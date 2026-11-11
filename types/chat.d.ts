/**
 * `$dsh/chat` — drive the next conversation turn from inside a card.
 *
 * Hand-written rather than emitted: the implementation's types are shaped by how it reaches
 * the host, and what a card should see is the surface, not the plumbing. `types/check.ts`
 * asserts the two stay assignable, so drift fails the build rather than the model.
 */
declare module "$dsh/chat" {
  /**
   * Sends a prompt into the current session, exactly as the composer would — the text lands
   * in the transcript as the user's own message.
   */
  export function sendMessage(text: string): void;
}
