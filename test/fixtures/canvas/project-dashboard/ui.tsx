// Shared UI primitives used across every dashboard page.
import type { CSSProperties, ReactNode, ElementType } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

export function Card({ children, style, padding = 16 }: { children: ReactNode; style?: CSSProperties; padding?: number }) {
  return (
    <div
      style={{
        background: "var(--dsw-alias-bg-layer-1)",
        border: "1px solid var(--dsw-alias-border-l1)",
        borderRadius: 14,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        marginBottom: 18,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 650,
            margin: 0,
            letterSpacing: "-0.01em",
            color: "var(--dsw-alias-label-primary)",
          }}
        >
          {title}
        </h1>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>{subtitle}</p>}
      </div>
      {children && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{children}</div>}
    </div>
  );
}

export function KpiCard({ label, value, delta, icon: Icon }: { label: string; value: string; delta: number; icon: ElementType }) {
  const up = delta >= 0;
  const Trend = up ? TrendingUp : TrendingDown;
  const tone = up ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-error-primary)";
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "var(--dsw-alias-label-secondary)", fontSize: 13 }}>{label}</span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)",
            color: "var(--dsw-alias-state-business-primary)",
          }}
        >
          <Icon size={16} />
        </span>
      </div>
      <div style={{ fontSize: 30, fontWeight: 680, marginTop: 12, lineHeight: 1, color: "var(--dsw-alias-label-primary)" }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 12 }}>
        <Trend size={14} style={{ color: tone }} />
        <span style={{ color: tone, fontWeight: 600 }}>
          {up ? "+" : ""}
          {delta}%
        </span>
        <span style={{ color: "var(--dsw-alias-label-secondary)" }}>较上周</span>
      </div>
    </Card>
  );
}

export type Tone = "done" | "doing" | "todo" | "high" | "medium" | "low" | "muted";

const toneColors: Record<Tone, { fg: string; bg: string }> = {
  done: { fg: "var(--dsw-alias-state-success-primary)", bg: "color-mix(in srgb, var(--dsw-alias-state-success-primary) 15%, transparent)" },
  doing: { fg: "var(--dsw-alias-state-business-primary)", bg: "color-mix(in srgb, var(--dsw-alias-state-business-primary) 15%, transparent)" },
  todo: { fg: "var(--dsw-alias-label-secondary)", bg: "color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent)" },
  high: { fg: "var(--dsw-alias-state-error-primary)", bg: "color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent)" },
  medium: { fg: "var(--dsw-alias-state-warn-primary)", bg: "color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent)" },
  low: { fg: "var(--dsw-alias-label-secondary)", bg: "color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)" },
  muted: { fg: "var(--dsw-alias-label-secondary)", bg: "color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent)" },
};

const toneLabel: Record<Tone, string> = {
  done: "已完成",
  doing: "进行中",
  todo: "待办",
  high: "高优",
  medium: "中等",
  low: "较低",
  muted: "",
};

export function Badge({ tone, children }: { tone: Tone; children?: ReactNode }) {
  const c = toneColors[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 550,
        color: c.fg,
        background: c.bg,
        whiteSpace: "nowrap",
      }}
    >
      {children ?? toneLabel[tone]}
    </span>
  );
}

export function Bar({ value, tone = "business", height = 6 }: { value: number; tone?: "business" | "success" | "warn"; height?: number }) {
  const bg = tone === "success" ? "var(--dsw-alias-state-success-primary)" : tone === "warn" ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-state-business-primary)";
  return (
    <div
      style={{
        height,
        borderRadius: 999,
        width: "100%",
        overflow: "hidden",
        background: "color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.max(0, Math.min(100, value))}%`,
          borderRadius: 999,
          background: bg,
          transition: "width .5s ease",
        }}
      />
    </div>
  );
}

export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        fontWeight: 600,
        fontSize: Math.round(size * 0.42),
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {name.slice(0, 1)}
    </span>
  );
}
