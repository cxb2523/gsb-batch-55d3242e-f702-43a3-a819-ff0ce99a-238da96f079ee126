import { expect, test } from "bun:test";
import { serveWebSearch } from "../src/index.ts";

/** The two things a route handler needs, and nothing else. */
const call = async (body: string, opts: { cwd?: string; method?: string; search?: unknown; live?: string[] } = {}) => {
  const chunks: string[] = [];
  let status = 0;
  const res = {
    on() {},
    writeHead(code: number) {
      status = code;
      return res;
    },
    end(text?: string) {
      if (text !== undefined) chunks.push(text);
    },
  };
  const req = Object.assign(
    (async function* () {
      yield body;
    })(),
    { url: `/x?cwd=${encodeURIComponent(opts.cwd ?? "/w")}`, method: opts.method ?? "POST", on: () => {} },
  );
  const ctx = { web: { search: opts.search ?? (async () => ({ sources: [{ url: "https://e.x" }], truncated: false })) } };
  await serveWebSearch(ctx as never, () => new Set(opts.live ?? ["/w"]), req as never, res as never);
  return { status, body: chunks.join("") };
};

test("a search is forwarded and its result returned", async () => {
  const seen: unknown[] = [];
  const r = await call(JSON.stringify({ query: "bun test" }), {
    search: async (request: unknown) => {
      seen.push(request);
      return { content: "c", sources: [{ url: "https://a" }], truncated: true };
    },
  });
  expect(r.status).toBe(200);
  expect(JSON.parse(r.body)).toEqual({ content: "c", sources: [{ url: "https://a" }], truncated: true });
  // The bound is applied here, not left to the provider: the seam enforces `maxResults` on the
  // way back, so omitting it would let a provider return an unbounded list into a card.
  expect(seen[0]).toEqual({ query: "bun test", maxResults: 8 });
});

// Same fence as the fs and exec routes: a cwd that is not a live session's workspace is refused,
// so the route cannot be used to search on behalf of a workspace nobody has open.
test("a workspace nobody has open is refused", async () => {
  expect((await call(JSON.stringify({ query: "x" }), { cwd: "/elsewhere" })).status).toBe(403);
});

test("an empty query is refused rather than searched", async () => {
  expect((await call(JSON.stringify({ query: "   " }))).status).toBe(400);
  expect((await call("not json")).status).toBe(400);
});

test("GET is not a search", async () => {
  expect((await call("", { method: "GET" })).status).toBe(405);
});

// `WebError.code` is documented as an OPEN set — a provider may raise a code this build has never
// seen — so the route must not match on it. It passes the message through and lets the card show
// something; swallowing it would give the reader a card that is empty for no stated reason.
test("a provider failure comes back as a message, not a crash", async () => {
  const r = await call(JSON.stringify({ query: "x" }), {
    search: async () => {
      throw new Error("WEB_PROVIDER_UNAVAILABLE: no usable provider");
    },
  });
  expect(r.status).toBe(500);
  expect(JSON.parse(r.body).error).toContain("WEB_PROVIDER_UNAVAILABLE");
});
