import { expect, test } from "bun:test";
import { deliver, deliveryFor, importSignature, probeOutcome } from "../src/client/runtime/GenUISurface.tsx";

/**
 * The frame-delivery decision. `pushCode` APPENDS while a session event carries the whole
 * prefix so far — the reason this is a state machine at all, and the reason getting it wrong
 * doubles the buffer on every frame rather than failing loudly.
 *
 * It lived inside an effect behind three refs, so none of its four answers was constrained.
 */
test("a settled frame replaces the buffer outright", () => {
  expect(deliveryFor("full card", "", false)).toEqual({ do: "replace", code: "full card" });
});

test("a settled frame identical to what is painted does nothing", () => {
  // The common case: the effect re-runs because another dependency changed.
  expect(deliveryFor("full card", "full card", false)).toEqual({ do: "nothing" });
});

test("a streaming frame appends only the delta", () => {
  expect(deliveryFor("abcdef", "abc", true)).toEqual({ do: "append", delta: "def" });
});

test("a streaming frame that grew by nothing does nothing", () => {
  // A closing fence adds no text — the case that kept `inline-fence` on the streaming path.
  expect(deliveryFor("abc", "abc", true)).toEqual({ do: "nothing" });
});

test("a rewritten prefix restarts with the whole frame", () => {
  // A re-delivered history page, or an edit. Appending the delta here is meaningless because
  // there is no delta — the buffer holds text this frame does not contain.
  expect(deliveryFor("xyz", "abc", true)).toEqual({ do: "restart", code: "xyz" });
});

test("settled is decided before the prefix relationship", () => {
  // A settled frame that is NOT a prefix extension still replaces rather than restarts: there
  // is no partial state to preserve, and `restart` would clear the surface for nothing.
  expect(deliveryFor("xyz", "abc", false)).toEqual({ do: "replace", code: "xyz" });
});

test("the first streaming frame appends everything", () => {
  expect(deliveryFor("abc", "", true)).toEqual({ do: "append", delta: "abc" });
});

test("an empty settled frame with a painted buffer still replaces", () => {
  // A card edited down to nothing must clear, not silently keep the old render.
  expect(deliveryFor("", "abc", false)).toEqual({ do: "replace", code: "" });
});

/**
 * The other half: routing a `Delivery` to the renderer. `render` REPLACES the buffer and
 * `pushCode` APPENDS to it, so swapping them doubles the card on every streamed frame — a
 * one-word difference that used to live inside an effect where nothing could reach it.
 */
const spy = () => {
  const calls: string[] = [];
  const renderer = {
    render: (code: string) => void calls.push(`render:${code}`),
    pushCode: (delta: string) => void calls.push(`push:${delta}`),
    clear: (options: { preserveVisualState: boolean }) => void calls.push(`clear:${options.preserveVisualState}`),
  };
  return { renderer, calls };
};

test("nothing calls nothing, and tells the caller not to advance", () => {
  const { renderer, calls } = spy();
  expect(deliver(renderer, { do: "nothing" })).toBe(false);
  expect(calls).toEqual([]);
});

test("replace renders the whole code", () => {
  const { renderer, calls } = spy();
  expect(deliver(renderer, { do: "replace", code: "abc" })).toBe(true);
  expect(calls).toEqual(["render:abc"]);
});

test("append pushes only the delta", () => {
  const { renderer, calls } = spy();
  expect(deliver(renderer, { do: "append", delta: "def" })).toBe(true);
  expect(calls).toEqual(["push:def"]);
});

/**
 * `preserveVisualState: true` is the whole point of the restart path — clearing without it blanks
 * a surface that was showing a working card, on every re-delivered history page.
 */
test("restart clears without blanking, then pushes the whole code", () => {
  const { renderer, calls } = spy();
  expect(deliver(renderer, { do: "restart", code: "xyz" })).toBe(true);
  expect(calls).toEqual(["clear:true", "push:xyz"]);
});

/**
 * The import-map probe is cached against this signature. It must change when the card starts
 * importing something new — an unresolvable bare specifier fails the WHOLE module import, so a
 * stale signature means a surface that stays blank for good.
 */
test("the signature changes when a new import appears", () => {
  const before = importSignature(`import { useState } from "react";`);
  const after = importSignature(`import { useState } from "react";\nimport x from "recharts";`);
  expect(before).not.toBe(after);
});

test("the signature ignores what is imported, only from where", () => {
  expect(importSignature(`import { a } from "react";`)).toBe(importSignature(`import { b, c } from "react";`));
});

test("a card with no imports has an empty signature", () => {
  expect(importSignature(`export default () => <b/>;`)).toBe("");
});

test("both quote styles are seen", () => {
  expect(importSignature(`import a from 'recharts';`)).toBe("recharts");
});

/**
 * What an import probe does when it settles. All three branches were unconstrained inside the
 * effect, and each wrong answer is a distinct visible bug: a stale probe reverts the import map
 * and the newer frame's packages vanish; a missing redeliver leaves a settled card blank for
 * good; an extra one truncates a stream to whatever prefix was current when the probe fired.
 */
test("a probe overtaken by a later frame is dropped", () => {
  expect(probeOutcome("recharts", "recharts,motion", false, "code", "code")).toBe("stale");
});

test("a settled surface must be re-rendered — nothing else will apply the map", () => {
  expect(probeOutcome("recharts", "recharts", false, "code", "code")).toBe("redeliver");
});

test("while streaming a newer frame applies it; re-rendering here truncates the stream", () => {
  expect(probeOutcome("recharts", "recharts", true, "newer code", "code")).toBe("store");
});

/**
 * The last frame of a stream introduces the specifier as often as any other frame does, and
 * "the next frame will apply the map" is then a bet on a frame that never comes. Measured on a
 * real card importing `@radix-ui/react-tabs`: one delivery with `streaming: true` renders 0
 * characters permanently, and `errorAction` answers `ignore`, so nothing tells anyone.
 */
test("while streaming with no frame since the probe, nothing else will apply the map either", () => {
  expect(probeOutcome("recharts", "recharts", true, "code", "code")).toBe("redeliver");
});

test("an empty buffer is never re-rendered — that would clear the surface", () => {
  expect(probeOutcome("recharts", "recharts", false, "", "code")).toBe("store");
});
