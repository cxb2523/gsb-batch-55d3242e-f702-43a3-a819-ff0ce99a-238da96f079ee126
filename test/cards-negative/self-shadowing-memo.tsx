import { useState, useMemo } from "react"
import { usePersistedState } from "$dsh/state"
import {
  Droplets,
  Dumbbell,
  Moon,
  ChevronLeft,
  ChevronRight,
  Flame,
  Check,
  Plus,
  Minus,
} from "lucide-react"

type HabitId = "water" | "exercise" | "sleep"

interface HabitDef {
  id: HabitId
  label: string
  icon: React.ElementType
  color: string
  unit: string
  description: string
}

const HABITS: HabitDef[] = [
  { id: "water", label: "喝水", icon: Droplets, color: "#3b82f6", unit: "杯", description: "每天至少 8 杯" },
  { id: "exercise", label: "运动", icon: Dumbbell, color: "#10b981", unit: "分钟", description: "每天至少 30 分钟" },
  { id: "sleep", label: "早睡", icon: Moon, color: "#8b5cf6", unit: "", description: "23:00 前入睡" },
]

const STORAGE_KEY = "habit-tracker-data"

interface DayData {
  water: number
  exercise: number
  sleep: boolean
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

function weekDates(ref: Date): Date[] {
  const start = new Date(ref)
  const day = start.getDay()
  const diff = start.getDate() - day + (day === 0 ? -6 : 1)
  start.setDate(diff)
  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dates.push(d)
  }
  return dates
}

