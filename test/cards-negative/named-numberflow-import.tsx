import { useState, useMemo } from "react"
import { NumberFlow } from "@number-flow/react"

type RepaymentType = "equal_principal" | "equal_payment"

interface LoanParams {
  amount: number
  annualRate: number
  years: number
  repaymentType: RepaymentType
}

function formatCurrency(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcMonthlyPayment(p: LoanParams) {
  const { amount, annualRate, years, repaymentType } = p
  const n = years * 12
  const r = annualRate / 100 / 12
  if (repaymentType === "equal_payment") {
    if (r === 0) return amount / n
    return (amount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
  }
  return amount / n + amount * r
}

function calcSchedule(p: LoanParams) {
  const { amount, annualRate, years, repaymentType } = p
  const n = years * 12
  const r = annualRate / 100 / 12
  const principalMonthly = amount / n
  let balance = amount
  const rows: { month: number; payment: number; principal: number; interest: number; balance: number }[] = []
  for (let m = 1; m <= n; m++) {
    const interest = balance * r
    let principal: number
    let payment: number
    if (repaymentType === "equal_payment") {
      payment = calcMonthlyPayment(p)
      principal = payment - interest
    } else {
      principal = principalMonthly
      payment = principal + interest
    }
    balance -= principal
    if (balance < 0) balance = 0
    rows.push({ month: m, payment, principal, interest, balance })
  }
  return rows
}

export default function MortgageCalculator() {
  const [params, setParams] = useState<LoanParams>({
    amount: 1000000,
    annualRate: 3.85,
    years: 30,
    repaymentType: "equal_payment",
  })

  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)

  const schedule = useMemo(() => calcSchedule(params), [params])
  const monthlyPayment = useMemo(() => calcMonthlyPayment(params), [params])
  const totalPayment = useMemo(() => schedule.reduce((s, r) => s + r.payment, 0), [schedule])
  const totalInterest = useMemo(() => schedule.reduce((s, r) => s + r.interest, 0), [schedule])
  const totalPrincipal = useMemo(() => schedule.reduce((s, r) => s + r.principal, 0), [schedule])

  const selectedRow = selectedMonth != null ? schedule[selectedMonth - 1] : null

  const handleAmount = (v: number) => setParams((p) => ({ ...p, amount: Math.max(0, v) }))
  const handleRate = (v: number) => setParams((p) => ({ ...p, annualRate: Math.max(0, v) }))
  const handleYears = (v: number) => setParams((p) => ({ ...p, years: Math.max(1, Math.min(30, v)) }))

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 16, padding: 16, boxSizing: "border-box", overflow: "auto" }}>
      <style>{`
        .mc-input { width: 100%; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 14px; box-sizing: border-box; }
        .mc-input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
        .mc-btn { padding: 6px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px; cursor: pointer; }
        .mc-btn.active { background: var(--dsw-alias-state-business-primary); color: #fff; border-color: var(--dsw-alias-state-business-primary); }
        .mc-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
        .mc-btn.active:hover { background: var(--dsw-alias-state-business-primary); }
        .mc-row { display: grid; gap: 12px; }
        @container (min-width: 30rem) { .mc-row { grid-template-columns: 1fr 1fr; } }
        .mc-schedule-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 13px; cursor: pointer; }
        .mc-schedule-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
        .mc-schedule-row.selected { background: var(--dsw-alias-interactive-bg-hover); border-left: 3px solid var(--dsw-alias-state-business-primary); }
        .mc-schedule-row span { display: block; }
        .mc-schedule-row .label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
        .mc-schedule-row .value { color: var(--dsw-alias-label-primary); }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--dsw-alias-label-primary)" }}>房贷计算器</h2>
        <p style={{ margin: 0, fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>调整参数，实时查看月供与还款计划</p>
      </div>

      <div className="mc-row">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>贷款金额（元）</label>
          <input className="mc-input" type="number" value={params.amount} onChange={(e) => handleAmount(Number(e.target.value))} aria-label="贷款金额" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>年利率（%）</label>
          <input className="mc-input" type="number" step="0.01" value={params.annualRate} onChange={(e) => handleRate(Number(e.target.value))} aria-label="年利率" />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 13, color: "var(--dsw-alias-label-secondary)" }}>贷款期限（年）</label>
        <input className="mc-input" type="range" min={1} max={30} value={params.years} onChange={(e) => handleYears(Number(e.target.value))} aria-label="贷款期限" />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>
          <span>1 年</span>
          <span style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 500 }}>{params.years} 年</span>
          <span>30 年</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className={`mc-btn ${params.repaymentType === "equal_payment" ? "active" : ""}`} onClick={() => setParams((p) => ({ ...p, repaymentType: "equal_payment" }))} type="button">等额本息</button>
        <button className={`mc-btn ${params.repaymentType === "equal_principal" ? "active" : ""}`} onClick={() => setParams((p) => ({ ...p, repaymentType: "equal_principal" }))} type="button">等额本金</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div style={{ background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>月供</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: "var(--dsw-alias-label-primary)" }}>
            <NumberFlow value={monthlyPayment} format={{ style: "currency", currency: "CNY" }} />
          </span>
        </div>
        <div style={{ background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>总利息</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: "var(--dsw-alias-state-error-primary)" }}>
            <NumberFlow value={totalInterest} format={{ style: "currency", currency: "CNY" }} />
          </span>
        </div>
        <div style={{ background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--dsw-alias-label-secondary)" }}>总还款</span>
          <span style={{ fontSize: 22, fontWeight: 600, color: "var(--dsw-alias-label-primary)" }}>
            <NumberFlow value={totalPayment} format={{ style: "currency", currency: "CNY" }} />
          </span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--dsw-alias-label-primary)" }}>还款计划</span>
        <button className="mc-btn" onClick={() => setShowSchedule((s) => !s)} type="button">{showSchedule ? "收起" : "展开"}</button>
      </div>

      {showSchedule && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, padding: "6px 10px", fontSize: 12, color: "var(--dsw-alias-label-secondary)", borderBottom: "1px solid var(--dsw-alias-border-l1)" }}>
            <span>期数</span><span>月供</span><span>本金</span><span>利息</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 320, overflow: "auto" }}>
            {schedule.map((row) => (
              <div key={row.month} className={`mc-schedule-row ${selectedMonth === row.month ? "selected" : ""}`} onClick={() => setSelectedMonth(row.month)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedMonth(row.month); }}>
                <span className="value">{row.month}</span>
                <span className="value">{formatCurrency(row.payment)}</span>
                <span className="value">{formatCurrency(row.principal)}</span>
                <span className="value">{formatCurrency(row.interest)}</span>
              </div>
            ))}
          </div>
          {selectedRow && (
            <div style={{ background: "var(--dsw-alias-bg-layer-1)", border: "1px solid var(--dsw-alias-border-l1)", borderRadius: 8, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: "var(--dsw-alias-label-secondary)" }}>第 {selectedRow.month} 期</span></div>
              <div><span style={{ color: "var(--dsw-alias-label-secondary)" }}>剩余本金</span> <span style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 500 }}>{formatCurrency(selectedRow.balance)}</span></div>
              <div><span style={{ color: "var(--dsw-alias-label-secondary)" }}>月供</span> <span style={{ color: "var(--dsw-alias-label-primary)", fontWeight: 500 }}>{formatCurrency(selectedRow.payment)}</span></div>
              <div><span style={{ color: "var(--dsw-alias-label-secondary)" }}>其中利息</span> <span style={{ color: "var(--dsw-alias-state-error-primary)", fontWeight: 500 }}>{formatCurrency(selectedRow.interest)}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}