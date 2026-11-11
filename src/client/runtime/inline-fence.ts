/**
 * Renders ```` ```ui4a/tsx ```` blocks in assistant prose live, in place, between the
 * surrounding paragraphs — the ui4a-playground inline contract.
 *
 * Two sources, each doing what only it can:
 *
 * - **The session snapshot owns the code.** The host's markdown renderer withholds a
 *   fence's info string until the closing fence arrives, so a DOM-only implementation
 *   cannot tell a half-written ui4a block from any other code block, and can only claim
 *   it after the model has stopped typing. The raw assistant text has the opening fence
 *   from its very first token, so that is where the code and its language come from.
 * - **The DOM owns the position.** There is no slot for a markdown code block, so the
 *   rendered block is what tells us where in the prose to mount. `md-code-block` is a
 *   hard-coded class on the host's CodeBlock wrapper.
 *
 * Blocks are matched to segments by content (a rendered block's text is a prefix of, or
 * equal to, its segment's code), not by order, so unrelated code blocks in the same reply
 * are left alone.
 *
 * The claimed block is hidden rather than removed: it belongs to the host's React tree,
 * and detaching a node React still owns invites a NotFoundError on its next commit.
 */
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { CodeBlock } from "@deepseek-ai/dsh-client-ui-primitives";
import type { ReactElement } from "react";
import { FENCE_LANG } from "../../contract.ts";
import { parseUi4aSegments, type Fence, type Ui4aSegment } from "./segments.ts";
import { observeTranscript } from "./observe.ts";

const CLAIMED = "data-ui4a-claimed";
const MOUNT = "data-ui4a-mount";
const PREVIEW = "data-ui4a-preview";
/** The message a block belongs to. Private to the host, but it is the same string `ChatNodeView.key` carries. */
const NODE_KEY = "data-chat-node-key";

/** Unmounting a root during React's own commit throws; defer it like every other teardown here. */
const dropPreview = (claim: { preview: Preview | null }) => {
  const preview = claim.preview;
  if (preview === null) return;
  claim.preview = null;
  clearTimeout(preview.timer);
  queueMicrotask(() => {
    preview.root.unmount();
    preview.host.remove();
  });
};

/**
 * How long a claimed card gets to paint before its source preview is rendered.
 *
 * The preview is not free: shiki tokenizes synchronously during React's render, and on a 7–8KB card
 * that was a 310ms long task — measured on a session switch, where the cards themselves paint
 * 20–25ms after mount. Rendering it eagerly made the reader watch source for exactly as long as the
 * highlighting took. A warm card beats this delay and never shows source; a cold one still does.
 */
export const PREVIEW_DELAY_MS = 300;

type Preview = { host: HTMLElement; root: Root; shown: boolean; timer?: ReturnType<typeof setTimeout> };

/** `reserved` is the segment code this claim owns, so no other block can be matched to it — see `sweep`. */
type Claim = { block: HTMLElement; mount: HTMLElement; root: Root; code: string; reserved: string; complete: boolean; rendered: string; painted: MutationObserver | null; preview: Preview | null; owner: string | undefined };

/**
 * Whether the card has actually painted something a reader can see.
 *
 * **Compiling is not the same as having something to look at.** Mid-stream the default
 * export usually exists while the body is still an empty shell, so hiding the source block
 * at claim time leaves a blank gap that fills in with a pop seconds later — and the source
 * was sitting right there the whole time. Text, or an element that draws its own
 * pixels **and has a box**, is the signal; a wrapper with layout classes is not.
 *
 * Measured against the alternatives: a bare `getBoundingClientRect()` test passes a styled-but-
 * empty `div` — `height: 200px`, a grid with a gap, a padded skeleton card — which is precisely
 * the mid-stream shell this exists to reject. Enumerating tags alone missed `<video>`, custom
 * elements and iframes. Requiring both catches everything the tag list caught, plus those three,
 * and still rejects all three empty shells.
 */
/** Elements that paint their own pixels; a custom element (any tag with a dash) counts too. */
const DRAWS = new Set(["SVG", "CANVAS", "IMG", "VIDEO", "IFRAME", "PICTURE"]);

