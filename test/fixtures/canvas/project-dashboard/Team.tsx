import { Card, Avatar, Bar, Badge, PageHeader } from "./ui";
import { members, loadTasks } from "./data";

export default function Team() {
  const tasks = loadTasks();
  const stats = members.map((m) => {
    const mine = tasks.filter((t) => t.assignee === m.id);
    const done = mine.filter((t) => t.done).length;
    const total = mine.length;
    return {
      member: m,
      total,
      done,
      workload: total ? Math.round((done / total) * 100) : 0,
      open: total - done,
    };
  });

  return (
    <div>
      <PageHeader title="团队" subtitle="Atlas 设计系统核心成员 · 任务负载与分工" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
        {stats.map(({ member: m, total, done, workload, open }) => (
          <Card key={m.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={m.name} color={m.color} size={42} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 650, color: "var(--dsw-alias-label-primary)" }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginTop: 2 }}>{m.role}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
              {m.skills.map((s) => (
                <Badge key={s} tone="muted">
                  {s}
                </Badge>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: "var(--dsw-alias-label-secondary)" }}>任务负载</span>
                <span style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 600 }}>
                  {done}/{total}
                </span>
              </div>
              <Bar value={workload} tone={workload >= 70 ? "success" : "business"} height={7} />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 14,
                paddingTop: 12,
                borderTop: "1px solid var(--dsw-alias-border-l1)",
                fontSize: 12,
              }}
            >
              <span style={{ color: "var(--dsw-alias-label-secondary)" }}>待处理</span>
              <span
                style={{
                  color: open > 0 ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-state-success-primary)",
                  fontWeight: 600,
                }}
              >
                {open} 个
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
