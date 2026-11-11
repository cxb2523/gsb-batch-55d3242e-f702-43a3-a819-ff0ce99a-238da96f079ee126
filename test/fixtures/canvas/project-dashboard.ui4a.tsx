import { useState, useEffect, type ElementType } from "react";
import { LayoutDashboard, CheckSquare, Users, CalendarRange } from "lucide-react";
import Overview from "./project-dashboard/Overview";
import Tasks from "./project-dashboard/Tasks";
import Team from "./project-dashboard/Team";
import Timeline from "./project-dashboard/Timeline";
import { project } from "./project-dashboard/data";

type PageId = "overview" | "tasks" | "team" | "timeline";

const PAGES: { id: PageId; label: string; icon: ElementType }[] = [
  { id: "overview", label: "概览", icon: LayoutDashboard },
  { id: "tasks", label: "任务", icon: CheckSquare },
  { id: "team", label: "团队", icon: Users },
  { id: "timeline", label: "时间线", icon: CalendarRange },
];

const PAGE_KEY = "pd:page";

export default function Dashboard() {
  const [page, setPage] = useState<PageId>(() => {
    try {
      const v = localStorage.getItem(PAGE_KEY) as PageId | null;
      return v && PAGES.some((p) => p.id === v) ? v : "overview";
    } catch {
      return "overview";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_KEY, page);
    } catch {
      /* ignore */
    }
  }, [page]);

  return (
    <>
      <style>{`
        .root, .root * { box-sizing: border-box; }
        .root {
          container-type: inline-size;
          display: flex;
          height: 100%;
          width: 100%;
          background: var(--dsw-alias-bg-base);
          color: var(--dsw-alias-label-primary);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        }
        .sidebar {
          width: 64px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 16px 12px;
          background: var(--dsw-alias-bg-layer-1);
          border-right: 1px solid var(--dsw-alias-border-l1);
          transition: width .2s ease;
        }
        .brand { display: flex; align-items: center; gap: 10px; padding: 2px 4px 16px; justify-content: center; }
        .logo {
          width: 38px; height: 38px; border-radius: 11px;
          display: inline-flex; align-items: center; justify-content: center;
          background: var(--dsw-alias-state-business-primary); color: #fff;
          font-weight: 800; font-size: 17px; flex-shrink: 0;
        }
        .brand-text { display: none; flex-direction: column; min-width: 0; }
        .brand-name { font-size: 14px; font-weight: 700; color: var(--dsw-alias-label-primary); white-space: nowrap; }
        .brand-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; margin-top: 1px; }
        .nav {
          display: flex; align-items: center; gap: 12px; width: 100%;
          padding: 10px 0; border: 1px solid transparent; background: transparent;
          color: var(--dsw-alias-label-secondary); border-radius: 10px;
          cursor: pointer; font-size: 14px; font-weight: 550; text-align: left;
          justify-content: center;
        }
        .nav:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
        .nav.active {
          background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
          color: var(--dsw-alias-state-business-primary); font-weight: 650;
        }
        .nav-label { display: none; white-space: nowrap; }
        .nav-spacer { flex: 1; }
        .foot { display: none; }
        .foot-card {
          background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 22%, transparent);
          border-radius: 12px; padding: 12px;
        }
        .content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .page { flex: 1; overflow: auto; padding: 22px 22px 28px; }
        .grid2 { grid-template-columns: 1fr; }
        button:focus-visible, input:focus-visible {
          outline: 2px solid var(--dsw-alias-state-business-primary);
          outline-offset: 2px;
        }
        .filter:hover { color: var(--dsw-alias-label-primary); }
        .del:hover {
          color: var(--dsw-alias-state-error-primary);
          background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
        }
        @container (min-width: 46rem) {
          .sidebar { width: 232px; padding: 18px 14px; }
          .brand { justify-content: flex-start; }
          .brand-text { display: flex; }
          .nav { justify-content: flex-start; padding: 10px 12px; }
          .nav-label { display: inline; }
          .foot { display: block; }
          .grid2 { grid-template-columns: 1.6fr 1fr; }
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="root">
        <aside className="sidebar">
          <div className="brand">
            <span className="logo">A</span>
            <span className="brand-text">
              <span className="brand-name">{project.name}</span>
              <span className="brand-sub">
                {project.version} · {project.phase}
              </span>
            </span>
          </div>

          {PAGES.map((p) => {
            const Icon = p.icon;
            const active = page === p.id;
            return (
              <button key={p.id} type="button" className={"nav" + (active ? " active" : "")} onClick={() => setPage(p.id)} aria-current={active ? "page" : undefined}>
                <Icon size={18} />
                <span className="nav-label">{p.label}</span>
              </button>
            );
          })}

          <div className="nav-spacer" />

          <div className="foot">
            <div className="foot-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--dsw-alias-label-secondary)",
                  marginBottom: 8,
                }}
              >
                <span>整体进度</span>
                <span style={{ color: "var(--dsw-alias-state-business-primary)", fontWeight: 650 }}>{project.completion}%</span>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: "color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: project.completion + "%",
                    borderRadius: 999,
                    background: "var(--dsw-alias-state-business-primary)",
                  }}
                />
              </div>
            </div>
          </div>
        </aside>

        <main className="content">
          <div className="page">
            {page === "overview" && <Overview />}
            {page === "tasks" && <Tasks />}
            {page === "team" && <Team />}
            {page === "timeline" && <Timeline />}
          </div>
        </main>
      </div>
    </>
  );
}