/**
 * partial-react's error boundary renders a bare text node — `ERROR` or `ERROR: <message>`.
 * That is text, so a naive check reads it as a painted card and hides the source block
 * underneath it, leaving the reader one red line and no way to see what the model wrote.
 * Measured: exactly the case where the source is most worth keeping.
 */
const BOUNDARY_ERROR = /^ERROR(:|$)/;

/** Split out from `hasPainted` so the rule can be tested without a DOM. */
export const isPaintedText = (text: string) => {
  const trimmed = text.trim();
  return trimmed !== "" && !BOUNDARY_ERROR.test(trimmed);
};

export const hasPainted = (mount: HTMLElement) => {
  if (isPaintedText(mount.textContent ?? "")) return true;
  for (const el of mount.querySelectorAll("*")) {
    const tag = el.tagName.toUpperCase();
    if (!DRAWS.has(tag) && !tag.includes("-")) continue;
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return true;
  }
  return false;
};

/** A wider Markdown fence leaves the real ui4a opener as the first line of the rendered code. */
const LEADING_UI4A_FENCE = new RegExp(String.raw`^\s*\x60{3,}${FENCE_LANG.replace("/", "\\/")}(?:[^\n]*)(?:\n|$)`);

/** The block's source. `pre` when the grammar was unknown, the highlighted div otherwise. */
const codeOf = (block: HTMLElement) => {
  const rendered = block.querySelector("pre")?.textContent ?? "";
  if (!LEADING_UI4A_FENCE.test(rendered)) return rendered;
  // The snapshot parser already owns every malformed-closer tolerance. Reusing it here keeps the
  // DOM half on the same recovered body instead of growing a second fence grammar.
  return parseUi4aSegments(rendered)[0]?.code ?? rendered;
};

/** CodeBlock trims one trailing newline for display, so compare on trimmed ends. */
export const sameCode = (a: string, b: string) => a.trimEnd() === b.trimEnd();

/**
 * The segment a rendered block belongs to.
 *
 * Mid-stream the block shows a prefix of its segment; once settled the two are equal. So a PREFIX
 * only ever belongs to a segment that is still growing: a settled segment that opens with a shorter
 * block is not that block's card.
 *
 * Measured in a real session, where the newest card kept showing its source while every older card
 * rendered: the model had pasted a 162-character excerpt of that card into its own prose, the sweep
 * met the excerpt first (DOM order) and handed it the card's 8,156-character segment, and `taken`
 * then kept the real block from ever matching — a 6 KB card starved by a snippet of itself. Exact
 * match is tried across the whole list first, so a settled card still wins over a growing one that
 * happens to share its opening.
 */
export const matchSegment = (segments: readonly Ui4aSegment[], rendered: string) => segments.find((segment) => sameCode(segment.code, rendered)) ?? segments.find((segment) => !segment.complete && segment.code.startsWith(rendered));

export type InlineFenceOptions = {
  /** Every ui4a segment currently in the transcript, in document order. */
  segments: () => readonly Ui4aSegment[];
  /** 每条消息的 fence 列表，按宿主写进 DOM 的 node key 索引；缺省或查不到时退回纯内容匹配。 */
  fences?: () => ReadonlyMap<string, readonly Fence[]>;
  /** `last` answers whether this card is still the transcript's newest — asked at report time, not render time. */
  render: (props: { code: string; streaming: boolean; last: () => boolean }) => ReactElement;
  /** 在预览渲染时读取当前语言，而不是捕获挂载时的翻译。 */
  t: (key: "copy" | "copied") => string;
  /** 语言或字典变化只刷新源码预览，不重新挂载卡片。 */
  subscribeLocale: (refresh: () => void) => () => void;
  /** 当前会话。内容未变的卡片也必须随会话切换重渲染，否则能力仍绑在上一个会话。 */
  owner: () => string | undefined;
  /**
   * 会话切换本身不会改动 transcript DOM，`observeTranscript` 因此不会跑 sweep；宿主用它
   * 订阅选择变化，在 React 复用同一组节点时也能重画未变的卡片。
   */
  subscribeOwner?: (refresh: () => void) => () => void;
  scope?: HTMLElement;
};

