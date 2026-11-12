import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { Socket } from "node:net"
import { RequestValidationError } from "@trawl/tiers"
import {
  type HostLookup,
  PUBLIC_EGRESS_REASON,
  type PublicEgressReason,
  PublicTargetError,
  parsePublicHttpUrl,
  resolvePublicHostname,
} from "./outbound-policy"
import { connectTunnel } from "./proxy/upstreamTunnel"

/**
 * Maximum number of concurrently open egress connections. Over-limit requests
 * fail fast with {@link EGRESS_DENY_REASON.CONCURRENCY_LIMITED} instead of
 * queueing. The constant is exported so tests exercise the real limit.
 */
export const MAX_CONNECTIONS = 128
const MAX_ROUTES = 512

interface Options {
  lookup?: HostLookup
  connect?: typeof connectTunnel
  validateUpstream?: (proxy: string) => Promise<void>
}

/**
 * The complete, fixed set of refusal reasons this proxy emits. Every value is a
 * stable enum string: none are constructed from resolved IPs, upstream proxy
 * URLs or credentials, so responses never leak internal topology.
 */
export const EGRESS_DENY_REASON = {
  DESTINATION_PRIVATE: PUBLIC_EGRESS_REASON.DESTINATION_PRIVATE,
  DESTINATION_MIXED_RESOLUTION: PUBLIC_EGRESS_REASON.DESTINATION_MIXED_RESOLUTION,
  DNS_RESOLUTION_FAILED: PUBLIC_EGRESS_REASON.DNS_RESOLUTION_FAILED,
  /** Proxy-Authorization is missing, malformed or fails authentication. */
  PROXY_CREDENTIALS_INVALID: "proxy_credentials_invalid",
  /** The in-flight connection limit (MAX_CONNECTIONS) has been reached. */
  CONCURRENCY_LIMITED: "concurrency_limited",
  /** Malformed request that is not one of the categorised refusals above. */
  REQUEST_REJECTED: "request_rejected",
  /** Dial/upstream failure after every validated public address was tried. */
  DESTINATION_UNAVAILABLE: "destination_unavailable",
} as const

export type EgressDenyReason = (typeof EGRESS_DENY_REASON)[keyof typeof EGRESS_DENY_REASON]

/** A refusal that already knows its stable reason; its status/body derive from DENY_RESPONSE. */
export class EgressDenyError extends Error {
  constructor(readonly reason: EgressDenyReason) {
    super(reason)
    this.name = "EgressDenyError"
  }
}

/**
 * Single source of truth mapping a fixed reason to its HTTP status and a
 * constant, human-readable body. Bodies deliberately contain no request data.
 */
const DENY_RESPONSE: Readonly<Record<EgressDenyReason, { status: number; text: string }>> = {
  [EGRESS_DENY_REASON.DESTINATION_PRIVATE]: {
    status: 403,
    text: "TRAWL public egress refused: target is a private or local network address",
  },
  [EGRESS_DENY_REASON.DESTINATION_MIXED_RESOLUTION]: {
    status: 400,
    text: "TRAWL public egress refused: hostname resolved to a mix of public and private addresses",
  },
  [EGRESS_DENY_REASON.DNS_RESOLUTION_FAILED]: {
    status: 502,
    text: "TRAWL public egress refused: hostname could not be resolved",
  },
  [EGRESS_DENY_REASON.PROXY_CREDENTIALS_INVALID]: {
    status: 407,
    text: "TRAWL public egress refused: valid proxy credentials are required",
  },
  [EGRESS_DENY_REASON.CONCURRENCY_LIMITED]: {
    status: 503,
    text: "TRAWL public egress refused: connection limit reached, retry later",
  },
  [EGRESS_DENY_REASON.REQUEST_REJECTED]: {
    status: 400,
    text: "TRAWL public egress refused: malformed proxy request",
  },
  [EGRESS_DENY_REASON.DESTINATION_UNAVAILABLE]: {
    status: 502,
    text: "TRAWL public egress refused: no public address could be reached",
  },
}

function proxyStatusHeader(reason: EgressDenyReason): string {
  return `trawl-public; error=${reason}`
}

