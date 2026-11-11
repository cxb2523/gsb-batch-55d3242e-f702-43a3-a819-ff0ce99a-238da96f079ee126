import { restoreGlobals } from "./globals.ts";
import { afterAll, expect, test } from "bun:test";
import { bind, registerUi4aHost } from "../src/client/runtime/bindings";

const stream = (parts: Uint8Array[]) =>
  new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(p);
      c.close();
    },
  });

// One global `fetch` is shared by every test FILE, so a stub left installed breaks whichever
// file bun happens to run next — see the note in `read.test.ts`.
afterAll(restoreGlobals);

const collect = async (parts: Uint8Array[]) => {
  globalThis.fetch = (async () => new Response(stream(parts), { status: 200 })) as typeof fetch;
  const release = registerUi4aHost({ cwd: () => "/tmp" } as never);
  try {
    const out: string[] = [];
    for await (const piece of bind().ai.streamText("hi")) out.push(piece);
    return out;
  } finally {
    release();
  }
};

const utf8 = (s: string) => new TextEncoder().encode(s);

test("one piece per network chunk, not one per character", async () => {
  expect(await collect([utf8("你好"), utf8("世界")])).toEqual(["你好", "世界"]);
});

// A card that re-renders per piece pays a setState per piece, so spreading the string is a
// 20x multiplier on a Chinese answer — measured 560 iterations against 27 for the same text.
test("a long answer arrives in as many pieces as there were chunks", async () => {
  const bytes = utf8("这是一段流式返回的中文文本，".repeat(40));
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 64) chunks.push(bytes.slice(i, i + 64));
  const pieces = await collect(chunks);
  expect(pieces).toHaveLength(chunks.length);
  expect(pieces.join("")).toBe(new TextDecoder().decode(bytes));
});

// The reason for `stream: true`: a character split across two chunks must not become U+FFFD.
test("a multi-byte character split across chunks survives", async () => {
  const bytes = utf8("好");
  const pieces = await collect([bytes.slice(0, 1), bytes.slice(1)]);
  expect(pieces.join("")).toBe("好");
  expect(pieces.join("")).not.toContain("�");
});
