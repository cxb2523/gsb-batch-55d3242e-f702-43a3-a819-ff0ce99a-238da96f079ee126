import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import http from "node:http"
import https from "node:https"
import net, { type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runTier1 } from "../../../packages/tiers/src/tiers/1"
import { probeLandingHost } from "../../../packages/tiers/src/utils/crossedLanding"
import { publicEgress } from "./deps"
import { MitmCa } from "./proxy/ca"
import { registerLocalProxy } from "./proxy/localTrust"
import { MAX_CONNECTIONS, PublicEgressProxy } from "./public-egress"

async function tcp(port: number | undefined): Promise<Socket> {
  if (!port) throw new Error("Fixture is not listening")
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1")
    socket.on("error", () => {})
    socket.once("error", reject).once("connect", () => resolve(socket))
  })
}

/** Absolute-form plain-HTTP proxy request over a dedicated raw socket (no client pooling). */
function proxiedGet(
  port: number,
  auth: string,
  target: string,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const targetUrl = new URL(target)
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1")
    socket.once("error", reject)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Raw proxied GET timed out for ${target}`))
    }, 10_000)
    let buffer = Buffer.alloc(0)
    let parsed: { status: number; headers: Record<string, string>; bodyStart: number } | undefined
    let done = false
    const parseHeaders = () => {
      if (parsed) return
      const headerEnd = buffer.indexOf("\r\n\r\n")
      if (headerEnd < 0) return
      const lines = buffer.subarray(0, headerEnd).toString("utf8").split("\r\n")
      const headers: Record<string, string> = {}
      for (const line of lines.slice(1)) {
        const separator = line.indexOf(":")
        if (separator > 0) headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim()
      }
      parsed = { status: Number(lines[0].split(" ")[1]), headers, bodyStart: headerEnd + 4 }
    }
    const complete = (bodyEnd?: number) => {
      parseHeaders()
      if (!parsed || done) return
      done = true
      clearTimeout(timer)
      let body: string
      if (parsed.headers["transfer-encoding"]?.includes("chunked")) {
        const chunks: Buffer[] = []
        let offset = parsed.bodyStart
        while (offset < buffer.length) {
          const sizeEnd = buffer.indexOf("\r\n", offset)
          if (sizeEnd < 0) break
          const size = Number.parseInt(buffer.subarray(offset, sizeEnd).toString("utf8"), 16)
          if (!Number.isFinite(size) || size === 0) break
          const dataStart = sizeEnd + 2
          if (buffer.length < dataStart + size) break
          chunks.push(buffer.subarray(dataStart, dataStart + size))
          offset = dataStart + size + 2
        }
        body = Buffer.concat(chunks).toString("utf8")
      } else {
        body = buffer.subarray(parsed.bodyStart, bodyEnd ?? buffer.length).toString("utf8")
      }
      resolve({ ...parsed, body })
      socket.destroy()
    }
    // Attach immediately and always drain the socket so backpressure cannot
    // delay the server FIN or the framing-complete check below.
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      parseHeaders()
      if (!parsed) return
      const length = Number(parsed.headers["content-length"])
      if (Number.isFinite(length) && buffer.length >= parsed.bodyStart + length) complete(parsed.bodyStart + length)
      // Chunked and close-delimited responses complete when the socket ends (Connection: close is sent).
    })
    socket.on("end", () => complete())
    socket.write(
      `GET ${target} HTTP/1.1\r\nHost: ${targetUrl.host}\r\nProxy-Authorization: Basic ${auth}\r\nConnection: close\r\n\r\n`,
    )
  })
}

/** Raw CONNECT request returning the full refusal text so headers and body can both be inspected. */
function rawConnect(
  port: number,
  auth: string | undefined,
  target: string,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1")
    socket.once("error", reject)
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Raw CONNECT timed out for ${target}`))
    }, 10_000)
    socket.write(
      `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n` +
        `${auth ? `Proxy-Authorization: Basic ${auth}\r\n` : ""}\r\n`,
    )
    let buffer = Buffer.alloc(0)
    socket.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
    })
    socket.on("end", () => {
      clearTimeout(timer)
      const headerEnd = buffer.indexOf("\r\n\r\n")
      const lines = buffer.subarray(0, headerEnd).toString("utf8").split("\r\n")
      const headers: Record<string, string> = {}
      for (const line of lines.slice(1)) {
        const separator = line.indexOf(":")
        if (separator > 0) headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim()
      }
      resolve({
        status: Number(lines[0].split(" ")[1]),
        headers,
        body: buffer.subarray(headerEnd + 4).toString("utf8"),
      })
    })
  })
}

