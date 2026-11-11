import { useMemo, useState } from "react";

const DEFAULT_PATTERN = "^\\w+@\\w+\\.\\w{2,}$";

export default function RegexTester() {
  const [pattern, setPattern] = useState(DEFAULT_PATTERN);
  const [flags, setFlags] = useState("");
  const [test, setTest] = useState("");

  const result = useMemo(() => {
    let error: string | null = null;
    let re: RegExp | null = null;
    try {
      re = new RegExp(pattern, flags);
    } catch (e) {
      error = (e as Error).message;
    }
    let matched = false;
    let matchedText = "";
    let index = -1;
    if (re) {
      const m = re.exec(test);
      if (m) {
        matched = true;
        matchedText = m[0];
        index = m.index;
      }
    }
    return { error, matched, matchedText, index };
  }, [pattern, flags, test]);

  const showResult = test.length > 0 && !result.error;
  const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const pill = (bg: string, text: string) => ({
    display: "inline-block",
    fontSize: 12,
    fontWeight: 600,
    padding: "2px 10px",
    borderRadius: 999,
    background: bg,
    color: "#fff",
  });

  return (
    <div
      className="rgxt"
      style={{
        border: "1px solid var(--dsw-alias-border-l1)",
        borderRadius: 12,
        padding: 16,
        background: "var(--dsw-alias-bg-layer-1)",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        color: "var(--dsw-alias-label-primary)",
      }}
    >
      <style>{`
        .rgxt input { outline: none; }
        .rgxt input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important } }
      `}</style>

      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 14 }}>正则表达式测试器</div>

      <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 6 }}>模式</div>
      <div style={{ display: "flex", alignItems: "stretch", gap: 4, fontFamily: mono }}>
        <span style={{ display: "flex", alignItems: "center", color: "var(--dsw-alias-label-secondary)", padding: "0 2px" }}>/</span>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          spellCheck={false}
          aria-label="正则表达式模式"
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: mono,
            fontSize: 14,
            background: "var(--dsw-alias-bg-base)",
            border: "1px solid var(--dsw-alias-border-l2)",
            borderRadius: 6,
            padding: "7px 9px",
            color: "var(--dsw-alias-label-primary)",
          }}
        />
        <span style={{ display: "flex", alignItems: "center", color: "var(--dsw-alias-label-secondary)", padding: "0 2px" }}>/</span>
        <input
          value={flags}
          onChange={(e) => setFlags(e.target.value)}
          spellCheck={false}
          aria-label="标志 flags"
          placeholder="flags"
          style={{
            width: 70,
            flexShrink: 0,
            fontFamily: mono,
            fontSize: 13,
            background: "var(--dsw-alias-bg-base)",
            border: "1px solid var(--dsw-alias-border-l1)",
            borderRadius: 6,
            padding: "7px 9px",
            color: "var(--dsw-alias-label-primary)",
          }}
        />
      </div>

      <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginTop: 14, marginBottom: 6 }}>测试字符串</div>
      <input
        value={test}
        onChange={(e) => setTest(e.target.value)}
        spellCheck={false}
        aria-label="测试字符串"
        placeholder="例如 user@example.com"
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontFamily: mono,
          fontSize: 14,
          background: "var(--dsw-alias-bg-base)",
          border: "1px solid var(--dsw-alias-border-l2)",
          borderRadius: 6,
          padding: "8px 10px",
          color: "var(--dsw-alias-label-primary)",
        }}
      />

      <div style={{ marginTop: 14 }}>
        {result.error ? (
          <>
            <span style={pill("var(--dsw-alias-state-error-primary)", "#fff")}>模式错误</span>
            <div style={{ marginTop: 8, fontSize: 12, fontFamily: mono, color: "var(--dsw-alias-state-error-primary)", wordBreak: "break-all" }}>
              {result.error}
            </div>
          </>
        ) : showResult ? (
          <>
            <div>
              {result.matched ? (
                <span style={pill("var(--dsw-alias-state-success-primary)", "#fff")}>✓ 匹配</span>
              ) : (
                <span style={pill("var(--dsw-alias-state-error-primary)", "#fff")}>✗ 不匹配</span>
              )}
            </div>
            <div
              style={{
                marginTop: 10,
                padding: "9px 11px",
                background: "var(--dsw-alias-bg-base)",
                border: "1px solid var(--dsw-alias-border-l1)",
                borderRadius: 6,
                fontFamily: mono,
                fontSize: 14,
                wordBreak: "break-all",
                whiteSpace: "pre-wrap",
                color: "var(--dsw-alias-label-primary)",
              }}
            >
              {result.matched ? (
                <>
                  <span>{test.slice(0, result.index)}</span>
                  <mark
                    style={{
                      background: "color-mix(in srgb, var(--dsw-alias-state-success-primary) 22%, transparent)",
                      color: "var(--dsw-alias-label-primary)",
                      borderRadius: 3,
                      padding: "1px 2px",
                    }}
                  >
                    {result.matchedText}
                  </mark>
                  <span>{test.slice(result.index + result.matchedText.length)}</span>
                </>
              ) : (
                <span>{test}</span>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>输入字符串后会显示匹配结果</div>
        )}
      </div>
    </div>
  );
}
