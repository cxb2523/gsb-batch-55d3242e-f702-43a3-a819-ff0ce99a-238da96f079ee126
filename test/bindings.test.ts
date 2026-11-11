/**
 * The guards and the cache in `bindings.ts`.
 *
 * `stream.test.ts` covers the `$dsh/ai` path only. Measured by inverting each condition alone:
 * eight of the fifteen `if`s in this module changed nothing that any test asserted — including
 * every "no host bound" and "needs a session workspace" guard on `fs` and `exec`, both
 * `!response.ok` denials, and the `bindingImports` cache. A card calling `readFile` with no host
 * would have returned a URL query containing `undefined` rather than saying so.
 */
import { restoreGlobals } from "./globals.ts";
import { beforeEach, afterEach, expect, test } from "bun:test";
import { EXEC_PATH, FS_PATH } from "../src/contract-assets.ts";
import { bind, bindingImports, registerUi4aHost, releaseBindings } from "../src/client/runtime/bindings.ts";

let release: (() => void) | undefined;
// Before, not only after. The module-level host is shared with every other test FILE — bun
// keeps one module registry per RUN — so the "no host bound" test below asserts a state this
// file must ESTABLISH rather than assume. In file order nothing has bound one yet; under
// `--randomize` another file may have registered one and not released it.
//
// `releaseBindings()` does NOT do this: it revokes cached blob URLs and leaves `host` alone.
// Registering a throwaway host and immediately calling its disposer is the only way to reach
// the module's `host = null` from outside.
beforeEach(() => {
  releaseBindings();
  registerUi4aHost({} as never)();
});
afterEach(() => {
  release?.();
  release = undefined;
  restoreGlobals();
  releaseBindings();
});

const hostWith = (cwd: string | undefined) => registerUi4aHost({ cwd: () => cwd, sessionId: () => "s1" } as never);

test("with no host bound, fs and exec say so instead of building a URL", () => {
  expect(() => bind().fs.readFile("a.txt")).toThrow("no host bound");
  // `sendMessage` drives the next turn; with no host it would silently swallow the card's turn.
  expect(() => bind().chat.sendMessage("hi")).toThrow("no host bound");
  expect(() => bind().exec.bash("ls")).toThrow("no host bound");
});

test("a host without a workspace names the missing workspace, not the missing host", () => {
  release = hostWith(undefined);
  expect(() => bind().fs.readFile("a.txt")).toThrow("$dsh/fs needs a session workspace");
  expect(() => bind().exec.bash("ls")).toThrow("$dsh/exec needs a session workspace");
});

// A denial carries the route's own `error` so the card can say "this session is read-only".
test("a rejected fs or exec request surfaces the route's reason", async () => {
  release = hostWith("/tmp");
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://x").pathname;
    expect([FS_PATH, EXEC_PATH]).toContain(path);
    return new Response(JSON.stringify({ error: "read-only session" }), { status: 403 });
  }) as typeof fetch;
  await expect(bind().fs.readFile("a.txt")).rejects.toThrow("read-only session");
  await expect(bind().exec.bash("ls")).rejects.toThrow("read-only session");
});

/**
 * The reason has to be a FIELD, not only a sentence.
 *
 * A card that wants to draw "this session is read-only" differently from "that file is gone"
 * can only do so by branching, and branching on our message text makes every reword a breaking
 * change for cards already written. `denied` says which of the two it is; `code` carries the
 * host's own name for it.
 */
test("a denial is told from an outage by a field, not by the message", async () => {
  release = hostWith("/tmp");
  const failWith = (status: number, error: string) => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error }), { status })) as typeof fetch;
  };
  failWith(403, "FS_SANDBOX_DENIED");
  const refused = await bind()
    .fs.writeFile("a.txt", "x")
    .catch((e: unknown) => e as { denied?: boolean; code?: string });
  expect(refused.denied).toBe(true);
  expect(refused.code).toBe("FS_SANDBOX_DENIED");
  // A missing file is not a denial: same rejection shape, `denied` false, so a card that
  // branches on it offers a retry here and does not offer one above.
  failWith(404, "ENOENT");
  const missing = await bind()
    .fs.readFile("a.txt")
    .catch((e: unknown) => e as { denied?: boolean; code?: string });
  expect(missing.denied).toBe(false);
  expect(missing.code).toBe("ENOENT");
});

// `statusText` is the fallback when the route dies before writing a body at all.
test("a denial with no body still names something", async () => {
  release = hostWith("/tmp");
  globalThis.fetch = (async () => new Response("<html>", { status: 502, statusText: "Bad Gateway" })) as typeof fetch;
  await expect(bind().fs.readFile("a.txt")).rejects.toThrow("Bad Gateway");
});

/**
 * The blob URLs are built once. Rebuilding them per call would leak a URL per import and, worse,
 * hand two surfaces different module identities for `$dsh/fs` — the same singleton problem that
 * makes a second React instance render blank.
 */
test("the binding blobs are built once and revoked on release", () => {
  const first = bindingImports();
  expect(bindingImports()).toBe(first);
  releaseBindings();
  expect(bindingImports()).not.toBe(first);
});

