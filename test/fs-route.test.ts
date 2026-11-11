/**
 * The `$dsh/fs` route.
 *
 * Path safety is `ctx.fs.resolve`'s job — the host's sandbox, not ours, and testing it here
 * would be testing someone else's code. What IS ours: which session's access mode a write runs
 * under, that a denial reads differently from a failure, and that binary files do not go through
 * the UTF-8 path. All three are stated in comments and none was checked.
 */
import { describe, expect, test } from "bun:test";
import { serveFs } from "../src/index.ts";

const target = { displayPath: "notes.txt" };
type Call = { name: string; args: unknown[] };

const ctxWith = (over: Record<string, unknown> = {}, calls: Call[] = []) => ({
  fs: {
    resolve: async () => target,
    readText: async () => "text body",
    readBytes: async () => new Uint8Array([0xff, 0x00, 0x80]),
    listDir: async () => [{ name: "a.ts", type: "file", size: 3, target: "SECRET", version: "SECRET" }],
    writeText: async (...args: unknown[]) => {
      calls.push({ name: "writeText", args });
      return undefined;
    },
    ...over,
  },
  sandboxPolicy: { resolve: (request?: { session?: unknown }) => ({ forSession: request?.session }) },
  sessions: {
    list: () => [
      { id: "s1", header: { cwd: "/w" } },
      { id: "s2", header: { cwd: "/w" } },
    ],
  },
});

const call = async (query: string, opts: { method?: string; body?: string; ctx?: ReturnType<typeof ctxWith>; live?: Set<string> } = {}) => {
  let status = 0,
    body = "";
  const res = {
    writeHead(code: number) {
      status = code;
      return res;
    },
    end(chunk?: string) {
      body = chunk ?? "";
      return res;
    },
  };
  const req: any = {
    method: opts.method ?? "GET",
    url: `/x?${query}`,
    async *[Symbol.asyncIterator]() {
      if (opts.body !== undefined) yield opts.body;
    },
  };
  await serveFs((opts.ctx ?? ctxWith()) as never, () => opts.live ?? new Set(["/w"]), req, res as never);
  return { status, json: body === "" ? null : JSON.parse(body) };
};

describe("reads", () => {
  test("a listing forwards only the three contract fields", async () => {
    const { status, json } = await call("cwd=%2Fw&path=.&list=1&session=s1");
    expect(status).toBe(200);
    // The host also returns `target` and a `version` cache key. Neither is contract, and
    // `target` is an absolute host path — forwarding it would leak the filesystem layout.
    expect(json.entries[0]).toEqual({ name: "a.ts", type: "file", size: 3 });
  });

  // `readText` decodes UTF-8, so a .mid or .png comes back as U+FFFD — silently corrupt rather
  // than refused. The bytes path exists so a card can have the actual bytes.
  test("?bytes reads bytes, not decoded text", async () => {
    const { json } = await call("cwd=%2Fw&path=a.mid&bytes=1&session=s1");
    expect(json.base64).toBe(Buffer.from([0xff, 0x00, 0x80]).toString("base64"));
    expect(json.byteLength).toBe(3);
  });

  test("a plain read answers text", async () => {
    expect((await call("cwd=%2Fw&path=a.txt&session=s1")).json).toEqual({ content: "text body" });
  });
});

describe("the fence", () => {
  test("a workspace this session does not own is refused", async () => {
    expect((await call("cwd=%2Fw&path=a.txt&session=s1", { live: new Set() })).status).toBe(403);
  });

  test("a missing path is a 400 before any filesystem call", async () => {
    expect((await call("cwd=%2Fw")).status).toBe(400);
    expect((await call("cwd=%2Fw&path=")).status).toBe(400);
  });

  // The card needs to tell "you may not" from "it broke": one is worth showing the user as a
  // read-only session, the other is a bug.
  test("a sandbox denial is 403 and a missing file is 404", async () => {
    const denied = ctxWith({
      resolve: async () => {
        throw Object.assign(new Error("no"), { code: "FS_SANDBOX_DENIED" });
      },
    });
    expect((await call("cwd=%2Fw&path=a.txt&session=s1", { ctx: denied })).status).toBe(403);
    const missing = ctxWith({
      resolve: async () => {
        throw Object.assign(new Error("nope"), { code: "ENOENT" });
      },
    });
    expect((await call("cwd=%2Fw&path=a.txt&session=s1", { ctx: missing })).status).toBe(404);
  });
});

describe("writes", () => {
  // Addressed by id, not found by cwd: several sessions share one workspace, and picking the
  // first would silently run the write under a stranger's access mode.
  test("the write runs under the named session's policy", async () => {
    const calls: Call[] = [];
    const ctx = ctxWith({}, calls);
    const { status } = await call("cwd=%2Fw&path=a.txt&session=s2", { method: "POST", body: JSON.stringify({ content: "hi" }), ctx });
    expect(status).toBe(200);
    expect(calls[0].args[4]).toEqual({ forSession: { id: "s2", header: { cwd: "/w" } } });
  });

  test("a write with no session is refused rather than run under a default", async () => {
    expect((await call("cwd=%2Fw&path=a.txt", { method: "POST", body: JSON.stringify({ content: "hi" }) })).status).toBe(400);
    expect((await call("cwd=%2Fw&path=a.txt&session=nope", { method: "POST", body: JSON.stringify({ content: "hi" }) })).status).toBe(400);
  });

  test("a non-string content is refused", async () => {
    expect((await call("cwd=%2Fw&path=a.txt&session=s1", { method: "POST", body: JSON.stringify({ content: 42 }) })).status).toBe(400);
    expect((await call("cwd=%2Fw&path=a.txt&session=s1", { method: "POST", body: "not json" })).status).toBe(400);
  });

  test("an unsupported method is 405", async () => {
    expect((await call("cwd=%2Fw&path=a.txt&session=s1", { method: "DELETE" })).status).toBe(405);
  });
});

test("a session that does not own the workspace cannot choose the policy for it", async () => {
  const ctx = {
    ...ctxWith(),
    sessions: {
      list: () => [
        { id: "s1", header: { cwd: "/w" } },
        { id: "s2", header: { cwd: "/elsewhere" } },
      ],
    },
  } as never;
  // `cwd` selects the allowlist entry and `session` selects the policy. Left independent, one
  // request can read and write a workspace under another session's access mode.
  expect((await call("cwd=%2Fw&path=a.txt&session=s2", { method: "POST", body: JSON.stringify({ content: "hi" }), ctx })).status).toBe(400);
});

test("reads are paired with the session that owns the workspace too", async () => {
  const ctx = {
    ...ctxWith(),
    sessions: {
      list: () => [
        { id: "s1", header: { cwd: "/w" } },
        { id: "s2", header: { cwd: "/elsewhere" } },
      ],
    },
  } as never;
  // A GET used to reach `readText`/`listDir` before any session was looked at, so a page that
  // knew another session's workspace could read it. The pair has to be settled first.
  expect((await call("cwd=%2Fw&path=a.txt&session=s2", { ctx })).status).toBe(400);
  expect((await call("cwd=%2Fw&path=a.txt&list=1&session=s2", { ctx })).status).toBe(400);
  expect((await call("cwd=%2Fw&path=a.txt&bytes=1&session=s2", { ctx })).status).toBe(400);
});
