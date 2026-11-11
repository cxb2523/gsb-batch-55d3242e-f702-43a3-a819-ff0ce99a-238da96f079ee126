/**
 * `isPaintedText` is the text half of `hasPainted`, which decides when the host's own code block is hidden behind a rendered card.
 *
 * The case that matters is the one it used to get wrong: partial-react's error boundary
 * renders a bare `ERROR: …` text node, which is text, so the source block was hidden at
 * exactly the moment the reader most needs to see what the model wrote. See CLAUDE.md §4's
 * table — an empty mount and an `ERROR:` mount are both zero-children and want opposite
 * responses.
 */
import { describe, expect, test } from "bun:test";
import { hasPainted, isPaintedText, matchSegment, sameCode } from "../src/client/runtime/inline-fence.ts";

describe("isPaintedText", () => {
  test("a rendered card counts", () => {
    expect(isPaintedText("月供 4890.17 元")).toBe(true);
  });

  test("the error boundary's output does not", () => {
    expect(isPaintedText("ERROR: item.difficulty is undefined")).toBe(false);
    expect(isPaintedText("ERROR")).toBe(false);
  });

  test("a card whose own text opens with ERROR still counts", () => {
    // `^ERROR(:|$)` and not `startsWith("ERROR")`: a log viewer is a real card.
    expect(isPaintedText("ERROR 404 是什么意思？共 12 条日志")).toBe(true);
  });

  test("an empty mount does not", () => {
    expect(isPaintedText("")).toBe(false);
  });
});

/**
 * Which segment a rendered block belongs to.
 *
 * Mid-stream the DOM shows a prefix of the segment, so the match is `startsWith`; once settled
 * they are equal, modulo the one trailing newline CodeBlock trims for display. Getting this
 * wrong shows the reader a different card than the one they are looking at — and with two cards
 * in one reply, a prefix match against the wrong one is entirely possible.
 *
 * A prefix therefore only belongs to a segment that is STILL GROWING: a settled segment that opens
 * with a shorter block is not that block's card. Measured in a real session, where a 162-character
 * excerpt pasted into prose took a finished card's 8 KB segment in DOM order and kept the card from
 * ever claiming.
 */
describe("matchSegment", () => {
  const seg = (code: string, complete = true) => ({ code, complete });

  test("a settled block matches its own segment", () => {
    const segments = [seg("export default function A() {}\n"), seg("export default function B() {}\n")];
    expect(matchSegment(segments, "export default function B() {}")?.code).toBe("export default function B() {}\n");
  });

  test("a mid-stream prefix matches the segment it is a prefix of", () => {
    const segments = [seg("export default function Counter() { return <div /> }", false)];
    expect(matchSegment(segments, "export default function Coun")).toBe(segments[0]);
  });

  test("a settled segment is not handed to a shorter block that prefixes it", () => {
    const segments = [seg("export default function Counter() { return <div /> }")];
    expect(matchSegment(segments, "export default function Coun")).toBeUndefined();
  });

  // Document order decides ties: two cards that begin identically are indistinguishable until
  // the stream diverges, and the first is the one the reader is looking at.
  test("an ambiguous prefix takes the first segment", () => {
    const segments = [seg('import { useState } from "react"\nconst A = 1', false), seg('import { useState } from "react"\nconst B = 2', false)];
    expect(matchSegment(segments, 'import { useState } from "react"\n')).toBe(segments[0]);
  });

  // Exact match is searched across the whole list before any prefix, so a finished card wins over
  // an unfinished one that happens to open the same way.
  test("an exact match beats an earlier prefix match", () => {
    // The first is longer and still growing, so it answers `startsWith`; only the second is this
    // block's own card.
    const segments = [seg("export default () => <div>a</div>\n// and more", false), seg("export default () => <div>a</div>", true)];
    expect(matchSegment(segments, "export default () => <div>a</div>")).toBe(segments[1]);
  });

  test("a block belonging to no segment matches nothing", () => {
    expect(matchSegment([seg("export default function A() {}")], "console.log('unrelated')")).toBeUndefined();
  });

  // The trailing-newline tolerance: CodeBlock trims one for display, so an exact compare would
  // fail on every settled card and the source block would never be hidden.
  test("a trailing newline does not break the match", () => {
    expect(sameCode("const a = 1\n", "const a = 1")).toBe(true);
    expect(sameCode("const a = 1", "const b = 1")).toBe(false);
  });
});

/**
 * `hasPainted` — the whole rule, not just its text half.
 *
 * A card that draws instead of writing (a chart, a canvas game, a bare `<svg>`) has no text at
 * all, so the text check alone would leave the source block visible under a perfectly good
 * card. The element half exists for that, and it is measured on the *box*: an element that is
 * present but zero-sized has not painted anything the reader can see.
 *
 * Only four DOM members are touched, so a fake mount is cheaper and more honest than a DOM
 * library — the test then depends on exactly the surface the function depends on.
 */
describe("hasPainted", () => {
  const el = (tagName: string, box: { width: number; height: number }) => ({ tagName, getBoundingClientRect: () => box });
  const mount = (textContent: string, children: ReturnType<typeof el>[] = []) => ({ textContent, querySelectorAll: () => children }) as unknown as HTMLElement;
  const box = { width: 300, height: 200 };
  const zero = { width: 0, height: 0 };

  test("text alone counts", () => {
    expect(hasPainted(mount("月供 4890.17 元"))).toBe(true);
  });

  test("a chart with no text counts", () => {
    expect(hasPainted(mount("", [el("svg", box)]))).toBe(true);
    expect(hasPainted(mount("", [el("canvas", box)]))).toBe(true);
  });

  // A custom element is anything with a dash, because a card may render one this list has
  // never heard of — the naming rule is the only reliable signal that it is not a layout div.
  test("a custom element counts", () => {
    expect(hasPainted(mount("", [el("my-widget", box)]))).toBe(true);
  });

  // The reason it measures the box: React mounts the element before it has laid out, and an
  // `<svg>` with no size is a card that has not drawn yet.
  test("a zero-sized element does not count", () => {
    expect(hasPainted(mount("", [el("svg", zero)]))).toBe(false);
  });

  // A plain layout div is not evidence of anything: an empty card is full of them.
  test("ordinary elements do not count", () => {
    expect(hasPainted(mount("", [el("div", box), el("span", box)]))).toBe(false);
  });

  // The case the whole rule exists for: the error boundary's text must not hide the source.
  test("an error boundary does not count, even though it has text", () => {
    expect(hasPainted(mount("ERROR: item.difficulty is undefined"))).toBe(false);
  });
});
