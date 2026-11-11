/**
 * Opens a canvas tab when the transcript shows one being written or edited.
 *
 * Everything else about a canvas is the tab system's job: closing, reopening, keeping several
 * open, floating, docking, remembering them across a session switch. This is the one gesture
 * still ours — the model wrote a file, so show it — and it is deliberately a single call into
 * `sidebarRight.openResource`, which is idempotent per address: two opens of the same address
 * are the same tab, so re-sweeping a transcript cannot stack duplicates.
 */
import { sessionFileAddress } from "@deepseek-ai/dsh-util-workspace-path";
import { canvasPath } from "../../contract.ts";
import { observeTranscript } from "../runtime/observe.ts";
import { collectCanvases, type CollectedCanvases, type ToolCallView } from "./collect.ts";

export type AutoOpenOptions = {
  /** Every tool call in the session being swept. */
  calls: () => readonly ToolCallView[];
  /** The session being swept — the one whose transcript this is. */
  sessionId: () => string | undefined;
  /** Opens the canvas `id` as a tab in `sessionId`. */
  open: (sessionId: string, id: string) => void;
  /** The workspace root of that session, for listing; omit and code-written canvases are skipped. */
  cwd?: () => string | undefined;
  /** Every canvas on disk in the workspace. */
  list?: (cwd: string) => Promise<readonly string[]>;
};

/**
 * A canvas written by executed code rather than by a file tool.
 *
 * 29 canvas writes in the corpus go through `run_code`, and in 27 of them the path is built from
 * a variable — so nothing in the arguments names the canvas and `collect.ts`, which classifies by
 * argument shape, cannot see any of them. The workspace listing already knows. This predicate is
 * what says "ask it again"; without it a code-written canvas is in the file tree and nowhere else.
 */
export const OPAQUE_WRITE = /"(?:code|command)"\s*:[\s\S]*canvases/;

/**
 * What state a canvas is in, as a short string. Equal signatures mean nothing to say.
 *
 * `"streaming"` is its own value and is never acted on: a write that is still growing would
 * otherwise open once per token, and each open bumps the tab's navigation revision, which makes
 * the body re-read the file — a fetch per frame for content that is not written yet. Opening
 * happens when the stream settles instead.
 *
 * `code.length` rather than the code, and `stale`'s count rather than a boolean: the first is
 * what moves on every frame that matters and on none that do not, and the second is already the
 * cache version `collect.ts` hands out for a patch.
 */
export const openSignature = (id: string, collected: CollectedCanvases): string => {
  const canvas = collected.canvases.find((entry) => entry.id === id);
  const stale = collected.stale.get(id) ?? 0;
  return canvas === undefined ? `stale:${stale}` : canvas.streaming ? "streaming" : `s${stale}:c${canvas.code.length}`;
};

/**
 * Cheap identity for a call list, so a sweep over an unchanged transcript can skip the walk.
 *
 * Exported because `test/sweep-cost.test.ts` asserts its *shape* — and a test that re-implements
 * the key it is measuring asserts that a re-implementation agrees with itself (§6.5's
 * `compiler.test.ts` trap). Lengths rather than the bytes: a streamed argument grows, so its
 * length moves on every frame that matters and on none that do not, and comparing megabytes of
 * source per token would cost more than the walk it avoids.
 */
export const callsKeyOf = (views: readonly ToolCallView[]): string => `${views.length}:${views.reduce((total, call) => total + call.argsRaw.length + (call.settled ? 1 : 0), 0)}`;

