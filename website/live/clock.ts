/**
 * The demo's time. Everything scripted waits on THIS clock, not on `setTimeout`, so the whole
 * choreography freezes mid-gesture when the stage scrolls out of view or the tab hides, and resumes
 * from exactly where it was — a loop that only plays while someone is watching it.
 */
export const CANCEL = Symbol("cancel");

export function createClock() {
  let now = 0;
  let generation = 0;
  let waiters: { at: number; resolve: () => void; reject: (e: unknown) => void }[] = [];
  return {
    get now() {
      return now;
    },
    get generation() {
      return generation;
    },
    tick(ms: number) {
      now += ms;
      const due = waiters.filter((w) => w.at <= now);
      waiters = waiters.filter((w) => w.at > now);
      due.forEach((w) => w.resolve());
    },
    wait(ms: number) {
      return new Promise<void>((resolve, reject) => waiters.push({ at: now + ms, resolve, reject }));
    },
    /** Resolves on the first tick where `ready()` holds. */
    async until(ready: () => unknown, poll = 30) {
      while (!ready()) await this.wait(poll);
    },
    /** Rejects every pending wait, which unwinds whatever script was awaiting it. */
    cancel() {
      generation++;
      waiters.forEach((w) => w.reject(CANCEL));
      waiters = [];
    },
  };
}
export type Clock = ReturnType<typeof createClock>;
