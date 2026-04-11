// src/pages/Reports.jsx — Advanced Reports v1.0
// 50+ analytical dimensions across 8 report sections
// Each section is independently filterable and exportable as CSV

import { useState, useEffect, useMemo } from "react"
import { Trade } from "@/api/supabaseStore"
import { useLanguage } from "@/lib/LanguageContext"
import {
  BarChart, Bar, AreaChart, Area, LineChart, Line,
  ScatterChart, Scatter, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import {
  TrendingUp, TrendingDown, Download, Filter,
  BarChart3, Clock, Target, Activity, Calendar,
  DollarSign, Percent, Zap, Shield, ChevronDown
} from "lucide-react"

// ─── Helpers ──────────────────────────────────────────────────────────────────
const C = {
  success: "#2ed573", danger: "#ff4757", accent: "#6c63ff",
  warning: "#ffa502", secondary: "#00d4aa", muted: "#4a4c5e",
  textSec: "#8b8d9e", border: "#1a1a30", bg: "#0f0f22", bgEl: "#141430"
}

const fmtP  = v => v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`
const fmtPct= v => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
const clr   = v => v >= 0 ? C.success : C.danger

function safeTrade(t) {
  if (!t || typeof t !== "object") return null
  try {
    const pnl = parseFloat(t.pnl) || 0
    return {
      ...t,
      pnl,
      gross_pnl:   parseFloat(t.gross_pnl)  || pnl,
      commission:  parseFloat(t.commission) || 0,
      swap:        parseFloat(t.swap)       || 0,
      pips:        parseFloat(t.pips)       || 0,
      lot_size:    parseFloat(t.lot_size)   || parseFloat(t.volume) || 0,
      quality:     parseInt(t.quality)      || 5,
      outcome:     ["WIN","LOSS","BREAKEVEN"].includes((t.outcome||"").toUpperCase())
                     ? t.outcome.toUpperCase() : pnl>0?"WIN":pnl<0?"LOSS":"BREAKEVEN",
      direction:   ["BUY","SELL"].includes((t.direction||"").toUpperCase())
                     ? t.direction.toUpperCase() : "BUY",
      symbol:      (t.symbol || "UNKNOWN").toUpperCase(),
      session:     t.session || "LONDON",
      timeframe:   t.timeframe || "M15",
      entry_time:  t.entry_time || new Date().toISOString(),
      tags:        Array.isArray(t.tags) ? t.tags : [],
    }
  } catch { return null }
}

function groupBy(trades, key, label) {
  const map = {}
  trades.forEach(t => {
    const k = t[key] || "OTHER"
    if (!map[k]) map[k] = { label: k, pnl:0, trades:0, wins:0, losses:0, pips:0, fees:0 }
    map[k].pnl    += t.pnl
    map[k].trades += 1
    map[k].pips   += t.pips
    map[k].fees   += Math.abs(t.commission) + Math.abs(t.swap)
    if (t.outcome === "WIN")  map[k].wins++
    if (t.outcome === "LOSS") map[k].losses++
  })
  return Object.values(map).map(g => ({
    ...g,
    pnl:        parseFloat(g.pnl.toFixed(2)),
    winRate:    parseFloat((g.wins / g.trades * 100).toFixed(1)),
    avgPnl:     parseFloat((g.pnl / g.trades).toFixed(2)),
    profitFactor: g.losses > 0
      ? parseFloat((trades.filter(t=>t[key]===(g.label)&&t.outcome==="WIN").reduce((s,t)=>s+t.pnl,0) /
          Math.abs(trades.filter(t=>t[key]===(g.label)&&t.outcome==="LOSS").reduce((s,t)=>s+t.pnl,0))).toFixed(2))
      : g.wins > 0 ? 99 : 0,
  }))
}

function calcStreaks(trades) {
  const sorted = [...trades].sort((a,b) => new Date(a.entry_time)-new Date(b.entry_time))
  let curW=0, curL=0, maxW=0, maxL=0
  sorted.forEach(t => {
    if (t.outcome === "WIN")  { curW++; curL=0; maxW=Math.max(maxW,curW) }
    if (t.outcome === "LOSS") { curL++; curW=0; maxL=Math.max(maxL,curL) }
  })
  return { maxWin:maxW, maxLoss:maxL, currentWin:curW, currentLoss:curL }
}

function calcDrawdown(trades) {
  const sorted = [...trades].sort((a,b) => new Date(a.entry_time)-new Date(b.entry_time))
  let peak=0, cum=0, maxDD=0, maxDDPct=0
  const curve = sorted.map(t => {
    cum  += t.pnl
    peak  = Math.max(peak, cum)
    const dd    = cum - peak
    const ddPct = peak > 0 ? (dd / peak * 100) : 0
    maxDD    = Math.min(maxDD, dd)
    maxDDPct = Math.min(maxDDPct, ddPct)
    return { date: t.entry_time?.slice(0,10), cum: parseFloat(cum.toFixed(2)), dd: parseFloat(dd.toFixed(2)) }
  })
  return { curve, maxDD: parseFloat(maxDD.toFixed(2)), maxDDPct: parseFloat(maxDDPct.toFixed(1)) }
}

function tip() {
  return {
    contentStyle: { background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 },
    labelStyle:   { color:"var(--text-secondary)" },
    itemStyle:    { color:"var(--text-primary)" },
  }
}

// ─── Reusable components ──────────────────────────────────────────────────────
function SectionCard({ title, icon:Icon, color="#6c63ff", children, onExport }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-5 py-3 cursor-pointer select-none"
        style={{ borderBottom: open ? "1px solid var(--border)" : "none", background:"var(--bg-elevated)" }}
        onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:`${color}20` }}>
            <Icon size={13} style={{ color }}/>
          </div>
          <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {onExport && open && (
            <button onClick={e => { e.stopPropagation(); onExport() }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs hover:opacity-70"
              style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)" }}>
              <Download size={11}/> CSV
            </button>
          )}
          <ChevronDown size={14} style={{ color:"var(--text-muted)", transform: open?"rotate(180deg)":"none", transition:"transform 0.2s" }}/>
        </div>
      </div>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

function StatGrid({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {stats.map(s => (
        <div key={s.label} className="rounded-xl p-3" style={{ background:"var(--bg-elevated)" }}>
          <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>{s.label}</p>
          <p className="font-bold text-sm" style={{ color: s.color || "var(--text-primary)", fontFamily:"var(--font-mono)" }}>{s.value}</p>
          {s.sub && <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>{s.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function DataTable({ cols, rows, maxRows=20 }) {
  const [show, setShow] = useState(maxRows)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom:"1px solid var(--border)" }}>
            {cols.map(c => (
              <th key={c.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                style={{ color:"var(--text-muted)" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, show).map((row, i) => (
            <tr key={i} style={{ borderBottom:"1px solid var(--border)" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-elevated)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {cols.map(c => (
                <td key={c.key} className="px-3 py-2 whitespace-nowrap"
                  style={{ color: c.color ? c.color(row[c.key], row) : "var(--text-secondary)" }}>
                  {c.fmt ? c.fmt(row[c.key], row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > show && (
        <button onClick={() => setShow(s => s + 20)}
          className="w-full py-2 text-xs mt-2 rounded-lg hover:opacity-70"
          style={{ color:"var(--accent)", background:"rgba(108,99,255,0.05)" }}>
          Show more ({rows.length - show} remaining)
        </button>
      )}
    </div>
  )
}

function exportCSV(filename, cols, rows) {
  const header = cols.map(c => c.label).join(",")
  const body   = rows.map(r => cols.map(c => {
    const v = r[c.key]
    return typeof v === "string" && v.includes(",") ? `"${v}"` : v
  }).join(",")).join("\n")
  const blob = new Blob([header + "\n" + body], { type:"text/csv" })
  const a    = document.createElement("a")
  a.href     = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ─── SECTION: Summary KPIs (20 metrics) ──────────────────────────────────────
function SummarySection({ trades }) {
  const wins   = trades.filter(t => t.outcome==="WIN")
  const losses = trades.filter(t => t.outcome==="LOSS")
  const be     = trades.filter(t => t.outcome==="BREAKEVEN")
  const netPnl = trades.reduce((s,t) => s+t.pnl, 0)
  const fees   = trades.reduce((s,t) => s+Math.abs(t.commission)+Math.abs(t.swap), 0)
  const gross  = trades.reduce((s,t) => s+(t.gross_pnl||t.pnl), 0)
  const avgW   = wins.length   ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length   : 0
  const avgL   = losses.length ? Math.abs(losses.reduce((s,t)=>s+t.pnl,0)/losses.length) : 0
  const wr     = trades.length ? wins.length/trades.length*100 : 0
  const pf     = avgL>0 ? avgW/avgL : avgW>0?99:0
  const exp    = trades.length ? netPnl/trades.length : 0
  const { maxDD, maxDDPct } = calcDrawdown(trades)
  const { maxWin, maxLoss } = calcStreaks(trades)
  const avgPips = trades.length ? trades.reduce((s,t)=>s+t.pips,0)/trades.length : 0
  const avgLots = trades.length ? trades.reduce((s,t)=>s+t.lot_size,0)/trades.length : 0
  const avgQ    = trades.length ? trades.reduce((s,t)=>s+t.quality,0)/trades.length : 0
  const buys    = trades.filter(t=>t.direction==="BUY")
  const sells   = trades.filter(t=>t.direction==="SELL")

  const sorted = [...trades].sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))
  const firstDate = sorted[0]?.entry_time?.slice(0,10) || "—"
  const lastDate  = sorted[sorted.length-1]?.entry_time?.slice(0,10) || "—"
  const days = trades.length ? Math.ceil((new Date(lastDate)-new Date(firstDate))/(86400000))+1 : 0
  const tradesPerDay = days>0 ? (trades.length/days).toFixed(1) : "—"

  return (
    <SectionCard title="Summary — 20 Key Metrics" icon={BarChart3} color="#6c63ff">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label:"Net P&L",         value: fmtP(netPnl),          color: clr(netPnl) },
          { label:"Gross P&L",       value: fmtP(gross),           color: clr(gross) },
          { label:"Total Fees",      value: `-$${fees.toFixed(2)}`, color: C.warning },
          { label:"Win Rate",        value: `${wr.toFixed(1)}%`,   color: wr>=50?C.success:C.danger },
          { label:"Profit Factor",   value: pf>=99?"∞":pf.toFixed(2), color: pf>=1?C.success:C.danger },
          { label:"Expectancy/Trade",value: fmtP(exp),             color: clr(exp) },
          { label:"Total Trades",    value: trades.length,         color: C.accent },
          { label:"Wins",            value: wins.length,           color: C.success },
          { label:"Losses",          value: losses.length,         color: C.danger },
          { label:"Breakeven",       value: be.length,             color: C.muted },
          { label:"Avg Win",         value: `$${avgW.toFixed(2)}`, color: C.success },
          { label:"Avg Loss",        value: `$${avgL.toFixed(2)}`, color: C.danger },
          { label:"Best Streak",     value: `${maxWin}W`,          color: C.success },
          { label:"Worst Streak",    value: `${maxLoss}L`,         color: C.danger },
          { label:"Max Drawdown",    value: `$${Math.abs(maxDD).toFixed(2)}`, color: C.warning },
          { label:"Max DD %",        value: `${Math.abs(maxDDPct).toFixed(1)}%`, color: C.warning },
          { label:"Avg Pips/Trade",  value: avgPips.toFixed(1),    color: "var(--text-primary)" },
          { label:"Avg Lot Size",    value: avgLots.toFixed(2),    color: "var(--text-primary)" },
          { label:"Avg Quality",     value: `${avgQ.toFixed(1)}/10`, color: avgQ>=6?C.success:avgQ>=4?C.warning:C.danger },
          { label:"Trades/Day",      value: tradesPerDay,          color: "var(--text-primary)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3" style={{ background:"var(--bg-elevated)" }}>
            <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>{s.label}</p>
            <p className="font-bold text-sm" style={{ color:s.color, fontFamily:"var(--font-mono)" }}>{s.value}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── SECTION: Symbol Analysis ──────────────────────────────────────────────────
function SymbolSection({ trades }) {
  const rows = useMemo(() => {
    return groupBy(trades, "symbol", "symbol").sort((a,b) => b.trades - a.trades).map(g => {
      const symT  = trades.filter(t => t.symbol === g.label)
      const wins  = symT.filter(t => t.outcome==="WIN")
      const losses= symT.filter(t => t.outcome==="LOSS")
      const avgW  = wins.length   ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length   : 0
      const avgL  = losses.length ? Math.abs(losses.reduce((s,t)=>s+t.pnl,0)/losses.length) : 0
      return { ...g, avgWin:parseFloat(avgW.toFixed(2)), avgLoss:parseFloat(avgL.toFixed(2)),
               pips: parseFloat(g.pips.toFixed(1)), fees: parseFloat(g.fees.toFixed(2)) }
    })
  }, [trades])

  const cols = [
    { key:"label",       label:"Symbol",       color:()=>C.accent },
    { key:"trades",      label:"Trades" },
    { key:"pnl",         label:"Net P&L",      color:v=>clr(v), fmt:v=>fmtP(v) },
    { key:"winRate",     label:"Win Rate",      color:v=>v>=50?C.success:C.danger, fmt:v=>`${v}%` },
    { key:"profitFactor",label:"P.Factor",      color:v=>v>=1?C.success:C.danger },
    { key:"avgPnl",      label:"Avg P&L",       color:v=>clr(v), fmt:v=>fmtP(v) },
    { key:"avgWin",      label:"Avg Win",       color:()=>C.success, fmt:v=>`$${v}` },
    { key:"avgLoss",     label:"Avg Loss",      color:()=>C.danger, fmt:v=>`$${v}` },
    { key:"pips",        label:"Total Pips",    color:v=>clr(v) },
    { key:"fees",        label:"Fees",          color:()=>C.warning, fmt:v=>`$${v}` },
  ]

  const chartData = rows.slice(0,10)

  return (
    <SectionCard title="By Symbol" icon={BarChart3} color="#00d4aa"
      onExport={() => exportCSV("by_symbol.csv", cols, rows)}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barCategoryGap="20%">
            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
            <XAxis dataKey="label" tick={{ fill:C.textSec, fontSize:10 }}/>
            <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
            <Tooltip {...tip()} formatter={v=>[`$${v}`,"P&L"]}/>
            <Bar dataKey="pnl" radius={[4,4,0,0]}>
              {chartData.map((d,i) => <Cell key={i} fill={d.pnl>=0?C.success:C.danger}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} barCategoryGap="20%">
            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
            <XAxis dataKey="label" tick={{ fill:C.textSec, fontSize:10 }}/>
            <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`${v}%`}/>
            <Tooltip {...tip()} formatter={v=>[`${v}%`,"Win Rate"]}/>
            <Bar dataKey="winRate" radius={[4,4,0,0]}>
              {chartData.map((d,i) => <Cell key={i} fill={d.winRate>=50?C.success:C.danger}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable cols={cols} rows={rows}/>
    </SectionCard>
  )
}

// ─── SECTION: Time Analysis ────────────────────────────────────────────────────
function TimeSection({ trades }) {
  // By hour of day
  const hourData = useMemo(() => {
    const map = {}
    trades.forEach(t => {
      const h = new Date(t.entry_time).getUTCHours()
      if (!map[h]) map[h] = { hour:`${String(h).padStart(2,"0")}:00`, pnl:0, trades:0, wins:0 }
      map[h].pnl    += t.pnl
      map[h].trades += 1
      if (t.outcome==="WIN") map[h].wins++
    })
    return Array.from({length:24},(_,h)=>{
      const d = map[h] || { hour:`${String(h).padStart(2,"0")}:00`, pnl:0, trades:0, wins:0 }
      return { ...d, pnl:parseFloat(d.pnl.toFixed(2)), winRate:d.trades?parseFloat((d.wins/d.trades*100).toFixed(1)):0 }
    })
  }, [trades])

  // By day of week
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const dowData = useMemo(() => {
    const map = {}
    DOW.forEach(d => map[d] = { day:d, pnl:0, trades:0, wins:0 })
    trades.forEach(t => {
      const d = DOW[new Date(t.entry_time).getUTCDay()]
      map[d].pnl    += t.pnl
      map[d].trades += 1
      if (t.outcome==="WIN") map[d].wins++
    })
    return DOW.map(d => ({ ...map[d], pnl:parseFloat(map[d].pnl.toFixed(2)),
      winRate:map[d].trades?parseFloat((map[d].wins/map[d].trades*100).toFixed(1)):0 }))
  }, [trades])

  // By session
  const sessionData = groupBy(trades, "session", "session").sort((a,b)=>b.pnl-a.pnl)

  // By timeframe
  const tfData = groupBy(trades, "timeframe", "timeframe").sort((a,b)=>b.pnl-a.pnl)

  return (
    <SectionCard title="Time Analysis" icon={Clock} color="#ffa502">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>P&L by Hour (UTC)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourData} barCategoryGap="5%">
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="hour" tick={{ fill:C.muted, fontSize:8 }} interval={3}/>
              <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...tip()} formatter={v=>[`$${v}`,"P&L"]}/>
              <Bar dataKey="pnl" radius={[2,2,0,0]}>
                {hourData.map((d,i) => <Cell key={i} fill={d.pnl>=0?C.success:C.danger}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>P&L by Day of Week</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dowData} barCategoryGap="20%">
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="day" tick={{ fill:C.textSec, fontSize:11 }}/>
              <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...tip()} formatter={v=>[`$${v}`,"P&L"]}/>
              <Bar dataKey="pnl" radius={[4,4,0,0]}>
                {dowData.map((d,i) => <Cell key={i} fill={d.pnl>=0?C.success:C.danger}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>By Session</p>
          <DataTable cols={[
            { key:"label", label:"Session", color:()=>C.accent },
            { key:"trades", label:"Trades" },
            { key:"pnl", label:"P&L", color:v=>clr(v), fmt:v=>fmtP(v) },
            { key:"winRate", label:"Win Rate", color:v=>v>=50?C.success:C.danger, fmt:v=>`${v}%` },
            { key:"profitFactor", label:"P.Factor", color:v=>v>=1?C.success:C.danger },
          ]} rows={sessionData} maxRows={10}/>
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>By Timeframe</p>
          <DataTable cols={[
            { key:"label", label:"TF", color:()=>C.accent },
            { key:"trades", label:"Trades" },
            { key:"pnl", label:"P&L", color:v=>clr(v), fmt:v=>fmtP(v) },
            { key:"winRate", label:"Win Rate", color:v=>v>=50?C.success:C.danger, fmt:v=>`${v}%` },
            { key:"profitFactor", label:"P.Factor", color:v=>v>=1?C.success:C.danger },
          ]} rows={tfData} maxRows={10}/>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── SECTION: Direction Analysis ──────────────────────────────────────────────
function DirectionSection({ trades }) {
  const buys  = trades.filter(t => t.direction==="BUY")
  const sells = trades.filter(t => t.direction==="SELL")

  const dirStats = ["BUY","SELL"].map(dir => {
    const group = trades.filter(t => t.direction===dir)
    const w = group.filter(t=>t.outcome==="WIN")
    const l = group.filter(t=>t.outcome==="LOSS")
    const pnl = group.reduce((s,t)=>s+t.pnl,0)
    const avgW = w.length ? w.reduce((s,t)=>s+t.pnl,0)/w.length : 0
    const avgL = l.length ? Math.abs(l.reduce((s,t)=>s+t.pnl,0)/l.length) : 0
    return { direction:dir, trades:group.length, pnl:parseFloat(pnl.toFixed(2)),
      winRate:group.length?parseFloat((w.length/group.length*100).toFixed(1)):0,
      avgWin:parseFloat(avgW.toFixed(2)), avgLoss:parseFloat(avgL.toFixed(2)),
      profitFactor:avgL>0?parseFloat((avgW/avgL).toFixed(2)):avgW>0?99:0 }
  })

  const pieData = dirStats.filter(d=>d.trades>0).map(d => ({ name:d.direction, value:d.trades }))

  return (
    <SectionCard title="Direction Analysis" icon={TrendingUp} color="#2ed573">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center justify-center">
          <PieChart width={180} height={180}>
            <Pie data={pieData} cx={90} cy={90} innerRadius={50} outerRadius={80} dataKey="value">
              <Cell fill={C.success}/>
              <Cell fill={C.danger}/>
            </Pie>
            <Tooltip {...tip()}/>
            <Legend/>
          </PieChart>
        </div>
        <div className="md:col-span-2">
          <DataTable cols={[
            { key:"direction", label:"Direction", color:v=>v==="BUY"?C.success:C.danger },
            { key:"trades",    label:"Trades" },
            { key:"pnl",       label:"Net P&L",   color:v=>clr(v), fmt:v=>fmtP(v) },
            { key:"winRate",   label:"Win Rate",   color:v=>v>=50?C.success:C.danger, fmt:v=>`${v}%` },
            { key:"profitFactor",label:"P.Factor", color:v=>v>=1?C.success:C.danger },
            { key:"avgWin",    label:"Avg Win",    color:()=>C.success, fmt:v=>`$${v}` },
            { key:"avgLoss",   label:"Avg Loss",   color:()=>C.danger,  fmt:v=>`$${v}` },
          ]} rows={dirStats}/>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── SECTION: Quality & Tags Analysis ─────────────────────────────────────────
function QualitySection({ trades }) {
  // By quality score (1-10)
  const qualData = useMemo(() => {
    const map = {}
    for (let q=1; q<=10; q++) map[q] = { quality:`Q${q}`, score:q, pnl:0, trades:0, wins:0 }
    trades.forEach(t => {
      const q = t.quality || 5
      if (map[q]) { map[q].pnl+=t.pnl; map[q].trades+=1; if(t.outcome==="WIN")map[q].wins++ }
    })
    return Object.values(map).map(g => ({
      ...g, pnl:parseFloat(g.pnl.toFixed(2)),
      winRate:g.trades?parseFloat((g.wins/g.trades*100).toFixed(1)):0
    }))
  }, [trades])

  // By tag
  const tagData = useMemo(() => {
    const map = {}
    trades.forEach(t => {
      (t.tags||[]).forEach(tag => {
        if (!map[tag]) map[tag] = { tag, pnl:0, trades:0, wins:0 }
        map[tag].pnl    += t.pnl
        map[tag].trades += 1
        if (t.outcome==="WIN") map[tag].wins++
      })
    })
    return Object.values(map).sort((a,b)=>b.trades-a.trades).map(g => ({
      ...g, pnl:parseFloat(g.pnl.toFixed(2)),
      winRate:g.trades?parseFloat((g.wins/g.trades*100).toFixed(1)):0
    }))
  }, [trades])

  return (
    <SectionCard title="Quality & Tags Analysis" icon={Target} color="#6c63ff">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>P&L by Setup Quality (1–10)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={qualData} barCategoryGap="10%">
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="quality" tick={{ fill:C.textSec, fontSize:10 }}/>
              <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...tip()} formatter={v=>[`$${v}`,"P&L"]}/>
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {qualData.map((d,i) => <Cell key={i} fill={d.pnl>=0?C.success:d.trades>0?C.danger:C.muted}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>Win Rate by Quality</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={qualData}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="quality" tick={{ fill:C.textSec, fontSize:10 }}/>
              <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`${v}%`}/>
              <Tooltip {...tip()} formatter={v=>[`${v}%`,"Win Rate"]}/>
              <Line type="monotone" dataKey="winRate" stroke={C.accent} strokeWidth={2} dot={{ fill:C.accent, r:3 }}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      {tagData.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>Performance by Tag</p>
          <DataTable cols={[
            { key:"tag",      label:"Tag",      color:()=>C.accent },
            { key:"trades",   label:"Trades" },
            { key:"pnl",      label:"Net P&L",  color:v=>clr(v), fmt:v=>fmtP(v) },
            { key:"winRate",  label:"Win Rate",  color:v=>v>=50?C.success:C.danger, fmt:v=>`${v}%` },
          ]} rows={tagData}/>
        </div>
      )}
    </SectionCard>
  )
}

// ─── SECTION: Risk & Drawdown ──────────────────────────────────────────────────
function RiskSection({ trades }) {
  const { curve, maxDD, maxDDPct } = calcDrawdown(trades)
  const { maxWin, maxLoss, currentWin, currentLoss } = calcStreaks(trades)

  const wins   = trades.filter(t=>t.outcome==="WIN")
  const losses = trades.filter(t=>t.outcome==="LOSS")
  const avgW   = wins.length   ? wins.reduce((s,t)=>s+t.pnl,0)/wins.length   : 0
  const avgL   = losses.length ? Math.abs(losses.reduce((s,t)=>s+t.pnl,0)/losses.length) : 0
  const rr     = avgL>0 ? avgW/avgL : 0
  const fees   = trades.reduce((s,t)=>s+Math.abs(t.commission)+Math.abs(t.swap),0)

  // P&L distribution bins
  const pnls = trades.map(t=>t.pnl)
  const min=Math.min(...pnls,0), max=Math.max(...pnls,0)
  const bSize=(max-min||1)/12
  const hist = Array.from({length:12},(_,i)=>({
    range:`$${(min+i*bSize).toFixed(0)}`,
    count:0, positive:(min+i*bSize+bSize/2)>=0
  }))
  pnls.forEach(p=>{ const idx=Math.min(Math.floor((p-min)/bSize),11); hist[idx].count++ })

  return (
    <SectionCard title="Risk & Drawdown Analysis" icon={Shield} color="#ff4757">
      <StatGrid stats={[
        { label:"Max Drawdown $",  value:`$${Math.abs(maxDD).toFixed(2)}`,    color:C.danger },
        { label:"Max Drawdown %",  value:`${Math.abs(maxDDPct).toFixed(1)}%`, color:C.danger },
        { label:"Avg R:R",         value:rr.toFixed(2),                       color:rr>=1?C.success:C.danger },
        { label:"Best Win Streak", value:`${maxWin} trades`,                  color:C.success },
        { label:"Worst Loss Streak",value:`${maxLoss} trades`,                color:C.danger },
        { label:"Current Streak",  value:currentWin>0?`+${currentWin}W`:`-${currentLoss}L`,
          color:currentWin>0?C.success:C.danger },
        { label:"Total Fees",      value:`$${fees.toFixed(2)}`,               color:C.warning },
        { label:"Avg Win $",       value:`$${avgW.toFixed(2)}`,               color:C.success },
        { label:"Avg Loss $",      value:`$${avgL.toFixed(2)}`,               color:C.danger },
        { label:"Kelly Criterion", value:avgL>0?`${Math.max(0,((avgW/avgL)*(wins.length/trades.length||0)-(losses.length/trades.length||0))/(avgW/avgL)*100).toFixed(1)}%`:"—",
          color:C.accent },
      ]}/>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>Equity Drawdown Curve</p>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={curve}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.danger} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={C.danger} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="date" tick={{ fill:C.muted, fontSize:9 }} interval="preserveStartEnd"/>
              <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...tip()} formatter={v=>[`$${v}`,"Drawdown"]}/>
              <Area type="monotone" dataKey="dd" stroke={C.danger} strokeWidth={2} fill="url(#ddGrad)"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>P&L Distribution</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hist}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="range" tick={{ fill:C.muted, fontSize:8 }}/>
              <YAxis tick={{ fill:C.muted, fontSize:9 }}/>
              <Tooltip {...tip()} formatter={v=>[`${v} trades`,"Count"]}/>
              <Bar dataKey="count" radius={[3,3,0,0]}>
                {hist.map((d,i)=><Cell key={i} fill={d.positive?C.success:C.danger}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── SECTION: Monthly & Yearly Breakdown ──────────────────────────────────────
function CalendarSection({ trades }) {
  const monthlyData = useMemo(() => {
    const map = {}
    trades.forEach(t => {
      if (!t.entry_time) return
      const d = new Date(t.entry_time)
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
      if (!map[k]) map[k] = { month:k, year:d.getFullYear(), pnl:0, trades:0, wins:0, fees:0 }
      map[k].pnl    += t.pnl
      map[k].trades += 1
      map[k].fees   += Math.abs(t.commission)+Math.abs(t.swap)
      if (t.outcome==="WIN") map[k].wins++
    })
    return Object.values(map).sort((a,b)=>a.month.localeCompare(b.month)).map(m => ({
      ...m, pnl:parseFloat(m.pnl.toFixed(2)), fees:parseFloat(m.fees.toFixed(2)),
      winRate:parseFloat((m.wins/m.trades*100).toFixed(1)),
      avgPnl: parseFloat((m.pnl/m.trades).toFixed(2))
    }))
  }, [trades])

  const yearlyData = useMemo(() => {
    const map = {}
    monthlyData.forEach(m => {
      if (!map[m.year]) map[m.year] = { year:m.year, pnl:0, trades:0, wins:0, months:0 }
      map[m.year].pnl    += m.pnl
      map[m.year].trades += m.trades
      map[m.year].wins   += m.wins
      map[m.year].months += 1
    })
    return Object.values(map).sort((a,b)=>a.year-b.year).map(y => ({
      ...y, pnl:parseFloat(y.pnl.toFixed(2)),
      winRate:parseFloat((y.wins/y.trades*100).toFixed(1))
    }))
  }, [monthlyData])

  const monthlyCols = [
    { key:"month",    label:"Month" },
    { key:"trades",   label:"Trades" },
    { key:"pnl",      label:"Net P&L",   color:v=>clr(v), fmt:v=>fmtP(v) },
    { key:"winRate",  label:"Win Rate",   color:v=>v>=50?C.success:C.danger, fmt:v=>`${v}%` },
    { key:"avgPnl",   label:"Avg/Trade",  color:v=>clr(v), fmt:v=>fmtP(v) },
    { key:"wins",     label:"Wins",       color:()=>C.success },
    { key:"fees",     label:"Fees",       color:()=>C.warning, fmt:v=>`$${v}` },
  ]

  return (
    <SectionCard title="Monthly & Yearly Breakdown" icon={Calendar} color="#ffa502"
      onExport={() => exportCSV("monthly_breakdown.csv", monthlyCols, monthlyData)}>
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>Monthly P&L</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyData} barCategoryGap="15%">
            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
            <XAxis dataKey="month" tick={{ fill:C.muted, fontSize:9 }} interval="preserveStartEnd"/>
            <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
            <Tooltip {...tip()} formatter={v=>[`$${v}`,"P&L"]}/>
            <Bar dataKey="pnl" radius={[3,3,0,0]}>
              {monthlyData.map((d,i)=><Cell key={i} fill={d.pnl>=0?C.success:C.danger}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>Yearly Summary</p>
          <DataTable cols={[
            { key:"year",     label:"Year" },
            { key:"trades",   label:"Trades" },
            { key:"pnl",      label:"Net P&L",  color:v=>clr(v), fmt:v=>fmtP(v) },
            { key:"winRate",  label:"Win Rate",  color:v=>v>=50?C.success:C.danger, fmt:v=>`${v}%` },
          ]} rows={yearlyData} maxRows={10}/>
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>Monthly Details</p>
          <DataTable cols={monthlyCols} rows={monthlyData}/>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── SECTION: Equity Curve ────────────────────────────────────────────────────
function EquitySection({ trades }) {
  const sorted = useMemo(() =>
    [...trades].sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time)), [trades])

  let cum=0
  const curve = sorted.map((t,i) => {
    cum += t.pnl
    return {
      n:         i+1,
      date:      t.entry_time?.slice(0,10),
      symbol:    t.symbol,
      cum:       parseFloat(cum.toFixed(2)),
      tradePnl:  parseFloat(t.pnl.toFixed(2)),
      outcome:   t.outcome,
    }
  })

  // Scatter: entry time vs P&L
  const scatter = trades.map(t => ({
    hour:    new Date(t.entry_time).getUTCHours(),
    pnl:     parseFloat(t.pnl.toFixed(2)),
    outcome: t.outcome,
  }))

  return (
    <SectionCard title="Equity Curve & Trade Distribution" icon={Activity} color="#00d4aa">
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>Cumulative P&L</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={curve}>
            <defs>
              <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={C.success} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={C.success} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
            <XAxis dataKey="date" tick={{ fill:C.muted, fontSize:9 }} interval="preserveStartEnd"/>
            <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
            <Tooltip {...tip()} formatter={(v,n)=>[`$${v}`,n==="cum"?"Cumulative P&L":"Trade P&L"]}/>
            <Area type="monotone" dataKey="cum" stroke={C.success} strokeWidth={2} fill="url(#eqGrad)"/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>P&L by Entry Hour (scatter)</p>
        <ResponsiveContainer width="100%" height={160}>
          <ScatterChart>
            <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
            <XAxis dataKey="hour" type="number" domain={[0,23]} tick={{ fill:C.muted, fontSize:9 }} name="Hour (UTC)" tickFormatter={v=>`${v}h`}/>
            <YAxis dataKey="pnl" tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`} name="P&L"/>
            <Tooltip {...tip()} cursor={{ strokeDasharray:"3 3" }}/>
            <Scatter data={scatter.filter(d=>d.outcome==="WIN")}   fill={C.success} opacity={0.7} name="Win"/>
            <Scatter data={scatter.filter(d=>d.outcome==="LOSS")}  fill={C.danger}  opacity={0.7} name="Loss"/>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}

