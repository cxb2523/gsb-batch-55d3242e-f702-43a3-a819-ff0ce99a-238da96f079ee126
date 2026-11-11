/**
 * The canvas browser: every canvas in the workspace, one row each.
 *
 * The file tree already lists them, three levels down under `.dsh/ui4a/canvases/`; this is the
 * flat list that makes them reachable in one click. Picking a row opens it as a canvas tab through
 * the same `openResource` the transcript and the file tree use, so it reveals an already-open
 * canvas rather than stacking a second copy.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { PropsRuntime, TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
import { canvasAddress } from "./auto-open.ts";
import { listCanvasIds } from "./read.ts";
import { CanvasReadStatus } from "./read-status.tsx";

export type CanvasBrowserInjected = {
  /** The workspace root a given session reads under. */
  readonly cwdOf: (sessionId: string) => string | undefined;
};

export type CanvasBrowserProps = PropsRuntime<"sidebar.right.pane.tab"> & CanvasBrowserInjected & { t: TranslateNS<"ui4aCanvas"> };

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 12px",
  border: 0,
  borderRadius: 8,
  background: "transparent",
  color: "var(--dsw-alias-label-primary)",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
const HOVER = "var(--dsw-alias-interactive-bg-hover)";

export function CanvasBrowser({ useTabInfo, sessionId, cwdOf, t }: CanvasBrowserProps) {
  const { tab } = useTabInfo();
  const cwd = cwdOf(String(sessionId));
  const [ids, setIds] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (cwd === undefined) return;
    let live = true;
    setIds(null);
    setError(null);
    void listCanvasIds(cwd)
      .then((found) => {
        if (live) setIds(found);
      })
      .catch((reason: unknown) => {
        if (live) setError(reason);
      });
    return () => {
      live = false;
    };
    // Keyed on the workspace, not on the tab's revision: browsing is a listing, and re-listing on
    // every navigation would refetch what has not changed.
  }, [cwd, retry]);

  if (cwd === undefined) return null;
  if (error !== null) return <CanvasReadStatus t={t} error={error} retry={() => setRetry((n) => n + 1)} />;
  if (ids === null) return <CanvasReadStatus t={t} />;

  if (ids.length === 0) {
    return (
      <div style={{ padding: 24, color: "var(--dsw-alias-label-secondary)", fontSize: 13, lineHeight: "20px" }}>
        <div style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 500, marginBottom: 4 }}>{t("empty.title")}</div>
        <div>{t("empty.body")}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 8 }}>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          style={ROW}
          onMouseEnter={(event) => void (event.currentTarget.style.background = HOVER)}
          onMouseLeave={(event) => void (event.currentTarget.style.background = "transparent")}
          onFocus={(event) => void (event.currentTarget.style.background = HOVER)}
          onBlur={(event) => void (event.currentTarget.style.background = "transparent")}
          onClick={() => tab.actions.openResource(canvasAddress(String(sessionId), id))}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{id}</span>
        </button>
      ))}
    </div>
  );
}
