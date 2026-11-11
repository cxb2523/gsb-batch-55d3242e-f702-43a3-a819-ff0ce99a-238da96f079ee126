import { expect, test, beforeEach } from "bun:test";
import { cancelPendingReport, cardRendered, forgetReportedErrors, reportCardError } from "../src/client/runtime/report-error.ts";

beforeEach(forgetReportedErrors);

type Report = { message: string; phase: string } | null;

test("a superseded card's paint cannot cancel a pending report", async () => {
  const sent: Report[] = [];
  const delivered = new Promise<void>((resolve) => {
    reportCardError(
      (report) => {
        sent.push(report);
        resolve();
      },
      "newest card broke",
      "render",
      () => true,
    );
  });
  cardRendered(false, () => false);
  await delivered;
  expect(sent).toEqual([{ message: "newest card broke", phase: "render" }]);
});

// The whole point: before this existed, `onError` had no consumer and a card that failed to
// compile was a red panel the reader saw and the model never did. Measured on a real session —
// the surface printed `has no export named 'MonacoEditor'; module exports: Workspace, errors,
// hydrate, init, lazy`, which contains the fix, and the transcript ends with the model never
// having seen the string.
const settle = () => new Promise((r) => setTimeout(r, 1100));

test("a reported error reaches the host", async () => {
  const sent: Report[] = [];
  reportCardError((r) => sent.push(r), "has no export named 'MonacoEditor'", "compile");
  await settle();
  expect(sent).toEqual([{ message: "has no export named 'MonacoEditor'", phase: "compile" }]);
});

// A half-written component rendering mid-stream throws, and the next frame is fine. Measured in a
// browser: a card that ultimately rendered correctly reported `Cannot read properties of undefined
// (reading 'getCurrentStack')`, a React internal. A red panel for one frame costs nothing; a
// message about a card that then worked costs the model a turn fixing what is not broken.
test("an error the next frame makes untrue is never sent", async () => {
  const sent: Report[] = [];
  reportCardError((r) => sent.push(r), "Cannot read properties of undefined", "render");
  cardRendered();
  await settle();
  expect(sent).toEqual([]);
});

// …but a paint BEFORE the failure must not silence it: that is the ordinary case of a card that
// rendered for a while and then broke on an edit.
test("a paint before the error does not cancel it", async () => {
  const sent: Report[] = [];
  cardRendered();
  reportCardError((r) => sent.push(r), "TypeError: x is not a function", "render");
  await settle();
  expect(sent).toHaveLength(1);
});

/**
 * Recovery is reported, because the report is STATE.
 *
 * The host keeps the failure in the model's runtime context until it hears otherwise, so a card
 * that starts working has to say so — otherwise the model reads about a failure that no longer
 * exists on every step for the rest of the session. As a chat message this was not expressible at
 * all, which is the reason the old body had to explain that nobody had typed it.
 */
test("a card that starts working is reported as recovered", async () => {
  const sent: Report[] = [];
  const send = (r: Report) => sent.push(r);
  reportCardError(send, "boom", "compile");
  await settle();
  expect(sent).toEqual([{ message: "boom", phase: "compile" }]);
  cardRendered();
  expect(sent).toEqual([{ message: "boom", phase: "compile" }, null]);
});

// Only once, though: a settled card that fails re-renders on every later frame of the transcript,
// and a clear per paint is a request per paint.
test("recovery is reported once, not once per paint", async () => {
  const sent: Report[] = [];
  const send = (r: Report) => sent.push(r);
  reportCardError(send, "boom", "compile");
  await settle();
  cardRendered();
  cardRendered();
  cardRendered();
  expect(sent.filter((r) => r === null)).toHaveLength(1);
});

// Nothing was ever delivered, so there is nothing to take back.
test("a paint with no outstanding failure sends nothing", () => {
  const sent: Report[] = [];
  reportCardError((r) => sent.push(r), "boom", "compile");
  cardRendered();
  expect(sent).toEqual([]);
});

// A host with no channel is not an error; it is a headless or embedded surface.
test("no channel is a no-op, not a throw", () => {
  expect(() => reportCardError(undefined, "boom", "compile")).not.toThrow();
});