/**
 * Normalise any thrown error into a categorised refusal. Policy errors carry
 * their own reason; everything else falls back to a fixed generic bucket so a
 * failure message can never surface internal addresses or credentials.
 */
function classifyDeny(error: unknown): EgressDenyError {
  if (error instanceof EgressDenyError) return error
  if (error instanceof PublicTargetError) return new EgressDenyError(fromPolicyReason(error.reason))
  if (error instanceof RequestValidationError && error.statusCode === 407)
    return new EgressDenyError(EGRESS_DENY_REASON.PROXY_CREDENTIALS_INVALID)
  if (error instanceof RequestValidationError) return new EgressDenyError(EGRESS_DENY_REASON.REQUEST_REJECTED)
  return new EgressDenyError(EGRESS_DENY_REASON.DESTINATION_UNAVAILABLE)
}

/** Every outbound-policy reason is also a proxy denial reason (enforced by the Record lookup). */
function fromPolicyReason(reason: PublicEgressReason): EgressDenyReason {
  const mapped: Record<PublicEgressReason, EgressDenyReason> = {
    [PUBLIC_EGRESS_REASON.DESTINATION_PRIVATE]: EGRESS_DENY_REASON.DESTINATION_PRIVATE,
    [PUBLIC_EGRESS_REASON.DESTINATION_MIXED_RESOLUTION]: EGRESS_DENY_REASON.DESTINATION_MIXED_RESOLUTION,
    [PUBLIC_EGRESS_REASON.DNS_RESOLUTION_FAILED]: EGRESS_DENY_REASON.DNS_RESOLUTION_FAILED,
  }
  return mapped[reason]
}

/** Local forwarding only: HTTPS stays end-to-end, and every connection uses an approved IP. */
export class PublicEgressProxy {
  private server?: Server
  private starting?: Promise<Server>
  private closing?: Promise<void>
  private readonly sockets = new Set<Socket>()
  private key = randomBytes(32)
  private readonly proxyUrls = new Map<string, string>()
  private pending = 0

  constructor(private readonly options: Options = {}) {}

