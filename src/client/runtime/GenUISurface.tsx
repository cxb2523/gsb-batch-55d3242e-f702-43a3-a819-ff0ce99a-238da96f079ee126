/**
 * One mounted GenUIRenderer. Owns the imperative renderer's lifecycle and nothing
 * else — what to render and where it comes from is the caller's business, which is
 * what lets the same surface back both the inline chat card and the canvas view.
 */
import { useEffect, useRef, useState } from "react";
import { GenUIRenderer } from "partial-react";
import { createBrowserTsxCompiler } from "./compiler.ts";
import { mergeFallbackImports } from "partial-react/import-map";
import { localImports } from "./bindings.ts";
import { UI4A_ROOT_CLASS, ensureUnoStyles } from "./uno.ts";

export type GenUISurfaceProps = {
  /** The owning session, independent of the currently selected conversation. */
  sessionId?: string;
  /** Full source when settled; the growing prefix while streaming. */
  code: string;
  /** True while `code` is still a prefix, so partial frames get normalized before compiling. */
  streaming?: boolean;
  /**
   * Keep React state across recompiles, by rendering through partial-react's stable slot
   * wrapper so hooks stay on the same fiber. Off, every recompile renders a freshly
   * compiled function type, which React remounts — a running timer restarts at zero.
   *
   * It does NOT risk dropping an edit: the renderer's two reuse branches only fire in
   * `push` mode, so a whole-file replacement always renders.
   */
  preserveState?: boolean;
  /** Real compile diagnostics. A streaming frame never reaches this — see `errorAction`. */
  onError?: (error: Error, phase: "transform" | "compile" | "render") => void;
  /** Fires whenever a frame actually painted. Use it to clear a previously shown error. */
  onRendered?: (restored: boolean) => void;
  className?: string;
};

/**
 * A ref that always holds the latest value, updated after commit rather than during render.
 *
 * Assigning `ref.current` in the render body is a side effect React may discard or replay.
 * Every reader here is a renderer callback that fires well after commit, so a plain effect
 * is early enough.
 */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/** The compiler owns a single wasm instance; one per document is both enough and what we can afford. */
let sharedCompiler: ReturnType<typeof createBrowserTsxCompiler> | null = null;
/** Paired with `disposeCompiler`: the shared instance must go with the wasm behind it. */
export const dropSharedCompiler = () => {
  sharedCompiler = null;
};

export const compiler = () => {
  if (sharedCompiler === null) {
    sharedCompiler = createBrowserTsxCompiler();
  }
  return sharedCompiler;
};

/**
 * A dependency that failed to arrive, not code that is wrong. esm.sh cold-starts and the
 * network drops, and the symptom is identical to a broken component — a blank surface — so
 * it is worth a few retries before anyone concludes the model wrote something wrong.
 */
/** Exported for `test/transient.test.ts`. */
export const TRANSIENT_LOAD = /failed to fetch|failed to load|networkerror|load failed/i;
const MAX_RETRIES = 3;

/**
 * Whether a reported error is worth another attempt.
 *
 * Extracted because it is the whole of the decision and none of the React: three conditions,
 * each of which sends the reader somewhere different when it is wrong. Exported for
 * `test/retry.test.ts`.
 */
export const shouldRetry = (message: string, phase: string, streaming: boolean, attempts: number) => phase === "compile" && !streaming && TRANSIENT_LOAD.test(message) && attempts < MAX_RETRIES;
/**
 * What to do with a frame, given what the surface already holds.
 *
 * `pushCode` APPENDS but a session event carries the whole prefix so far, so the difference
 * between these four answers is the difference between a correct surface and one whose buffer
 * doubles on every frame. Pure, because the decision is, and because a state machine that only
 * runs inside an effect with three refs is one nothing ever checks.
 *
 * - `nothing`   the frame adds no text, or a settled frame re-delivers what is already painted
 * - `replace`   settled: render the whole thing outright
 * - `append`    streaming and the buffer is a prefix of this frame: push only the delta
 * - `restart`   the prefix was rewritten (a re-delivered history page, or an edit)
 */
export type Delivery = { do: "nothing" } | { do: "replace"; code: string } | { do: "append"; delta: string } | { do: "restart"; code: string };