// ─── SECTION: Lot Size Analysis ────────────────────────────────────────────────
function LotSection({ trades }) {
  const tradesWithLots = trades.filter(t => t.lot_size > 0)
  if (tradesWithLots.length === 0) return null

  // Bucket by lot size
  const lots = tradesWithLots.map(t=>t.lot_size)
  const maxLot = Math.max(...lots)
  const buckets = [0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,99]
  const lotData = buckets.slice(0,-1).map((low,i) => {
    const high = buckets[i+1]
    const group = tradesWithLots.filter(t=>t.lot_size>=low&&t.lot_size<high)
    const pnl   = group.reduce((s,t)=>s+t.pnl,0)
    const wins  = group.filter(t=>t.outcome==="WIN").length
    return { label:`${low}–${high}`, trades:group.length, pnl:parseFloat(pnl.toFixed(2)),
      winRate:group.length?parseFloat((wins/group.length*100).toFixed(1)):0 }
  }).filter(d=>d.trades>0)

  return (
    <SectionCard title="Lot Size Analysis" icon={Zap} color="#ffa502">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>P&L by Lot Size</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={lotData}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="label" tick={{ fill:C.muted, fontSize:9 }}/>
              <YAxis tick={{ fill:C.muted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...tip()}/>
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {lotData.map((d,i)=><Cell key={i} fill={d.pnl>=0?C.success:C.danger}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <DataTable cols={[
          { key:"label",   label:"Lot Range" },
          { key:"trades",  label:"Trades" },
          { key:"pnl",     label:"Net P&L",  color:v=>clr(v), fmt:v=>fmtP(v) },
          { key:"winRate", label:"Win Rate",  color:v=>v>=50?C.success:C.danger, fmt:v=>`${v}%` },
        ]} rows={lotData}/>
      </div>
    </SectionCard>
  )
}

// ─── PERIOD FILTER ─────────────────────────────────────────────────────────────
const PERIODS = [
  { id:"all", label:t("period_all") },
  { id:"ytd", label:t("period_ytd") },
  { id:"1y",  label:t("period_1y") },
  { id:"6m",  label:t("period_6m") },
  { id:"3m",  label:t("period_3m") },
  { id:"1m",  label:t("period_1m") },
  { id:"1w",  label:t("period_1w") },
]

function applyPeriod(trades, id) {
  if (id === "all") return trades
  const now = Date.now()
  const ms  = { ytd:null, "1y":31536e6, "6m":15768e6, "3m":7884e6, "1m":2592e6, "1w":604800e3 }
  if (id === "ytd") {
    const start = new Date(new Date().getFullYear(), 0, 1).getTime()
    return trades.filter(t => new Date(t.entry_time).getTime() >= start)
  }
  const cutoff = now - ms[id]
  return trades.filter(t => new Date(t.entry_time).getTime() >= cutoff)
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const { t } = useLanguage()
  const [allTrades,  setAllTrades]  = useState([])
  const [period,     setPeriod]     = useState("all")
  const [filterSym,  setFilterSym]  = useState("ALL")
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    Trade.list().then(d => {
      setAllTrades((d||[]).map(safeTrade).filter(Boolean))
      setLoading(false)
    })
  }, [])

  const symbols = useMemo(() =>
    ["ALL", ...Array.from(new Set(allTrades.map(t=>t.symbol))).sort()], [allTrades])

  const trades = useMemo(() => {
    let t = applyPeriod(allTrades, period)
    if (filterSym !== "ALL") t = t.filter(x => x.symbol === filterSym)
    return t
  }, [allTrades, period, filterSym])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor:"var(--accent)" }}/>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)", fontFamily:"var(--font-display)" }}>
            {t("reports_title")}
          </h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
            {trades.length} trades · 50+ dimensions
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl p-3 mb-5 flex flex-col gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold flex-shrink-0" style={{ color:"var(--text-muted)" }}>PERIOD:</span>
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{ background:period===p.id?"var(--accent)":"var(--bg-elevated)",
                color:period===p.id?"#fff":"var(--text-secondary)",
                border:"1px solid", borderColor:period===p.id?"var(--accent)":"var(--border)" }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold flex-shrink-0" style={{ color:"var(--text-muted)" }}>SYMBOL:</span>
          {symbols.map(s => (
            <button key={s} onClick={() => setFilterSym(s)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
              style={{ background:filterSym===s?"var(--accent)":"var(--bg-elevated)",
                color:filterSym===s?"#fff":"var(--text-secondary)",
                border:"1px solid", borderColor:filterSym===s?"var(--accent)":"var(--border)" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <BarChart3 size={40} style={{ color:"var(--text-muted)" }}/>
          <p style={{ color:"var(--text-muted)" }}>No trades for this filter combination</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <SummarySection  trades={trades}/>
          <EquitySection   trades={trades}/>
          <SymbolSection   trades={trades}/>
          <TimeSection     trades={trades}/>
          <DirectionSection trades={trades}/>
          <QualitySection  trades={trades}/>
          <RiskSection     trades={trades}/>
          <CalendarSection trades={trades}/>
          <LotSection      trades={trades}/>
        </div>
      )}
    </div>
  )
}