function isToday(d: Date): boolean {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

function getDayData(data: Record<string, DayData>, d: Date): DayData {
  return data[dateKey(d)] ?? { water: 0, exercise: 0, sleep: false }
}

function streak(data: Record<string, DayData>, habit: HabitId, ref: Date): number {
  let count = 0
  const d = new Date(ref)
  if (habit === "sleep") {
    if (!getDayData(data, d).sleep) return 0
    count = 1
    d.setDate(d.getDate() - 1)
  } else {
    const goal = habit === "water" ? 8 : 30
    if ((getDayData(data, d)[habit] ?? 0) < goal) return 0
    count = 1
    d.setDate(d.getDate() - 1)
  }
  while (true) {
    if (habit === "sleep") {
      if (!getDayData(data, d).sleep) break
    } else {
      const goal = habit === "water" ? 8 : 30
      if ((getDayData(data, d)[habit] ?? 0) < goal) break
    }
    count++
    d.setDate(d.getDate() - 1)
  }
  return count
}

export default function HabitTracker() {
  const [data, setData] = usePersistedState<Record<string, DayData>>(STORAGE_KEY, {})
  const [ref, setRef] = useState(() => new Date())

  const today = useMemo(() => new Date(), [])
  const weekDates = useMemo(() => weekDates(ref), [ref])
  const dayData = useMemo(() => getDayData(data, ref), [data, ref])

  const weekProgress = useMemo(() => {
    return weekDates.map((d) => {
      const dd = getDayData(data, d)
      const waterDone = dd.water >= 8
      const exerciseDone = dd.exercise >= 30
      const sleepDone = dd.sleep
      const done = [waterDone, exerciseDone, sleepDone].filter(Boolean).length
      return { date: d, done, total: 3 }
    })
  }, [data, weekDates])

  const todayStreaks = useMemo(() => {
    return HABITS.map((h) => ({ ...h, streak: streak(data, h.id, today) }))
  }, [data, today])

  const updateDay = (d: Date, patch: Partial<DayData>) => {
    const key = dateKey(d)
    setData((prev) => ({ ...prev, [key]: { ...getDayData(prev, d), ...patch } }))
  }

  const toggleSleep = (d: Date) => {
    updateDay(d, { sleep: !getDayData(data, d).sleep })
  }

  const changeWater = (d: Date, delta: number) => {
    const dd = getDayData(data, d)
    const next = Math.max(0, dd.water + delta)
    updateDay(d, { water: next })
  }

  const changeExercise = (d: Date, delta: number) => {
    const dd = getDayData(data, d)
    const next = Math.max(0, dd.exercise + delta)
    updateDay(d, { exercise: next })
  }

  const navigateWeek = (dir: number) => {
    const d = new Date(ref)
    d.setDate(d.getDate() + dir * 7)
    setRef(d)
  }

  const goToToday = () => setRef(new Date())

  const weekLabel = useMemo(() => {
    const s = weekDates[0]
    const e = weekDates[6]
    if (s.getMonth() === e.getMonth()) return `${s.getMonth() + 1}月${s.getDate()}日 - ${e.getDate()}日`
    return `${s.getMonth() + 1}月${s.getDate()}日 - ${e.getMonth() + 1}月${e.getDate()}日`
  }, [weekDates])

  const dayLabel = useMemo(() => {
    const d = ref
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const dd = d.getDate()
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
    return `${y}年${m}月${dd}日 ${weekdays[d.getDay()]}`
  }, [ref])

  const weekTotal = useMemo(() => weekProgress.reduce((s, w) => s + w.done, 0), [weekProgress])

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 16, padding: "16px 20px", overflow: "auto" }}>
      <style>{`
        .ht-card {
          background: var(--dsw-alias-bg-layer-1);
          border: 1px solid var(--dsw-alias-border-l1);
          border-radius: 12px;
          padding: 16px;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .ht-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }
        .ht-btn {
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: background 120ms ease, transform 80ms ease;
        }
        .ht-btn:hover { transform: scale(1.04); }
        .ht-btn:active { transform: scale(0.97); }
        .ht-toggle {
          width: 48px;
          height: 28px;
          border-radius: 14px;
          border: none;
          cursor: pointer;
          position: relative;
          transition: background 200ms ease;
        }
        .ht-toggle::after {
          content: "";
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #fff;
          transition: transform 200ms ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        .ht-toggle.on::after { transform: translateX(20px); }
        .ht-week-dot {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          transition: background 150ms ease, transform 120ms ease;
        }
        .ht-week-dot:hover { transform: scale(1.15); }
        .ht-week-dot.today { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          .ht-card, .ht-btn, .ht-toggle, .ht-week-dot { transition: none !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--dsw-alias-label-primary)" }}>习惯打卡</div>
          <div style={{ fontSize: 13, color: "var(--dsw-alias-label-secondary)", marginTop: 2 }}>坚持每一天，养成好习惯</div>
        </div>
        <button className="ht-btn" onClick={goToToday} style={{ background: "var(--dsw-alias-state-business-primary)", color: "#fff", padding: "8px 14px" }}>
          今天
        </button>
      </div>

      {/* Week overview */}
      <div className="ht-card" style={{ padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)" }}>本周 {weekLabel}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="ht-btn" onClick={() => navigateWeek(-1)} style={{ background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", padding: "4px 10px" }} aria-label="上一周">
              <ChevronLeft size={16} />
            </button>
            <button className="ht-btn" onClick={() => navigateWeek(1)} style={{ background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", padding: "4px 10px" }} aria-label="下一周">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
          {weekProgress.map((w) => {
            const pct = w.done / w.total
            const bg = pct === 1 ? "var(--dsw-alias-state-success-primary)" : pct > 0 ? "var(--dsw-alias-state-warn-primary)" : "var(--dsw-alias-bg-layer-2)"
            return (
              <div key={dateKey(w.date)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div className={`ht-week-dot ${isToday(w.date) ? "today" : ""}`} style={{ background: bg, color: pct > 0 ? "#fff" : "var(--dsw-alias-label-secondary)" }}>
                  {w.date.getDate()}
                </div>
                <span style={{ fontSize: 11, color: "var(--dsw-alias-label-secondary)" }}>
                  {["日", "一", "二", "三", "四", "五", "六"][w.date.getDay()]}
                </span>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>
          本周完成 <strong style={{ color: "var(--dsw-alias-state-success-primary)" }}>{weekTotal}</strong> / {weekProgress.length * 3} 项
        </div>
      </div>

      {/* Today's habits */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--dsw-alias-label-primary)" }}>{dayLabel}</div>
        {HABITS.map((h) => {
          const Icon = h.icon
          const done = h.id === "sleep" ? dayData.sleep : (dayData[h.id] ?? 0) >= (h.id === "water" ? 8 : 30)
          const count = dayData[h.id] ?? 0
          const goal = h.id === "water" ? 8 : 30
          const pct = Math.min(1, count / goal)
          const st = streak(data, h.id, today)
          return (
            <div key={h.id} className="ht-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${h.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={22} color={h.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, color: "var(--dsw-alias-label-primary)" }}>{h.label}</span>
                  {st > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: "#f59e0b" }}>
                      <Flame size={14} /> {st}天
                    </span>
                  )}
                  {done && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--dsw-alias-state-success-primary)" }}>
                      <Check size={14} /> 已完成
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginTop: 2 }}>{h.description}</div>
                {h.id !== "sleep" && (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--dsw-alias-bg-layer-2)" }}>
                      <div style={{ width: `${pct * 100}%`, height: "100%", borderRadius: 3, background: h.color, transition: "width 200ms ease" }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)", minWidth: 40, textAlign: "right" }}>
                      {count} / {goal}{h.unit}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {h.id === "sleep" ? (
                  <button
                    className={`ht-toggle ${dayData.sleep ? "on" : ""}`}
                    onClick={() => toggleSleep(ref)}
                    style={{ background: dayData.sleep ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-bg-layer-2)" }}
                    aria-label={`早睡${dayData.sleep ? "已打卡" : "未打卡"}`}
                  />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button className="ht-btn" onClick={() => (h.id === "water" ? changeWater(ref, -1) : changeExercise(ref, -1))} style={{ width: 30, height: 30, background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="减少">
                      <Minus size={16} />
                    </button>
                    <button className="ht-btn" onClick={() => (h.id === "water" ? changeWater(ref, 1) : changeExercise(ref, 1))} style={{ width: 30, height: 30, background: "var(--dsw-alias-state-business-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="增加">
                      <Plus size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Streak summary */}
      <div className="ht-card" style={{ padding: "12px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--dsw-alias-label-primary)", marginBottom: 8 }}>连续打卡</div>
        <div style={{ display: "flex", gap: 16 }}>
          {todayStreaks.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <s.icon size={16} color={s.color} />
              <span style={{ fontSize: 13, color: "var(--dsw-alias-label-primary)" }}>{s.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: s.streak > 0 ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-label-secondary)" }}>
                {s.streak}天
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}