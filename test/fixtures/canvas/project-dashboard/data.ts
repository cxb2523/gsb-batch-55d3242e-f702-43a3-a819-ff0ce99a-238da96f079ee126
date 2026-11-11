// Shared types, mock data and persistence helpers for the project dashboard.
// Imported by every page via relative path so all pages share one source of truth.

export type TaskStatus = "todo" | "doing" | "done";
export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  assignee: string;
  status: TaskStatus;
  priority: Priority;
  due: string; // ISO date yyyy-mm-dd
  done: boolean;
}

export interface Member {
  id: string;
  name: string;
  role: string;
  color: string;
  skills: string[];
}

export interface Milestone {
  id: string;
  date: string;
  title: string;
  status: "done" | "active" | "upcoming";
  note: string;
}

export interface ActivityItem {
  id: string;
  who: string;
  action: string;
  target: string;
  time: string;
}

export const project = {
  name: "Atlas 设计系统",
  version: "v2.0",
  phase: "Q3 重构",
  completion: 64,
};

export const members: Member[] = [
  { id: "u1", name: "林知夏", role: "负责人 / 前端架构", color: "#6366f1", skills: ["架构", "组件", "性能"] },
  { id: "u2", name: "陈墨", role: "前端开发", color: "#0ea5a4", skills: ["React", "组件", "动画"] },
  { id: "u3", name: "苏屿", role: "视觉设计", color: "#ec4899", skills: ["Figma", "Token", "无障碍"] },
  { id: "u4", name: "周野", role: "后端开发", color: "#f59e0b", skills: ["API", "数据", "构建"] },
  { id: "u5", name: "韩星", role: "测试工程师", color: "#8b5cf6", skills: ["E2E", "用例", "回归"] },
];

export const seedTasks: Task[] = [
  { id: "t1", title: "搭建组件库脚手架", assignee: "u2", status: "done", priority: "high", due: "2025-07-12", done: true },
  { id: "t2", title: "设计 Token 体系", assignee: "u3", status: "done", priority: "high", due: "2025-07-15", done: true },
  { id: "t3", title: "迁移 Button 组件", assignee: "u2", status: "doing", priority: "medium", due: "2025-07-20", done: false },
  { id: "t4", title: "重构表单校验逻辑", assignee: "u4", status: "doing", priority: "high", due: "2025-07-22", done: false },
  { id: "t5", title: "暗色主题适配", assignee: "u3", status: "todo", priority: "medium", due: "2025-07-26", done: false },
  { id: "t6", title: "编写无障碍测试用例", assignee: "u5", status: "todo", priority: "low", due: "2025-07-30", done: false },
  { id: "t7", title: "文档站点搭建", assignee: "u1", status: "doing", priority: "medium", due: "2025-08-02", done: false },
  { id: "t8", title: "发布 Beta 版本", assignee: "u1", status: "todo", priority: "high", due: "2025-08-10", done: false },
];

export const milestones: Milestone[] = [
  { id: "m1", date: "07-05", title: "需求评审", status: "done", note: "与各业务线对齐重构范围与里程碑。" },
  { id: "m2", date: "07-18", title: "视觉规范定稿", status: "done", note: "Token、组件、图标体系完成评审。" },
  { id: "m3", date: "07-28", title: "核心组件迁移", status: "active", note: "Button / Form / Modal 等基础组件迁移中。" },
  { id: "m4", date: "08-10", title: "Beta 发布", status: "upcoming", note: "内部灰度，收集接入反馈。" },
  { id: "m5", date: "08-25", title: "正式版发布", status: "upcoming", note: "全量上线，废弃 v1 组件。" },
];

export const activity: ActivityItem[] = [
  { id: "a1", who: "u1", action: "完成了", target: "文档站点搭建", time: "2 小时前" },
  { id: "a2", who: "u5", action: "评论了", target: "无障碍测试用例", time: "5 小时前" },
  { id: "a3", who: "u4", action: "更新进度至 60%", target: "表单校验逻辑", time: "昨天" },
  { id: "a4", who: "u3", action: "提交了", target: "Token 体系", time: "3 天前" },
  { id: "a5", who: "u2", action: "新建了", target: "暗色主题适配", time: "3 天前" },
];

export const weekly: { week: string; done: number; planned: number }[] = [
  { week: "W1", done: 4, planned: 6 },
  { week: "W2", done: 7, planned: 8 },
  { week: "W3", done: 5, planned: 9 },
  { week: "W4", done: 8, planned: 8 },
  { week: "W5", done: 6, planned: 10 },
  { week: "W6", done: 0, planned: 7 },
];

// --- persistence: tasks live in localStorage so toggles/adds survive reloads and edits ---

const TASKS_KEY = "pd:tasks";

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (raw) return JSON.parse(raw) as Task[];
  } catch {
    /* ignore */
  }
  return seedTasks.map((t) => ({ ...t }));
}

export function saveTasks(tasks: Task[]): void {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

export function memberById(id: string): Member | undefined {
  return members.find((m) => m.id === id);
}
