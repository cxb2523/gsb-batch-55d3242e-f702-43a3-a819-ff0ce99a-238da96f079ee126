import { describe, expect, test } from "bun:test"
import {
  assertPublicHttpUrl,
  createPublicUrlValidator,
  PUBLIC_EGRESS_REASON,
  type PublicTargetError,
} from "./outbound-policy"

describe("MCP outbound URL policy", () => {
  test("rejects a hostname that rebinds after an earlier public response", async () => {
    let lookups = 0
    const validate = createPublicUrlValidator(async () => [
      { address: ++lookups === 1 ? "1.1.1.1" : "127.0.0.1", family: 4 },
    ])
    await validate("http://rebind.example/first")
    await expect(validate("http://rebind.example/later")).rejects.toThrow("private or local network")
    expect(lookups).toBe(2)
  })
  for (const url of [
    "file:///etc/passwd",
    "http://localhost/admin",
    "http://127.0.0.1/",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[0:0:0:0:0:ffff:7f00:1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://[::ffff:a9fe:a9fe]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    "http://[2001:db8::1]/",
    "http://user:password@example.com/",
  ]) {
    test(`rejects ${url}`, async () => {
      await expect(assertPublicHttpUrl(url)).rejects.toThrow()
    })
  }

  test("accepts a public literal address", async () => {
    expect((await assertPublicHttpUrl("https://1.1.1.1/path")).hostname).toBe("1.1.1.1")
  })
})

describe("public egress refusal reasons", () => {
  test("exposes a fixed enum of reason identifiers", () => {
    const reasons = Object.values(PUBLIC_EGRESS_REASON)
    expect(new Set(reasons)).toEqual(
      new Set(["destination_mixed_resolution", "destination_private", "dns_resolution_failed"]),
    )
    // Every identifier is a stable, non-empty snake_case token with no request data embedded.
    for (const reason of reasons) expect(reason).toMatch(/^[a-z_]+$/)
  })

  test("a private literal target is classified as destination_private", async () => {
    const validate = createPublicUrlValidator(async () => [{ address: "1.1.1.1", family: 4 }])
    await expect(validate("http://127.0.0.1/")).rejects.toMatchObject({
      name: "PublicTargetError",
      reason: PUBLIC_EGRESS_REASON.DESTINATION_PRIVATE,
      statusCode: 400,
    } satisfies Partial<PublicTargetError>)
  })

  test("an all-private DNS answer is classified as destination_private", async () => {
    const validate = createPublicUrlValidator(async () => [{ address: "10.0.0.5", family: 4 }])
    await expect(validate("http://private.example/")).rejects.toMatchObject({
      name: "PublicTargetError",
      reason: PUBLIC_EGRESS_REASON.DESTINATION_PRIVATE,
    } satisfies Partial<PublicTargetError>)
  })

  test("a mixed public/private DNS answer is classified as destination_mixed_resolution", async () => {
    const validate = createPublicUrlValidator(async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ])
    await expect(validate("http://mixed.example/")).rejects.toMatchObject({
      name: "PublicTargetError",
      reason: PUBLIC_EGRESS_REASON.DESTINATION_MIXED_RESOLUTION,
      statusCode: 400,
    } satisfies Partial<PublicTargetError>)
  })

  test("a failing lookup is classified as dns_resolution_failed", async () => {
    const validate = createPublicUrlValidator(async () => {
      throw new Error("lookup boom")
    })
    await expect(validate("http://nx.example/")).rejects.toMatchObject({
      name: "PublicTargetError",
      reason: PUBLIC_EGRESS_REASON.DNS_RESOLUTION_FAILED,
      statusCode: 400,
    } satisfies Partial<PublicTargetError>)
  })

  test("an empty lookup answer is classified as dns_resolution_failed", async () => {
    const validate = createPublicUrlValidator(async () => [])
    await expect(validate("http://empty.example/")).rejects.toMatchObject({
      name: "PublicTargetError",
      reason: PUBLIC_EGRESS_REASON.DNS_RESOLUTION_FAILED,
    } satisfies Partial<PublicTargetError>)
  })

  test("a fully public answer still resolves", async () => {
    const validate = createPublicUrlValidator(async () => [{ address: "1.1.1.1", family: 4 }])
    expect((await validate("http://public.example/")).hostname).toBe("public.example")
  })
})