  async proxyFor(upstream?: string): Promise<string> {
    if (this.closing) throw new RequestValidationError("Public egress proxy is closing", 503)
    if (upstream) await this.options.validateUpstream?.(upstream)
    if (Buffer.byteLength(upstream ?? "") > 4096) throw new RequestValidationError("Proxy URL is too long", 400)
    const existing = this.proxyUrls.get(upstream ?? "")
    if (existing) return existing
    const server = await this.start()
    if (this.closing || server !== this.server) throw new RequestValidationError("Public egress proxy is closing", 503)
    const cached = this.proxyUrls.get(upstream ?? "")
    if (cached) return cached
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Public proxy did not start")
    // Stateless authenticated tokens survive memo-cache eviction and hide upstream credentials.
    const nonce = randomBytes(12)
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce)
    const encrypted = Buffer.concat([cipher.update(upstream ?? "", "utf8"), cipher.final()])
    const token = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url")
    const url = `http://trawl:${token}@127.0.0.1:${address.port}`
    if (this.proxyUrls.size >= MAX_ROUTES) this.proxyUrls.delete(this.proxyUrls.keys().next().value ?? "")
    this.proxyUrls.set(upstream ?? "", url)
    return url
  }

  private start(): Promise<Server> {
    if (this.starting) return this.starting
    this.starting = new Promise((resolve, reject) => {
      const server = http.createServer({ maxHeaderSize: 16_384 }, (req, res) => {
        void this.forward(req, res).catch((error) => {
          if (res.headersSent) res.destroy()
          else this.denyResponse(res, classifyDeny(error))
        })
      })
      // No socket-level maxConnections: the pending-dial guard below enforces
      // MAX_CONNECTIONS and produces an explicit, categorised 503 instead of
      // silently dropping the next TCP connection.
      server.headersTimeout = 10_000
      server.requestTimeout = 0
      server.keepAliveTimeout = 5_000
      server.on("connection", (socket) => {
        this.track(socket)
        socket.setTimeout(10_000, () => socket.destroy())
      })
      server.on("connect", (req, socket, head) => {
        const client = socket as Socket
        client.pause()
        void this.tunnel(req, client, head).catch((error) => this.refuse(client, classifyDeny(error)))
      })
      server.on("upgrade", (req, socket, head) => {
        const client = socket as Socket
        client.pause()
        void this.upgrade(req, client, head).catch((error) => this.refuse(client, classifyDeny(error)))
      })
      server.on("clientError", (_error, socket) => socket.destroy())
      server.once("error", (error) => {
        this.starting = undefined
        reject(error)
      })
      server.listen(0, "127.0.0.1", () => {
        this.server = server
        server.unref()
        resolve(server)
      })
    })
    return this.starting
  }

  private track(socket: Socket): void {
    this.sockets.add(socket)
    socket.on("error", () => {})
    socket.once("close", () => this.sockets.delete(socket))
  }

  private route(req: IncomingMessage): { upstream?: string } {
    try {
      const header = req.headers["proxy-authorization"]
      if (typeof header !== "string" || !header.startsWith("Basic ")) throw new Error("Missing credentials")
      const credentials = Buffer.from(header.slice(6), "base64").toString()
      if (!credentials.startsWith("trawl:")) throw new Error("Invalid user")
      const token = Buffer.from(credentials.slice(6), "base64url")
      if (token.length < 28) throw new Error("Invalid token")
      const decipher = createDecipheriv("aes-256-gcm", this.key, token.subarray(0, 12))
      decipher.setAuthTag(token.subarray(12, 28))
      const upstream = Buffer.concat([decipher.update(token.subarray(28)), decipher.final()]).toString()
      return { upstream: upstream || undefined }
    } catch {
      throw new EgressDenyError(EGRESS_DENY_REASON.PROXY_CREDENTIALS_INVALID)
    }
  }

  /** Write a categorised plain-HTTP refusal with a stable reason header and fixed body. */
  private denyResponse(res: ServerResponse, denial: EgressDenyError): void {
    const { status, text } = DENY_RESPONSE[denial.reason]
    const headers: http.OutgoingHttpHeaders = {
      "content-type": "text/plain; charset=utf-8",
      "proxy-status": proxyStatusHeader(denial.reason),
    }
    if (status === 407) headers["proxy-authenticate"] = 'Basic realm="TRAWL"'
    res.writeHead(status, headers).end(text)
  }

  /** Write a categorised refusal directly onto a CONNECT/Upgrade tunnel socket. */
  private refuse(socket: Socket, denial: EgressDenyError): void {
    if (socket.destroyed) return
    const { status, text } = DENY_RESPONSE[denial.reason]
    const reasonPhrase =
      status === 407
        ? "Proxy Authentication Required"
        : status === 403
          ? "Forbidden"
          : status === 503
            ? "Service Unavailable"
            : status === 502
              ? "Bad Gateway"
              : "Bad Request"
    const body = Buffer.from(text, "utf8")
    socket.end(
      `HTTP/1.1 ${status} ${reasonPhrase}\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n` +
        `Proxy-Status: ${proxyStatusHeader(denial.reason)}\r\n` +
        `${status === 407 ? 'Proxy-Authenticate: Basic realm="TRAWL"\r\n' : ""}` +
        `Connection: close\r\n` +
        `Content-Length: ${body.length}\r\n\r\n` +
        text,
    )
  }

  private async dial(
    hostname: string,
    port: number,
    upstream: string | undefined,
    signal: AbortSignal,
  ): Promise<Socket> {
    // Fail fast: the limit is the existing MAX_CONNECTIONS constant and
    // over-limit requests are rejected immediately rather than queued.
    if (this.pending >= MAX_CONNECTIONS) throw new EgressDenyError(EGRESS_DENY_REASON.CONCURRENCY_LIMITED)
    this.pending++
    try {
      const addresses = await resolvePublicHostname(hostname, this.options.lookup)
      signal.throwIfAborted()
      if (upstream) await this.options.validateUpstream?.(upstream)
      signal.throwIfAborted()
      let failure: unknown
      for (const address of addresses.toSorted((a, b) => a.family - b.family)) {
        try {
          signal.throwIfAborted()
          const socket = await (this.options.connect ?? connectTunnel)(address.address, port, upstream, signal)
          if (signal.aborted) {
            socket.destroy()
            signal.throwIfAborted()
          }
          socket.setTimeout(0)
          this.track(socket)
          return socket
        } catch (error) {
          signal.throwIfAborted()
          failure = error
        }
      }
      throw failure ?? new Error("No public address could be reached")
    } finally {
      this.pending--
    }
  }

  private async tunnel(req: IncomingMessage, client: Socket, head: Buffer): Promise<void> {
    const { upstream } = this.route(req)
    if (!req.url || /[/?#@]/.test(req.url)) throw new RequestValidationError("Invalid CONNECT target", 400)
    const { url, hostname } = parsePublicHttpUrl(`https://${req.url}`)
    client.setTimeout(0)
    const abort = new AbortController()
    client.once("close", () => abort.abort())
    const peer = await this.dial(hostname, Number(url.port || 443), upstream, abort.signal)
    client.once("close", () => peer.destroy())
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
    if (head.length) peer.write(head)
    peer.once("close", () => client.destroy())
    client.pipe(peer).pipe(client)
  }

  private async forward(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let upstream: string | undefined
    try {
      ;({ upstream } = this.route(req))
    } catch (error) {
      // 407 responses include Proxy-Authenticate via denyResponse.
      this.denyResponse(res, classifyDeny(error))
      return
    }
    const { url, hostname } = parsePublicHttpUrl(req.url ?? "")
    if (url.protocol !== "http:") throw new RequestValidationError("HTTPS requires CONNECT", 400)
    req.socket.setTimeout(0)
    const abort = new AbortController()
    res.once("close", () => abort.abort())
    const peer = await this.dial(hostname, Number(url.port || 80), upstream, abort.signal)
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: url.host }
    delete headers["proxy-authorization"]
    delete headers["proxy-connection"]
    const agent = new http.Agent({ keepAlive: false })
    agent.createConnection = () => peer
    const outbound = http.request(
      {
        hostname,
        port: Number(url.port || 80),
        path: `${url.pathname}${url.search}`,
        method: req.method,
        headers,
        agent,
        signal: abort.signal,
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(res)
      },
    )
    outbound.once("error", () => {
      if (res.headersSent) res.destroy()
      else this.denyResponse(res, new EgressDenyError(EGRESS_DENY_REASON.DESTINATION_UNAVAILABLE))
    })
    res.once("close", () => {
      outbound.destroy()
      agent.destroy()
      peer.destroy()
    })
    req.pipe(outbound)
  }

  private async upgrade(req: IncomingMessage, client: Socket, head: Buffer): Promise<void> {
    const { upstream } = this.route(req)
    const { url, hostname } = parsePublicHttpUrl((req.url ?? "").replace(/^ws:/i, "http:"))
    if (url.protocol !== "http:") throw new RequestValidationError("Invalid WebSocket target", 400)
    client.setTimeout(0)
    const abort = new AbortController()
    client.once("close", () => abort.abort())
    const peer = await this.dial(hostname, Number(url.port || 80), upstream, abort.signal)
    client.once("close", () => peer.destroy())
    const headers: http.OutgoingHttpHeaders = { ...req.headers, host: url.host }
    delete headers["proxy-authorization"]
    delete headers["proxy-connection"]
    peer.write(
      `${req.method} ${url.pathname}${url.search} HTTP/1.1\r\n${Object.entries(headers)
        .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`)
        .join("\r\n")}\r\n\r\n`,
    )
    if (head.length) peer.write(head)
    peer.once("close", () => client.destroy())
    client.pipe(peer).pipe(client)
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.closing = (async () => {
      const server = await this.starting?.catch(() => undefined)
      for (const socket of this.sockets) socket.destroy()
      if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
      this.server = undefined
      this.starting = undefined
      this.key = randomBytes(32)
      this.proxyUrls.clear()
    })().finally(() => {
      this.closing = undefined
    })
    return this.closing
  }
}
