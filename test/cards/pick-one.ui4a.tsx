import { useState } from "react"
import { sendMessage } from "$dsh/chat"

const OPTIONS = [
  { id: "calc", title: "交互计算工具", desc: "单位换算、贷款月供这类，输入即出结果" },
  { id: "dashboard", title: "数据可视化看板", desc: "图表 + 指标卡，展示一组示例数据" },
  { id: "planner", title: "个人计划 / 清单", desc: "可勾选、自动保存，关掉再打开还在" },
]

export default function PickCanvas() {
  const [picked, setPicked] = useState<string | null>(null)
  const [custom, setCustom] = useState("")

  const choose = (id: string) => {
    if (picked) return
    setPicked(id)
    sendMessage(id)
  }
  const submitCustom = () => {
    const v = custom.trim()
    if (!v || picked) return
    setPicked("custom")
    sendMessage("custom:" + v)
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      padding: 14,
      borderRadius: 12,
      border: "1px solid var(--dsw-alias-border-l1)",
      background: "var(--dsw-alias-bg-layer-1)",
    }}>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>
        想用 canvas 呈现什么？点一个方向我马上建，或在下面输入你的内容。
      </p>

      {OPTIONS.map((o) => {
        const active = picked === o.id
        const dim = picked && !active
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => choose(o.id)}
            disabled={!!picked}
            className={"pick-row" + (active ? " pick-active" : "") + (dim ? " pick-dim" : "")}
          >
            <div className="pick-title">{o.title}</div>
            <div className="pick-desc">{o.desc}</div>
          </button>
        )
      })}

      <div style={{ height: 1, background: "var(--dsw-alias-border-l1)", margin: "10px 0" }} />

      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="pick-input"
          value={custom}
          aria-label="自定义呈现内容"
          placeholder="或输入你想呈现的内容…"
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitCustom() }}
          disabled={!!picked}
        />
        <button
          type="button"
          className="pick-send"
          onClick={submitCustom}
          disabled={!custom.trim() || !!picked}
        >
          建这个
        </button>
      </div>

      {picked && (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>
          {picked === "custom"
            ? "已收到你的内容，正在生成 canvas…"
            : `已选「${OPTIONS.find(o => o.id === picked)?.title}」，正在生成 canvas…`}
        </p>
      )}

      <style>{`
        .pick-row {
          display: block; width: 100%; text-align: left;
          padding: 10px 12px; margin-bottom: 4px;
          border-radius: 9px; border: 1px solid transparent;
          background: transparent; color: var(--dsw-alias-label-primary);
          cursor: pointer;
          transition: background 120ms ease, opacity 120ms ease;
        }
        .pick-row:not(.pick-active):not(:disabled):hover {
          background: var(--dsw-alias-interactive-bg-hover);
        }
        .pick-row.pick-active {
          background: var(--dsw-alias-state-business-primary);
          color: #fff;
        }
        .pick-row.pick-dim { opacity: 0.45; }
        .pick-row:disabled { cursor: default; }
        .pick-row:focus-visible {
          outline: 2px solid var(--dsw-alias-state-business-primary);
          outline-offset: 2px;
        }
        .pick-title { font-size: 14px; font-weight: 600; }
        .pick-desc { font-size: 12px; margin-top: 2px; opacity: 0.7; }
        .pick-active .pick-desc { opacity: 0.9; }

        .pick-input {
          flex: 1; padding: 9px 11px; border-radius: 8px;
          border: 1px solid var(--dsw-alias-border-l1);
          background: var(--dsh-alias-bg-base, var(--dsw-alias-bg-base));
          color: var(--dsw-alias-label-primary);
          font-size: 13px; outline: none;
        }
        .pick-input:focus {
          outline: 2px solid var(--dsw-alias-state-business-primary);
          outline-offset: 2px;
        }
        .pick-input:disabled { opacity: 0.5; }

        .pick-send {
          padding: 0 14px; border-radius: 8px;
          border: 1px solid var(--dsw-alias-border-l1);
          background: var(--dsw-alias-bg-base);
          color: var(--dsw-alias-label-primary);
          font-size: 13px; cursor: pointer;
        }
        .pick-send:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover); }
        .pick-send:focus-visible {
          outline: 2px solid var(--dsw-alias-state-business-primary);
          outline-offset: 2px;
        }
        .pick-send:disabled { cursor: default; opacity: 0.5; }

        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important }
        }
      `}</style>
    </div>
  )
}
