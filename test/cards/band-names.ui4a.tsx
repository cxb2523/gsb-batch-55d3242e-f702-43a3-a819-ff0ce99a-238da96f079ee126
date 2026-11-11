import { useState, useEffect, useRef } from "react"
import { streamText } from "$dsh/ai"
import { parse, Allow } from "partial-json"
import { RefreshCw } from "lucide-react"

type Band = { name: string; genre: string; vibe: string }

const PROMPT = [
  "生成5个原创、有趣的乐队名字，风格尽量多样（合成器流行、迷幻摇滚、城市民谣、爵士、朋克、dream pop 等）。",
  "每个乐队包含三个字段：name（乐队名，可中可英，要独特有记忆点）、",
  "genre（音乐风格，中文，2-4字）、vibe（一句话氛围描述，中文，15字以内）。",
  '只返回JSON，格式：{"bands":[{"name":"","genre":"","vibe":""}]}',
].join("")

export default function BandNames() {
  const [bands, setBands] = useState<Band[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const running = useRef<AbortController | null>(null)

  const generate = async () => {
    running.current?.abort()
    const ctrl = (running.current = new AbortController())
    setLoading(true)
    setError(null)
    setBands([])
    let buffer = ""
    try {
      for await (const chunk of streamText({ prompt: PROMPT, signal: ctrl.signal })) {
        if (ctrl.signal.aborted) return
        buffer += chunk
        try {
          const parsed = parse(buffer, Allow.ALL) as { bands?: Band[] }
          if (Array.isArray(parsed.bands)) setBands(parsed.bands)
        } catch {
          /* half-written JSON — skip this frame */
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setError("生成失败，点下方按钮重试")
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }

  useEffect(() => {
    void generate()
    return () => running.current?.abort()
  }, [])

  const showSpinner = loading && bands.length === 0

  return (
    <div className="band-card">
      <style>{`
        .band-card { font-family: inherit; }
        .band-card .spin { animation: band-spin 0.9s linear infinite; }
        @keyframes band-spin { to { transform: rotate(360deg); } }
        .band-card .band-row { animation: band-fade 0.3s ease; }
        @keyframes band-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .band-card .regen-btn { transition: transform .12s ease, opacity .15s ease; }
        .band-card .regen-btn:hover:not(:disabled) { transform: translateY(-1px); }
        .band-card .regen-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .band-card * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--dsw-alias-label-primary)" }}>
          乐队名字生成器
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>
          AI 即兴生成五个乐队，可反复刷新
        </p>
      </div>

      <div aria-live="polite" style={{ marginTop: 18 }}>
        {error ? (
          <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "var(--dsw-alias-state-error-primary)" }}>
            {error}
          </div>
        ) : showSpinner ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "28px 0" }}>
            <RefreshCw size={16} className="spin" style={{ color: "var(--dsw-alias-label-secondary)" }} />
            <span style={{ fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>正在生成…</span>
          </div>
        ) : (
          bands.map((band, i) => (
            <div
              key={i}
              className="band-row"
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 0",
                borderTop: i === 0 ? "none" : "1px solid var(--dsw-alias-border-l1)",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  minWidth: 22,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 13,
                  color: "var(--dsw-alias-label-secondary)",
                  paddingTop: 2,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--dsw-alias-label-primary)" }}>
                    {band.name ?? "…"}
                  </span>
                  {band.genre ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        lineHeight: 1.5,
                        padding: "1px 8px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                        background: "var(--dsw-alias-state-business-primary)",
                        color: "#fff",
                      }}
                    >
                      {band.genre}
                    </span>
                  ) : null}
                </div>
                {band.vibe ? (
                  <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--dsw-alias-label-secondary)" }}>
                    {band.vibe}
                  </p>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          className="regen-btn"
          onClick={generate}
          disabled={loading}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 18px",
            borderRadius: 999,
            border: "none",
            background: "var(--dsw-alias-state-business-primary)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          <span>{loading ? "生成中…" : "重新生成"}</span>
        </button>
      </div>
    </div>
  )
}
