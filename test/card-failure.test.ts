import { expect, test } from "bun:test";
import { CardFailures, failureText, WAKE_TEXT } from "../src/card-failure.ts";

/**
 * Deduplication lives HOST-side, and that placement is the point.
 *
 * It used to be a `Set` in the browser half, which every navigation throws away — so a reload
 * woke the model again about a card it had already been told about. The host outlives the page.
 */
test("the same failure is news once", () => {
  const failures = new CardFailures();
  expect(failures.set("s1", { message: "boom", phase: "compile" })).toBe(true);
  expect(failures.set("s1", { message: "boom", phase: "compile" })).toBe(false);
});

// The notice carries no detail — it says "go read the runtime context" and nothing else. So a
// second failure while one is already recorded has nothing new to announce: the context it points
// at is re-evaluated every step and already holds the newer message. Measured on a real session,
// the old "is the message different" test produced two byte-identical notices queued in the
// composer, and would have pointed two turns at one snapshot.
test("a different failure while one is already open is not a second nudge", () => {
  const failures = new CardFailures();
  expect(failures.set("s1", { message: "boom", phase: "compile" })).toBe(true);
  expect(failures.set("s1", { message: "different", phase: "compile" })).toBe(false);
  expect(failures.set("s1", { message: "different", phase: "render" })).toBe(false);
  // …but the model still reads the NEWEST one, because that is what the context serves.
  expect(failures.text("s1")).toContain("different");
  expect(failures.text("s1")).toContain("render");
});

test("recovery re-arms the nudge", () => {
  const failures = new CardFailures();
  failures.set("s1", { message: "boom", phase: "compile" });
  failures.clear("s1");
  expect(failures.set("s1", { message: "boom", phase: "compile" })).toBe(true);
});

test("sessions do not share a failure", () => {
  const failures = new CardFailures();
  failures.set("s1", { message: "boom", phase: "compile" });
  expect(failures.set("s2", { message: "boom", phase: "compile" })).toBe(true);
  expect(failures.text("s2")).toContain("boom");
  failures.clear("s1");
  expect(failures.text("s2")).toContain("boom");
});

/**
 * An empty context contributes nothing to the assembly, which is how a fixed card stops being
 * mentioned. The old chat message could not be taken back: the model read about a card it had
 * repaired three turns ago on every step until compaction.
 */
test("a cleared session contributes no context", () => {
  const failures = new CardFailures();
  failures.set("s1", { message: "boom", phase: "compile" });
  expect(failures.text("s1")).not.toBe("");
  failures.clear("s1");
  expect(failures.text("s1")).toBe("");
});

test("an unknown or absent session contributes no context", () => {
  const failures = new CardFailures();
  expect(failures.text("never-seen")).toBe("");
  expect(failures.text(undefined)).toBe("");
});

test("the context carries the message and the phase", () => {
  const text = failureText({ message: "has no export named 'MonacoEditor'", phase: "compile" });
  expect(text).toContain("has no export named 'MonacoEditor'");
  expect(text).toContain("compile");
});

/**
 * No disclaimer, in either half.
 *
 * The old body spent a paragraph on *"This was sent by the renderer, not by the user — nobody
 * typed it, so do not apologise"*, because it arrived wearing the user's face. A `kind: "plugin"`
 * source does not, so that paragraph is not just unnecessary, it is a claim about the transcript
 * that is no longer true.
 */
test("neither half claims to be a user message", () => {
  for (const text of [failureText({ message: "boom", phase: "compile" }), WAKE_TEXT]) {
    expect(text).not.toContain("nobody typed");
    expect(text).not.toContain("[automatic]");
  }
});

/**
 * English, like the prompt and the skill beside it. In Chinese this read as a different voice —
 * and worse, a card must be written in the language the USER wrote in, so a Chinese interruption
 * pushed the model toward the wrong language for the rest of the turn.
 */
test("both halves are in English, like the prompt and the skill", () => {
  for (const text of [failureText({ message: "boom", phase: "compile" }), WAKE_TEXT]) {
    expect(text).not.toMatch(/[一-鿿]/);
  }
});

/**
 * The detail is re-delivered on every step while the card stays broken, so it has to read as
 * state. Without this the model treats each step's copy as a fresh report and tries the fix again.
 */
test("the context says it is current state, not a new event", () => {
  expect(failureText({ message: "boom", phase: "compile" })).toContain("current state");
});

/**
 * The nudge has to survive its own detail disappearing.
 *
 * `followup` cannot be recalled once queued, and the context provider runs later — so a card that
 * recovers in between opens a turn whose notice points at a context section that is no longer
 * there. Measured on a real session: the second of two notices had no card-failure section in the
 * turn that followed, and the model went looking and rewrote a card that was fine.
 */
test("the nudge says what to do when the failure is already gone", () => {
  const failures = new CardFailures();
  expect(failures.set("s", { message: "boom", phase: "render" })).toBe(true); // the wake fires here
  failures.clear("s"); // …and the card recovers before the turn assembles
  expect(failures.text("s")).toBe(""); // so the context the notice points at is empty
  expect(WAKE_TEXT).toContain("recovered on its own");
});