test("session shims are distinct and carry no secret in their source", async () => {
  const a = bindingImports("a");
  const b = bindingImports("b");
  expect(bindingImports("a")).toBe(a);
  expect(a["$dsh/fs"]).not.toBe(b["$dsh/fs"]);
  const aSource = await (await fetch(a["$dsh/fs"])).text();
  const bSource = await (await fetch(b["$dsh/fs"])).text();
  // The capability is the shim's own `import.meta.url`, read in the shim. Nothing is compiled in,
  // so intercepting the text of one reveals no more than the card already had.
  expect(aSource).toContain("bindOwner(import.meta.url)");
  expect(bSource).toContain("bindOwner(import.meta.url)");
  // No literal argument: that is what would put a capability in a string a card can read.
  expect(aSource).not.toMatch(/bindOwner\((["'`])/);
  expect(bSource).not.toMatch(/bindOwner\((["'`])/);
  // …and no session id travels in either body.
  expect(aSource).not.toContain('"a"');
  expect(bSource).not.toContain('"b"');
  const internal = aSource.match(/from "(blob:[^"]+)"/)![1];
  expect(bSource).toContain(internal);
  expect((await fetch(internal)).ok).toBe(true);
  // The internal module is not advertised: `$dsh/internal` resolves for no generated card.
  expect((await import("../src/client/runtime/bindings")).localImports("a")).not.toHaveProperty("$dsh/internal");
});

test("a capability is the shim URL itself, and cannot be forged", async () => {
  const { bindOwner, bindingImports, registerUi4aHost } = await import("../src/client/runtime/bindings");
  release = registerUi4aHost({ cwd: (owner) => owner, sessionId: () => "selected", send() {} });
  const url = bindingImports("victim")["$dsh/fs"];
  expect(() => bindOwner("blob:not-a-shim")).toThrow("no such capability");
  expect(() => bindOwner("victim")).toThrow("no such capability");
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(new URL(String(input), "http://local"));
    return Response.json({ content: "ok" });
  }) as typeof fetch;
  await bindOwner(url).fs.readFile("x");
  expect(urls.at(-1)!.searchParams.get("session")).toBe("victim");
});

test("replacing Map.prototype cannot mint a capability for another session", async () => {
  const { bindOwner, bindingImports, registerUi4aHost } = await import("../src/client/runtime/bindings");
  release = registerUi4aHost({ cwd: (owner) => owner, sessionId: () => "selected", send() {} });
  const capability = bindingImports("victim")["$dsh/fs"];
  const realHas = Map.prototype.has;
  const realGet = Map.prototype.get;
  Map.prototype.has = () => true;
  Map.prototype.get = () => "victim";
  try {
    // The lookup is a null-prototype table, so neither `in` nor `[]` dispatches what a card can
    // replace. If it did, this would hand back the victim's capabilities instead of throwing.
    expect(() => bindOwner("forged-token")).toThrow("no such capability");
    expect(() => bindOwner(capability)).not.toThrow();
  } finally {
    Map.prototype.has = realHas;
    Map.prototype.get = realGet;
  }
});

test("entropy survives a reload even after a card replaced the realm primitives", async () => {
  const first = await import("../src/client/runtime/bindings");
  const capabilityA = first.bindingImports("owner-a")["$dsh/fs"];

  const realUUID = globalThis.crypto.randomUUID;
  (globalThis.crypto as any).randomUUID = () => "known";
  try {
    const second = await import(`../src/client/runtime/bindings.ts?entropy=${Math.random()}`);
    const capabilityB = second.bindingImports("owner-b")["$dsh/fs"];
    // A reload must reuse the entropy captured before generated code ran, not whatever it left
    // in the realm: a constant here would make every later capability — and the bridge key — known.
    expect(capabilityB).not.toBe("known");
    expect(capabilityB).not.toBe(capabilityA);
  } finally {
    (globalThis.crypto as any).randomUUID = realUUID;
  }
});

test("shim construction does not run through anything a card can replace", async () => {
  const { bindingImports, registerUi4aHost } = await import("../src/client/runtime/bindings");
  release = registerUi4aHost({ cwd: (owner) => owner, sessionId: () => "selected", send() {} });
  const stolen: unknown[] = [];
  const realKeys = Object.keys;
  const realMap = Array.prototype.map;
  const realJoin = Array.prototype.join;
  (Object as any).keys = (value: unknown) => {
    stolen.push(value);
    return realKeys(value);
  };
  (Array.prototype as any).map = function (fn: unknown) {
    stolen.push(this);
    return realMap.call(this, fn);
  };
  (Array.prototype as any).join = function (sep: unknown) {
    stolen.push(this);
    return realJoin.call(this, sep);
  };
  try {
    const source = await (await fetch(bindingImports("mine")["$dsh/fs"])).text();
    expect(source).toContain("bindOwner(import.meta.url)");
    // Nothing that reached a replaceable call was a live capability object. If it were, the
    // wrapper could retain `readFile` and use it against whichever session is selected.
    expect(stolen.every((value) => typeof value !== "object" || value === null || Array.isArray(value) || !("readFile" in (value as object)))).toBe(true);
  } finally {
    Object.keys = realKeys;
    (Array.prototype as any).map = realMap;
    (Array.prototype as any).join = realJoin;
  }
});

test("an older entropy holder fails closed instead of minting broken shims", () => {
  const { intrinsicsReady } = require("../src/client/runtime/bindings.ts") as { intrinsicsReady: (holder: Record<string, unknown>) => boolean };
  // The parent build's holder has only entropy and the two Object helpers. Capturing the rest at
  // upgrade time would mean capturing whatever a card left in the realm; refusing is the honest
  // answer, and one page reload fixes it.
  expect(intrinsicsReady({ uuid: () => "x", random: Math.random, define: Object.defineProperty, create: Object.create })).toBe(false);
  expect(intrinsicsReady({ objectURL: () => "blob:x", blob: Blob, entries: Object.entries, keys: Object.keys, values: Object.values })).toBe(true);
});
