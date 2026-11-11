import { expect, test } from "bun:test";
import { CANVAS_BROWSER_ID, CANVAS_BROWSER_KIND, CANVAS_TAB_ID, canvasBrowserDefinition, canvasIdOfAddress, canvasTabDefinition, isCanvasAddress } from "../src/client/canvas/definition.ts";
import { sessionFileAddress, absoluteFileAddress } from "@deepseek-ai/dsh-util-workspace-path";

const SID = "s1";
const canvas = (id: string) => sessionFileAddress(SID, `.dsh/ui4a/canvases/${id}.ui4a.tsx`);

test("claims a canvas entry file", () => {
  expect(isCanvasAddress(canvas("todo"))).toBe(true);
  // The contract widens ids past ASCII (§4.5) and the tab has to follow it, or a Chinese
  // canvas is written, claimed by nobody, and the reply still says it is done.
  expect(isCanvasAddress(canvas("背单词"))).toBe(true);
});

test("declines anything that is not a canvas entry", () => {
  // A sibling `.tsx` is a sub-page, not a tab of its own.
  expect(isCanvasAddress(sessionFileAddress(SID, ".dsh/ui4a/canvases/todo/deck.tsx"))).toBe(false);
  // A `.ui4a.tsx` outside the contract directory is just a file with a suffix.
  expect(isCanvasAddress(sessionFileAddress(SID, "notes.ui4a.tsx"))).toBe(false);
  // The near-misses that a suffix glob would grab if `canOpen` were not there.
  expect(isCanvasAddress(sessionFileAddress(SID, ".dsh/ui4a/canvases/todo.ui4a.ts"))).toBe(false);
  expect(isCanvasAddress(sessionFileAddress(SID, ".dsh/ui4a/canvases/todo.tsx"))).toBe(false);
  expect(isCanvasAddress(sessionFileAddress(SID, "README.md"))).toBe(false);
});

test("declines an address with no session — there would be no cwd to read it with", () => {
  const absolute = absoluteFileAddress("/home/me/proj/.dsh/ui4a/canvases/todo.ui4a.tsx");
  // The path IS a canvas; the scope is what disqualifies it. Assert both, so this cannot
  // pass by matching on path alone.
  expect(absolute).toContain("todo.ui4a.tsx");
  expect(isCanvasAddress(absolute)).toBe(false);
});

test("title is the canvas id, not the address", () => {
  expect(canvasTabDefinition.title(canvas("todo"))).toBe("todo");
  expect(canvasTabDefinition.title(canvas("背单词"))).toBe("背单词");
});

test("the id is decoded, the address is not", () => {
  // The general rule behind the CJK case: `sessionFileAddress` percent-encodes segments, so
  // matching the contract against the raw URI yields an id that is ASCII, passes `isCanvasId`,
  // and names a file that does not exist. It looked fine and read nothing.
  const encoded = canvas("背单词");
  expect(encoded).toContain("%E8%83%8C");
  expect(canvasIdOfAddress(encoded)).toBe("背单词");
  // Same mechanism, a different script — and the id rules out whitespace, so `a b` is not a
  // canvas id at all (`isCanvasId` excludes `\s`).
  expect(canvasIdOfAddress(canvas("café"))).toBe("café");
  expect(canvasIdOfAddress(sessionFileAddress(SID, ".dsh/ui4a/canvases/a b.ui4a.tsx"))).toBeNull();
});

test("the static face is the one the tab system needs", () => {
  expect(canvasTabDefinition.id).toBe(CANVAS_TAB_ID);
  expect(canvasTabDefinition.kind).toBe("ui4a-canvas");
  // The band that outranks every viewer the product ships — without it documentpreview's
  // `dsh-resource://file/**` fallback shows a canvas as source text.
  expect(canvasTabDefinition.priority).toBe("extension");
  // A canvas runs timers and the reader comes back to it; unmounting on hide would kill both.
  expect(canvasTabDefinition.keepMounted).toBe(true);
  // A pattern with no `:` matches the URI path at any depth, which is what makes this claim
  // `.dsh/ui4a/canvases/<id>.ui4a.tsx` and not every `.tsx`.
  expect(canvasTabDefinition.patterns).toEqual(["*.ui4a.tsx"]);
  // Unset on purpose: a canvas's content identity is its address, and the registry makes two
  // opens of one address the same tab. `multiple` is for page types opened by kind.
  expect(canvasTabDefinition.multiple).toBeUndefined();
});

test("the browser is a page type with a guide capsule", () => {
  const t = (key: string) => key;
  const browser = canvasBrowserDefinition(t as never);
  // A page type recognizes no address: a guide capsule opens its contributor BY KIND at
  // `sidebar://<kind>`, which would never match `*.ui4a.tsx`. Pointing a capsule at the file
  // type would open an address no type claims and throw.
  expect(browser.patterns).toBeUndefined();
  expect(browser.kind).toBe(CANVAS_BROWSER_KIND);
  // Two types, two ids — the seat is dispatched with the definition's `id`, so sharing one
  // would send both bodies the other's tabs.
  expect(browser.id).toBe(CANVAS_BROWSER_ID);
  expect(browser.id).not.toBe(canvasTabDefinition.id);
  expect(browser.guide).toHaveLength(1);
  // `sidebar-files` contributes its workspace capsule at `order: 10`; sitting after it is the
  // difference between "next to the thing you'd look for it near" and "at the bottom".
  expect(browser.guide![0]!.order).toBeGreaterThan(10);
  expect(browser.guide![0]!.title()).toBe("guide.title");
  expect(typeof browser.guide![0]!.icon).toBe("function");
});
