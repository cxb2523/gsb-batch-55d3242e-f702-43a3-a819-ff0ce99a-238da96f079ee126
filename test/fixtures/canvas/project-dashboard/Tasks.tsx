import { useState, useEffect, useMemo } from "react";
import { Plus, Search, Trash2, CheckCircle2, Circle } from "lucide-react";
import { Card, Badge, Avatar, PageHeader } from "./ui";
import { loadTasks, saveTasks, memberById, type Task, type TaskStatus, type Priority } from "./data";

const FILTERS: { id: "all" | TaskStatus; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "todo", label: "待办" },
  { id: "doing", label: "进行中" },
  { id: "done", label: "已完成" },
];

const PRIORITY_TONE: Record<Priority, "high" | "medium" | "low"> = { high: "high", medium: "medium", low: "low" };
const STATUS_TONE: Record<TaskStatus, "done" | "doing" | "todo"> = { done: "done", doing: "doing", todo: "todo" };

// A fixed "today" keeps the demo dates stable regardless of the real date.
const TODAY = new Date("2025-07-22T00:00:00");

function fmtDue(due: string, done: boolean): { text: string; over: boolean } {
  const d = new Date(due + "T00:00:00");
  const diff = Math.round((d.getTime() - TODAY.getTime()) / 86400000);
  let text: string;
  if (diff < 0) text = `逾期 ${Math.abs(diff)} 天`;
  else if (diff === 0) text = "今天到期";
  else if (diff === 1) text = "明天到期";
  else text = `${diff} 天后`;
  return { text, over: diff < 0 && !done };
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks());
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((t) => !t.done && t.status === "todo").length,
      doing: tasks.filter((t) => !t.done && t.status === "doing").length,
      done: tasks.filter((t) => t.done).length,
    }),
    [tasks],
  );

  const visible = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "todo" && !(!t.done && t.status === "todo")) return false;
      if (filter === "doing" && !(!t.done && t.status === "doing")) return false;
      if (filter === "done" && !t.done) return false;
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [tasks, filter, query]);

  const toggle = (id: string) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done, status: !t.done ? "done" : "todo" } : t)));

  const remove = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    const id = "t" + Date.now();
    const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    setTasks((prev) => [{ id, title, assignee: "u1", status: "todo", priority: "medium", due, done: false }, ...prev]);
    setDraft("");
  };

  return (
    <div>
      <PageHeader title="任务" subtitle="勾选完成、新增与删除都即时保存到本地，刷新后保留">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--dsw-alias-bg-layer-1)",
            border: "1px solid var(--dsw-alias-border-l1)",
            borderRadius: 10,
            padding: "4px 4px 4px 10px",
          }}
        >
          <Search size={15} style={{ color: "var(--dsw-alias-label-secondary)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索任务…"
            aria-label="搜索任务"
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 13,
              color: "var(--dsw-alias-label-primary)",
              width: 120,
            }}
          />
        </div>
      </PageHeader>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={active ? "filter active" : "filter"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                borderRadius: 999,
                border: "1px solid " + (active ? "transparent" : "var(--dsw-alias-border-l1)"),
                background: active ? "color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent)" : "var(--dsw-alias-bg-layer-1)",
                color: active ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-secondary)",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {f.label}
              <span style={{ fontSize: 11, opacity: 0.8 }}>{counts[f.id]}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="新增任务，回车添加"
            aria-label="新增任务标题"
            style={{
              border: "1px solid var(--dsw-alias-border-l1)",
              background: "var(--dsw-alias-bg-layer-1)",
              outline: "none",
              fontSize: 13,
              color: "var(--dsw-alias-label-primary)",
              borderRadius: 10,
              padding: "7px 10px",
              width: 200,
            }}
          />
          <button
            type="button"
            onClick={add}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 10,
              border: "none",
              background: "var(--dsw-alias-state-business-primary)",
              color: "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> 添加
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visible.length === 0 && <Card style={{ textAlign: "center", padding: 32, fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>没有匹配的任务</Card>}
        {visible.map((t) => {
          const m = memberById(t.assignee);
          const due = fmtDue(t.due, t.done);
          return (
            <Card key={t.id} padding={0} style={{ padding: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  aria-label={t.done ? "标记为未完成" : "标记为完成"}
                  onClick={() => toggle(t.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 2,
                    display: "inline-flex",
                    lineHeight: 0,
                    color: t.done ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-secondary)",
                  }}
                >
                  {t.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>

                <div style={{ flex: 1, minWidth: 160 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 550,
                      color: t.done ? "var(--dsw-alias-label-secondary)" : "var(--dsw-alias-label-primary)",
                      textDecoration: t.done ? "line-through" : "none",
                    }}
                  >
                    {t.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                    <Badge tone={PRIORITY_TONE[t.priority]} />
                    {m && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 12,
                          color: "var(--dsw-alias-label-secondary)",
                        }}
                      >
                        <Avatar name={m.name} color={m.color} size={18} /> {m.name}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 12,
                        color: due.over ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-label-secondary)",
                      }}
                    >
                      {due.text}
                    </span>
                  </div>
                </div>

                <Badge tone={STATUS_TONE[t.status]} />

                <button
                  type="button"
                  aria-label="删除任务"
                  onClick={() => remove(t.id)}
                  className="del"
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 4,
                    color: "var(--dsw-alias-label-secondary)",
                    display: "inline-flex",
                    lineHeight: 0,
                    borderRadius: 6,
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
