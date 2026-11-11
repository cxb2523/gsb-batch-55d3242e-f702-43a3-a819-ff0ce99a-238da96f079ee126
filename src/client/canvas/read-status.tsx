import type { TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";

export function CanvasReadStatus({ t, error, retry }: { t: TranslateNS<"ui4aCanvas">; error?: unknown; retry?: () => void }) {
  return (
    <div role={error ? "alert" : "status"} style={{ padding: 24, color: "var(--dsw-alias-label-secondary)" }}>
      <p>{t(error ? "read.error" : retry ? "read.missing" : "read.loading")}</p>
      {error instanceof Error && <p>{error.message}</p>}
      {retry && (
        <button type="button" onClick={retry}>
          {t("read.retry")}
        </button>
      )}
    </div>
  );
}
