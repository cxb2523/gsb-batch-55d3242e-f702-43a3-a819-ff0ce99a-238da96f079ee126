/**
 * The shell's frozen module table (`packages/client/web/src/platform.ts`).
 *
 * One list, two consumers that must agree: `build.ts` externalizes exactly these, and
 * `smoke.ts` answers `require()` for exactly these and throws on anything else. Kept apart they
 * were identical by luck — a module externalized but not answered is a blank app, and one
 * answered but not externalized is a second React, which is the singleton bug this project
 * already has a whole section about.
 *
 * No `scheduler`, no `react-dom/server` — both get bundled.
 *
 * Eleven entries, measured 2026-10-26 off a running dsh 0.2.1-rc.3 shell bundle. The 7-entry
 * list this used to hold was real at rc.8 and has since grown back; a missing entry does not
 * fail loudly, it silently bundles a second copy of a host singleton.
 */
export const PLATFORM_MODULES = ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "@deepseek-ai/cordis", "zod", "@tanstack/react-virtual", "@deepseek-ai/dsh-client-store", "@deepseek-ai/dsh-client-ui-slots", "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-client-ui-dockkit"];
