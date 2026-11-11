import { expect, test } from "bun:test";
import { collectCanvases, toolCallsOf, type ToolCallView } from "../src/client/canvas/collect";

const write = (argsRaw: string, settled = false): ToolCallView => ({ name: "write_file", argsRaw, settled });
const codeOf = (raw: string, settled = false) => collectCanvases([write(raw, settled)]).canvases[0]?.code;

const full = JSON.stringify({ path: ".dsh/ui4a/canvases/a.ui4a.tsx", content: "a\tb\nc→d" });

test("a settled write yields the whole file", () => {
  const { canvases } = collectCanvases([write(full, true)]);
  expect(canvases).toHaveLength(1);
  expect(canvases[0]).toMatchObject({ id: "a", code: "a\tb\nc→d", streaming: false });
});

// The property the hand-written walk exists for: arguments arrive a few bytes at a time, so
// every prefix has to be a legal input — including ones that stop inside an escape. A throw
// here is a canvas that vanishes mid-generation; a shrink is one that flickers.
test("every prefix parses, and the code only grows", () => {
  let previous = "";
  for (let n = 1; n <= full.length; n += 1) {
    const code = codeOf(full.slice(0, n)) ?? "";
    expect(code.startsWith(previous)).toBe(true);
    previous = code;
  }
  expect(previous).toBe("a\tb\nc→d");
});

// JSON.stringify emits `→` literally, so the \u path needs an argument written by hand — which
// is what a model's tool call actually looks like when it escapes non-ASCII.
test("a \\u escape cut in half emits nothing rather than a wrong character", () => {
  const head = '{"path":".dsh/ui4a/canvases/a.ui4a.tsx","content":"x\\u2192';
  expect(codeOf(`${head.slice(0, head.length - 2)}`)).toBe("x");
  expect(codeOf(head)).toBe("x→");
});

test("an unsettled write reads as streaming", () => {
  expect(collectCanvases([write(full.slice(0, 55))]).canvases[0]!.streaming).toBe(true);
});

/**
 * `toolCallsOf` — the walk over a `tool-call` node.
 *
 * Four conditions here had no test that would notice them going. The consequence of each is a
 * canvas that never appears: a write nested inside `run_code` is a sub-call, so reading only the
 * root finds nothing, and a half-arrived call has a name but no arguments yet.
 */
test("a canvas written through a dispatching tool is found in the sub-calls", () => {
  const inner = { kind: "tool-result", name: "write_file", argsRaw: full };
  const calls = toolCallsOf({ root: { kind: "tool-result", name: "run_code", argsRaw: "{}", subCalls: [inner] } });
  expect(calls.map((c) => c.name)).toEqual(["run_code", "write_file"]);
  expect(collectCanvases(calls).canvases.map((c) => c.id)).toEqual(["a"]);
});

test("a node with no root yields nothing rather than throwing", () => {
  expect(toolCallsOf(undefined)).toEqual([]);
  expect(toolCallsOf({})).toEqual([]);
});

// The name arrives before the arguments do. A view built from half a call would carry
// `undefined` into the parser.
test("a call whose arguments have not arrived is skipped, its children are not", () => {
  const child = { kind: "tool-result", name: "write_file", argsRaw: full };
  expect(toolCallsOf({ root: { name: "run_code", subCalls: [child] } }).map((c) => c.name)).toEqual(["write_file"]);
});

/**
 * A patch to a canvas this session never wrote still gets a panel — with empty code, which the
 * sweep then fills by reading the file. Dropping it means editing an existing card shows nothing.
 */
test("a patch to a canvas never written here still yields a canvas", () => {
  const { canvases, stale } = collectCanvases([{ name: "edit_file", argsRaw: JSON.stringify({ path: ".dsh/ui4a/canvases/b.ui4a.tsx", old_str: "x", new_str: "y" }), settled: true }]);
  expect(canvases).toEqual([{ id: "b", code: "", streaming: false }]);
  expect([...stale.keys()]).toEqual(["b"]);
});

// ...but a patch that follows a write in the same session must not blank the written code.
test("a patch after a write leaves the written code alone", () => {
  const { canvases } = collectCanvases([
    { name: "write_file", argsRaw: full, settled: true },
    { name: "edit_file", argsRaw: JSON.stringify({ path: ".dsh/ui4a/canvases/a.ui4a.tsx", old_str: "x", new_str: "y" }), settled: true },
  ]);
  expect(canvases).toEqual([{ id: "a", code: "a\tb\nc→d", streaming: false }]);
});
