import { expect, test } from "bun:test";
import { callsKeyOf, textOf } from "../src/client/index.ts";
import type { ChatNodeView } from "../src/client/session.ts";

const node = (data: unknown): ChatNodeView => ({ kind: "x", data, anchorSeq: 0 });

test("textOf concatenates assistant prose and ignores every other block kind", () => {
  expect(textOf(node({ blocks: [{ kind: "text", text: "a" }, { kind: "tool-call" }, { kind: "text", text: "b" }] }))).toBe("ab");
});

test("textOf is empty for a node that carries no blocks", () => {
  expect(textOf(node(undefined))).toBe("");
  expect(textOf(node({}))).toBe("");
  // A text block with no text yet — the state every streamed reply passes through.
  expect(textOf(node({ blocks: [{ kind: "text" }] }))).toBe("");
});

test("callsKeyOf changes as arguments stream", () => {
  const at = (argsRaw: string) => callsKeyOf(node({ root: { kind: "tool-call", argsRaw } }));
  expect(at("{}")).not.toBe(at('{"a":1}'));
});

/**
 * The invariant the settled marker exists for. `argsRaw` is already complete when the result
 * arrives, so a key built from length alone is identical before and after — the cached view
 * would claim `streaming` forever, which is a canvas that never stops pulsing.
 */
test("callsKeyOf changes when a call settles, though its arguments did not grow", () => {
  const args = '{"path":"a.tsx"}';
  expect(callsKeyOf(node({ root: { kind: "tool-call", argsRaw: args } }))).not.toBe(callsKeyOf(node({ root: { kind: "tool-result", argsRaw: args } })));
});

test("callsKeyOf walks nested sub-calls", () => {
  const withChild = (childArgs: string) => callsKeyOf(node({ root: { kind: "tool-call", argsRaw: "{}", subCalls: [{ kind: "tool-call", argsRaw: childArgs }] } }));
  expect(withChild("{}")).not.toBe(withChild('{"deep":1}'));
  // and a missing root is not a crash
  expect(callsKeyOf(node(undefined))).toBe("");
});

test("callsKeyOf prefers the nested call's argsRaw over the block's own", () => {
  const key = callsKeyOf(node({ root: { kind: "tool-call", argsRaw: "xx", call: { argsRaw: "longer-args" } } }));
  expect(key).toBe("11");
});
