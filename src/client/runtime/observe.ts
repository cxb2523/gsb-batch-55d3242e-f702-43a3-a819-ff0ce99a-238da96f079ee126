/**
 * One document observer, shared by every consumer that reacts to transcript mutations.
 *
 * Both the inline-fence claimer and the canvas host are driven by the same event — a
 * streamed token landing in the chat DOM — so a second observer over the same subtree only
 * doubles the browser's mutation bookkeeping and the number of frames scheduled. The
 * coalescing is not optional either: a streaming reply mutates the transcript dozens of
 * times per second, and one sweep per mutation is how a renderer melts the main thread.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let observer: MutationObserver | null = null;
let frame = 0;

const flush = () => {
  frame = 0;
  for (const listener of listeners) listener();
};

const schedule = () => {
  if (frame !== 0) return;
  frame = requestAnimationFrame(flush);
};

/**
 * Runs `listener` at most once per frame while the document changes, starting immediately.
 * @returns a disposer that also tears the observer down once nothing is left listening.
 */
export function observeTranscript(listener: Listener): () => void {
  listeners.add(listener);
  if (observer === null) {
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }
  schedule();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    observer?.disconnect();
    observer = null;
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
  };
}

/** Requests a frame outside a mutation — for state that changed without the DOM changing. */
export const scheduleSweep = schedule;

/**
 * Drop every listener and tear the observer down.
 *
 * The set above is module scope, so it is shared by everything in a process — which is right in
 * a browser (one transcript, one observer) and is a trap in a test run, where a listener left by
 * one file goes on being swept by every later one. A sweep captures its root at registration, so
 * a stale one runs against a document that has since been replaced.
 *
 * Nothing in the plugin calls this: the shell disposes each host and that is the real path.
 */
export function resetTranscriptObservers(): void {
  listeners.clear();
  observer?.disconnect();
  observer = null;
  frame = 0;
}
