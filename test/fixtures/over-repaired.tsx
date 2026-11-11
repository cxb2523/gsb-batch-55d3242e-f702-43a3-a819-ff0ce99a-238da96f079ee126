import { useState, useMemo } from "react";

const PRESETS = [
  { name: "邮箱", pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}", flags: "g", sample: "联系我：test@example.com 或 admin@site.org" },
  { name: "网址", pattern: "https?://[^\\s]+", flags: "g", sample: "访问 https://example.com 或 http://test.io/p?q=1" },
  { name: "手机号", pattern: "1[3-9]\\d{9}", flags: "g", sample: "电话 13812345678 或 15900001111" },
  { name: "IPv4", pattern: "\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b", flags: "g", sample: "服务器 192.168.1.1 与 10.0.0.1" },
  { name: "日期", pattern: "\\d{4}-\\d{2}-\\d{2}", flags: "g", sample: "从 2024-01-15 到 2024-12-31" },
  { name: "色值", pattern: "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b", flags: "g", sample: "颜色 #fff、#1a2b3c 与 #abc" },
];

const FLAGS = [
  { code: "g", label: "全局" },
  { code: "i", label: "忽略大小写" },
  { code: "m", label: "多行" },
  { code: "s", label: ". 匹配换行" },
  { code: "u", label: "Unicode" },
  { code: "y", label: "粘性" },
] as const;

type MatchInfo = {
  match: string;
  index: number;
  groups: (string | undefined)[];
  named: Record<string, string> | undefined;
};

const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);

