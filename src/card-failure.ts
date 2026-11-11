/**
 * What the model is told about a card that will not render.
 *
 * Split in two, deliberately, because the two halves want opposite lifetimes:
 *
 * - **The detail is state.** It goes out as a runtime-context snapshot, re-evaluated on every
 *   assembly and superseded by the next one. A card that gets fixed simply stops being mentioned.
 *   As a chat message it was the opposite — permanent, and still there three turns after the card
 *   started working.
 * - **The nudge is an event.** One short line through `followup`, whose only job is to open a turn
 *   so the model looks at the detail now rather than whenever the user next types.
 *
 * Neither is a user-role message any more, and that removes the paragraph the old body had to
 * carry: *"This was sent by the renderer, not by the user — nobody typed it, so do not apologise
 * or address it as a request."* That existed because the report arrived wearing the user's face.
 * A `kind: "plugin"` source does not, so the model is told what happened and nothing else — the
 * disclaimer cost more tokens than the error it was wrapped around.
 */

/** A card failure as the browser half reported it. */
export type CardFailure = { readonly message: string; readonly phase: string };

/** The runtime-context section name. Stable: it is how a later snapshot supersedes an earlier one. */
export const CARD_FAILURE_CONTEXT = "ui4a:card-failure";

/**
 * Ordered after the plugin's own guidance so the model reads how cards work before it reads that
 * one is broken.
 */
export const CARD_FAILURE_CONTEXT_ORDER = 250;

/**
 * The detail, as the model sees it.
 *
 * It says it is current state rather than an event on purpose: the same text is re-delivered on
 * every step while the card stays broken, and a model that reads it as a fresh report tries to
 * fix the card again on each one.
 */
export const failureText = (failure: CardFailure) =>
  `A ui4a card in this session is not rendering. It failed at the ${failure.phase} step:\n\n${failure.message}\n\nThis is current state, not a new event — it is re-read every step and disappears once the card renders. If the error names the correct usage (the available exports, for instance), fix the card and send it again. If it does not, look it up before you change anything.`;

/**
 * The one line that opens a turn. The detail is already in context; this only asks for attention.
 *
 * The second sentence is not padding — it closes a race the split design makes possible. The nudge
 * is an event and cannot be recalled once queued; the detail is state and is re-evaluated when the
 * turn assembles. A card that recovers in between (a retry succeeding is the common way) clears
 * the state, so the turn opens with "go read the runtime context" pointing at a context that says
 * nothing about a card.
 *
 * Seen in a real session: two notices, and the SECOND one had no card-failure section anywhere in
 * the turn that followed it. Without a defined outcome for that, the model has been told something
 * is broken, cannot find it, and goes looking — in that session it rewrote a card that was fine.
 */
export const WAKE_TEXT = "A ui4a card you wrote is not rendering — the failure is in the runtime context. If there is no card failure there, it recovered on its own between this notice and now: say nothing about it and carry on with what you were doing.";

/** Shown as the context row's label in the transcript, so a reader can see what fired without opening it. */
export const WAKE_SUMMARY = "ui4a card failed to render";

/**
 * The current failing card per session.
 *
 * Per session rather than per card: the nudge exists to get one turn spent on the problem, and a
 * reply that breaks three cards does not want three turns. The newest failure wins because it is
 * the one the model just wrote.
 */
export class CardFailures {
  private readonly bySession = new Map<string, CardFailure>();

  /**
   * Record a failure.
   *
   * @returns whether the session went from HEALTHY to failing — the caller wakes the model only
   * then. Dedup lives here rather than in the browser half because that half is reloaded by every
   * navigation, and a dedup set that resets on reload wakes the model again for a card it already
   * knows about.
   *
   * **Not "is this a different message".** That was the first version, and it is wrong for a
   * nudge whose entire payload is *go read the context*: two different failures produce two
   * BYTE-IDENTICAL notices, so a reader watching a long turn sees the same sentence queued twice
   * and the model gets two turns pointed at one current-state snapshot. Measured on a real
   * session — three genuinely different failures (`@react-three/fiber` unresolvable, `maps is not
   * defined`, `@react-three/cannon` unresolvable) over eighty minutes, each "news" by the old
   * test, and the third's notice was still sitting unsent in the composer beside the second.
   *
   * While a failure is already recorded the model is either about to look or has looked, and the
   * detail it will read is re-evaluated every step anyway — so a changed message needs no second
   * nudge. `clear()` on recovery is what re-arms this.
   */
  set(session: string, failure: CardFailure): boolean {
    const wasHealthy = !this.bySession.has(session);
    this.bySession.set(session, failure);
    return wasHealthy;
  }

  clear(session: string): void {
    this.bySession.delete(session);
  }

  /** The context text for one session; empty contributes nothing to the assembly. */
  text(session: string | undefined): string {
    const failure = session === undefined ? undefined : this.bySession.get(session);
    return failure === undefined ? "" : failureText(failure);
  }
}
