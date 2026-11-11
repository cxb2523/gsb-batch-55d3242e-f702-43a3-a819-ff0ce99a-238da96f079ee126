/**
 * The canvas tab type: what the host's right Sidebar needs to know about a canvas file.
 *
 * Pure data plus the contract's own predicates — no React, no fetch. Registration is two
 * stages and the second is keyed by `id`, not by `kind` (§3.6).
 */
import { parseFileAddress } from "@deepseek-ai/dsh-util-workspace-path";
// Type-only: `sidebar-right` is not in PLATFORM_MODULES, so a value import would bundle a
// second copy of the registry instead of reaching the host's `reflect.provide` singleton.
// This import is also what merges `sidebar.right.pane.tab` into `SlotMap` (§2.7).
import type { SidebarRightTabDefinition } from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { SlotMap } from "@deepseek-ai/dsh-client-ui-slots";
import { GuideArtworkBrowser } from "@deepseek-ai/dsh-client-ui-primitives";
import type { CanvasKey } from "./locales.ts";
import { canvasIdOf } from "../../contract.ts";

/** What `openTab` would name; canvases are opened by address, so this is only a discriminator. */
export const CANVAS_KIND = "ui4a-canvas";
/**
 * This implementation's identity in the tab system — and the key the body registers under in
 * the `sidebar.right.pane.tab` seat. The package name is the natural value, and it is the
 * convention every shipped tab type uses.
 */
export const CANVAS_TAB_ID = "dsh-generative-ui";

/**
 * The canvas id a `dsh-resource://file/…` address names, or null when it names none.
 *
 * **Always decode before matching.** `sessionFileAddress` percent-encodes each segment, so
 * `背单词.ui4a.tsx` travels as `%E8%83%8C%E5%8D%95%E8%AF%8D.ui4a.tsx` — and running the
 * contract's `canvasIdOf` on the raw URI returns that encoded string, which passes `isCanvasId`
 * (it is all ASCII) and then names a file that does not exist. The chip would show the
 * mojibake and every read would 404. `parseFileAddress` decodes; go through it.
 */
export function canvasIdOfAddress(address: string): string | null {
  const parsed = parseFileAddress(address);
  return parsed === undefined ? null : canvasIdOf(parsed.path);
}

/**
 * A `dsh-resource://file/…` address names a canvas entry file exactly when the contract says
 * its decoded path is one.
 *
 * Both halves matter. `patterns` is a suffix match, so it would happily claim
 * `notes.ui4a.tsx` sitting outside `ui4a/canvases/`; and an `absolute`-scope address has no
 * session, so the body could not resolve a cwd to read it with (the route allowlists against
 * each session's `header.cwd`). The registry treats a `canOpen` veto as ordinary — a type is
 * allowed to decline an address its globs matched.
 */
export function isCanvasAddress(address: string): boolean {
  return parseFileAddress(address)?.scope === "session" && canvasIdOfAddress(address) !== null;
}

export const canvasTabDefinition: SidebarRightTabDefinition = {
  id: CANVAS_TAB_ID,
  kind: CANVAS_KIND,
  // `multiple` is deliberately unset. That flag is about page types opened by kind, where each
  // open makes new content; a canvas's content identity IS its address, and the registry makes
  // two opens of one address the same tab — which is what stops the model's every rewrite from
  // stacking a duplicate.
  // Visited bodies stay mounted through hiding, session switches, docking and floating. A canvas
  // is a durable mini-app that runs timers, and every one of those is an unmount without this.
  // Bounded: only a body the user actually opened is kept.
  keepMounted: true,
  // No `:` in the pattern, so it matches the URI *path* at any depth — the registry's own
  // example is `*.md` matching `dsh-resource://file/session/s1/home/me/notes.md`.
  patterns: ["*.ui4a.tsx"],
  // The default band, written out because it is the whole point: "a type from outside the
  // product", which outranks every viewer the product ships — including documentpreview's
  // `dsh-resource://file/**` fallback, which would otherwise show a canvas as source text.
  priority: "extension",
  canOpen: isCanvasAddress,
  // The canvas id is what the old panel header showed, and unlike a filename it is stable and
  // language-independent, so the chip needs no locale namespace of its own.
  title: (address) => canvasIdOfAddress(address) ?? address.split("/").at(-1) ?? address,
};

/**
 * §2.7 is a silent failure: if the `declare module` merge did not happen, `register`'s `name`
 * is no longer constrained to real seats and the call still type-checks against an open string
 * domain. `tsc` staying green is exactly the symptom, so the probe lives at the type level,
 * where it can only fail by failing to compile.
 */
type Assert<T extends true> = T;
type _SidebarSeatIsMerged = Assert<"sidebar.right.pane.tab" extends keyof SlotMap ? true : false>;

/**
 * The canvas browser: a *page* type, which is a different thing from the file type above.
 *
 * A type is either a resource type (`patterns` — it recognizes addresses) or a page type (no
 * `patterns` — it is opened by kind), and a guide capsule always opens its contributor **by kind**
 * at `sidebar://<kind>`. So a capsule cannot point at the file type: its address would never match
 * `*.ui4a.tsx`, and `openResource` on an address no type claims is a wiring mistake that throws.
 * Hence a second type whose job is the list, and which opens a canvas through `openResource` when
 * one is picked.
 */
export const CANVAS_BROWSER_KIND = "ui4a-canvases";
/** Distinct from `CANVAS_TAB_ID`: the seat key is the definition's `id`, so two types need two. */
export const CANVAS_BROWSER_ID = "dsh-generative-ui/canvases";

/**
 * @param t - namespace-bound translate, read fresh on every label call so a language change
 *   reaches the capsule without a re-registration.
 * @returns the definition to register.
 */
export const canvasBrowserDefinition = (t: (key: CanvasKey) => string): SidebarRightTabDefinition => ({
  id: CANVAS_BROWSER_ID,
  kind: CANVAS_BROWSER_KIND,
  title: () => t("guide.title"),
  // `order: 20` puts it after `sidebar-files`' workspace capsule, which is `order: 10`.
  guide: [{ id: "canvases", order: 20, title: () => t("guide.title"), description: () => t("guide.description"), icon: GuideArtworkBrowser }],
});