export const deliveryFor = (code: string, delivered: string, streaming: boolean): Delivery => {
  // Trailing whitespace only: the SETTLED frame is the streamed one plus the newline that sat
  // in front of the closing fence (`parseUi4aSegments` slices to `closeIndex`, the streaming
  // branch slices to the end of the buffer). Byte-comparing those two says "changed", and the
  // `replace` that follows tears the card down and rebuilds it — every card remounted once, at
  // the very moment the reader started using it, losing scroll position, focus and any state
  // held in a component. Nothing a reader can see is different, so nothing should be delivered.
  if (!streaming) return code.trimEnd() === delivered.trimEnd() ? { do: "nothing" } : { do: "replace", code };
  if (!code.startsWith(delivered)) return { do: "restart", code };
  const delta = code.slice(delivered.length);
  return delta === "" ? { do: "nothing" } : { do: "append", delta };
};

/**
 * Route a `Delivery` to the renderer. Returns whether anything was delivered, which is what tells
 * the caller to advance its `delivered` marker.
 *
 * Split from the effect so the three calls can be constrained: `render` replaces the buffer,
 * `pushCode` appends to it, and `clear({ preserveVisualState: true })` starts over WITHOUT
 * blanking what is on screen. Getting `render` and `pushCode` the wrong way round doubles the
 * buffer on every streamed frame, and the difference is one word inside an effect.
 */
export const deliver = (renderer: RendererCalls, delivery: Delivery): boolean => {
  if (delivery.do === "nothing") return false;
  if (delivery.do === "replace") renderer.render(delivery.code);
  else if (delivery.do === "append") renderer.pushCode(delivery.delta);
  else {
    // Keep the painted frame so the surface does not blink while it starts over.
    renderer.clear({ preserveVisualState: true });
    renderer.pushCode(delivery.code);
  }
  return true;
};

/**
 * What the card imports, as one string — the key the import-map probe is cached against.
 *
 * Compared by value rather than by set, so re-ordering the same imports re-probes. That is
 * deliberate: the probe is cheap and cached downstream, and a set comparison here would be more
 * code to get wrong than the re-probe costs.
 */
export const importSignature = (code: string) => [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]).join(" ");

/**
 * Whether a failure suppressed during streaming still has to be told to someone.
 *
 * The hole this closes: `errorAction` ignores every streaming frame (a truncated one is not a
 * broken card), and `deliveryFor` answers `nothing` when the settled frame is byte-identical to
 * the last streamed one. Both are right on their own, and together they mean a card that really
 * is broken recompiles never and reports never.
 *
 * Pure, and exported, because it is three conditions and each one is a distinct bug when wrong:
 * without `!streaming` it fires mid-stream and undoes the fix it belongs to; without `stranded`
 * it reports nothing; without the `reportedFor` guard a settled card re-rendered by every later
 * frame of the transcript reports on each one.
 */
export const reportStranded = (streaming: boolean, stranded: unknown, code: string, reportedFor: string) => !streaming && stranded !== null && reportedFor !== code;

/** Only what `deliver` touches — the real renderer has far more. */
export type RendererCalls = {
  render: (code: string) => void;
  pushCode: (delta: string) => void;
  clear: (options: { preserveVisualState: boolean }) => void;
};

/**
 * What to do about an error the renderer reported.
 *
 * - `ignore`  the stream is not finished; the next frame supersedes this
 * - `retry`   a dependency failed to arrive, and busting the import URLs is the fix
 * - `report`  tell the reader
 *
 * **A streaming frame is never reported, whatever it says.** This used to test the message
 * against `TRANSIENT` (`No default export found`, unexpected EOF) and report anything else, on
 * the theory that a truncated frame fails to parse. It does not have to: a cut that lands
 * mid-identifier leaves valid syntax and throws at module evaluation instead. Measured on one
 * real session — five consecutive reports, five regenerations, and every final card was fine:
 * `Mouse is not defined` from a card whose only such name is `MousePointer2`, `type is not
 * defined` from `type ToolGroup =`, and `icon is not defined` from a card containing no `icon` at
 * all. The frame, not the card, was broken. There is no message that distinguishes the two, so
 * the phase does it: only a settled surface has anything worth saying about.
 */
