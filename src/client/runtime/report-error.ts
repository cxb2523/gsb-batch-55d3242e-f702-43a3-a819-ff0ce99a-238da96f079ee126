/**
 * Sends a card's compile error back to the model as a chat message.
 *
 * Until this existed, `onError` had no consumer at all: a card that failed to compile painted a
 * red panel for the reader and the model never learned anything. Measured on a real session —
 * a card imported `MonacoEditor` from `modern-monaco`, the surface reported *"has no export named
 * 'MonacoEditor'; module exports: Workspace, errors, hydrate, init, lazy"*, and the transcript
 * ends there: `MonacoEditor` appears 6 times in the records after that point and `no export named`
 * zero. The reader saw the answer on screen; the one party who could act on it did not.
 *
 * Four constraints, each of which this got wrong in an obvious first version:
 *
 * - **Only errors that survived.** `GenUISurface` already separates a mid-stream prefix failure
 *   and a retryable network blip from a real one — the `report` branch of its error action. That
 *   branch is the only caller, so a half-written expression never reaches the model.
 *
 *   It is not sufficient on its own, though. `isUnfinishedFrame` excludes the RENDER phase by
 *   design — a card whose own render throws is usually a real error — but a half-written
 *   component rendering mid-stream throws too, and the next frame is fine. Measured in a browser:
 *   a card that ultimately rendered correctly reported `Cannot read properties of undefined
 *   (reading 'getCurrentStack')`, a React internal, to the model. Painting a red panel for a
 *   frame costs nothing; sending the model a message about a card that then worked costs it a
 *   turn spent fixing what is not broken. So the send is DEFERRED, and a paint cancels it.
 * - **Once per card, not once per frame.** A settled card that fails re-renders on every later
 *   frame of the transcript, and a turn per render is a loop the user has to kill. Deduplication
 *   lives HOST-side now (`CardFailures.set`), because this half is thrown away by every
 *   navigation and a dedup set that resets on reload wakes the model about a card it already
 *   knows. What stays here is the settling, which is about frames, not about turns.
 * - **Recovery is reported too.** The report is state, not an event: a card that starts working
 *   sends `null`, and the host drops it out of the model's context. As a chat message that was
 *   impossible, which is why the old body had to carry a paragraph explaining that nobody had
 *   typed it.
 * - **Only the newest card counts.** An earlier card that cannot render stays in the transcript
 *   and re-renders on every later frame, so it goes on failing for the rest of the session.
 *   Measured on a real one: the model wrote a card importing `Github` from `lucide-react`
 *   (removed upstream), was told, fixed it to `GitBranch` in its very next reply — and the
 *   failure notice kept coming back from the message it had already superseded. There is nothing
 *   the model can do with that; it cannot edit a reply it has sent. `isLastSegment` is the gate, on both the report and the retraction.
 */

/** Exported for the test: a fresh card in a fresh session should be able to report again. */
export const forgetReportedErrors = () => {
  cancelPendingReport();
  outstanding = null;
};

/** `null` means the card recovered. */
export type ErrorReporter = (report: { message: string; phase: string } | null) => void;

/**
 * How long an error must stand before the model hears about it. A streaming card recompiles many
 * times a second, so a frame that throws and a frame that paints are milliseconds apart; a second
 * is far longer than that gap and far shorter than a reader's patience with a broken card.
 */
const SETTLE_MS = 1000;

/**
 * The one report waiting out its settle window, and the card it belongs to.
 *
 * One slot, not one per card, because only one report can be outstanding host-side. But the slot
 * being shared is what made the gate below dangerous: a superseded card re-compiles on every later
 * frame — that is the premise of this whole file — and evicting the newest card's armed timer to
 * install its own meant the newest card's report died when the superseded one was gated off. So
 * eviction is now conditional on the incoming card actually being reportable.
 */
let pending: { timer: ReturnType<typeof setTimeout>; message: string } | null = null;
/**
 * Whether the host currently holds a failure for this surface.
 *
 * The report is state, so recovery has to be reported too — otherwise a card that failed once
 * stays in the model's context for the rest of the session. Kept here rather than derived from
 * `pending`, which is only the not-yet-sent window.
 */
let outstanding: ErrorReporter | null = null;

/** Drop a report the page is going away before it can deliver. NOT a recovery — nothing is fixed. */
export function cancelPendingReport(): void {
  if (pending === null) return;
  clearTimeout(pending.timer);
  pending = null;
}

/**
 * Called when a surface paints. Cancels a report the very next frame made untrue.
 *
 * **`restored` is not a detail.** partial-react answers a render throw by re-mounting the LAST
 * GOOD component (`runtime.ts:416-419`, whenever `preserve` is on — which is every inline card),
 * and that re-mount paints, and painting used to cancel the report that the very same throw had
 * just armed. So the one case the reporting exists for — a card that worked, then broke on an
 * edit — showed the reader stale content and told the model nothing. A paint only means the card
 * is fine when it is the NEW code that painted.
 */
/**
 * @param current whether the painting card is the one the gate would let report. Defaults to
 *   permissive for the canvas path, which shows one card at a time.
 */
export function cardRendered(restored = false, current: () => boolean = () => true): void {
  if (restored) return;
  // **A card may only retract its OWN failure.** The error path is gated on `isLastSegment`; without
  // the same gate here the asymmetry is that a superseded card cannot report a failure but can
  // still clear someone else's. That is reachable by scrolling: an old card enters the
  // IntersectionObserver margin, gets claimed, compiles and paints, and the model's context is
  // told nothing is broken while the newest card is still a red panel — and it cannot re-report,
  // because `reportStranded`'s `reportedFor` guard already fired for that code.
  if (!current()) return;
  cancelPendingReport();
  // A card that is working again must be taken OUT of the model's context, or it reads about a
  // failure that no longer exists on every step for the rest of the session.
  const send = outstanding;
  outstanding = null;
  send?.(null);
}

export function reportCardError(send: ErrorReporter | undefined, message: string, phase: string, current: () => boolean = () => true): void {
  if (send === undefined) return;
  // **Asked twice, and the first time is not redundant.** A superseded card that will be gated off
  // must not evict an armed report belonging to a card that will not be — otherwise the newest
  // card, which IS broken, reports nothing: its timer is cleared, the evictor's own timer fires
  // 1000ms later, `current()` is false, and the slot empties with nothing sent. The newest card
  // cannot re-arm either, because `reportStranded`'s `reportedFor` guard suppresses a second
  // report for the same code. Measured: with the old card re-failing every 300ms the newest
  // card's reporter stayed empty indefinitely.
  if (!current()) return;
  if (pending !== null) clearTimeout(pending.timer);
  // Asked AGAIN when the report is about to be SENT, because that is the question that matters:
  // a card is the newest one in the transcript at the instant it throws and stops being so the
  // moment the model's next reply lands — which is precisely the second this timer waits out.
  pending = {
    timer: setTimeout(() => {
      pending = null;
      if (!current()) return;
      outstanding = send;
      send({ message, phase });
    }, SETTLE_MS),
    message,
  };
}
