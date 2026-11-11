import { expect, test } from "bun:test";
import { parseFences, parseUi4aSegments as p } from "../src/client/runtime/segments.ts";
test("standard", () => {
  const [b] = p("说明\n\n````ui4a/tsx\nexport default function A() {}\n````\n收尾");
  expect(b.code).toBe("export default function A() {}\n");
  expect(b.complete).toBe(true);
});
test("open mid-sentence", () => {
  const [b] = p("……完整元素周期表。````ui4a/tsx\nexport default function A() {}\n````");
  expect(b.complete).toBe(true);
});
test("first line glued to lang", () => {
  const [b] = p('````ui4a/tsx import { useState } from "react"\nexport default function A() {}\n````');
  expect(b.code.startsWith('import { useState } from "react"\n')).toBe(true);
});
test("close glued to last line", () => {
  const [b] = p("````ui4a/tsx\nexport default function A() {}````");
  expect(b.complete).toBe(true);
});
test("streaming", () => {
  const [b] = p("````ui4a/tsx\nexport default function A() {");
  expect(b.complete).toBe(false);
});
test("longer fence not cut", () => {
  const [b] = p("`````ui4a/tsx\nconst md = `\\`\\`\\``\n`````");
  expect(b.complete).toBe(true);
});
test("python untouched", () => {
  expect(p("```python\nprint(1)\n```")).toHaveLength(0);
});
test("two blocks", () => {
  expect(p("````ui4a/tsx\nA\n````\n中间\n````ui4a/tsx\nB\n````")).toHaveLength(2);
});
test("meta on fence line", () => {
  const [b] = p("````ui4a/tsx title=demo\nexport default function A() {}\n````");
  expect(b.code).toBe("export default function A() {}\n");
});

// The one unbalanced fence in a 183-session corpus: the model glued `</parameter></invoke>`
// onto its last line of TSX. Left in, the body fails to compile — the reader loses the whole card.
test("leaked tool-call markup dropped", () => {
  const [b] = p("好的\n````ui4a/tsx\nexport default () => <div />\n</parameter>\n</invoke>");
  expect(b.complete).toBe(false);
  expect(b.code).toBe("export default () => <div />");
});
test("lookalike inside code survives", () => {
  const [b] = p("````ui4a/tsx\nconst s = `</parameter>`\n");
  expect(b.code).toBe("const s = `</parameter>`\n");
});
// 19 of 405 fence openers in the corpus are the model *describing* the fence rather than opening one;
// 14 put the sentence right after the language. Dropping those costs 0 of 390 real cards.
test("prose about the fence is not a card", () => {
  expect(p("用 ````ui4a/tsx```` 块，原地渲染成可交互界面\n讲完了。")).toHaveLength(0);
});
test("meta after the language still opens a card", () => {
  const [b] = p("````ui4a/tsx title=demo\nexport default function A() {}\n````");
  expect(b.code).toBe("export default function A() {}\n");
});
// 18 of 385 openers in the corpus are closed by a SHORTER run — markdown says that does not close
// the fence, so each was a card that streamed forever. `open=6 close=4` is the common shape.
test("a shorter closing fence still closes", () => {
  const [b] = p("``````ui4a/tsx\nexport default function A() {}\n````\n收尾");
  expect(b.complete).toBe(true);
  expect(b.code).toBe("export default function A() {}\n");
});
test("an exact closer still wins over an earlier shorter one", () => {
  const [b] = p("`````ui4a/tsx\nconst md = `\\`\\`\\``\n`````");
  expect(b.complete).toBe(true);
  expect(b.code).toBe("const md = `\\`\\`\\``\n");
});
// Ordering, not just presence: the exact-length closer must be tried FIRST, or a ```js block inside
// the card's own strings ends the card at its first line. This is the entire reason the prompt asks
// for four backticks, and "try short, then exact" passes every other test in this file.
test("a triple-backtick run inside the body does not close a longer fence", () => {
  const [b] = p("`````ui4a/tsx\nconst help = `\n```js\nfoo()\n```\n`\nexport default function A() {}\n`````");
  expect(b.complete).toBe(true);
  expect(b.code.includes("export default")).toBe(true);
});
// The model's own tool-call spelling, three times in the corpus against one for the ASCII form.
// Those bars are U+FF5C. A regex written from the single ASCII sample could not see any of them.
test("the DSML tool-call spelling is dropped too", () => {
  const [b] = p("````ui4a/tsx\nexport default () => <div />\n</｜｜DSML｜｜parameter>\n</｜｜DSML｜｜invoke>\n</｜｜DSML｜｜tool_calls>");
  expect(b.code).toBe("export default () => <div />");
});