export const errorAction = (message: string, phase: string, streaming: boolean, attempts: number): "ignore" | "retry" | "report" => {
  if (streaming) return "ignore";
  return shouldRetry(message, phase, streaming, attempts) ? "retry" : "report";
};

/**
 * 0.5s / 2s / 8s. **Linear 0.4/0.8/1.2 did not cover a cold start** — it spends 2.4 seconds
 * total, and a first request for a package esm.sh has never built waits on that build: measured
 * 2.27s cold against 0.50s warm for the same URL, so all three attempts landed inside one
 * unfinished build and the reader got `failed to fetch dynamically imported module` on a package
 * that resolves fine a second later. Seen in a real session on `@headlessui/react`, twice in a
 * row, on a card the model had been asked to write with it.
 *
 * Backing off ×4 spends 10.5s across the same three attempts, which covers a cold build with room
 * and still gives up fast enough that a genuinely missing package does not hang the card.
 */
const RETRY_BACKOFF_MS = 500;
const RETRY_FACTOR = 4;

/**
 * What `onError` DOES with the three outcomes, separated from where they come from. The decision
 * was already a pure function; the dispatch was not, and the mutation audit could not constrain
 * it — swapping `ignore` for `retry` survived every test, because the only caller lives inside a
 * `GenUIRenderer.create` callback that needs a DOM to reach.
 *
 * Each branch is one line and each is load-bearing: `ignore` must not touch the counter (a
 * streaming frame is not a failed attempt), `retry` must increment BEFORE scheduling (the delay
 * is a function of the count), and `report` must not increment at all.
 */
/**
 * What to do when an import probe settles. Three outcomes and every one is a bug if wrong:
 *
 * - **stale** — a later frame's probe won the race. Applying this one reverts the map to an
 *   older import set, and the newer frame's packages go missing.
 * - **redeliver** — nothing else is going to apply the map. Always true of a settled surface,
 *   and true while streaming too when no frame has been delivered since the probe fired:
 *   `setImportMap` only stores, so that buffer stays compiled against a map without these
 *   entries — and an unresolvable bare specifier kills the whole module graph, so the card is
 *   blank rather than wrong. Measured 2026-08-27 on a card importing `@radix-ui/react-tabs`:
 *   one delivery with `streaming: true` renders 0 characters **for good**, while the identical
 *   code with `streaming: false` renders. The error is swallowed on top of it — `errorAction`
 *   answers `ignore` while streaming, so the reader gets an empty card and the model gets no
 *   report. A cold probe is 1.0s and the import behind it another 2.4s, so the window this
 *   covers is seconds wide, not a frame.
 * - **store** — a newer frame has already been delivered, and it will apply the map itself.
 *   Re-delivering here instead would replace the buffer with the prefix that was current when
 *   the probe fired, truncating the stream mid-flight.
 *
 * `redeliver` renders `deliveredRef.current`, which is read at SETTLE time — the newest buffer,
 * not the captured one — so the append the next frame computes still lines up.
 *
 * The `delivered !== ""` part is not defensive: re-rendering an empty buffer clears the surface.
 */
export const probeOutcome = (signature: string, current: string, streaming: boolean, delivered: string, probed: string): "stale" | "redeliver" | "store" => {
  if (signature !== current) return "stale";
  if (delivered === "") return "store";
  return !streaming || delivered === probed ? "redeliver" : "store";
};

export const dispatchError = (action: "ignore" | "retry" | "report", effects: { attempts: () => number; setAttempts: (n: number) => void; schedule: (ms: number) => void; report: () => void }) => {
  if (action === "ignore") return;
  if (action === "retry") {
    const next = effects.attempts() + 1;
    effects.setAttempts(next);
    effects.schedule(RETRY_BACKOFF_MS * RETRY_FACTOR ** (next - 1));
    return;
  }
  effects.report();
};

/**
 * The same import map with a fresh query on every fetched entry.
 *
 * Only `https://esm.sh/` URLs are touched. Local blob URLs are minted per render and already
 * fresh, and appending a query to a `blob:` URL makes it unresolvable — which would break every
 * card rather than fixing one.
 */
