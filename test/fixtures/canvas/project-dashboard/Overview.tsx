import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CheckCircle2, ListChecks, CalendarClock, Users } from "lucide-react";
import { Card, KpiCard, Bar, Avatar, PageHeader } from "./ui";
import { members, activity, weekly, loadTasks, memberById } from "./data";

// recharts passes these to SVG attributes, where var() does not resolve —
// so chart strokes/fills use fixed mid-tone hues that read on both themes.
// The Tooltip renders HTML, so it can safely use the theme CSS variables.
const AXIS = "#8b93a3";
const GRID = "#8b93a3";
const DONE = "#5b8def";

const tooltipStyle = {
  background: "var(--dsw-alias-bg-layer-2)",
  border: "1px solid var(--dsw-alias-border-l2)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--dsw-alias-label-primary)",
  boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
  padding: "8px 10px",
};

export default function Overview() {
  const tasks = loadTasks();
  const total = tasks.length;
  const doneCount = tasks.filter((t) => t.done).length;
  const doingCount = tasks.filter((t) => t.status === "doing" && !t.done).length;
  const todoCount = tasks.filter((t) => !t.done && t.status !== "doing").length;
  const completion = total ? Math.round((doneCount / total) * 100) : 0;
  const thisWeek = weekly[weekly.length - 2]?.done ?? 0;

  const statusRows = [
    { label: "已完成", value: doneCount, tone: "success" as const },
    { label: "进行中", value: doingCount, tone: "business" as const },
    { label: "待办", value: todoCount, tone: "warn" as const },
  ];
  const maxStatus = Math.max(1, ...statusRows.map((s) => s.value));

  return (
    <div>
      <PageHeader title="概览" subtitle="Atlas 设计系统 v2.0 · 当周项目进展一览" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))", gap: 14 }}>
        <KpiCard label="完成率" value={`${completion}%`} delta={8} icon={CheckCircle2} />
        <KpiCard label="待办任务" value={String(todoCount + doingCount)} delta={5} icon={ListChecks} />
        <KpiCard label="本周完成" value={String(thisWeek)} delta={-2} icon={CalendarClock} />
        <KpiCard label="团队成员" value={String(members.length)} delta={0} icon={Users} />
      </div>

      <div className="grid2" style={{ marginTop: 14, display: "grid", gap: 14 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ fontSize: 15, fontWeight: 650, margin: 0, color: "var(--dsw-alias-label-primary)" }}>周完成趋势</h2>
            <span style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>近 6 周 · 单位 个</span>
          </div>
          <ResponsiveContainer width="100%" height={236}>
            <AreaChart data={weekly} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="doneFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={DONE} stopOpacity={0.34} />
                  <stop offset="100%" stopColor={DONE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: AXIS }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: GRID, strokeOpacity: 0.4, strokeDasharray: "4 4" }} />
              <Area type="monotone" dataKey="planned" stroke={AXIS} strokeDasharray="5 4" strokeWidth={1.5} fill="none" name="计划" />
              <Area type="monotone" dataKey="done" stroke={DONE} strokeWidth={2.4} fill="url(#doneFill)" name="已完成" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 style={{ fontSize: 15, fontWeight: 650, margin: 0, marginBottom: 16, color: "var(--dsw-alias-label-primary)" }}>状态分布</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {statusRows.map((s) => (
              <div key={s.label}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                  <span style={{ color: "var(--dsw-alias-label-secondary)" }}>{s.label}</span>
                  <span style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 600 }}>{s.value}</span>
                </div>
                <Bar value={(s.value / maxStatus) * 100} tone={s.tone} height={8} />
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: "1px solid var(--dsw-alias-border-l1)",
              fontSize: 13,
              color: "var(--dsw-alias-label-secondary)",
            }}
          >
            共 {total} 个任务 · 整体完成率 <span style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 600 }}>{completion}%</span>
          </div>
        </Card>
      </div>

      <Card style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 650, margin: 0, marginBottom: 6, color: "var(--dsw-alias-label-primary)" }}>最近动态</h2>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {activity.map((a) => {
            const m = memberById(a.who);
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px" }}>
                {m && <Avatar name={m.name} color={m.color} size={30} />}
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>
                  <span style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 600 }}>{m?.name}</span> {a.action} <span style={{ color: "var(--dsw-alias-state-business-primary)" }}>「{a.target}」</span>
                </div>
                <span style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", whiteSpace: "nowrap" }}>{a.time}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