// partial-react answers a render throw by re-mounting the LAST GOOD component (`runtime.ts:416-419`,
// whenever `preserve` is on — which is every inline card). That re-mount PAINTS, and painting used
// to cancel the report the same throw had just armed, so the one case this feature exists for — a
// card that worked and then broke on an edit — showed stale content and told the model nothing.
test("a restore-to-last-good does not cancel the report it was armed by", async () => {
  const sent: Report[] = [];
  reportCardError((r) => sent.push(r), "no export named MonacoEditor", "compile");
  cardRendered(true); // the restore's paint, ~16ms later
  await settle();
  expect(sent).toHaveLength(1);
});

/**
 * The page going away is not a recovery.
 *
 * Teardown runs the same cancel the next paint would, and routing both through `cardRendered`
 * meant closing a tab told the host the card was fine — clearing a failure that is still there
 * for whoever opens the session next.
 */
test("teardown drops a pending report without claiming the card is fixed", async () => {
  const sent: Report[] = [];
  reportCardError((r) => sent.push(r), "boom", "compile");
  cancelPendingReport();
  await settle();
  expect(sent).toEqual([]);
});

/**
 * Only the newest card counts.
 *
 * An earlier card that cannot render stays in the transcript and re-compiles on every later
 * frame, so it fails again for the rest of the session. Measured on a real one: the model wrote a
 * card importing `Github` from `lucide-react` (removed upstream), was told, fixed it to
 * `GitBranch` in its very next reply — and the badge kept coming back from the message it had
 * already superseded. `scripts/superseded-card.mjs` is the same thing in a browser; without this
 * gate it reports the identical error a second time.
 */
test("a card the transcript has moved past is not reported", async () => {
  const sent: Report[] = [];
  reportCardError(
    (r) => sent.push(r),
    "no export named 'Github'",
    "compile",
    () => false,
  );
  await settle();
  expect(sent).toEqual([]);
});

// The predicate is asked when the report is about to be SENT, not when the error is raised: a
// card is the newest one at the instant it throws and stops being so as soon as the next reply
// lands — which is exactly the second `SETTLE_MS` is waiting out.
test("the newest-card check is made at send time, not at throw time", async () => {
  const sent: Report[] = [];
  let newest = true;
  reportCardError(
    (r) => sent.push(r),
    "no export named 'Github'",
    "compile",
    () => newest,
  );
  newest = false; // the model's next reply arrives while the report is still settling
  await settle();
  expect(sent).toEqual([]);
});

// And the ordinary case still goes through, or the two above would pass on a reporter that never
// fires at all.
test("the newest card is still reported", async () => {
  const sent: Report[] = [];
  reportCardError(
    (r) => sent.push(r),
    "boom",
    "compile",
    () => true,
  );
  await settle();
  expect(sent).toEqual([{ message: "boom", phase: "compile" }]);
});

// **A superseded card must not evict the newest card's armed report.** The gate made the shared
// `pending` slot dangerous: the old card re-compiles on every later frame, and clearing the timer
// before asking the predicate meant the newest card — which IS broken — sent nothing, then could
// not re-arm, because `reportStranded`'s `reportedFor` guard already fired for that code.
test("a superseded card's failure does not starve the newest card's report", async () => {
  const sent: Report[] = [];
  reportCardError(
    (r) => sent.push(r),
    "B broke",
    "render",
    () => true,
  );
  reportCardError(
    () => expect.unreachable("a superseded card must not send"),
    "A broke",
    "render",
    () => false,
  );
  await settle();
  expect(sent).toEqual([{ message: "B broke", phase: "render" }]);
});

// The error path and the recovery path need the SAME gate. Without it a card that may not report a
// failure may still retract someone else's, which a reader reaches by scrolling: an old card enters
// the observer margin, is claimed, compiles and paints.
test("a card that may not report may not retract either", async () => {
  const sent: Report[] = [];
  reportCardError(
    (r) => sent.push(r),
    "A broke",
    "render",
    () => true,
  );
  await settle();
  expect(sent).toEqual([{ message: "A broke", phase: "render" }]);
  cardRendered(false, () => false);
  expect(sent).toEqual([{ message: "A broke", phase: "render" }]);
});

// And the newest card's own paint still clears it, or the test above would pass on a `cardRendered`
// that never retracts anything.
test("the newest card's paint still retracts its failure", async () => {
  const sent: Report[] = [];
  reportCardError(
    (r) => sent.push(r),
    "A broke",
    "render",
    () => true,
  );
  await settle();
  cardRendered(false, () => true);
  expect(sent).toEqual([{ message: "A broke", phase: "render" }, null]);
});
