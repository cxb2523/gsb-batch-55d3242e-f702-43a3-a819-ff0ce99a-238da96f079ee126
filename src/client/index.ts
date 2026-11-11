/**
 * Browser half: renders ui4a TSX the model writes, inline in the transcript and as canvas tabs
 * in the host's right Sidebar.
 * @module dsh-generative-ui/client
 */
import { createElement } from "react";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
// Type-only, and load-bearing twice over. `sidebar-right` declares `sidebar.right.pane.tab` into
// SlotMap through this package's `declare module`, and a merge only happens for packages some file
// actually imports — drop the line and the seat key vanishes while `tsc` stays green (§2.7). It
// must stay type-only: `sidebar-right` is not in PLATFORM_MODULES, so a value import would bundle
// a second copy of the registry instead of reaching the host's `reflect.provide` singleton.
import type {} from "@deepseek-ai/dsh-client-ui-sidebar-right/client";
import type { SlotCore } from "@deepseek-ai/dsh-client-ui-slots";

/** The slot service's declared-but-untyped half: `inject` defers a registration until the seat exists. */
type SlotsInject = { inject<T>(name: string, body: () => T): () => void };
import { GenUISurface } from "./runtime/GenUISurface.tsx";
import { cancelPendingReport, cardRendered, reportCardError } from "./runtime/report-error.ts";
import { disposeCompiler } from "./runtime/compiler.ts";
import { dropSharedCompiler } from "./runtime/GenUISurface.tsx";
import { disposeRegistry } from "./runtime/registry.ts";
import { registerUi4aHost, releaseBindings, localImports } from "./runtime/bindings.ts";
import { claimInlineFences } from "./runtime/inline-fence.ts";
import { parseFences, parseUi4aSegments, type Fence, type Ui4aSegment } from "./runtime/segments.ts";
import { warmCompiler } from "./runtime/compiler.ts";
import { chatNodes, perNode, selectedSessionId, type ChatNodeView } from "./session.ts";
import { CANVAS_BROWSER_ID, CANVAS_TAB_ID, canvasBrowserDefinition, canvasTabDefinition } from "./canvas/definition.ts";
import { CanvasBody } from "./canvas/body.tsx";
import { CanvasBrowser } from "./canvas/browser.tsx";
import { NS, en, zh } from "./canvas/locales.ts";
import { canvasAddress, startCanvasAutoOpen } from "./canvas/auto-open.ts";
import { toolCallsOf, type CallBlock, type ToolCallView } from "./canvas/collect.ts";
import { listCanvasIds } from "./canvas/read.ts";
import { CARD_ERROR_PATH } from "../contract-assets.ts";

export const inject = ["sessions", "locale"];

/** Re-exported so `bun run smoke` can build the synthesized blob modules and parse them. */
export { localImports };

/** Assistant text blocks, whose fences are the inline sources. */
type AssistantNodeData = { blocks?: readonly { kind: string; text?: string }[] };