export default function RegexTester() {
  const [pattern, setPattern] = useState("");
  const [flagSet, setFlagSet] = useState<Set<string>>(new Set(["g"]));
  const [testString, setTestString] = useState("");
  const [mode, setMode] = useState<"match" | "replace">("match");
  const [replacement, setReplacement] = useState("");

  const flags = useMemo(() => [...flagSet].join(""), [flagSet]);

  const { matches, error, replaced } = useMemo(() => {
    const none = { matches: [] as MatchInfo[], error: null as string | null, replaced: null as string | null };
    if (!pattern) return none;
    let execRegex: RegExp;
    try {
      execRegex = new RegExp(pattern, flags);
    } catch (e) {
      return { matches: [] as MatchInfo[], error: (e as Error).message, replaced: null as string | null };
    }
    const ms: MatchInfo[] = [];
    if (flags.includes("g")) {
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = execRegex.exec(testString)) !== null) {
        ms.push({ match: m[0], index: m.index, groups: m.slice(1) as (string | undefined)[], named: m.groups ?? undefined });
        if (m.index === execRegex.lastIndex) execRegex.lastIndex++;
        if (++guard > 5000) break;
      }
    } else {
      const m = execRegex.exec(testString);
      if (m) ms.push({ match: m[0], index: m.index, groups: m.slice(1) as (string | undefined)[], named: m.groups ?? undefined });
    }
    let replaced: string | null = null;
    if (mode === "replace") {
      try {
        replaced = testString.replace(new RegExp(pattern, flags), replacement);
      } catch {
        replaced = null;
      }
    }
    return { matches: ms, error: null, replaced };
  }, [pattern, flags, testString, mode, replacement]);

  const segments = useMemo(() => {
    if (error) return null;
    const segs: { text: string; type: "text" | "match"; n?: number }[] = [];
    let last = 0;
    matches.forEach((m, i) => {
      if (m.index > last) segs.push({ text: testString.slice(last, m.index), type: "text" });
      segs.push({ text: m.match, type: "match", n: i });
      last = m.index + m.match.length;
    });
    if (last < testString.length) segs.push({ text: testString.slice(last), type: "text" });
    return segs;
  }, [matches, error, testString]);

  const toggleFlag = (code: string) =>
    setFlagSet((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setPattern(p.pattern);
    setFlagSet(new Set(p.flags.split("")));
    setTestString(p.sample);
    setMode("match");
  };

  const clearAll = () => {
    setPattern("");
    setFlagSet(new Set(["g"]));
    setTestString("");
    setReplacement("");
    setMode("match");
  };

  return (
    <div className="rt" style={{ fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 14, padding: 16, color: "var(--dsw-alias-label-primary)", fontSize: 14, lineHeight: 1.5 }}>
      <style>{`
        .rt input, .rt textarea { font-family: ${mono}; }
        .rt input:focus-visible, .rt textarea:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
        .rt button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
        .rt .rt-preview { white-space: pre-wrap; word-break: break-word; }
        .rt .rt-mono { font-family: ${mono}; }
        @media (prefers-reduced-motion: reduce) { .rt * { transition: none !important } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "inline-flex", background: "var(--dsw-alias-bg-base)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 10, padding: 3 }}>
          {(["match", "replace"] as const).map((md) => (
            <button
              key={md}
              type="button"
              onClick={() => setMode(md)}
              aria-pressed={mode === md}
              style={{ border: "none", cursor: "pointer", padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: mode === md ? "var(--dsw-alias-state-business-primary)" : "transparent", color: mode === md ? "#fff" : "var(--dsw-alias-label-secondary)" }}
            >
              {md === "match" ? "匹配" : "替换"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginRight: 2 }}>示例</span>
          {PRESETS.map((p) => (
            <button key={p.name} type="button" onClick={() => applyPreset(p)} style={{ border: "1px solid var(--dsw-alias-border-l1)", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
              {p.name}
            </button>
          ))}
          <button type="button" onClick={clearAll} style={{ border: "1px solid var(--dsw-alias-border-l1)", background: "transparent", color: "var(--dsw-alias-label-secondary)", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
            清空
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--dsw-alias-bg-base)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: "8px 10px" }}>
        <span className="rt-mono" style={{ color: "var(--dsw-alias-label-secondary)", fontSize: 15 }}>
          /
        </span>
        <input
          aria-label="正则表达式"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder={"输入正则表达式，如 \\d+ 或 [a-z]+"}
          spellCheck={false}
          autoComplete="off"
          style={{ flex: 1, border: "none", background: "transparent", outline: "none", fontSize: 15, color: "var(--dsw-alias-label-primary)", minWidth: 0 }}
        />
        <span className="rt-mono" style={{ color: "var(--dsw-alias-label-secondary)", fontSize: 15 }}>
          /
        </span>
        <span className="rt-mono" style={{ color: "var(--dsw-alias-state-business-primary)", fontSize: 15, marginLeft: 2, minWidth: 18 }}>
          {flags}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {FLAGS.map((f) => {
          const on = flagSet.has(f.code);
          return (
            <button
              key={f.code}
              type="button"
              onClick={() => toggleFlag(f.code)}
              aria-pressed={on}
              aria-label={`标志 ${f.code}：${f.label}${on ? "（已启用）" : ""}`}
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: 5,
                border: "1px solid " + (on ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-border-l1)"),
                background: on ? "color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent)" : "transparent",
                color: on ? "var(--dsw-alias-label-primary)" : "var(--dsw-alias-label-secondary)",
                borderRadius: 8,
                padding: "4px 9px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <span className="rt-mono" style={{ fontWeight: 700 }}>
                {f.code}
              </span>
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent)", color: "var(--dsw-alias-state-error-primary)", fontSize: 13 }}
        >
          <span style={{ fontWeight: 600 }}>表达式有误：</span>
          <span className="rt-mono">{error}</span>
        </div>
      )}

      {mode === "replace" && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 4 }}>替换字符串（支持 $1、$2、$&amp; 等）</div>
          <input
            aria-label="替换字符串"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder={"例如 [$&] 或 $1-$2"}
            spellCheck={false}
            autoComplete="off"
            style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: "8px 12px", background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)", fontSize: 14, outline: "none" }}
          />
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 4 }}>测试文本</div>
        <textarea
          aria-label="测试文本"
          value={testString}
          onChange={(e) => setTestString(e.target.value)}
          placeholder="在此输入要匹配的文本…"
          spellCheck={false}
          style={{ width: "100%", boxSizing: "border-box", minHeight: 72, resize: "vertical", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: "10px 12px", background: "var(--dsw-alias-bg-base)", color: "var(--dsw-alias-label-primary)", fontSize: 14, outline: "none" }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13 }}>
        {error ? (
          <>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--dsw-alias-state-error-primary)" }} />
            <span style={{ color: "var(--dsw-alias-state-error-primary)" }}>表达式无效</span>
          </>
        ) : !pattern ? (
          <>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--dsw-alias-label-secondary)", opacity: 0.5 }} />
            <span style={{ color: "var(--dsw-alias-label-secondary)" }}>输入正则表达式开始</span>
          </>
        ) : !testString ? (
          <>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--dsw-alias-label-secondary)", opacity: 0.5 }} />
            <span style={{ color: "var(--dsw-alias-label-secondary)" }}>等待测试文本</span>
          </>
        ) : matches.length === 0 ? (
          <>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--dsw-alias-label-secondary)" }} />
            <span style={{ color: "var(--dsw-alias-label-secondary)" }}>无匹配</span>
          </>
        ) : (
          <>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--dsw-alias-state-success-primary)" }} />
            <span style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 600 }}>找到 {matches.length} 个匹配</span>
          </>
        )}
      </div>

      {testString && !error && (
        <div className="rt-preview rt-mono" style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "var(--dsw-alias-bg-base)", border: "1px solid var(--dsw-alias-border-l1)", fontSize: 13, lineHeight: 1.6, maxHeight: 200, overflow: "auto" }}>
          {segments?.map((seg, i) =>
            seg.type === "text" ? (
              <span key={i}>{seg.text}</span>
            ) : seg.text === "" ? (
              <span key={i} title="零宽匹配" style={{ display: "inline-block", width: 0, borderLeft: "2px solid var(--dsw-alias-state-business-primary)", height: "1em", verticalAlign: "middle", margin: "0 1px" }} />
            ) : (
              <span
                key={i}
                title={`#${(seg.n ?? 0) + 1}`}
                style={{ background: "color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent)", border: "1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, transparent)", borderRadius: 4, padding: "1px 2px", color: "var(--dsw-alias-label-primary)" }}
              >
                {seg.text}
              </span>
            ),
          )}
        </div>
      )}

      {mode === "replace" && pattern && !error && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 4 }}>替换结果</div>
          <div
            className="rt-mono"
            style={{ padding: "10px 12px", borderRadius: 10, background: "var(--dsw-alias-bg-base)", border: "1px solid var(--dsw-alias-border-l1)", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 240, overflow: "auto", color: "var(--dsw-alias-label-primary)" }}
          >
            {replaced ?? ""}
          </div>
        </div>
      )}

      {mode === "match" && !error && matches.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 6 }}>匹配详情</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflow: "auto" }}>
            {matches.map((m, i) => {
              const end = m.index + m.match.length;
              const groupEntries: { key: string; val: string | undefined }[] = [];
              m.groups.forEach((g, gi) => groupEntries.push({ key: `$${gi + 1}`, val: g }));
              if (m.named) Object.entries(m.named).forEach(([k, v]) => groupEntries.push({ key: k, val: v }));
              return (
                <div key={i} style={{ border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 10, padding: "8px 10px", background: "var(--dsw-alias-bg-base)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 20, padding: "0 5px", borderRadius: 6, background: "var(--dsw-alias-state-business-primary)", color: "#fff", fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                    <span className="rt-mono" title={m.match} style={{ fontSize: 13, color: "var(--dsw-alias-label-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                      {truncate(m.match, 80) || "（空匹配）"}
                    </span>
                    <span className="rt-mono" style={{ fontSize: 11, color: "var(--dsw-alias-label-secondary)", background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 6, padding: "2px 6px" }}>
                      [{m.index}, {end})
                    </span>
                  </div>
                  {groupEntries.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7, paddingLeft: 30 }}>
                      {groupEntries.map((g, gi) => (
                        <span key={gi} className="rt-mono" style={{ fontSize: 11, background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 6, padding: "2px 7px", color: "var(--dsw-alias-label-secondary)" }}>
                          <span style={{ color: "var(--dsw-alias-state-business-primary)", fontWeight: 600 }}>{g.key}</span>: {g.val == null ? "（未参与）" : g.val === "" ? "（空）" : truncate(g.val, 40)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
