import { useState } from "react"
import { sendMessage } from "$dsh/chat"

const SESSIONS = [
  { id: "morning", label: "上午场", time: "09:00 – 12:00" },
  { id: "afternoon", label: "下午场", time: "13:30 – 16:30" },
  { id: "evening", label: "晚间场", time: "18:00 – 21:00" },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegistrationForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [session, setSession] = useState<string | null>(null)
  const [meal, setMeal] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)

  const emailOk = email === "" || EMAIL_RE.test(email)
  const valid = name.trim() !== "" && emailOk && session !== null

  const submit = () => {
    if (!valid) return
    const data = {
      姓名: name.trim(),
      邮箱: email.trim(),
      场次: SESSIONS.find((s) => s.id === session)?.label ?? session,
      餐食: meal ? "需要" : "不需要",
    }
    sendMessage(JSON.stringify(data))
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{ padding: "24px 20px", background: "var(--dsw-alias-bg-layer-1)", borderRadius: 12, border: `1px solid var(--dsw-alias-border-l1)` }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--dsw-alias-label-primary)", marginBottom: 8 }}>报名已提交 ✓</div>
        <div style={{ fontSize: 14, color: "var(--dsw-alias-label-secondary)" }}>
          姓名：{name.trim()}
        </div>
        <div style={{ fontSize: 14, color: "var(--dsw-alias-label-secondary)" }}>
          邮箱：{email.trim()}
        </div>
        <div style={{ fontSize: 14, color: "var(--dsw-alias-label-secondary)" }}>
          场次：{SESSIONS.find((s) => s.id === session)?.label}（{SESSIONS.find((s) => s.id === session)?.time}）
        </div>
        <div style={{ fontSize: 14, color: "var(--dsw-alias-label-secondary)" }}>
          餐食：{meal ? "需要" : "不需要"}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "24px 20px", background: "var(--dsw-alias-bg-layer-1)", borderRadius: 12, border: `1px solid var(--dsw-alias-border-l1)` }}>
      <style>{`
        .reg input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px }
        .reg .session-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px }
        @container (min-width: 28rem) { .reg .row { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--dsw-alias-label-primary)", marginBottom: 16 }}>活动报名</div>

      <div className="reg" style={{ display: "grid", gap: 16 }}>
        {/* 姓名 */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--dsw-alias-label-secondary)", marginBottom: 6 }}>姓名</label>
          <input
            className="reg"
            type="text"
            placeholder="请输入姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocused("name")}
            onBlur={() => setFocused(null)}
            style={{
              width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
              border: `1px solid ${focused === "name" ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-border-l1)"}`,
              background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 邮箱 */}
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--dsw-alias-label-secondary)", marginBottom: 6 }}>邮箱</label>
          <input
            className="reg"
            type="email"
            placeholder="请输入邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            style={{
              width: "100%", padding: "10px 12px", fontSize: 14, borderRadius: 8,
              border: `1px solid ${focused === "email" ? (emailOk ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-state-error-primary)") : "var(--dsw-alias-border-l1)"}`,
              background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)",
              boxSizing: "border-box",
            }}
          />
          {!emailOk && email !== "" && (
            <div style={{ fontSize: 12, color: "var(--dsw-alias-state-error-primary)", marginTop: 4 }}>请输入有效的邮箱地址</div>
          )}
        </div>

        {/* 场次选择 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--dsw-alias-label-secondary)", marginBottom: 8 }}>选择场次</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {SESSIONS.map((s) => {
              const sel = session === s.id
              return (
                <button
                  key={s.id}
                  className="reg session-btn"
                  type="button"
                  onClick={() => setSession(s.id)}
                  style={{
                    padding: "12px 8px", borderRadius: 8, border: `1px solid ${sel ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-border-l1)"}`,
                    background: sel ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-bg-base)",
                    color: sel ? "#fff" : "var(--dsw-alias-label-primary)",
                    cursor: "pointer", fontSize: 13, textAlign: "center", transition: "all .12s ease",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{s.time}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 餐食 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className="reg"
              type="button"
              onClick={() => setMeal(!meal)}
              style={{
                width: 40, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                background: meal ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-border-l2)",
                position: "relative", transition: "background .15s ease",
              }}
              aria-label="是否需要餐食"
            >
              <div style={{
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3, left: meal ? 19 : 3,
                transition: "left .15s ease",
              }} />
            </button>
            <span style={{ fontSize: 14, color: "var(--dsw-alias-label-primary)" }}>
              是否需要餐食 {meal ? "（需要）" : "（不需要）"}
            </span>
          </div>
        </div>

        {/* 提交 */}
        <div style={{ gridColumn: "1 / -1" }}>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 8, border: "none",
              background: valid ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-border-l2)",
              color: valid ? "#fff" : "var(--dsw-alias-label-secondary)",
              fontSize: 15, fontWeight: 600, cursor: valid ? "pointer" : "default",
              transition: "all .12s ease",
            }}
          >
            提交报名
          </button>
        </div>
      </div>
    </div>
  )
}