/**
 * A fence opened inside a wider fence is a wrapper, not a card.
 *
 * This project's own prompt shows the block wrapped in five backticks so the four-backtick
 * fence inside it survives the example — and once in 389 corpus openers the model copied the
 * wrapper into its reply. Taking the outer fence gives a body that is the inner fence **as
 * text**, which compiles cleanly (measured, both modes) and renders nothing: no error anywhere,
 * the reader just gets a blank card.
 */
test("a fence wrapped in a wider fence yields the inner card", () => {
  const wrapped = "before\n\n`````ui4a/tsx\n````ui4a/tsx\nexport default () => <div>hi</div>\n````\n`````\n\nafter";
  expect(p(wrapped)).toEqual([{ code: "export default () => <div>hi</div>\n", complete: true }]);
});

// ...and a fence that merely CONTAINS a backtick run in its body is untouched: a card printing
// a markdown example is ordinary, and skipping to an inner opener there would lose it.
test("backticks inside a card's body do not make it a wrapper", () => {
  const code = 'export default () => <pre>{"```js\\nlet a = 1\\n```"}</pre>\n';
  expect(p(`\`\`\`\`ui4a/tsx\n${code}\`\`\`\`\n`)).toEqual([{ code, complete: true }]);
});

// The leak does not only happen mid-stream: the model writes the tags AND then closes the fence.
// Stripping only the unterminated body left that card failing to compile (measured on a real one).
test("leaked markup dropped from a closed fence too", () => {
  const [b] = p("````ui4a/tsx\nexport default () => <div />\n</parameter>\n</invoke>\n````");
  expect(b.complete).toBe(true);
  expect(b.code).toBe("export default () => <div />");
});

// `parseFences` exists to answer "which fence, and in what language" for EVERY block — the ui4a
// parser only recognises its own language, so it cannot tell a card from a sample that opens the
// same way, which is how a 162-character excerpt held an 8 KB card out of a real transcript.
test("parseFences lists every fence with its language, in order", () => {
  const text = '说明\n\n````ui4a/tsx\nexport default () => <div />\n````\n\n```tsx\nimport NumberFlow from "x";\n```\n';
  expect(parseFences(text).map((fence) => [fence.lang, fence.code.trimEnd(), fence.complete])).toEqual([
    ["ui4a/tsx", "export default () => <div />", true],
    ["tsx", 'import NumberFlow from "x";', true],
  ]);
});

// CommonMark renders `~~~` as a code block in the same wrapper, so leaving it out of this list
// shifts every index after it — and the block this map exists to veto is exactly the one that
// slips through.
test("parseFences sees tilde fences too", () => {
  const text = "~~~tsx\nconst a = 1\n~~~\n\n````ui4a/tsx\nexport default () => <div />\n````\n";
  expect(parseFences(text).map((fence) => [fence.lang, fence.code.trimEnd()])).toEqual([
    ["tsx", "const a = 1"],
    ["ui4a/tsx", "export default () => <div />"],
  ]);
});

// A `~~~` line inside an unterminated backtick fence is a nested Markdown example, not this
// card's closer. Accepting it truncates the card mid-stream — and permanently when the model
// never writes the real closer.
test("a tilde line does not close a backtick fence", () => {
  const [card] = p("````ui4a/tsx\nexport default () => <div />\n~~~\nconst a = 1");
  expect(card.complete).toBe(false);
  expect(card.code).toContain("~~~");
});

// A streaming reply leaves the last fence open; its language still has to be known.
test("parseFences marks an unterminated fence incomplete", () => {
  const [fence] = parseFences("```tsx\nconst a = 1");
  expect(fence).toEqual({ lang: "tsx", code: "const a = 1", complete: false });
});