export function apply(ctx: ClientContext): void {
  // The Host and browser halves share one type-check program but bind different
  // `sessions` service shapes; the browser uses the Client Controller.
  const sessions = ctx.sessions as unknown as ISessions;
  const currentSession = () => selectedSessionId(ctx);
  // Compiling anything pays a ~400 ms wasm init. Doing it now means the first fence the
  // user actually sees does not, and an idle tab is the cheapest possible moment for it.
  void warmCompiler();

  /**
   * Every ui4a fence in the current session's assistant prose, straight from the log.
   *
   * The host's markdown renderer withholds a fence's info string until the closing fence
   * arrives, so the DOM cannot identify a half-written ui4a block. The raw text has the
   * opening fence from its first token, which is what makes inline rendering streamable.
   */
  const segmentsOf = perNode(
    (node) => `${node.anchorSeq}:${textOf(node).length}`,
    (node) => parseUi4aSegments(textOf(node)),
  );
  const segments = (): readonly Ui4aSegment[] => segmentsOf(chatNodes(ctx)).flat();

  /**
   * Every fence of every message, keyed by the identity the transcript DOM carries.
   *
   * This is what lets a block be turned away because it is an ordinary ```tsx sample rather than
   * an `ui4a/tsx` card — content alone cannot tell them apart when the sample opens the same way.
   * Cached per message and text length, so a streaming reply re-parses only the message that grew.
   * Empty when the host exposes no node key: callers then keep their content-match behaviour.
   */
  const fencesOf = perNode(
    (node) => `${node.key ?? node.anchorSeq}:${textOf(node).length}`,
    (node) => parseFences(textOf(node)),
  );
  const fencesByKey = (): ReadonlyMap<string, readonly Fence[]> => {
    const nodes = chatNodes(ctx);
    const parsed = fencesOf(nodes);
    const byKey = new Map<string, readonly Fence[]>();
    for (let index = 0; index < nodes.length; index += 1) {
      const key = nodes[index]?.key;
      if (key !== undefined) byKey.set(key, parsed[index] ?? []);
    }
    return byKey;
  };

  /**
   * Every tool call in the current session, in log order — the canvas source.
   *
   * `tool-call` nodes carry a lifecycle `root` (not the assistant's block list), and the
   * root's `call.argsRaw` grows while the call streams, which is what makes a canvas
   * render as it is written.
   */
  const callsOf = perNode(
    (node) => `${node.anchorSeq}:${callsKeyOf(node)}`,
    (node) => (node.kind === "tool-call" ? toolCallsOf(node.data) : []),
  );
  const calls = (): readonly ToolCallView[] => {
    const nodes = chatNodes(ctx);
    // Node iteration order is unspecified; log order decides which write wins.
    return callsOf(nodes)
      .map((calls, index) => ({ calls, seq: nodes[index]?.anchorSeq ?? 0 }))
      .toSorted((a, b) => a.seq - b.seq)
      .flatMap((entry) => entry.calls);
  };

  /** The current session's workspace, which canvas file reads resolve against. */
  const cwd = (owner?: string): string | undefined => {
    const id = owner ?? currentSession();
    const byId = sessions.list.getSnapshot().byId;
    return id === undefined ? undefined : byId[id as keyof typeof byId]?.cwd;
  };

  /**
   * Identity of the open session, so a dismissed canvas stays dismissed only there.
   * Returns the branded `SessionId` rather than a plain string: `sessions.scope()` needs it.
   */
  const sessionId = (): string => currentSession() ?? "";

  // Revoking on teardown is safe: a blob module that was already imported keeps working after
  // its URL is revoked (the module graph holds it), so this only reclaims URLs nothing can
  // reach any more. Without it every HMR round leaks one per registered specifier.
  ctx.effect(() => disposeRegistry, "dsh-generative-ui: blob module URLs");
  // An error report waits a second before it is sent (see `SETTLE_MS`), and an unload inside that
  // second leaves the timer holding a closure over a conversation that is being torn down. There
  // is nothing to flush — a report nobody will read is not worth delivering — so cancelling is
  // the whole disposer, and `cardRendered` already is one.
  ctx.effect(() => () => cancelPendingReport(), "dsh-generative-ui: pending error report");
  // The wasm half of the same problem: ~16MB per instance, one per HMR round, and upstream
  // offers no dispose — dropping the reference is all there is (see `disposeCompiler`).
  ctx.effect(
    () => () => {
      disposeCompiler();
      dropSharedCompiler();
    },
    "dsh-generative-ui: tsx wasm instance",
  );
  // What `$dsh/chat` calls into. A nested fiber, not a static inject: every name in
  // `inject` is a hard dependency, and a profile without `conversation` would otherwise
  // take the whole plugin down rather than just this one capability.
  ctx.inject(["conversation"], (scoped) => {
    scoped.effect(() => {
      // `conversation` is scope-addressed: reading it off the plugin's own context sends
      // into no session and rejects. The scope has to come from `sessions.scope(id)`, and
      // resolved per call rather than once — the reader switches sessions under us.
      //
      // `send` rejects on business failures and the caller is a generated card that cannot
      // handle it, so surface it rather than dropping it: a click that goes nowhere looks
      // exactly like a click that was never wired up.
      const release = registerUi4aHost({
        cwd,
        sessionId,
        send: (text, owner) => {
          const id = owner ?? currentSession();
          const store = scoped.sessions as unknown as ISessions;
          const byId = store.list.getSnapshot().byId;
          const ownerId = id as keyof typeof byId | undefined;
          const session = ownerId === undefined || byId[ownerId] === undefined ? undefined : store.scope(ownerId);
          if (session === undefined) throw new Error("[dsh-generative-ui] $dsh/chat: owning session is unavailable");
          // The scoped context is minted by the host and carries its own inject set, so our
          // outer declaration does not reach it — reading `conversation` off it directly
          // throws `cannot get property "conversation" without inject`. One more inject on
          // that context is what makes the property readable.
          session.inject(["conversation"], (addressed) => {
            void addressed.conversation.send(text).catch((error: unknown) => console.error("[dsh-generative-ui] $dsh/chat send failed", error));
          });
        },
      });
      return () => {
        release();
        releaseBindings();
      };
    }, "dsh-generative-ui: $dsh host");
  });
  // A card that fails to compile used to be a red panel the reader saw and the model never did.
  // `onError` fires only for a failure that survived settling and retries, so this is the real
  // ones — see `report-error.ts` for why it is once per message and why it waits a beat.
  //
  // A route rather than `conversation.send`: the detail belongs in the model's CONTEXT, which is
  // assembled host-side, and a chat message could never be taken back once the card was fixed.
  // `card-failure.ts` has the rest.
  const sendToModel = (report: { message: string; phase: string } | null) => {
    const id = currentSession();
    if (id === undefined) return;
    void fetch(`${CARD_ERROR_PATH}?session=${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report ?? {}),
    }).catch((error: unknown) => console.error("[dsh-generative-ui] card error report failed", error));
  };

  // Canvases are a tab type in the host's right Sidebar (§3.6) — the tab strip, close control,
  // width drag, float/dock, and "which ones are open" are all the host's, and this is the whole
  // of what remains ours: say what a canvas file is, draw one, and open it when the model writes
  // it. A nested fiber and not a static inject: every name in `inject` is a hard dependency, and
  // a host without the sidebar should lose the canvas panel, not the plugin — inline cards and
  // the prompt still matter there.
  let sidebarArrived = false;
  ctx.inject(["slots", "sidebarRightTabs", "sidebarRight"], (scoped) => {
    sidebarArrived = true;
    // `slots` is not merged onto cordis's `Context` by any package's `declare module` — nothing
    // in the tree declares it, so the property is genuinely absent from the type while present at
    // runtime. Narrowed to the service's own class rather than left as `any`, so `register`'s
    // generics still check the seat name and the composed props (§4's `as unknown as` precedent:
    // this dodges a client-side type gap, not the runtime inject check, which still applies).
    // `inject` is on the service wrapper rather than on `SlotCore` itself.
    const slots = (scoped as unknown as { slots: SlotCore & SlotsInject }).slots;
    // `byId` is keyed by the branded `SessionId`; an address or a tab's standard props carry a
    // plain string that names one, so the lookup widens on the way in and nothing else does.
    const cwdOf = (id: string) => {
      const byId = (scoped.sessions as unknown as ISessions).list.getSnapshot().byId as Record<string, { cwd?: string } | undefined>;
      return byId[id]?.cwd;
    };
    // Order matters: `openResource` throws on an address no type claims, so the type has to be
    // registered before anything can try to open one.
    scoped.effect(() => scoped.locale.register(NS, { zh, en }), "dsh-generative-ui: canvas copy");
    scoped.effect(() => scoped.sidebarRightTabs.register(canvasTabDefinition), "dsh-generative-ui: canvas tab type");
    scoped.effect(() => scoped.sidebarRightTabs.register(canvasBrowserDefinition(scoped.locale.bind(NS))), "dsh-generative-ui: canvas browser type");
    scoped.effect(
      () =>
        // The seat is declared at runtime by the sidebar, so registering early throws
        // `slot "..." is not declared` (§2.4). `inject` is a factory: the framework resolves the
        // session and calls it, which is what lets the body read under the address's own session
        // rather than whichever one the reader happens to have on screen.
        slots.inject("sidebar.right.pane.tab", () =>
          slots.register(
            {
              name: "sidebar.right.pane.tab",
              key: CANVAS_TAB_ID,
              registrant: "dsh-generative-ui: canvas tab body",
              locale: NS,
              inject: () => ({
                cwdOf,
                onCardError: (message: string, phase: string) => reportCardError(sendToModel, message, phase),
                onCardRendered: cardRendered,
              }),
            },
            CanvasBody,
          ),
        ),
      "dsh-generative-ui: canvas tab body",
    );
    scoped.effect(
      () =>
        slots.inject("sidebar.right.pane.tab", () =>
          slots.register(
            {
              name: "sidebar.right.pane.tab",
              key: CANVAS_BROWSER_ID,
              registrant: "dsh-generative-ui: canvas browser",
              locale: NS,
              inject: () => ({ cwdOf }),
            },
            CanvasBrowser,
          ),
        ),
      "dsh-generative-ui: canvas browser",
    );
    scoped.effect(
      () =>
        startCanvasAutoOpen({
          calls,
          sessionId: currentSession,
          cwd,
          list: listCanvasIds,
          open: (session, id) => {
            try {
              scoped.sidebarRight.openResource(canvasAddress(session, id));
            } catch (error) {
              // `openResource` treats an address no type will claim as a wiring mistake and
              // throws. One bad path must not take the transcript observer down with it.
              console.error("[dsh-generative-ui] could not open canvas", id, error);
            }
          },
        }),
      "dsh-generative-ui: canvas auto-open",
    );
  });
  // The nested callback above is the success signal; this is only its absence. Same shape as the
  // AppFrame timeout it replaces — one warning turns "the canvases do nothing" into a starting
  // point instead of a mystery. Inside an effect and off the bare global rather than `window`:
  // the plugin loads in a document, but `apply()` is also called by tests and by smoke, and a
  // bare `window` there is a throw that takes the whole registration down.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      if (!sidebarArrived) console.warn("[dsh-generative-ui] no right Sidebar on this host — canvases have nowhere to render.");
    }, 5_000);
    return () => clearTimeout(timer);
  }, "dsh-generative-ui: canvas tab availability");
  ctx.effect(
    () =>
      claimInlineFences({
        segments,
        fences: fencesByKey,
        t: ctx.locale.bind("common"),
        subscribeLocale: (refresh) => ctx.locale.subscribe(refresh),
        // A settled card is skipped only while it is still the one it was claimed for: a session
        // switch re-renders it so its capability shims follow the conversation the reader is on.
        owner: sessionId,
        // React can reuse the whole transcript across a session switch without a single mutation,
        // which is the one case `observeTranscript` has nothing to react to.
        subscribeOwner: (refresh) => {
          const selected = ctx.get("uiSession") as { adapter?: { current: { subscribe?: (listener: () => void) => () => void } } } | undefined;
          const primary = selected?.adapter?.current.subscribe?.(refresh);
          if (primary !== undefined) return primary;
          // Older hosts keep the selection on the session list, which is where
          // `selectedSessionId` reads it from too. Listening to only one of the two leaves the
          // cards of the other un-re-rendered across a switch.
          const list = sessions.list as unknown as { subscribe?: (listener: () => void) => () => void };
          return list.subscribe?.(refresh) ?? (() => {});
        },
        // The SAME gate on both callbacks. A card that may not report a failure may not retract
        // one either — see `cardRendered`.
        render: ({ code, streaming, last }) => createElement(GenUISurface, { key: sessionId(), sessionId: sessionId(), code, streaming, onError: (error, phase) => reportCardError(sendToModel, error.message, phase, last), onRendered: (restored) => cardRendered(restored, last) }),
      }),
    "dsh-generative-ui: inline fences",
  );
}

/** All assistant prose in one node, concatenated; empty for every other node kind. */
export function textOf(node: ChatNodeView): string {
  const blocks = (node.data as AssistantNodeData | undefined)?.blocks;
  if (blocks === undefined) return "";
  let text = "";
  for (const block of blocks) if (block.kind === "text" && block.text !== undefined) text += block.text;
  return text;
}

/**
 * Cache key for a `tool-call` node: how far its arguments have streamed, plus which calls
 * have settled. Read straight off the node rather than through `toolCallsOf`, so computing
 * the key does not repeat the work the cache exists to avoid.
 *
 * The settled flags are part of the key, not a detail: a call's `argsRaw` is already
 * complete when `tool-result` arrives, so a length-only key would never invalidate and the
 * cached view would claim `streaming` forever — a canvas that never stops pulsing and an
 * `edit` that never marks it stale.
 */
export function callsKeyOf(node: ChatNodeView): string {
  const parts: string[] = [];
  const walk = (block: CallBlock | undefined): void => {
    if (block === undefined) return;
    parts.push(`${(block.call?.argsRaw ?? block.argsRaw)?.length ?? 0}${block.kind === "tool-result" ? "!" : ""}`);
    for (const child of block.subCalls ?? []) walk(child);
  };
  walk((node.data as { root?: CallBlock } | undefined)?.root);
  return parts.join(",");
}
