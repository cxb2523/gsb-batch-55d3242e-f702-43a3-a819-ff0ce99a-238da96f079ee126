/**
 * Reading the current session's chat nodes.
 *
 * Both consumers — inline fences and canvases — need the same unwrap, and both run it on
 * every frame while a reply streams. Sharing it keeps the guards in one place, and lets
 * the per-node work be cached against a node's identity rather than redone per frame.
 */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type { ISessions } from "@deepseek-ai/dsh-api-session-controller/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";

/**
 * `key` is the identity the host also writes onto the transcript DOM as `data-chat-node-key`
 * (`chatNode()` returns `key: context.key` and the flow item carries the same string). Optional
 * because older hosts may not expose it; every caller treats a missing key as "no anchor", never
 * as a mismatch.
 */
export type ChatNodeView = { readonly key?: string; readonly kind: string; readonly data: unknown; readonly anchorSeq: number };

type SessionId = Parameters<ISessions["binding"]>[0];

/** Use the UI selection on current hosts; older hosts kept it on the session list. */
export function selectedSessionId(ctx: ClientContext): SessionId | undefined {
  // `uiSession` is not statically injected: older hosts may not provide it.
  const uiSession = ctx.get("uiSession") as { adapter?: { current: { getSnapshot(): { key?: string } } } } | undefined;
  const key = uiSession === undefined ? (ctx.sessions as unknown as { list: { getSnapshot(): { current?: string } } }).list.getSnapshot().current : uiSession.adapter?.current.getSnapshot().key;
  return key as SessionId | undefined;
}

type ChatSnapshotLike = { readonly nodes: { values(): Iterable<unknown> } };
type UiConversationLike = { binding(source: unknown): { target(name: "chat"): { getSnapshot(): ChatSnapshotLike | undefined } } };

/** The current session's chat nodes, or an empty list when no session is open. */
export function chatNodes(ctx: ClientContext): readonly ChatNodeView[] {
  const sessionId = selectedSessionId(ctx);
  if (sessionId === undefined) return [];
  const binding = (ctx.sessions as unknown as ISessions).binding(sessionId);
  if (binding === undefined) return [];
  // A static inject would disable older hosts, so feature-detect the 0.1.2 service per sweep.
  const uiConversation = ctx.get("uiConversation") as UiConversationLike | undefined;
  const chat = uiConversation === undefined ? (binding.session.getSnapshot() as unknown as { readonly chat?: ChatSnapshotLike } | undefined)?.chat : uiConversation.binding(binding).target("chat").getSnapshot();
  if (chat === undefined) return [];
  return [...chat.nodes.values()] as readonly ChatNodeView[];
}

/**
 * Derives a value per chat node, reusing the previous result when the node has not changed.
 *
 * A sweep runs on every frame of a streaming reply, but only the tail node is actually
 * growing — re-deriving finished nodes means re-scanning the whole transcript dozens of
 * times a second, which grows with session length rather than with what changed.
 *
 * @param key - identity of a node's current content; equal keys must mean equal results.
 * @param derive - the per-node work to memoize.
 */
export function perNode<T>(key: (node: ChatNodeView) => string, derive: (node: ChatNodeView) => T) {
  let cache = new Map<string, T>();
  return (nodes: readonly ChatNodeView[]): T[] => {
    const next = new Map<string, T>();
    const results: T[] = [];
    for (const node of nodes) {
      const id = key(node);
      const value = cache.get(id) ?? derive(node);
      next.set(id, value);
      results.push(value);
    }
    // Replacing the map drops entries for nodes that left the loaded window.
    cache = next;
    return results;
  };
}
