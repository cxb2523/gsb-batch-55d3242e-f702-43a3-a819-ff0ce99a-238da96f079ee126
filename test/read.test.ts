/**
 * Canvas file reads.
 *
 * Everything here is about not getting a stale answer: a canvas is re-read precisely because it
 * just changed, so a cached body is the one response guaranteed to be wrong. `no-store` covers
 * the HTTP cache; the serial covers everything else that might key on a URL.
 */
import { restoreGlobals } from "./globals.ts";
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { listCanvasIds, readCanvasChild, readCanvasFile } from "../src/client/canvas/read.ts";

// Restored, because bun shares one global across every test FILE: leaving a stub installed
// broke `compile-pipeline.test.ts`, which fetches its wasm over a real server, with
// "WebAssembly response has unsupported MIME type 'null'" — a failure whose message names
// neither this file nor fetch. The full suite passed anyway only because another file happened
// to sort earlier and warm the compiler first; renaming that file exposed it.
afterAll(restoreGlobals);

let seen: { url: string; init?: RequestInit }[] = [];
let reply: () => Response = () => new Response("body");

beforeEach(() => {
  seen = [];
  (globalThis as any).fetch = (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return Promise.resolve(reply());
  };
});

describe("readCanvasFile", () => {
  test("no two reads of one canvas share a URL", async () => {
    reply = () => new Response("code");
    await readCanvasFile("/w", "dice");
    await readCanvasFile("/w", "dice");
    expect(seen[0].url).not.toBe(seen[1].url);
    expect(seen.every((s) => s.init?.cache === "no-store")).toBe(true);
  });

  // 404 is ordinary, not exceptional: a canvas whose write is still streaming has no file yet,
  // and the sweep runs once per streamed token — so this path is hit constantly.
  test("a missing file is null, not a throw", async () => {
    reply = () => new Response("", { status: 404 });
    expect(await readCanvasFile("/w", "dice")).toBeNull();
  });

  test("a network failure is reported, not mistaken for a missing file", async () => {
    (globalThis as any).fetch = () => Promise.reject(new Error("offline"));
    await expect(readCanvasFile("/w", "dice")).rejects.toThrow("offline");
  });

  for (const status of [403, 500])
    test(`HTTP ${status} is reported`, async () => {
      reply = () => new Response("", { status });
      await expect(readCanvasFile("/w", "dice")).rejects.toThrow(`HTTP ${status}`);
    });

  // The id reaches the server as a query parameter, and canvas ids are routinely non-ASCII.
  test("a non-ASCII id is encoded", async () => {
    reply = () => new Response("code");
    await readCanvasFile("/w", "背单词");
    expect(seen[0].url).toContain(encodeURIComponent("背单词"));
    expect(seen[0].url).not.toContain("背单词");
  });
});

describe("listCanvasIds", () => {
  test("a failed listing remains an error", async () => {
    reply = () => new Response("", { status: 500 });
    await expect(listCanvasIds("/w")).rejects.toThrow("HTTP 500");
    (globalThis as any).fetch = () => Promise.reject(new Error("offline"));
    await expect(listCanvasIds("/w")).rejects.toThrow("offline");
  });
  test("a successful empty listing is still empty", async () => {
    reply = () => Response.json([]);
    expect(await listCanvasIds("/w")).toEqual([]);
  });
});

describe("readCanvasChild", () => {
  // The server resolved which extension the specifier names, and the compiler picks its syntax
  // from the filename — a `.ts` child compiled as `.tsx` fails on its first generic.
  test("the resolved filename comes from the server", async () => {
    reply = () => new Response("export const x = 1", { headers: { "x-ui4a-filename": ".dsh/ui4a/canvases/tarot/deck.ts" } });
    expect((await readCanvasChild("/w", "tarot", "./deck", "from.tsx"))?.filename).toBe(".dsh/ui4a/canvases/tarot/deck.ts");
  });

  test("without the header the specifier is assumed to be .tsx", async () => {
    reply = () => new Response("export const x = 1");
    expect((await readCanvasChild("/w", "tarot", "./deck", "from.tsx"))?.filename).toBe("./deck.tsx");
  });

  test("a refused specifier is null", async () => {
    reply = () => new Response("", { status: 400 });
    expect(await readCanvasChild("/w", "tarot", "../escape", "from.tsx")).toBeNull();
  });
});
