/**
 * The real globals, captured before any test file installs a stub.
 *
 * Bun keeps one global object per test RUN, not per file, and every file's module body runs
 * before any test does. So a file capturing `globalThis.document` at module load may already be
 * holding another file's stub — restoring that later *installs* the stub rather than removing
 * it, which is worse than not restoring at all.
 *
 * Importing this module from every stubbing file makes the capture happen exactly once, in
 * whichever file bun loads first, and `restoreGlobals()` then always puts back the real thing.
 */
const NAMES = ["document", "window", "requestAnimationFrame", "cancelAnimationFrame", "MutationObserver", "console", "fetch", "setTimeout", "clearTimeout"] as const;

const real = Object.fromEntries(NAMES.map((name) => [name, (globalThis as Record<string, unknown>)[name]]));

export const restoreGlobals = (): void => {
  for (const name of NAMES) {
    if (real[name] === undefined) delete (globalThis as Record<string, unknown>)[name];
    else (globalThis as Record<string, unknown>)[name] = real[name];
  }
};
