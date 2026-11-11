/**
 * `$dsh/state` — state that survives a remount.
 *
 * Hand-written rather than emitted, like the rest of `types/*.d.ts`; `types/check.ts` asserts it
 * stays assignable to what `bind()` returns.
 *
 * This is the one capability with nothing behind it — no host call, no network. It exists because
 * three independent runs of a habit-tracker prompt imported exactly this name from exactly this
 * module without being told it was there, and an unresolvable specifier renders a blank card.
 */
declare module "$dsh/state" {
  import type { Dispatch, SetStateAction } from "react";

  /**
   * `useState`, except the value is written to `localStorage` under a namespaced key and read
   * back on mount.
   *
   * Reach for it whenever losing the value would be a bug: a canvas is remounted by every
   * revision you make to it, and an inline card by any transcript re-render. Both are
   * indistinguishable from a reload, and neither is rare.
   *
   * `initial` may be a value or a lazy initialiser, exactly as in `useState`.
   */
  export function usePersistedState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
}
