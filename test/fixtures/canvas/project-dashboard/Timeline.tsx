import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import { Card, Badge, PageHeader } from "./ui";
import { milestones, type Milestone } from "./data";

const STATUS: Record<Milestone["status"], { icon: typeof CheckCircle2; tone: "done" | "doing" | "todo"; label: string; color: string }> = {
  done: { icon: CheckCircle2, tone: "done", label: "已完成", color: "var(--dsw-alias-state-success-primary)" },
  active: { icon: Circle, tone: "doing", label: "进行中", color: "var(--dsw-alias-state-business-primary)" },
  upcoming: { icon: CircleDashed, tone: "todo", label: "待开始", color: "var(--dsw-alias-label-secondary)" },
};

export default function Timeline() {
  return (
    <div>
      <PageHeader title="时间线" subtitle="关键里程碑与交付节点" />
      <Card padding={0} style={{ padding: "10px 4px" }}>
        <div style={{ position: "relative" }}>
          {milestones.map((m, i) => {
            const s = STATUS[m.status];
            const Icon = s.icon;
            const last = i === milestones.length - 1;
            return (
              <div key={m.id} style={{ display: "flex", gap: 16, padding: "4px 18px", position: "relative" }}>
                {!last && (
                  <span
                    style={{
                      position: "absolute",
                      left: 30,
                      top: 34,
                      bottom: -6,
                      width: 2,
                      background: "color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)",
                    }}
                  />
                )}
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--dsw-alias-bg-layer-1)",
                    border: "2px solid " + s.color,
                    color: s.color,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <Icon size={14} />
                </span>
                <div style={{ flex: 1, paddingBottom: last ? 4 : 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: "var(--dsw-alias-label-secondary)",
                        fontWeight: 600,
                        fontFamily: "ui-monospace, SFMono-Regular, monospace",
                      }}
                    >
                      {m.date}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 650, color: "var(--dsw-alias-label-primary)" }}>{m.title}</span>
                    <Badge tone={s.tone} />
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>{m.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