/**
 * The same import map with `bundle`/`external` dropped from every esm.sh entry.
 *
 * esm.sh serves two different builds and only one of them can fail: `?bundle` runs esbuild over
 * the package's whole tree, and a version skew anywhere in it is a hard 500. Measured on
 * `mermaid`, three attempts, deterministic — `?bundle&target=es2022&external=react,react-dom,scheduler`
 * answers **500 `esbuild: No matching export in "node_modules/d3/src/index.js" for import
 * "curveBumpX"`**, while the plain `https://esm.sh/mermaid?target=es2022` answers 200 and the
 * module imports fine. The card meanwhile renders **completely blank with nothing in the
 * console**, because an unresolvable import kills the whole module graph.
 *
 * So the retry that only busts the query re-requests the same broken build. Unbundling is a
 * genuinely different artefact on esm.sh's side, which is what makes it a second chance rather
 * than a second identical failure. It is not the first choice — the bundled build is one request
 * instead of a waterfall — which is why this is on the retry path and not on the happy one.
 */
export const unbundleFetchedImports = (imports: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(imports).map(([key, url]) => {
      if (!url.startsWith("https://esm.sh/")) return [key, url];
      const parsed = new URL(url);
      parsed.searchParams.delete("bundle");
      // `external` STAYS. Dropping it was in this function for one day and it broke rendering in a
      // way far worse than the 500 it was meant to route around. Measured on the real URLs:
      //
      //   ?bundle&target=es2022&external=react,react-dom,scheduler -> 500   (the bug being fixed)
      //   ?target=es2022&external=react,react-dom,scheduler        -> 200   (fixed, react shared)
      //   ?target=es2022                                           -> 200   (fixed, react NOT shared)
      //
      // The 500 comes from `bundle` alone; `external` has nothing to do with it. What `external`
      // does do is make esm.sh emit a BARE `import … from "react"`, which the document import map
      // resolves to the host's single instance. Without it the same build emits
      // `import "/react@^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0?target=es2022"` — an ABSOLUTE URL
      // an import map keyed on the bare specifier cannot redirect, so the package gets esm.sh's own
      // React (19, against this host's 18). Elements it creates then carry a `$$typeof` the host
      // React does not recognise, and the card dies on **`Minified React error #31`, args
      // `object with keys {$$typeof, type, key, ref, props}`**.
      //
      // Seen end to end in one session: a card rendered correctly, a later retry re-fetched its
      // icons without `external`, every lucide element became a foreign object, and the model was
      // handed a render-failure notice for a card that had been fine — it rewrote it, blaming
      // itself for "rendering icons/objects directly".
      //
      // `bundle` is a valueless flag, and `URLSearchParams` writes it back as `bundle=` — which
      // esm.sh reads as the flag being present. Deleting is enough; re-serialising is what would
      // put it back.
      return [key, parsed.toString()];
    }),
  );

export const bustFetchedImports = (imports: Record<string, string>, attempt: number): Record<string, string> => Object.fromEntries(Object.entries(imports).map(([key, url]) => [key, url.startsWith("https://esm.sh/") ? `${url}${url.includes("?") ? "&" : "?"}ui4a-retry=${attempt}` : url]));

export function GenUISurface(props: GenUISurfaceProps) {
  return <SessionSurface key={props.sessionId} {...props} />;
}