describe("public destination egress", () => {
  test("recognized local MITM upstreams are rejected before opening a guarded connection", async () => {
    const server = net.createServer()
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("No fixture port")
    const unregister = registerLocalProxy({ server, configuredPort: address.port, ca: "owned CA" })
    try {
      for (const host of [
        "127.0.0.1",
        "127.0.0.2",
        "[::1]",
        "[::ffff:127.0.0.1]",
        "[::ffff:7f00:1]",
        "0.0.0.0",
        "[::]",
        "[::ffff:0.0.0.0]",
      ]) {
        await expect(publicEgress.proxyFor(`http://${host}:${address.port}`)).rejects.toThrow("intercepting MITM")
      }
    } finally {
      unregister()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
  test("route cache eviction preserves active credentials and forged tokens fail closed", async () => {
    const origin = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("owned") })
    const seen: (string | undefined)[] = []
    const proxy = new PublicEgressProxy({
      connect: async (_ip, _port, upstream) => {
        seen.push(upstream)
        return tcp(origin.port)
      },
    })
    try {
      const upstream = "http://operator:owned-password@proxy.example:8080"
      const first = await proxy.proxyFor(upstream)
      for (let i = 0; i < 513; i++) await proxy.proxyFor(`http://proxy-${i}.example:8080`)
      expect(await (await fetch("http://1.1.1.1/", { proxy: first })).text()).toBe("owned")
      expect(seen).toEqual([upstream])
      const forged = new URL(first)
      const token = Buffer.from(forged.password, "base64url")
      token[0] ^= 1
      forged.password = token.toString("base64url")
      expect((await fetch("http://1.1.1.1/", { proxy: forged.href })).status).toBe(407)
      expect(seen).toHaveLength(1)
    } finally {
      await proxy.close()
      await origin.stop(true)
    }
  })
  test("the selected Tier 1 transport uses guarded egress without changing origin proxy metadata", async () => {
    const html = `<html><head><title>Owned</title></head><body>${"Public egress fixture content. ".repeat(12)}</body></html>`
    const origin = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(html, { headers: { "content-type": "text/html" } }),
    })
    let connects = 0
    const proxy = new PublicEgressProxy({
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      connect: async (ip) => {
        expect(ip).toBe("1.1.1.1")
        connects++
        return tcp(origin.port)
      },
    })
    try {
      const result = await runTier1(
        "http://owned.example/",
        undefined,
        "GET",
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        4000,
        undefined,
        undefined,
        await proxy.proxyFor(),
      )
      expect(result.status, result.reason).toBe("success")
      expect(result.html).toContain("Public egress fixture content")
      expect(connects).toBe(1)
    } finally {
      await proxy.close()
      await origin.stop(true)
    }
  })
  test("the crossed-landing probe keeps guarded egress on redirects", async () => {
    const origin = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }),
    })
    let connects = 0
    const proxy = new PublicEgressProxy({
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      connect: async (ip) => {
        expect(ip).toBe("1.1.1.1")
        connects++
        return tcp(origin.port)
      },
    })
    try {
      await probeLandingHost("http://owned.example/", {
        networkProxy: (upstream) => proxy.proxyFor(upstream),
        timeoutMs: 3000,
      })
      expect(connects).toBe(1)
    } finally {
      await proxy.close()
      await origin.stop(true)
    }
  })
  test("HTTPS retains end-to-end SNI and certificate verification", async () => {
    const dir = mkdtempSync(join(tmpdir(), "trawl-egress-ca-"))
    const ca = new MitmCa(dir)
    const origin = https.createServer({ key: ca.leafKeyPem, cert: ca.leafCertPem("owned.example") }, (_req, res) =>
      res.end("owned TLS content"),
    )
    let servername = ""
    origin.on("secureConnection", (socket) => {
      servername = socket.servername || ""
    })
    await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve))
    const address = origin.address()
    if (!address || typeof address === "string") throw new Error("No TLS port")
    const proxy = new PublicEgressProxy({
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      connect: async (ip) => {
        expect(ip).toBe("1.1.1.1")
        return tcp(address.port)
      },
    })
    try {
      const proxyUrl = await proxy.proxyFor()
      const response = await fetch("https://owned.example/", {
        proxy: proxyUrl,
        tls: { ca: ca.caCertPem },
        signal: AbortSignal.timeout(4000),
      })
      expect(await response.text()).toBe("owned TLS content")
      expect(servername).toBe("owned.example")
      await expect(
        fetch("https://other.example/", {
          proxy: proxyUrl,
          tls: { ca: ca.caCertPem },
          signal: AbortSignal.timeout(4000),
        }),
      ).rejects.toThrow()
      await expect(
        fetch("https://owned.example/", { proxy: proxyUrl, signal: AbortSignal.timeout(4000) }),
      ).rejects.toThrow()
    } finally {
      await proxy.close()
      origin.closeAllConnections()
      await new Promise<void>((resolve) => origin.close(() => resolve()))
      rmSync(dir, { recursive: true, force: true })
    }
  }, 15_000)
  test("pins HTTP to the checked IP, preserves content and strips proxy credentials", async () => {
    const origin = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (req) => Response.json({ url: req.url, auth: req.headers.get("proxy-authorization") }),
    })
    const connected: string[] = []
    let lookups = 0
    const proxy = new PublicEgressProxy({
      lookup: async () => {
        lookups++
        return [{ address: "1.1.1.1", family: 4 }]
      },
      connect: async (address, port) => {
        connected.push(`${address}:${port}`)
        return tcp(origin.port)
      },
    })
    try {
      const url = await proxy.proxyFor()
      const response = await fetch("http://owned.example:8080/test?x=1", {
        proxy: url,
        signal: AbortSignal.timeout(4000),
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ url: "http://owned.example:8080/test?x=1", auth: null })
      expect(lookups).toBe(1)
      expect(connected).toEqual(["1.1.1.1:8080"])
      expect(await proxy.proxyFor()).toBe(url)
    } finally {
      await proxy.close()
      await origin.stop(true)
    }
  })

  test("a later private DNS answer never reaches the connector", async () => {
    const origin = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("owned") })
    let lookups = 0
    let connects = 0
    const proxy = new PublicEgressProxy({
      lookup: async () => [{ address: ++lookups === 1 ? "1.1.1.1" : "127.0.0.1", family: 4 }],
      connect: async () => {
        connects++
        return tcp(origin.port)
      },
    })
    try {
      const url = await proxy.proxyFor()
      expect(await (await fetch("http://rebind.example/first", { proxy: url })).text()).toBe("owned")
      const denied = await fetch("http://rebind.example/second", { proxy: url, signal: AbortSignal.timeout(3000) })
      expect(denied.status).toBe(403)
      expect(denied.headers.get("proxy-status")).toBe("trawl-public; error=destination_private")
      expect(await denied.text()).toContain("private or local network")
      expect(connects).toBe(1)
      expect(lookups).toBe(2)
    } finally {
      await proxy.close()
      await origin.stop(true)
    }
  })

  test("rejects mixed public/private DNS, literal private targets and missing proxy credentials with distinct reasons", async () => {
    let connects = 0
    const proxy = new PublicEgressProxy({
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
      connect: async () => {
        connects++
        throw new Error("must not connect")
      },
    })
    try {
      const url = await proxy.proxyFor()
      // Mixed public/private resolution: 400 + destination_mixed_resolution.
      const mixed = await fetch("http://mixed.example/", { proxy: url, signal: AbortSignal.timeout(3000) })
      expect(mixed.status).toBe(400)
      expect(mixed.headers.get("proxy-status")).toBe("trawl-public; error=destination_mixed_resolution")
      expect(await mixed.text()).toContain("mix of public and private")
      // Private literal targets: 403 + destination_private, distinguishable from the mixed case.
      for (const target of ["http://[::ffff:127.0.0.1]/", "http://127.0.0.1/"]) {
        const result = await fetch(target, { proxy: url, signal: AbortSignal.timeout(3000) })
        expect(result.status).toBe(403)
        expect(result.headers.get("proxy-status")).toBe("trawl-public; error=destination_private")
        expect(await result.text()).toContain("private or local network")
      }
      // Missing proxy credentials: 407 with Proxy-Authenticate and a distinct reason.
      const withoutAuth = new URL(url)
      withoutAuth.username = ""
      withoutAuth.password = ""
      const noCredentials = await fetch("http://owned.example", {
        proxy: withoutAuth.href,
        signal: AbortSignal.timeout(3000),
      })
      expect(noCredentials.status).toBe(407)
      expect(noCredentials.headers.get("proxy-authenticate")).toBe('Basic realm="TRAWL"')
      expect(noCredentials.headers.get("proxy-status")).toBe("trawl-public; error=proxy_credentials_invalid")
      expect(await noCredentials.text()).toContain("proxy credentials")
      expect(connects).toBe(0)
    } finally {
      await proxy.close()
    }
  })

  test("forged proxy credentials fail closed with 407 and never reach the connector", async () => {
    const origin = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("owned") })
    let connects = 0
    const proxy = new PublicEgressProxy({
      connect: async () => {
        connects++
        return tcp(origin.port)
      },
    })
    try {
      const proxyUrl = await proxy.proxyFor("http://operator:owned-secret@proxy.example:8080")
      const forged = new URL(proxyUrl)
      const token = Buffer.from(forged.password, "base64url")
      token[0] ^= 1
      forged.password = token.toString("base64url")
      const denied = await fetch("http://owned.example/", {
        proxy: forged.href,
        signal: AbortSignal.timeout(3000),
      })
      expect(denied.status).toBe(407)
      expect(denied.headers.get("proxy-authenticate")).toBe('Basic realm="TRAWL"')
      expect(denied.headers.get("proxy-status")).toBe("trawl-public; error=proxy_credentials_invalid")
      expect(connects).toBe(0)
    } finally {
      await proxy.close()
      await origin.stop(true)
    }
  })

  test("DNS resolution failures are refused with dns_resolution_failed", async () => {
    let connects = 0
    const proxy = new PublicEgressProxy({
      lookup: async () => {
        throw new Error("lookup failed")
      },
      connect: async () => {
        connects++
        throw new Error("must not connect")
      },
    })
    try {
      const url = await proxy.proxyFor()
      const denied = await fetch("http://nx.example/", { proxy: url, signal: AbortSignal.timeout(3000) })
      expect(denied.status).toBe(502)
      expect(denied.headers.get("proxy-status")).toBe("trawl-public; error=dns_resolution_failed")
      expect(await denied.text()).toContain("could not be resolved")
      expect(connects).toBe(0)
    } finally {
      await proxy.close()
    }
  })

  test("CONNECT passes raw bytes to a pinned IP and retains the configured upstream", async () => {
    const peers = new Set<Socket>()
    const echo = net.createServer((socket) => {
      peers.add(socket)
      socket.once("close", () => peers.delete(socket))
      socket.pipe(socket)
    })
    await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve))
    const address = echo.address()
    if (!address || typeof address === "string") throw new Error("No echo port")
    const seen: unknown[] = []
    const proxy = new PublicEgressProxy({
      lookup: async () => [{ address: "1.1.1.1", family: 4 }],
      connect: async (ip, port, upstream) => {
        seen.push({ ip, port, upstream })
        return tcp(address.port)
      },
    })
    try {
      const url = new URL(await proxy.proxyFor("socks5://operator:password@proxy.example:1080"))
      const socket = await tcp(Number(url.port))
      const auth = Buffer.from(`${url.username}:${url.password}`).toString("base64")
      const received = new Promise<string>((resolve, reject) => {
        let text = ""
        const timer = setTimeout(() => {
          socket.destroy()
          reject(new Error("Tunnel test timed out"))
        }, 4000)
        socket.on("data", (chunk) => {
          text += chunk.toString()
          if (text.includes("owned-bytes")) {
            clearTimeout(timer)
            resolve(text)
          }
        })
        socket.once("error", reject)
      })
      socket.write(
        `CONNECT owned.example:443 HTTP/1.1\r\nHost: owned.example:443\r\nProxy-Authorization: Basic ${auth}\r\n\r\nowned-bytes`,
      )
      expect(await received).toContain("200 Connection Established\r\n\r\nowned-bytes")
      expect(seen).toEqual([{ ip: "1.1.1.1", port: 443, upstream: "socks5://operator:password@proxy.example:1080" }])
      socket.destroy()
    } finally {
      await proxy.close()
      for (const peer of peers) peer.destroy()
      await new Promise<void>((resolve) => echo.close(() => resolve()))
    }
  })

  test("CONNECT denial and connection failure close without a direct fallback", async () => {
    let connects = 0
    const proxy = new PublicEgressProxy({
      connect: async () => {
        connects++
        throw new Error("refused")
      },
    })
    try {
      const url = new URL(await proxy.proxyFor())
      const auth = Buffer.from(`${url.username}:${url.password}`).toString("base64")
      const openConnect = (target: string) =>
        new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>((resolve, reject) => {
          const req = http.request({
            hostname: "127.0.0.1",
            port: url.port,
            method: "CONNECT",
            path: target,
            headers: { "proxy-authorization": `Basic ${auth}` },
          })
          req.once("connect", (res, socket) => {
            socket.destroy()
            resolve({ status: res.statusCode ?? 0, headers: res.headers })
          })
          req.once("error", reject)
          req.end()
        })
      const privateDenial = await openConnect("[::ffff:127.0.0.1]:443")
      expect(privateDenial.status).toBe(403)
      expect(privateDenial.headers["proxy-status"]).toBe("trawl-public; error=destination_private")
      const upstreamFailure = await openConnect("1.1.1.1:443")
      expect(upstreamFailure.status).toBe(502)
      expect(upstreamFailure.headers["proxy-status"]).toBe("trawl-public; error=destination_unavailable")
      expect(connects).toBe(1)
    } finally {
      await proxy.close()
    }
  })

  test("CONNECT without credentials is refused with 407, Proxy-Authenticate and a reason", async () => {
    const proxy = new PublicEgressProxy({ connect: async () => tcp(0) })
    try {
      const url = new URL(await proxy.proxyFor())
      const result = await new Promise<{ status: number; headers: Record<string, string | string[] | undefined> }>(
        (resolve, reject) => {
          const req = http.request({
            hostname: "127.0.0.1",
            port: url.port,
            method: "CONNECT",
            path: "owned.example:443",
          })
          req.once("connect", (res, socket) => {
            socket.destroy()
            resolve({ status: res.statusCode ?? 0, headers: res.headers })
          })
          req.once("error", reject)
          req.end()
        },
      )
      expect(result.status).toBe(407)
      expect(result.headers["proxy-authenticate"]).toBe('Basic realm="TRAWL"')
      expect(result.headers["proxy-status"]).toBe("trawl-public; error=proxy_credentials_invalid")
    } finally {
      await proxy.close()
    }
  })

  test("CONNECT private-literal and mixed-resolution denials carry distinct reasons, bodies and no IPs", async () => {
    const proxy = new PublicEgressProxy({
      lookup: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
      connect: async () => {
        throw new Error("must not connect")
      },
    })
    try {
      const url = new URL(await proxy.proxyFor())
      const auth = Buffer.from(`${url.username}:${url.password}`).toString("base64")
      // Private literal: 403 destination_private with a readable body and no literal address echoed.
      const literal = await rawConnect(Number(url.port), auth, "[::ffff:127.0.0.1]:443")
      expect(literal.status).toBe(403)
      expect(literal.headers["proxy-status"]).toBe("trawl-public; error=destination_private")
      expect(literal.body).toContain("private or local network")
      expect(literal.body).not.toContain("127.0.0.1")
      // Mixed public/private resolution via CONNECT: a distinct 400 reason.
      const mixed = await rawConnect(Number(url.port), auth, "mixed.example:443")
      expect(mixed.status).toBe(400)
      expect(mixed.headers["proxy-status"]).toBe("trawl-public; error=destination_mixed_resolution")
      expect(mixed.body).toContain("mix of public and private")
      expect(mixed.body).not.toContain("10.0.0.1")
    } finally {
      await proxy.close()
    }
  })

  test("over-limit requests fail fast with concurrency_limited instead of queueing", async () => {
    // Drive the real pending-vs-MAX_CONNECTIONS guard directly so the test is
    // deterministic and does not need hundreds of physical TCP connections.
    const origin = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("owned") })
    let lookups = 0
    let connects = 0
    const proxy = new PublicEgressProxy({
      lookup: async () => {
        lookups++
        return [{ address: "1.1.1.1", family: 4 }]
      },
      connect: () => {
        connects++
        return tcp(origin.port)
      },
    })
    try {
      const proxyUrl = new URL(await proxy.proxyFor())
      const auth = Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString("base64")
      const internals = proxy as unknown as { pending: number }
      // Simulate every permitted egress slot being occupied by an in-flight dial.
      internals.pending = MAX_CONNECTIONS
      // The over-limit request is rejected before lookup/connect: no extra dial.
      const refused = await proxiedGet(Number(proxyUrl.port), auth, "http://capacity.example/extra")
      expect(refused.status).toBe(503)
      expect(refused.headers["proxy-status"]).toBe("trawl-public; error=concurrency_limited")
      expect(refused.body).toContain("connection limit reached")
      expect(lookups).toBe(0)
      expect(connects).toBe(0)
      // Once a slot frees, the next request is served rather than permanently refused.
      internals.pending = MAX_CONNECTIONS - 1
      const allowed = await proxiedGet(Number(proxyUrl.port), auth, "http://capacity.example/after")
      expect(allowed.status).toBe(200)
      expect(allowed.headers["proxy-status"]).toBeUndefined()
      expect(lookups).toBe(1)
      expect(connects).toBe(1)
      // The served request balanced its pending increment; the earlier refusal must not have counted.
      expect(internals.pending).toBe(MAX_CONNECTIONS - 1)
    } finally {
      await proxy.close()
      await origin.stop(true)
    }
  })

  test("refusal responses never contain resolved IPs, proxy URLs or credentials", async () => {
    const secretPassword = "owned-secret-credential"
    const upstream = `http://operator:${secretPassword}@proxy.example:8080`
    const unreachableIp = "8.8.8.8"
    const proxy = new PublicEgressProxy({
      lookup: async (hostname) => {
        if (hostname === "mixed.example")
          return [
            { address: "1.1.1.1", family: 4 },
            { address: "10.20.30.40", family: 4 },
          ]
        if (hostname === "nx.example") throw new Error("lookup failed")
        return [{ address: unreachableIp, family: 4 }]
      },
      connect: async () => {
        throw new Error(`dial to ${unreachableIp} via proxy.example failed`)
      },
    })
    try {
      const proxyUrl = new URL(await proxy.proxyFor(upstream))
      const auth = Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString("base64")
      const scenarios: Array<{ target: string; reason: string; useAuth: boolean }> = [
        { target: "http://127.0.0.1/", reason: "destination_private", useAuth: true },
        { target: "http://mixed.example/", reason: "destination_mixed_resolution", useAuth: true },
        { target: "http://nx.example/", reason: "dns_resolution_failed", useAuth: true },
        { target: "http://unreachable.example/", reason: "destination_unavailable", useAuth: true },
        { target: "http://owned.example/", reason: "proxy_credentials_invalid", useAuth: false },
      ]
      const leakedFragments = ["127.0.0.1", "10.20.30.40", unreachableIp, "proxy.example", secretPassword]
      for (const { target, reason, useAuth } of scenarios) {
        const response = await proxiedGet(
          Number(proxyUrl.port),
          useAuth ? auth : Buffer.from("trawl:forged-token").toString("base64"),
          target,
        )
        const proxyStatus = response.headers["proxy-status"]
        expect(proxyStatus).toBe(`trawl-public; error=${reason}`)
        // Header carries only the fixed enum identifier and the stable proxy name.
        expect(proxyStatus).not.toMatch(/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/)
        for (const fragment of leakedFragments) {
          expect(response.body, `${reason} body leaked ${fragment}`).not.toContain(fragment)
        }
        if (reason === "proxy_credentials_invalid") {
          expect(response.headers["proxy-authenticate"]).toBe('Basic realm="TRAWL"')
          expect(response.body).not.toContain(proxyUrl.password)
        }
      }
    } finally {
      await proxy.close()
    }
  })
})