/**
 * Whether this card's code is the last ui4a segment in the transcript.
 *
 * **Only the last block's failure is worth telling the model about.** An earlier card that cannot
 * render stays in the transcript and re-renders on every later frame, so it fails again, and
 * again, for the rest of the session — measured on a real one where the model wrote a card
 * importing `Github` from `lucide-react` (removed upstream), was told, fixed it to `GitBranch` in
 * the very next reply, and the failure notice kept coming back from the reply it had already
 * superseded. The model cannot act on it: editing a message it already sent is not a thing it
 * can do.
 *
 * Evaluated when the report is about to be SENT, not when the error is raised. A card is the last
 * one at the moment it breaks and stops being so as soon as the next card appears, which is
 * exactly the second in between.
 *
 * **Segments, not mounts.** Comparing DOM nodes was wrong three separate ways, all of them
 * silent: `release` calls `claim.mount.remove()` on every markdown re-render, so a broken card
 * followed by any trailing prose compared a detached node and dropped its own report; `defer`
 * parks a far-offscreen block without ever creating a mount, so a reader scrolled up while the fix
 * streams left an older card holding the last mount and reporting as though it were newest; and an
 * empty node list has to mean false, since a session switch inside the settle window empties it
 * while `sendToModel` reads `currentSession()` at send time — session A's error into session B's
 * store. The segment list is the transcript's own order and survives all three.
 */
export const isLastSegment = (segments: readonly Ui4aSegment[], code: string): boolean => {
  const last = segments.at(-1);
  return last !== undefined && (sameCode(last.code, code) || last.code.startsWith(code));
};

/**
 * How far outside the viewport a card is still worth compiling.
 *
 * One viewport in each direction: the reader who scrolls towards a card finds it already
 * rendered, because compiling starts a screen before it arrives. Smaller and a fast scroll
 * outruns it; much larger and the whole transcript is "near" again, which is the state this
 * exists to leave.
 */
const NEAR_VIEWPORT = "100% 0px";