export function createCanvasAutoOpen({ calls, sessionId, open, cwd, list }: AutoOpenOptions): { sweep: () => void } {
  /** Last signature acted on, per session and canvas. */
  const opened = new Map<string, string>();
  /**
   * One session's listing state.
   *
   * Everything about a listing is transcript-local: the marker counts settled opaque calls in
   * that one session, and the root is that session's workspace. A shared scalar gets both wrong
   * the moment two sessions are in play — one blocks the other's marker, and a queued request
   * re-reads `cwd()` for whatever session happens to be selected when it drains.
   */
  type Listing = {
    /** The canvases the last listing saw, or `null` before the first one. */
    listed: ReadonlySet<string> | null;
    /** Settled opaque calls at the time of the last listing that LANDED. */
    marker: number;
    /** The newest write seen while a listing was in flight, with the workspace it belongs to. */
    queued: { marker: number; root: string } | null;
    inFlight: boolean;
  };
  const listings = new Map<string, Listing>();
  const listingFor = (session: string): Listing => {
    const existing = listings.get(session);
    if (existing !== undefined) return existing;
    const fresh: Listing = { listed: null, marker: 0, queued: null, inFlight: false };
    listings.set(session, fresh);
    return fresh;
  };

  /**
   * `collectCanvases` walks every argument string by hand, which is what makes it correct on a
   * half-arrived JSON prefix — and it costs 0.16ms per canvas per sweep. The sweep runs on every
   * transcript mutation, so a session with 34 canvas calls (the corpus maximum) spent ~5ms per
   * streamed token re-deriving a result that had not changed.
   */
  let callsKey: string | null = null;
  let collected = collectCanvases([]);
  let opaqueAfter = -1;

  /** The canvases `collect.ts` cannot name, found by listing after a call that might have written one. */
  const relist = (session: string, settledOpaque: number, root: string) => {
    if (list === undefined) return;
    const state = listingFor(session);
    // A write that lands mid-listing is not dropped: its own listing follows this one, and if the
    // directory snapshot predates it the canvas is otherwise never opened at all. The root travels
    // with it, because by the time this drains the reader may be looking at another session.
    if (state.inFlight) {
      if (state.queued === null || settledOpaque > state.queued.marker) state.queued = { marker: settledOpaque, root };
      return;
    }
    if (settledOpaque === state.marker) return;
    state.inFlight = true;
    const drain = () => {
      const next = state.queued;
      state.queued = null;
      if (next !== null) relist(session, next.marker, next.root);
    };
    void list(root)
      .then((ids) => {
        state.inFlight = false;
        // Only a listing that landed advances the marker. Rolling a failed one back to whatever
        // was there before is wrong too: with two writes in flight that value is another request's
        // uncommitted marker, and restoring it loses both writes to the next baseline.
        state.marker = settledOpaque;
        const known = state.listed;
        const fresh = known === null ? [] : ids.filter((id) => !known.has(id));
        state.listed = new Set(ids);
        for (const id of fresh) open(session, id);
        drain();
      })
      .catch((error: unknown) => {
        state.inFlight = false;
        console.error("[dsh-generative-ui] could not list canvases", error);
        // Settling a promise schedules no sweep of its own, so a write queued behind this one
        // would wait for some unrelated mutation before it was ever listed.
        drain();
      });
  };

  const sweep = () => {
    const allCalls = calls();
    const key = callsKeyOf(allCalls);
    if (key !== callsKey) {
      callsKey = key;
      collected = collectCanvases(allCalls);
      opaqueAfter = allCalls.filter((call) => call.settled && OPAQUE_WRITE.test(call.argsRaw)).length;
    }
    const session = sessionId();
    if (session === undefined) return;
    // Both maps, because a canvas can reach `canvases` two ways: a write carries a body, and a
    // patch with no write here synthesizes an empty one. Either can move independently.
    const ids = new Set([...collected.canvases.map((canvas) => canvas.id), ...collected.stale.keys()]);
    for (const id of ids) {
      const signature = openSignature(id, collected);
      if (signature === "streaming") continue;
      const mapKey = `${session}\0${id}`;
      if (opened.get(mapKey) === signature) continue;
      opened.set(mapKey, signature);
      open(session, id);
    }
    const root = cwd?.();
    if (root !== undefined) relist(session, opaqueAfter, root);
  };

  return { sweep };
}

export function startCanvasAutoOpen(options: AutoOpenOptions): () => void {
  return observeTranscript(createCanvasAutoOpen(options).sweep);
}

/**
 * The address of a canvas, as the tab system spells it.
 *
 * Workspace-relative rather than the absolute path a tool argument carries: `canvasIdOf` round-trips
 * it either way, the host resolves it against the named session's workspace, and an absolute path is
 * machine-specific — building the address from one is a second way to get the same address wrong.
 */
export const canvasAddress = (sessionId: string, id: string) => sessionFileAddress(sessionId, canvasPath(id));