function SessionSurface({ code, streaming = false, preserveState = true, onError, onRendered, className, sessionId }: GenUISurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // State, not a ref: `create` is async, so readiness must be able to trigger the
  // render effect. With a ref, the first pass sees null and nothing ever re-runs it.
  const [renderer, setRenderer] = useState<GenUIRenderer | null>(null);
  // The renderer outlives any one render and calls back into props, so those are read
  // through refs rather than captured — a new handler identity must not re-attach it.
  const onErrorRef = useLatest(onError);
  const onRenderedRef = useLatest(onRendered);
  // Set by a RENDER throw, consumed by the paint that follows it — see `onRendered` below.
  const threwRef = useRef(false);
  /**
   * The last failure `errorAction` suppressed because the surface was still streaming.
   *
   * Suppressing them is right — a truncated frame is not a broken card — but it leaves a hole at
   * the other end: when the settled frame is byte-identical to the last streamed one,
   * `deliveryFor` answers `nothing`, nothing recompiles, and a card that really is broken reports
   * NOTHING at all. The last streamed frame's failure is the surface's actual state at that
   * point, so it is what gets reported. Cleared by a real paint, which is the proof it was
   * transient after all.
   */
  const strandedRef = useRef<{ error: Error; phase: "transform" | "compile" | "render" } | null>(null);
  /** The code a stranded failure was already reported for, so a re-render does not report it again. */
  const strandedReportedRef = useRef("");
  const retryTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const streamingRef = useLatest(streaming);
  // Read once at attach: the renderer takes it as a construction option.
  const preserveStateRef = useRef(preserveState);
  /** Retries spent on the current code. Reset by a successful paint and by every new frame. */
  const retriesRef = useRef(0);
  const aliveRef = useRef(false);
  const revisionRef = useRef(0);
  const stylePassRef = useRef(0);
  const probeRef = useRef(0);
  const retrySequenceRef = useRef(0);
  const asyncErrorRef = useLatest((reason: unknown) => {
    if (!aliveRef.current) return;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    if (streamingRef.current) strandedRef.current = { error, phase: "compile" };
    else onErrorRef.current?.(error, "compile");
  });
  /**
   * The renderer's failure path, callable from anywhere that has an `Error` and a phase.
   *
   * Split out so the import probe inside a retry takes the same `errorAction` as a renderer
   * failure. Reporting a probe rejection through `asyncErrorRef` instead abandoned the retry
   * budget on the first transient CDN error — the very case the budget exists for. `retry` is
   * passed in rather than read from `retryRef` so this initializer does not capture a binding
   * that is still being initialized.
   */
  const handleFailureRef = useLatest((error: Error, phase: "transform" | "compile" | "render", retry: () => void, streaming = streamingRef.current) => {
    // A compile or render that started before teardown can report after it. Nothing downstream
    // should react to a surface that no longer exists — not a report, not another retry.
    if (!aliveRef.current) return;
    if (phase === "render") threwRef.current = true;
    const action = errorAction(error.message, phase, streaming, retriesRef.current);
    if (action === "ignore") strandedRef.current = { error, phase };
    dispatchError(action, {
      attempts: () => retriesRef.current,
      setAttempts: (n) => {
        retriesRef.current = n;
      },
      schedule: (ms) => {
        const timer = setTimeout(() => {
          retryTimers.current.delete(timer);
          retry();
        }, ms);
        retryTimers.current.add(timer);
      },
      report: () => onErrorRef.current?.(error, phase),
    });
  });
  /**
   * Re-deliver the current code after a dependency failed to fetch.
   *
   * `clear` is not enough on its own, though it is necessary — the renderer skips an unchanged
   * compile result. The part that makes this a real retry is **changing the dependency URL**.
   * Measured 2026-08-23: a second `import()` of a URL that already rejected makes **zero**
   * network requests, because the module registry caches the rejection for the page's lifetime.
   * `mergeFallbackImports` maps each bare specifier to a deterministic `https://esm.sh/<pkg>?…`,
   * so re-rendering imports the exact URL that failed and nothing is re-fetched. Every retry
   * before this was a no-op that burned 0.4/0.8/1.2s and reported the same failure.
   */
  // Named so the retry can hand `handleFailureRef` a way back into itself without `retryRef`
  // being read while its own initializer is still running.
  const retryRef = useLatest(function retry() {
    if (!aliveRef.current || renderer === null || code === "") return;
    const attempt = retriesRef.current;
    const revision = revisionRef.current;
    const sequence = ++retrySequenceRef.current;
    void mergeFallbackImports(localImports(sessionId), code)
      .then((imports) => {
        if (!aliveRef.current || revision !== revisionRef.current || sequence !== retrySequenceRef.current) return;
        // Only a retry that will actually apply may supersede the ordinary import probe.
        probeRef.current++;
        // Only the fetched esm.sh entries need busting; the local blob URLs are already fresh.
        // From the second attempt the bundled build is dropped as well: if the first failure was a
        // bundle-side 500 (see `unbundleFetchedImports`) no amount of cache-busting can clear it.
        const fresh = attempt > 0 ? unbundleFetchedImports(imports) : imports;
        renderer.setImportMap({ imports: bustFetchedImports(fresh, attempt) });
        renderer.clear({ preserveVisualState: true });
        renderer.render(code);
      })
      .catch((reason: unknown) => {
        if (revision !== revisionRef.current || sequence !== retrySequenceRef.current) return;
        handleFailureRef.current(reason instanceof Error ? reason : new Error(String(reason)), "compile", retry);
      });
  });

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    let disposed = false;
    aliveRef.current = true;
    let attached: GenUIRenderer | null = null;
    void GenUIRenderer.create(host, {
      compiler: compiler(),
      importmap: { imports: localImports(sessionId) },
      preserveStateOnUpdate: preserveStateRef.current,
      callbacks: {
        onError: (error, phase) => {
          if (phase === "render") threwRef.current = true;
          const action = errorAction(error.message, phase, streamingRef.current, retriesRef.current);
          // Remember what was swallowed. Only the newest matters: each frame supersedes the last,
          // so this is the state of the buffer the stream stopped on.
          if (action === "ignore") strandedRef.current = { error, phase };
          handleFailureRef.current(error, phase, () => retryRef.current());
        },
        onRendered: (_component, rendered) => {
          // "Is this the code we last delivered" decides everything here, including what a restore
          // is: partial-react repaints the LAST GOOD source after a render throw, which is by
          // definition not the code we just handed it. One global "a throw happened" flag cannot
          // survive interleaved commits — whichever callback runs first is the one that gets it
          // wrong. Tying the decision to the painted source is what makes the order irrelevant.
          const current = rendered.trimEnd() === deliveredRef.current.trimEnd();
          const restored = threwRef.current && !current;
          if (current) threwRef.current = false;
          // Only a current paint says anything about the import map or the retry state. An earlier
          // frame can reach React's concurrent render before a newer one commits, and letting that
          // older paint — or a restore — cancel the newer frame's retry left the newest code failed
          // with nothing left to try.
          if (!current) return;
          retriesRef.current = 0;
          for (const timer of retryTimers.current) clearTimeout(timer);
          retryTimers.current.clear();
          // A retry whose probe is already in flight is not in that set. This frame painted, so its
          // import map is good enough; invalidating the sequences keeps a late retry — or the
          // redundant probe a reorder of the same imports left pending — from reporting a failure
          // against a card that is already on screen.
          retrySequenceRef.current++;
          probeRef.current++;
          // A restore paints the LAST GOOD component, which says nothing about the current code —
          // clearing on it would lose exactly the failure this exists to carry.
          if (!restored) strandedRef.current = null;
          onRenderedRef.current?.(restored);
        },
      },
    })
      .then((created) => {
        // A fast unmount can land before `create` settles; detaching there would leak the root.
        if (disposed) return void created.detach();
        attached = created;
        setRenderer(created);
      })
      .catch((reason: unknown) => {
        if (disposed) return;
        // Terminal, and so reported as itself: there is no buffer to preserve and no later frame
        // to supersede it. Parked failures are flushed from the delivery effect below, which never
        // runs without a renderer — parking this one lost it, leaving a blank surface and no report.
        onErrorRef.current?.(reason instanceof Error ? reason : new Error(String(reason)), "compile");
      });
    return () => {
      disposed = true;
      aliveRef.current = false;
      revisionRef.current++;
      stylePassRef.current++;
      probeRef.current++;
      // Detach from the local handle, not from a state updater: React skips the updater
      // for an unmounted fiber whenever the queue is not empty, and a renderer that is
      // never detached keeps its React root and its module URL alive for the tab's life.
      attached?.detach();
      attached = null;
      setRenderer(null);
      for (const timer of retryTimers.current) clearTimeout(timer);
      retryTimers.current.clear();
    };
    // Attach exactly once. The refs above are how later prop values reach the renderer
    // without tearing it down, so they deliberately do not belong in these deps.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- see above
  }, []);

  // The set of bare specifiers the current code imports. Recomputing the fallback map costs a
  // network probe per package, so it is keyed on this rather than run per streamed frame.
  const importedRef = useRef("");

  // Last code handed to the renderer. A ref, not state: it only ever feeds the next
  // diff, and re-rendering on it would be a render per streamed frame for nothing.
  const deliveredRef = useRef("");

  useEffect(() => {
    if (renderer === null) return;
    // CSS work is superseded by every run; the retry revision below only moves when a frame lands.
    const stylePass = ++stylePassRef.current;
    // Anything the model imports beyond the registered react family (recharts, motion, …) has no
    // entry in the import map, and an unresolvable bare specifier fails the whole module import —
    // the surface just stays blank. `mergeFallbackImports` probes esm.sh and fills those in.
    const signature = importSignature(code);
    if (signature !== importedRef.current) {
      importedRef.current = signature;
      const probe = ++probeRef.current;
      // A later frame's probe can settle first; without this the map reverts to an older import set.
      void mergeFallbackImports(localImports(sessionId), code)
        .then((imports) => {
          if (!aliveRef.current || probe !== probeRef.current) return;
          const settle = probeOutcome(signature, importedRef.current, streamingRef.current, deliveredRef.current, code);
          if (settle === "stale") return;
          renderer.setImportMap({ imports });
          if (settle === "redeliver") renderer.render(deliveredRef.current);
        })
        .catch((reason: unknown) => {
          if (probe !== probeRef.current) return;
          // Through the retry policy, like a renderer failure: a transient lookup failure is the
          // case the budget exists for, not a verdict on the card.
          handleFailureRef.current(reason instanceof Error ? reason : new Error(String(reason)), "compile", () => retryRef.current());
        });
    }
    // Generated classes exist only in the code that just arrived, so their CSS is produced here
    // rather than at build time. Not awaited: the sheet is appended to `<head>` and applies to
    // whatever is already mounted, so a card paints unstyled for at most a frame instead of
    // holding up every delivery behind a generator that has to boot on the first call.
    void ensureUnoStyles(code, streaming).catch((error: unknown) => {
      if (stylePass === stylePassRef.current) asyncErrorRef.current(error);
    });
    if (!deliver(renderer, deliveryFor(code, deliveredRef.current, streaming))) {
      // Nothing was delivered, so nothing will recompile and no error will be raised — but the
      // buffer on screen may already have failed while streaming. This is the only moment that
      // failure can still reach anyone. Keyed on the code so a settled card re-rendered by every
      // later frame of the transcript reports once, not once per frame.
      const stranded = strandedRef.current;
      if (stranded !== null && reportStranded(streaming, stranded, code, strandedReportedRef.current)) {
        strandedReportedRef.current = code;
        // Re-decided now, not when it was parked: a transient probe failure is only known to be
        // about a settled frame here, so classifying it at streaming time spent no retry budget
        // and sent a one-off CDN blip to the model.
        handleFailureRef.current(stranded.error, stranded.phase, () => retryRef.current(), false);
      }
      return;
    }
    // `deliveredRef` must follow every delivery, or a later streaming frame diffs against a
    // prefix this render already superseded.
    // A frame that landed supersedes whatever the previous one scheduled. Cancelling at the top of
    // the effect instead did that for a NO-OP update too — the settled frame differing only in
    // trailing whitespace — leaving the surface failed with neither a retry nor a report.
    // Only a landed frame supersedes an in-flight retry. A no-op update still bumps the CSS pass
    // above, but must leave `revisionRef` alone or the retry's completion is discarded and the
    // surface stays failed with neither another attempt nor a report.
    revisionRef.current++;
    retriesRef.current = 0;
    for (const timer of retryTimers.current) clearTimeout(timer);
    retryTimers.current.clear();
    // This ref is the effect's own inter-frame state; the paint callback above reads it, which is
    // exactly why it is a ref and not a closure value.
    // oxlint-disable-next-line react/immutability
    deliveredRef.current = code;
    // The refs this reads (`importedRef`, `deliveredRef`, `streamingRef`) are how the effect
    // carries state between frames; listing them would re-run it on values it just wrote.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [renderer, code, streaming]);

  // A query container, so generated code can size itself against the space it was given.
  // The same card lands in a chat column and in a panel the reader drags between 320 and
  // 720px, and the viewport tells it nothing about either — `100vw` is the whole window in
  // both. Without `container-type` here a `@container` rule is inert rather than wrong
  // (measured: the guarded declaration simply never applies), which is the kind of failure
  // that reads as the model writing something bad.
  return <div ref={hostRef} className={[UI4A_ROOT_CLASS, className].filter(Boolean).join(" ")} style={{ containerType: "inline-size" }} />;
}
