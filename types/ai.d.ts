/** `$dsh/ai` — stream from the app's own model. See `types/chat.d.ts` on why these are hand-written. */
declare module "$dsh/ai" {
  /**
   * One user turn plus an optional system prompt; there is no conversation here.
   *
   * Pass `signal` when the card can start a second call before the first finishes — regenerating
   * per keystroke, or a Stop button. Aborting stops the generation itself, not just your reading
   * of it. The abort surfaces as an `AbortError`, which is the one rejection that is not a
   * failure: `if (error.name === "AbortError") return;` before showing anything.
   */
  export type StreamOptions = { prompt: string; system?: string; signal?: AbortSignal };
  /** Yields text as it arrives, one piece per network chunk. Inherits the app's model and credentials. */
  export function streamText(options: StreamOptions | string): AsyncIterable<string>;
}
