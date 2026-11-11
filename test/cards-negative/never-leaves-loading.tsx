import { useState, useMemo } from "react"
import { bash } from "$dsh/exec"
import { ChevronDown, ChevronRight, FileText, GitCommit } from "lucide-react"

interface Commit {
  hash: string
  date: string
  message: string
  files: { path: string; added: number; removed: number }[]
}

function parseLog(raw: string): Commit[] {
  const lines = raw.trim().split("\n")
  const commits: Commit[] = []
  let current: Commit | null = null
  for (const line of lines) {
    const m = line.match(/^([0-9a-f]{40})\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+[+-]\d{4})\s+(.+)$/)
    if (m) {
      if (current) commits.push(current)
      current = { hash: m[1], date: m[2], message: m[3], files: [] }
    } else if (current && line.startsWith(" ")) {
      const fm = line.match(/^\s+(\S+)\s+\|\s+(\d+)\s+insertion\(s\)\+(\d+)\s+deletion\(s\)-?$/)
      if (fm) {
        current.files.push({ path: fm[1], added: Number(fm[2]), removed: Number(fm[3]) })
      }
    }
  }
  if (current) commits.push(current)
  return commits
}

export default function RecentChanges() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [commits, setCommits] = useState<Commit[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")

  const fetchLog = async () => {
    setLoading(true)
    setError(null)
    try {
      const { stdout, exitCode, stderr } = await bash(
        'git log --format="%H %ai %s" -20 && echo "---STATS---" && git log --format="" --stat --no-merges -20 2>&1',
      )
      if (exitCode !== 0) {
        setError(stderr || `exit code ${exitCode}`)
        setCommits([])
        return
      }
      const [logPart, statsPart] = stdout.split("---STATS---")
      const parsed = parseLog(logPart.trim())
      const statsLines = (statsPart || "").trim().split("\n")
      let cur: Commit | null = null
      for (const line of statsLines) {
        const sm = line.match(/^commit\s+([0-9a-f]{40})$/)
        if (sm) {
          cur = parsed.find((c) => c.hash === sm[1]) || null
        } else if (cur && line.startsWith(" ")) {
          const fm = line.match(/^\s+(\S+)\s+\|\s+(\d+)\s+insertion\(s\)\+(\d+)\s+deletion\(s\)-?$/)
          if (fm) cur.files.push({ path: fm[1], added: Number(fm[2]), removed: Number(fm[3]) })
        }
      }
      setCommits(parsed)
    } catch (e) {
      setError((e as Error).message)
      setCommits([])
    } finally {
      setLoading(false)
    }
  }

  const toggle = (hash: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(hash)) next.delete(hash)
      else next.add(hash)
      return next
    })
  }

  const filtered = useMemo(() => {
    if (!filter) return commits
    const q = filter.toLowerCase()
    return commits.filter(
      (c) => c.message.toLowerCase().includes(q) || c.files.some((f) => f.path.toLowerCase().includes(q)),
    )
  }, [commits, filter])

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "var(--dsw-alias-label-primary)" }}>
      <style>{`
        .rc-row { transition: background .12s ease; }
        .rc-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
        .rc-btn:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
        @container (min-width: 30rem) { .rc-grid { grid-template-columns: 1fr 1fr; } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <GitCommit size={18} style={{ color: "var(--dsw-alias-state-business-primary)" }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>最近提交</h2>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>
          {commits.length} 次
        </span>
      </div>

      <input
        type="text"
        placeholder="按提交信息或文件过滤…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid var(--dsw-alias-border-l1)",
          borderRadius: 8,
          background: "var(--dsw-alias-bg-base)",
          color: "var(--dsw-alias-label-primary)",
          fontSize: 14,
          marginBottom: 16,
          boxSizing: "border-box",
        }}
      />

      {loading && <div style={{ padding: 24, textAlign: "center", color: "var(--dsw-alias-label-secondary)" }}>加载中…</div>}
      {error && (
        <div style={{ padding: 16, background: "var(--dsw-alias-state-error-primary)", color: "#fff", borderRadius: 8, marginBottom: 16 }}>
          获取提交记录失败: {error}
        </div>
      )}

      <div className="rc-grid" style={{ display: "grid", gap: 12 }}>
        {filtered.map((c) => (
          <div
            key={c.hash}
            className="rc-row"
            style={{
              border: "1px solid var(--dsw-alias-border-l1)",
              borderRadius: 10,
              background: "var(--dsw-alias-bg-layer-1)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              className="rc-btn"
              onClick={() => toggle(c.hash)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "12px 14px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 14,
                color: "var(--dsw-alias-label-primary)",
              }}
            >
              {expanded.has(c.hash) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.message}
                </div>
                <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>{c.date}</div>
              </div>
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 99,
                  background: "var(--dsw-alias-state-business-primary)",
                  color: "#fff",
                  whiteSpace: "nowrap",
                }}
              >
                {c.files.length} 文件
              </span>
            </button>

            {expanded.has(c.hash) && (
              <div style={{ borderTop: "1px solid var(--dsw-alias-border-l1)", padding: "10px 14px" }}>
                <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 8 }}>
                  {c.hash.slice(0, 12)}
                </div>
                {c.files.map((f) => (
                  <div
                    key={f.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      padding: "4px 0",
                    }}
                  >
                    <FileText size={14} style={{ color: "var(--dsw-alias-label-secondary)" }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f.path}
                    </span>
                    {f.added > 0 && (
                      <span style={{ color: "var(--dsw-alias-state-success-primary)", fontSize: 12 }}>+{f.added}</span>
                    )}
                    {f.removed > 0 && (
                      <span style={{ color: "var(--dsw-alias-state-error-primary)", fontSize: 12 }}>-{f.removed}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {!loading && !error && filtered.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "var(--dsw-alias-label-secondary)" }}>
          没有匹配的提交
        </div>
      )}
    </div>
  )
}