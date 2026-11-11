/**
 * One canvas tab's body: the file behind the address, rendered.
 *
 * A seat body, not a chrome host. The tab strip, header, close control and width drag are the
 * host's; this is the `GenUISurface` layer and the sub-page resolve that feeds it.
 */
import { useEffect, useState } from "react";
import { parseFileAddress } from "@deepseek-ai/dsh-util-workspace-path";
import type { PropsRuntime, TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { GenUISurface } from "../runtime/GenUISurface.tsx";
import { canvasIdOfAddress } from "./definition.ts";
import { readCanvasFile } from "./read.ts";
import { useSubPages } from "./subpages.ts";
import { CanvasReadStatus } from "./read-status.tsx";

/**
 * The registrant's business face, bound per tab occurrence.
 *
 * `inject` is a factory: the framework resolves the session and hands it over, so `cwdOf` is
 * asked for a specific session rather than reaching for "whichever one is on screen". Several
 * sessions share a workspace and a tab may belong to one the reader is not looking at — the
 * read route allowlists `cwd` against each session's `header.cwd`, so getting this wrong runs
 * the read under a stranger's allowlist (§3.65 hit the same shape on `$dsh/fs`).
 */
export type CanvasInjected = {
  /** The workspace root a given session reads under. */
  readonly cwdOf: (sessionId: string) => string | undefined;
  /** A canvas that failed to compile; see `runtime/report-error.ts`. */
  readonly onCardError: (message: string, phase: string) => void;
  /** A canvas that painted; see `runtime/report-error.ts`. */
  readonly onCardRendered: (restored: boolean) => void;
};

export type CanvasBodyProps = PropsRuntime<"sidebar.right.pane.tab"> & CanvasInjected & { t: TranslateNS<"ui4aCanvas"> };

export function CanvasBody({ useTabInfo, cwdOf, onCardError, onCardRendered, t }: CanvasBodyProps) {
  const { tab } = useTabInfo();
  const address = tab.contentId;
  const id = canvasIdOfAddress(address);
  const parsed = parseFileAddress(address);
  // The address's own session, not the tab's standard-prop one and never "current": the two
  // only agree when the reader happens to be looking at the session that wrote the canvas.
  const sessionId = parsed?.scope === "session" ? parsed.sessionId : undefined;
  const cwd = sessionId === undefined ? undefined : cwdOf(sessionId);
  const [body, setBody] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (cwd === undefined || id === null) return;
    let live = true;
    setError(null);
    setLoading(true);
    // Every re-read drops the body it is replacing, including the automatic one an edit triggers.
    // Retaining it renders code the file no longer has while the read is pending — and for good if
    // that read hangs.
    setBody(null);
    void readCanvasFile(cwd, id)
      .then((code) => {
        if (live) {
          setBody(code);
          setLoading(false);
        }
      })
      .catch((reason: unknown) => {
        if (live) {
          setError(reason);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
    // `revision` increments on every navigation to this tab, and auto-open re-navigates when an
    // `edit` marks the canvas stale — so a patch is re-read here without the transcript having
    // to carry the new body. `visible` deliberately does not appear: with `keepMounted` the body
    // survives a hide, and re-reading on every return would drop state for nothing.
  }, [cwd, id, tab.navigation.revision, retry]);

  // Disk is the source, so a body read here is always settled. Under the default PTC mode the
  // first frame the transcript shows is settled too (§3.6); off-PTC a top-level `write` briefly
  // has no file, and this stays empty until it lands rather than previewing the arguments.
  const resolved = useSubPages(cwd, body === null || id === null ? undefined : { id, code: body, streaming: false }, sessionId);

  // A retry after a failure drops the retained body first: `body` can still hold the source of a
  // revision whose read failed, and rendering that while the retry is in flight remounts and
  // executes code the file no longer has. Batched with the counter bump, so the render that
  // follows shows the loading state rather than the stale canvas.
  const retryRead = () => {
    setBody(null);
    setError(null);
    setLoading(true);
    setRetry((n) => n + 1);
  };

  if (id === null) return null;
  if (error !== null) return <CanvasReadStatus t={t} error={error} retry={retryRead} />;
  if (body === null) return <CanvasReadStatus t={t} retry={loading ? undefined : retryRead} />;
  // A canvas is inset; an inline card is not. The card is told to fill whatever holds it, so
  // the two surfaces have to differ HERE rather than in every generated component — inline sits
  // in the transcript and must share the prose's left edge, while a canvas in a panel with its
  // own chrome wants breathing room or the title sits on the frame. `24px` is the host's own
  // number: the Sidebar's guide tab body (`sidebar.right.tab.guide`, the same seat family as
  // this one) is `padding: 0 24px`.
  //
  // The grid row is the old panel's `.dgu-body > * { min-height: 100% }` without a stylesheet:
  // one row at least as tall as the box and free to grow, so a short card still fills the panel
  // and a card that asks for `height: 100%` has something to resolve against. `box-sizing:
  // border-box` keeps that 100% inside the padding rather than overflowing it.
  return (
    <div style={{ boxSizing: "border-box", height: "100%", minHeight: 0, overflow: "auto", padding: "24px", display: "grid", gridTemplateRows: "minmax(100%, auto)" }}>
      <GenUISurface key={`${sessionId}:${id}`} sessionId={sessionId} code={resolved} streaming={false} onError={(error, phase) => onCardError(error.message, phase)} onRendered={onCardRendered} />
    </div>
  );
}