export function claimInlineFences({ segments, fences, render, t, subscribeLocale, owner, subscribeOwner, scope }: InlineFenceOptions): () => void {
  const claims = new Map<HTMLElement, Claim>();
  const root = scope ?? document.body;

  // Blocks parked until they come near the viewport. Kept so the disposer can stop observing
  // them, and so `sweep` does not re-observe one it is already watching.
  const parked = new Set<HTMLElement>();
  // Blocks the observer has woken. Kept separately because waking does NOT move the block: the
  // observer fires on entering the margin, while `getBoundingClientRect` still reads whatever
  // the layout says, so re-measuring in the sweep that the wake triggered parks it straight back
  // and the card never renders. Membership here is the permission; the sweep clears it.
  const woken = new Set<HTMLElement>();
  const nearby: IntersectionObserver | null =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            let woke = false;
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const block = entry.target as HTMLElement;
              nearby?.unobserve(block);
              parked.delete(block);
              woken.add(block);
              woke = true;
            }
            // One sweep for the batch, not one per block: a scroll can bring a dozen into range
            // in the same frame, and `sweep` walks the whole transcript each time it runs.
            if (woke) sweep();
          },
          { rootMargin: NEAR_VIEWPORT },
        );

  /** True when this block should wait. An incomplete (still streaming) segment never waits — it is what the reader is watching. */
  const defer = (block: HTMLElement, segment: Ui4aSegment): boolean => {
    if (nearby === null || !segment.complete) return false;
    if (woken.delete(block)) return false;
    if (parked.has(block)) return true;
    // `getBoundingClientRect` rather than waiting for the observer's first callback: the observer
    // reports asynchronously, so a block would be claimed before its first entry ever arrives and
    // the deferral would never happen at all.
    const box = block.getBoundingClientRect();
    const limit = globalThis.innerHeight || 0 || 0;
    // A zero-height box means the block is not laid out yet (display:none, or an ancestor still
    // hidden). That is not "far away", and treating it as such parks a card that is about to be
    // visible, so measure it again next sweep instead of parking it.
    if (limit === 0 || (box.height === 0 && box.width === 0)) return false;
    if (box.bottom > -limit && box.top < limit * 2) return false;
    parked.add(block);
    nearby.observe(block);
    return true;
  };

  const renderPreview = (claim: Claim) => {
    const preview = claim.preview;
    if (!preview?.shown) return;
    claim.block.style.display = "none";
    preview.root.render(createElement(CodeBlock, { code: claim.code, lang: "tsx", copyLabel: t("copy"), copiedLabel: t("copied") }));
  };

  const release = (claim: Claim, restore: boolean) => {
    claim.painted?.disconnect();
    claim.root.unmount();
    claim.mount.remove();
    dropPreview(claim);
    if (restore && claim.block.isConnected) {
      claim.block.style.display = "";
      claim.block.removeAttribute(CLAIMED);
    }
    claims.delete(claim.block);
  };

  const sweep = () => {
    const current = segments();
    // Per sweep, so a streaming frame reuses one walk of each message's blocks. Two entries at most
    // in practice (the message being written, and whichever one the reader scrolled to).
    const byKey = fences?.();
    /**
     * A veto, never a decision: true when this block's own message says it is not a card.
     *
     * Positional on purpose NOT: numbering blocks against fences assumes the two enumerate the
     * same things, and they do not — a `~~~` sample or an indented code block reaches the same
     * `.md-code-block` wrapper without being a fence in this list, shifting every index after it,
     * and the block this guard exists for is exactly the one that would slip through. Content is
     * what both sides already agree on: an exact match decides, otherwise a unique prefix survives,
     * and anything ambiguous lets the ordinary content match through.
     */
    const isForeignFence = (block: HTMLElement, code: string) => {
      if (byKey === undefined || code === "") return false;
      const key = block.closest(`[${NODE_KEY}]`)?.getAttribute(NODE_KEY);
      if (key === undefined || key === null) return false;
      const fences = byKey.get(key);
      if (fences === undefined) return false;
      const exact = fences.filter((fence) => sameCode(fence.code, code));
      const candidates = exact.length > 0 ? exact : fences.filter((fence) => fence.code.startsWith(code));
      if (candidates.length !== 1) return false;
      const [only] = candidates;
      return only !== undefined && only.lang !== FENCE_LANG;
    };
    // Dead claims first, because the reservation below is built from what claims hold. A block
    // the host's markdown re-render replaced is gone but its claim is not, and releasing it in
    // the loop *after* the claim loop let it reserve its segment for one more sweep — long
    // enough for the replacement block to find nothing free and paint nothing. With the
    // re-render happening every streamed frame that alternates, and the card flickers.
    for (const claim of claims.values()) if (!claim.block.isConnected) release(claim, false);
    // A segment backs at most one block. `matchSegment` matches by PREFIX and takes the first
    // hit in document order, and every generated card opens with the same line — measured on a
    // real transcript, all three cards started `import { useState } from "react"`, so the third
    // card's opening 40 characters were still a prefix of the FIRST card's code. Its slot
    // rendered card one in full, then blanked for 2.8s when the texts diverged and the partial
    // buffer had no `export default` yet: content, then nothing, then finally the right card.
    // Excluding what live claims already own leaves each new block only the segments still going
    // spare, which in a growing transcript is the one still streaming.
    const taken = new Set([...claims.values()].map((claim) => claim.reserved));

    for (const block of root.querySelectorAll<HTMLElement>(`.md-code-block:not([${CLAIMED}])`)) {
      // OUR OWN nodes are not candidates. `CodeBlock` — the host component the source preview is
      // rendered with — puts `md-code-block` on its own root, so every preview we mount is itself
      // a match for this selector, and a card that renders a code block is another. Claiming one
      // mounts a card inside it, whose preview is a third block, and so on.
      //
      // Measured in a live session: `blocks` climbed 1 → 2 → 3 while `mounts` and `prev` climbed
      // with it, then the whole stack collapsed to 0 and rebuilt, several times a second — the
      // flicker. The reservation below does NOT stop it: it holds `claim.reserved`, the code from
      // the PREVIOUS frame, while the segment has already grown, so mid-stream the two never
      // match and nothing is excluded.
      if (block.closest(`[${PREVIEW}]`) !== null || block.closest(`[${MOUNT}]`) !== null) continue;
      const code = codeOf(block);
      if (code === "") continue;
      if (isForeignFence(block, code)) continue;
      // A streaming block's rendered text is a prefix of its segment; a settled one equals it.
      const segment = matchSegment(
        current.filter((candidate) => !taken.has(candidate.code)),
        code,
      );
      if (segment === undefined) continue;
      // A DEFERRED block still owns its segment. Deferring means "do not mount this yet", not
      // "this segment is free" — and the card that gets parked is by definition a settled one far
      // off screen, which in a live transcript is the oldest card while the reader sits at the
      // bottom watching a new one arrive. Reserving only on the claim path left that segment
      // spare, and the new block — still showing nothing but the opening line every generated
      // card shares — matched it by prefix and painted the OLD card where the new one belonged.
      //
      // Reserve BEFORE the deferral check, or the two earlier fixes to this class (the per-claim
      // reservation, and pruning dead claims before building it) go on missing it: both hold only
      // what a live claim owns, and a parked block has no claim. Reserving here also covers the
      // within-one-sweep case a reload presents — every block unclaimed at once, all of them
      // otherwise matching the same segment.
      taken.add(segment.code);
      // FAR OFFSCREEN AND NOT YET STREAMING: leave it for later. Claiming a block compiles it,
      // mounts a React root, runs every effect it declares and pulls its third-party imports off
      // esm.sh — a Monaco card costs megabytes and starts a language service. `isConnected` was
      // the only liveness test here, and the host keeps a long transcript's messages in the DOM,
      // so scrolling back through twenty cards paid all of that twenty times over for cards
      // nobody was looking at.
      //
      // A STREAMING block is never deferred: it is what the reader is watching, and its segment
      // is still growing. `defer` also answers false when there is no observer (no
      // IntersectionObserver, or `scope` is detached in a test), so the behaviour without one is
      // exactly what it was before.
      //
      // Called ONCE. It has side effects — it consumes the wake flag, parks the block and starts
      // observing it — so asking twice in one sweep eats the wake and re-parks a block that had
      // just come into view.
      if (defer(block, segment)) continue;
      block.setAttribute(CLAIMED, "");
      const mount = document.createElement("div");
      mount.setAttribute(MOUNT, "");
      block.parentElement?.insertBefore(mount, block.nextSibling);
      // Swap the host's block for our own CodeBlock while the card is still compiling. Two
      // reasons, both reported from a real transcript: the host keys highlighting on the fence
      // language, and its markdown parser truncates `ui4a/tsx` at the slash — so `ui4a` reaches
      // shiki, matches no grammar, and the source renders as unhighlighted plain text. Passing
      // `lang="tsx"` is all it takes; `dsh-client-ui-primitives` is in the platform table, so
      // this resolves to the shell's own component and costs nothing to bundle. The second
      // reason is height: a 300-line card streams for over a minute with all of it on screen,
      // and this preview is capped.
      const previewHost = document.createElement("div");
      previewHost.setAttribute(PREVIEW, "");
      block.parentElement?.insertBefore(previewHost, block);
      // The host's block stays visible until something replaces it — the preview once
      // PREVIEW_DELAY_MS passes, or the card the moment it paints. Hiding it at claim time would
      // leave a gap where the source was, which is exactly the blank this preview exists to avoid.
      const preview: Preview = { host: previewHost, root: createRoot(previewHost), shown: false };
      const claim: Claim = { block, mount, root: createRoot(mount), code: "", reserved: segment.code, complete: false, rendered: "", painted: null, preview, owner: owner() };
      preview.timer = setTimeout(() => {
        preview.shown = true;
        renderPreview(claim);
      }, PREVIEW_DELAY_MS);
      // The source stays visible until the card paints. Checked at most once per frame and
      // torn down the moment it fires: a streaming card mutates thousands of times, and
      // `textContent` walks the whole subtree, so a per-mutation check would be
      // O(mutations x subtree). The cost only exists during the gap it closes.
      let queued = 0;
      claim.painted = new MutationObserver(() => {
        if (queued !== 0) return;
        queued = requestAnimationFrame(() => {
          queued = 0;
          if (!hasPainted(mount)) return;
          claim.painted?.disconnect();
          claim.painted = null;
          claim.block.style.display = "none";
          dropPreview(claim);
        });
      });
      claim.painted.observe(mount, { childList: true, subtree: true, characterData: true });
      claims.set(block, claim);
    }

    for (const claim of claims.values()) {
      // Already pruned at the top of the sweep; a block can still go while the claim loop above
      // runs, so this stays as the guard for the rest of this pass.
      if (!claim.block.isConnected) {
        release(claim, false);
        continue;
      }
      const rendered = codeOf(claim.block);
      // A claim is not permanent. React reuses `.md-code-block` nodes positionally, so the node we
      // hid can come back holding a plain ```tsx sample; the language veto has to run on claims too,
      // or that block stays hidden behind a card it does not own. Before the skip below, because an
      // unchanged block's text is exactly the case this guard exists for.
      if (rendered !== "" && isForeignFence(claim.block, rendered)) {
        release(claim, true);
        continue;
      }
      // The block's own text is what locates its segment, so an unchanged block cannot
      // have changed its match — skip the scan rather than re-run it every frame.
      //
      // Only once it has settled, though. `complete` flips on the segment, not in the block, so
      // a card whose last token closes the fence without changing the rendered text would never
      // leave the streaming path — and the streaming path cuts back the still-being-typed tail,
      // so it would keep rendering a card with its last statement missing. The skip is an
      // optimization for the steady state (most blocks in a long transcript), and a claim that
      // is still streaming is being re-scanned every frame regardless.
      // `owner` is part of it: React reuses a `.md-code-block` across a session switch, so an
      // unchanged card is otherwise never handed to `render` again and keeps the shims of the
      // session it was claimed under — writes, commands and chat then act on a session the reader
      // is no longer looking at.
      if (rendered === claim.rendered && claim.code !== "" && claim.complete && claim.owner === owner()) continue;
      claim.rendered = rendered;
      // Same reservation as the claim loop, minus this claim's own segment: a block whose text is
      // still the shared opening line matches an older card here too, and the newest block would
      // be handed the oldest card's code on the very sweep that claimed it.
      const segment = matchSegment(
        current.filter((candidate) => candidate.code === claim.reserved || !taken.has(candidate.code)),
        rendered,
      );
      // The snapshot is authoritative while it still describes this block: mid-stream its
      // code runs ahead of what markdown has painted. Once it stops describing it — an
      // older page dropped out of the loaded window — the last good frame stands, because
      // re-deriving from the hidden block would hand the renderer a truncated prefix and
      // blank a card that was already complete.
      //
      // Unless the block stopped being this card's at all: React reconciles `.md-code-block`
      // wrappers positionally, so a re-render can drop unrelated content into the very node
      // we hid. Its text is then no longer a prefix of what we rendered, and holding the
      // claim would leave a stale card on screen with the real block invisible behind it.
      if (segment === undefined) {
        // The prefix rule is for a block whose text is still arriving. Once the session changed it
        // is a different transcript's card: keeping it leaves session A's mount — and its
        // capabilities — on screen under B, and only the fence language may have changed, which no
        // mutation reports.
        if (claim.owner === owner() && claim.code.startsWith(rendered)) continue;
        release(claim, true);
        continue;
      }
      const { code, complete } = segment;
      // Follow the segment as it grows, or the reservation still names the prefix it was claimed on.
      taken.delete(claim.reserved);
      taken.add(code);
      claim.reserved = code;
      if (code === claim.code && complete === claim.complete && claim.owner === owner()) continue;
      claim.code = code;
      claim.complete = complete;
      // `code` is captured, `segments()` is read at call time: that is exactly the report-time
      // question, and it stays correct across the re-render that replaces this claim's own block.
      claim.owner = owner();
      claim.root.render(render({ code, streaming: !complete, last: () => isLastSegment(segments(), code) }));
      // The preview follows the SEGMENT, not the block: mid-stream the snapshot runs ahead of
      // what markdown has painted, so this is the newer text and the one the reader wants while
      // waiting. Dropped the moment the card paints, and not rendered at all before PREVIEW_DELAY_MS.
      renderPreview(claim);
    }
  };

  const stop = observeTranscript(sweep);
  const stopOwner = subscribeOwner?.(sweep) ?? (() => {});
  const stopLocale = subscribeLocale(() => {
    for (const claim of claims.values()) renderPreview(claim);
  });

  return () => {
    stop();
    stopOwner();
    stopLocale();
    // `disconnect` rather than unobserving each: the observer is going away with us, and a
    // parked block that is never claimed would otherwise keep it alive through its target list.
    nearby?.disconnect();
    parked.clear();
    woken.clear();
    for (const claim of claims.values()) release(claim, true);
  };
}
