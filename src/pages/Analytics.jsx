import { useState, useEffect, useMemo } from "react"
import { useLanguage } from "@/lib/LanguageContext"
import { Trade, BrokerConnection } from "@/api/supabaseStore"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts"
import {
  TrendingUp, TrendingDown, Target, BarChart3, Activity,
  Calendar, ChevronDown, Clock, Layers, ArrowUpRight, ArrowDownRight
} from "lucide-react"
import HelpOverlay from "@/components/HelpOverlay"

// ─── Theme colors hook (resolves CSS vars for recharts SVG) ───────────────────
function useThemeColors() {
  const [C, setC] = useState({
    success:"#2ed573", danger:"#ff4757", accent:"#6c63ff",
    warning:"#ffa502", textMuted:"#4a4c5e", textSec:"#8b8d9e",
    textPri:"#f0f0f5", bgCard:"#16181f", bgElev:"#1c1e28", border:"#1e2030"
  })
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement)
      const g = v => s.getPropertyValue(v).trim()
      setC({
        success:  g("--accent-success")  || "#2ed573",
        danger:   g("--accent-danger")   || "#ff4757",
        accent:   g("--accent")          || "#6c63ff",
        warning:  g("--accent-warning")  || "#ffa502",
        textMuted:g("--text-muted")      || "#4a4c5e",
        textSec:  g("--text-secondary")  || "#8b8d9e",
        textPri:  g("--text-primary")    || "#f0f0f5",
        bgCard:   g("--bg-card")         || "#16181f",
        bgElev:   g("--bg-elevated")     || "#1c1e28",
        border:   g("--border")          || "#1e2030",
      })
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes:true, attributeFilter:["style"] })
    return () => obs.disconnect()
  }, [])
  return C
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeTrade(t) {
  if (!t || typeof t !== "object") return null
  try {
    const pnl = parseFloat(t.pnl) || 0
    let outcome = (t.outcome||"").toUpperCase()
    if (!["WIN","LOSS","BREAKEVEN"].includes(outcome))
      outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN"
    let direction = (t.direction||"").toUpperCase()
    if (!["BUY","SELL"].includes(direction)) direction = "BUY"
    let entry_time = t.entry_time
    try { if (!entry_time || isNaN(new Date(entry_time).getTime())) entry_time = new Date().toISOString() }
    catch { entry_time = new Date().toISOString() }
    return { ...t, symbol:(t.symbol||"UNKNOWN").toString().trim()||"UNKNOWN",
      direction, pnl:isNaN(pnl)?0:pnl, pips:parseFloat(t.pips)||0,
      entry_price:parseFloat(t.entry_price)||0, exit_price:parseFloat(t.exit_price)||0,
      quality:Math.min(10,Math.max(1,parseInt(t.quality)||5)),
      outcome, session:t.session||"UNKNOWN", timeframe:t.timeframe||"M15",
      commission:parseFloat(t.commission)||0, swap:parseFloat(t.swap)||0,
      rr:parseFloat(t.rr)||0, entry_time, notes:t.notes||"",
      screenshots:Array.isArray(t.screenshots)?t.screenshots:[] }
  } catch { return null }
}

// Period filter ranges
const PERIODS = [
  { id:"all",    label:"All Time" },
  { id:"1W",     label:"This Week" },
  { id:"LW",     label:"Last Week" },
  { id:"1M",     label:"This Month" },
  { id:"LM",     label:"Last Month" },
  { id:"3M",     label:"3 Months" },
  { id:"6M",     label:"6 Months" },
  { id:"YTD",    label:"This Year" },
]

function getPeriodRange(id) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (id === "all") return null
  if (id === "1W") {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay())
    return [start, now]
  }
  if (id === "LW") {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay() - 7)
    const end   = new Date(start); end.setDate(start.getDate() + 6)
    return [start, end]
  }
  if (id === "1M") return [new Date(now.getFullYear(), now.getMonth(), 1), now]
  if (id === "LM") {
    const start = new Date(now.getFullYear(), now.getMonth()-1, 1)
    const end   = new Date(now.getFullYear(), now.getMonth(), 0)
    return [start, end]
  }
  if (id === "3M") { const s = new Date(now); s.setMonth(now.getMonth()-3); return [s, now] }
  if (id === "6M") { const s = new Date(now); s.setMonth(now.getMonth()-6); return [s, now] }
  if (id === "YTD") return [new Date(now.getFullYear(), 0, 1), now]
  return null
}

function applyPeriod(trades, periodId) {
  const range = getPeriodRange(periodId)
  if (!range) return trades
  const [start, end] = range
  return trades.filter(t => {
    const d = new Date(t.entry_time)
    return d >= start && d <= end
  })
}

// ─── Reusable chart tooltip ────────────────────────────────────────────────────
function tip(C) {
  return {
    contentStyle: { background:C.bgElev, border:`1px solid ${C.border}`, borderRadius:8, color:C.textPri, fontSize:11 },
    cursor:{ stroke:C.border }
  }
}

// ─── Small helpers ────────────────────────────────────────────────────────────
const fmtPnl = (n) => `${n>=0?"+":""}$${Math.abs(n).toFixed(2)}`
const clr    = (C, n) => n >= 0 ? C.success : C.danger
const cssClr = (n)    => n >= 0 ? "var(--accent-success)" : "var(--accent-danger)"

function Empty({ text="Not enough data yet — log more trades." }) {
  return (
    <div className="flex items-center justify-center h-40 rounded-xl" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
      <p className="text-sm text-center px-4" style={{ color:"var(--text-muted)" }}>{text}</p>
    </div>
  )
}

function StatBox({ label, value, sub, color }) {
  return (
    <div className="rounded-xl p-4 flex-1 min-w-0" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>{label}</p>
      <p className="text-xl font-bold truncate" style={{ color:color||"var(--text-primary)" }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>{sub}</p>}
    </div>
  )
}

// ─── Breakdown table row ──────────────────────────────────────────────────────
function BdRow({ label, trades, totalPnl, rank }) {
  const wins   = trades.filter(t=>t.outcome==="WIN").length
  const losses = trades.filter(t=>t.outcome==="LOSS").length
  const pnl    = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const wr     = trades.length ? (wins/trades.length*100).toFixed(1) : 0
  const exp    = trades.length ? (pnl/trades.length).toFixed(2) : 0
  const comm   = trades.reduce((s,t)=>s+(t.commission||0),0)
  const barPct = totalPnl !== 0 ? Math.min(Math.abs(pnl/totalPnl)*100, 100) : 0
  return (
    <tr style={{ borderBottom:"1px solid var(--border)" }}
      onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold w-5 h-5 rounded flex items-center justify-center flex-shrink-0" style={{ background:"var(--bg-elevated)", color:"var(--text-muted)" }}>{rank}</span>
          <span className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{label}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-xs" style={{ color:"var(--text-secondary)" }}>{trades.length}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background:"var(--bg-elevated)", maxWidth:70 }}>
            <div className="h-full rounded-full" style={{ width:`${barPct}%`, background:pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}/>
          </div>
          <span className="text-sm font-bold" style={{ color:cssClr(pnl) }}>{fmtPnl(pnl)}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background:"var(--bg-elevated)" }}>
            <div className="h-full rounded-full" style={{ width:`${wr}%`, background:parseFloat(wr)>=50?"var(--accent-success)":"var(--accent-danger)" }}/>
          </div>
          <span className="text-xs font-bold" style={{ color:parseFloat(wr)>=50?"var(--accent-success)":"var(--accent-danger)" }}>{wr}%</span>
        </div>
      </td>
      <td className="px-3 py-3 text-xs" style={{ color:cssClr(parseFloat(exp)) }}>{fmtPnl(parseFloat(exp))}</td>
      <td className="px-3 py-3 text-xs" style={{ color:"var(--text-muted)" }}>{wins}W · {losses}L</td>
      {comm !== 0 && <td className="px-3 py-3 text-xs" style={{ color:"var(--text-muted)" }}>${Math.abs(comm).toFixed(2)}</td>}
    </tr>
  )
}

// ─── BREAKDOWN TAB ────────────────────────────────────────────────────────────
const BREAKDOWN_MODES = [
  { id:"daily",     label:"Daily",       icon:Calendar },
  { id:"weekly",    label:"Weekly",      icon:Layers },
  { id:"monthly",   label:"Monthly",     icon:Clock },
  { id:"pair",      label:"By Pair",     icon:Target },
  { id:"session",   label:"By Session",  icon:Activity },
  { id:"direction", label:"Direction",   icon:ArrowUpRight },
  { id:"timeframe", label:"Timeframe",   icon:BarChart3 },
]

function BreakdownTab({ trades }) {
  const { t } = useLanguage()
  const C = useThemeColors()
  const [mode, setMode] = useState("monthly")

  const groups = useMemo(() => {
    const map = {}
    trades.forEach(t => {
      let key
      const d = new Date(t.entry_time)
      if (mode === "daily")    key = d.toISOString().slice(0,10)
      else if (mode === "weekly") {
        const day   = d.getDay()
        const start = new Date(d); start.setDate(d.getDate() - day)
        key = `W/${start.toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"2-digit"})}`
      }
      else if (mode === "monthly")   key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
      else if (mode === "pair")      key = t.symbol || "UNKNOWN"
      else if (mode === "session")   key = t.session || "UNKNOWN"
      else if (mode === "direction") key = t.direction || "BUY"
      else if (mode === "timeframe") key = t.timeframe || "M15"
      if (!map[key]) map[key] = []
      map[key].push(t)
    })
    return Object.entries(map)
      .map(([label, ts]) => ({
        label,
        trades: ts,
        pnl:    ts.reduce((s,t)=>s+(t.pnl||0),0),
      }))
      .sort((a,b) => {
        if (mode==="daily"||mode==="weekly"||mode==="monthly") return a.label.localeCompare(b.label)
        return b.pnl - a.pnl
      })
  }, [trades, mode])

  const totalAbsPnl = groups.reduce((s,g)=>s+Math.abs(g.pnl),0)
  const chartData   = groups.map(g=>({ label:g.label.slice(-7), pnl:parseFloat(g.pnl.toFixed(2)) }))
  const totalPnl    = groups.reduce((s,g)=>s+g.pnl,0)
  const hasComm     = trades.some(t=>t.commission && t.commission!==0)

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        {BREAKDOWN_MODES.map(m=>(
          <button key={m.id} onClick={()=>setMode(m.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{ background:mode===m.id?"var(--accent)":"var(--bg-card)", color:mode===m.id?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:mode===m.id?"var(--accent)":"var(--border)" }}>
            <m.icon size={11}/>{m.label}
          </button>
        ))}
      </div>

      {/* Summary strip */}
      {groups.length > 0 && (
        <div className="flex flex-wrap gap-4 rounded-xl px-4 py-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Net P&L</p><p className="text-sm font-bold" style={{ color:cssClr(totalPnl) }}>{fmtPnl(totalPnl)}</p></div>
          <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Periods</p><p className="text-sm font-bold" style={{ color:"var(--text-primary)" }}>{groups.length}</p></div>
          <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Profitable</p><p className="text-sm font-bold" style={{ color:"var(--accent-success)" }}>{groups.filter(g=>g.pnl>0).length}</p></div>
          <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Unprofitable</p><p className="text-sm font-bold" style={{ color:"var(--accent-danger)" }}>{groups.filter(g=>g.pnl<0).length}</p></div>
          <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Best</p><p className="text-sm font-bold" style={{ color:"var(--accent-success)" }}>{fmtPnl(Math.max(...groups.map(g=>g.pnl)))}</p></div>
          <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Worst</p><p className="text-sm font-bold" style={{ color:"var(--accent-danger)" }}>{fmtPnl(Math.min(...groups.map(g=>g.pnl)))}</p></div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color:"var(--text-primary)" }}>
            P&L — {BREAKDOWN_MODES.find(m=>m.id===mode)?.label}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="label" tick={{ fill:C.textMuted, fontSize:9 }} interval="preserveStartEnd"/>
              <YAxis tick={{ fill:C.textMuted, fontSize:10 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...tip(C)} formatter={v=>[`$${parseFloat(v).toFixed(2)}`,"P&L"]}/>
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {chartData.map((d,i)=><Cell key={i} fill={d.pnl>=0?C.success:C.danger}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ranked table */}
      {groups.length > 0 ? (
        <div className="rounded-xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="px-5 py-3" style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
            <h3 className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>
              Ranked — {BREAKDOWN_MODES.find(m=>m.id===mode)?.label}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
                  {["Group","Trades","Net P&L","Win Rate","Expectancy","W / L", hasComm?"Fees":""].filter(Boolean).map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color:"var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g,i)=>(
                  <BdRow key={g.label} rank={i+1} label={g.label} trades={g.trades} totalPnl={totalAbsPnl}/>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : <Empty/>}
    </div>
  )
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ trades }) {
  const { t } = useLanguage()
  const C = useThemeColors()
  const sorted = [...trades].sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))
  let cum = 0
  const equityCurve = sorted.map(t=>({
    date: new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}),
    equity: parseFloat((cum+=t.pnl||0).toFixed(2))
  }))

  const wins   = trades.filter(t=>t.outcome==="WIN").length
  const losses = trades.filter(t=>t.outcome==="LOSS").length
  const bes    = trades.filter(t=>t.outcome==="BREAKEVEN").length
  const donut  = [
    { name:"WIN", value:wins, color:C.success },
    { name:"LOSS", value:losses, color:C.danger },
    { name:"BREAKEVEN", value:bes, color:C.accent },
  ].filter(d=>d.value>0)

  const byDay = {}
  trades.forEach(t=>{ if(!t.entry_time) return; const d=new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}); byDay[d]=(byDay[d]||0)+(t.pnl||0) })
  const dailyBars = Object.entries(byDay).map(([date,pnl])=>({ date, pnl:parseFloat(pnl.toFixed(2)) }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Equity Curve</h3>
          {equityCurve.length>1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.accent} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                <XAxis dataKey="date" tick={{ fill:C.textMuted, fontSize:10 }} interval="preserveStartEnd"/>
                <YAxis tick={{ fill:C.textMuted, fontSize:10 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...tip(C)} formatter={v=>[`$${v}`,"Equity"]}/>
                <Area type="monotone" dataKey="equity" stroke={C.accent} strokeWidth={2} fill="url(#eqGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Outcome Distribution</h3>
          {donut.length>0 ? (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie data={donut} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                    {donut.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip {...tip(C)} formatter={(v,n)=>[`${v} trades`,n]}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-1">
                {donut.map(d=>(
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background:d.color }}/>
                    <span className="text-xs" style={{ color:"var(--text-secondary)" }}>{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty text="Log trades to see distribution"/>}
        </div>
      </div>

      <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Daily P&L</h3>
        {dailyBars.length>0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyBars}>
              <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
              <XAxis dataKey="date" tick={{ fill:C.textMuted, fontSize:10 }} interval="preserveStartEnd"/>
              <YAxis tick={{ fill:C.textMuted, fontSize:10 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...tip(C)} formatter={v=>[`$${v}`,"P&L"]}/>
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {dailyBars.map((d,i)=><Cell key={i} fill={d.pnl>=0?C.success:C.danger}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty/>}
      </div>
    </div>
  )
}

// ─── PERFORMANCE TAB ──────────────────────────────────────────────────────────
function PerformanceTab({ trades }) {
  const { t } = useLanguage()
  const C = useThemeColors()

  const group = (key, label) => {
    const map = {}
    trades.forEach(t=>{ const k=t[key]||"UNKNOWN"; if(!map[k]) map[k]={[label]:k,pnl:0,trades:0,wins:0}; map[k].pnl+=t.pnl||0; map[k].trades+=1; if(t.outcome==="WIN") map[k].wins++ })
    return Object.values(map).map(s=>({ ...s, pnl:parseFloat(s.pnl.toFixed(2)), winRate:parseFloat((s.wins/s.trades*100).toFixed(1)) }))
  }

  const sessionData = group("session","session").sort((a,b)=>b.pnl-a.pnl)
  const symbolData  = group("symbol","symbol").sort((a,b)=>b.pnl-a.pnl)
  const tfData      = group("timeframe","tf").sort((a,b)=>b.pnl-a.pnl)

  const MiniChart = ({ data, key1 }) => (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" tick={{ fill:C.textMuted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
        <YAxis dataKey={key1} type="category" tick={{ fill:C.textSec, fontSize:11 }} width={80}/>
        <Tooltip {...tip(C)} formatter={v=>[`$${v}`,"P&L"]}/>
        <Bar dataKey="pnl" radius={[0,3,3,0]}>
          {data.map((d,i)=><Cell key={i} fill={d.pnl>=0?C.success:C.danger}/>)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color:"var(--text-primary)" }}>By Session</h3>
          {sessionData.length>0 ? <MiniChart data={sessionData} key1="session"/> : <Empty/>}
        </div>
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color:"var(--text-primary)" }}>By Pair</h3>
          {symbolData.length>0 ? <MiniChart data={symbolData.slice(0,8)} key1="symbol"/> : <Empty/>}
        </div>
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-3" style={{ color:"var(--text-primary)" }}>By Timeframe</h3>
          {tfData.length>0 ? <MiniChart data={tfData} key1="tf"/> : <Empty/>}
        </div>
      </div>

      {/* Symbol table */}
      <div className="rounded-xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-3" style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
          <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>Performance by Pair</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
              {["Pair","Trades","Net P&L","Win Rate","Avg Win","Avg Loss","Expectancy"].map(h=>(
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color:"var(--text-muted)" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {symbolData.map(s=>{
                const sWins  = trades.filter(t=>t.symbol===s.symbol&&t.outcome==="WIN")
                const sLoss  = trades.filter(t=>t.symbol===s.symbol&&t.outcome==="LOSS")
                const avgW   = sWins.length  ? sWins.reduce((a,t)=>a+(t.pnl||0),0)/sWins.length   : 0
                const avgL   = sLoss.length  ? Math.abs(sLoss.reduce((a,t)=>a+(t.pnl||0),0)/sLoss.length) : 0
                return (
                  <tr key={s.symbol} style={{ borderBottom:"1px solid var(--border)" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td className="px-4 py-3 font-bold" style={{ color:"var(--text-primary)" }}>{s.symbol}</td>
                    <td className="px-4 py-3 text-xs" style={{ color:"var(--text-secondary)" }}>{s.trades}</td>
                    <td className="px-4 py-3 font-semibold text-xs" style={{ color:cssClr(s.pnl) }}>{fmtPnl(s.pnl)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background:"var(--bg-elevated)" }}>
                          <div className="h-full rounded-full" style={{ width:`${s.winRate}%`, background:s.winRate>=50?"var(--accent-success)":"var(--accent-danger)" }}/>
                        </div>
                        <span className="text-xs" style={{ color:s.winRate>=50?"var(--accent-success)":"var(--accent-danger)" }}>{s.winRate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color:"var(--accent-success)" }}>${avgW.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color:"var(--accent-danger)" }}>${avgL.toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs" style={{ color:cssClr(s.pnl/s.trades) }}>{fmtPnl(s.pnl/s.trades)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── PATTERNS TAB ─────────────────────────────────────────────────────────────
function PatternsTab({ trades }) {
  const { t } = useLanguage()
  const C = useThemeColors()

  const dowMap = {0:"Sun",1:"Mon",2:"Tue",3:"Wed",4:"Thu",5:"Fri",6:"Sat"}
  const byDow  = {}
  trades.forEach(t=>{ if(!t.entry_time) return; const n=dowMap[new Date(t.entry_time).getDay()]; if(!byDow[n]) byDow[n]={day:n,wins:0,total:0}; byDow[n].total++; if(t.outcome==="WIN") byDow[n].wins++ })
  const dowData = ["Mon","Tue","Wed","Thu","Fri"].filter(d=>byDow[d]).map(d=>({ day:d, winRate:parseFloat((byDow[d].wins/byDow[d].total*100).toFixed(1)), trades:byDow[d].total }))

  const dirData = ["BUY","SELL"].map(dir=>{ const t=trades.filter(x=>x.direction===dir); const pnl=t.reduce((s,x)=>s+(x.pnl||0),0); return { dir, trades:t.length, pnl:parseFloat(pnl.toFixed(2)), winRate:t.length?parseFloat((t.filter(x=>x.outcome==="WIN").length/t.length*100).toFixed(1)):0 } }).filter(d=>d.trades>0)

  const qualityScatter = trades.filter(t=>t.quality&&t.pnl!==undefined).map(t=>({ quality:parseInt(t.quality)||0, pnl:parseFloat((t.pnl||0).toFixed(2)) }))

  const sorted=[...trades].sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))
  let maxW=0,maxL=0,cW=0,cL=0
  sorted.forEach(t=>{ if(t.outcome==="WIN"){cW++;cL=0;maxW=Math.max(maxW,cW)} else if(t.outcome==="LOSS"){cL++;cW=0;maxL=Math.max(maxL,cL)} else{cW=0;cL=0} })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Win Rate by Day of Week</h3>
          {dowData.length>0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dowData}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                <XAxis dataKey="day" tick={{ fill:C.textMuted, fontSize:10 }}/>
                <YAxis tick={{ fill:C.textMuted, fontSize:10 }} tickFormatter={v=>`${v}%`} domain={[0,100]}/>
                <Tooltip {...tip(C)} formatter={v=>[`${v}%`,"Win Rate"]}/>
                <Bar dataKey="winRate" radius={[3,3,0,0]}>
                  {dowData.map((d,i)=><Cell key={i} fill={d.winRate>=50?C.success:C.danger}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>BUY vs SELL</h3>
          <div className="space-y-3 mt-2">
            {dirData.map(d=>(
              <div key={d.dir} className="rounded-xl p-4" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm px-2 py-0.5 rounded"
                    style={{ background:d.dir==="BUY"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)", color:d.dir==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                    {d.dir==="BUY"?"▲ BUY":"▼ SELL"}
                  </span>
                  <span className="text-sm font-bold" style={{ color:cssClr(d.pnl) }}>{fmtPnl(d.pnl)}</span>
                </div>
                <div className="flex gap-4 text-xs" style={{ color:"var(--text-muted)" }}>
                  <span>{d.trades} trades</span>
                  <span style={{ color:d.winRate>=50?"var(--accent-success)":"var(--accent-danger)" }}>{d.winRate}% WR</span>
                </div>
              </div>
            ))}
            {dirData.length===0 && <Empty/>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Quality vs P&L</h3>
          {qualityScatter.length>1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                <XAxis dataKey="quality" type="number" domain={[0,11]} tick={{ fill:C.textMuted, fontSize:10 }}/>
                <YAxis dataKey="pnl" tick={{ fill:C.textMuted, fontSize:10 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...tip(C)} formatter={(v,n)=>[n==="pnl"?`$${v}`:v, n==="pnl"?"P&L":"Quality"]}/>
                <Scatter data={qualityScatter} fill={C.accent} fillOpacity={0.7}/>
              </ScatterChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Streaks</h3>
          <div className="space-y-3">
            {[
              { label:"Best Win Streak",  value:maxW, color:"var(--accent-success)", bg:"rgba(46,213,115,0.1)"  },
              { label:"Worst Loss Streak",value:maxL, color:"var(--accent-danger)",  bg:"rgba(255,71,87,0.1)"   },
              { label:"Total Trades",     value:trades.length, color:"var(--accent)", bg:"rgba(108,99,255,0.1)" },
            ].map(s=>(
              <div key={s.label} className="flex items-center justify-between p-3 rounded-xl" style={{ background:s.bg }}>
                <span className="text-sm" style={{ color:"var(--text-secondary)" }}>{s.label}</span>
                <span className="text-2xl font-bold" style={{ color:s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ADVANCED TAB ─────────────────────────────────────────────────────────────
function AdvancedTab({ trades }) {
  const { t } = useLanguage()
  const C = useThemeColors()
  const sorted=[...trades].sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))

  let peak=0,cum=0
  const drawdownData=sorted.map(t=>{ cum+=t.pnl||0; peak=Math.max(peak,cum); const dd=peak>0?parseFloat(((cum-peak)/peak*100).toFixed(2)):0; return { date:new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}), drawdown:dd } })

  const pnls=trades.map(t=>t.pnl||0); const min=Math.min(...pnls,0); const max=Math.max(...pnls,0)
  const bins=10; const bSize=(max-min||1)/bins
  const hist=Array.from({length:bins},(_,i)=>({ range:parseFloat((min+i*bSize).toFixed(1)), count:0, positive:(min+i*bSize+bSize/2)>=0 }))
  pnls.forEach(p=>{ const idx=Math.min(Math.floor((p-min)/bSize),bins-1); if(hist[idx]) hist[idx].count++ })

  const monthMap={}
  trades.forEach(t=>{ if(!t.entry_time) return; const d=new Date(t.entry_time); const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; if(!monthMap[k]) monthMap[k]={month:k,pnl:0,trades:0,wins:0,commission:0}; monthMap[k].pnl+=t.pnl||0; monthMap[k].trades+=1; monthMap[k].commission+=t.commission||0; if(t.outcome==="WIN") monthMap[k].wins++ })
  const monthlyData=Object.values(monthMap).sort((a,b)=>a.month.localeCompare(b.month)).map(m=>({ ...m, pnl:parseFloat(m.pnl.toFixed(2)), winRate:parseFloat((m.wins/m.trades*100).toFixed(1)) }))

  const wins=trades.filter(t=>t.outcome==="WIN"); const losses=trades.filter(t=>t.outcome==="LOSS")
  const avgWin=wins.length?wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length:0
  const avgLoss=losses.length?Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length):0
  const grossP=wins.reduce((s,t)=>s+(t.pnl||0),0); const grossL=Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0))
  const maxDD=drawdownData.length?Math.min(...drawdownData.map(d=>d.drawdown)):0
  const totalComm=trades.reduce((s,t)=>s+(t.commission||0),0)
  const totalSwap=trades.reduce((s,t)=>s+(t.swap||0),0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { label:"Avg Win",       value:`$${avgWin.toFixed(2)}`,   color:"var(--accent-success)"  },
          { label:"Avg Loss",      value:`$${avgLoss.toFixed(2)}`,  color:"var(--accent-danger)"   },
          { label:"Profit Factor", value:avgLoss>0?(grossP/grossL).toFixed(2):avgWin>0?"∞":"0", color:"var(--accent)" },
          { label:"Expectancy",    value:trades.length?`$${(trades.reduce((s,t)=>s+(t.pnl||0),0)/trades.length).toFixed(2)}`:"—", color:"var(--text-primary)" },
          { label:"Max Drawdown",  value:`${maxDD.toFixed(1)}%`,    color:"var(--accent-warning)"  },
          { label:"Gross Profit",  value:`$${grossP.toFixed(2)}`,   color:"var(--accent-success)"  },
          { label:"Gross Loss",    value:`$${grossL.toFixed(2)}`,   color:"var(--accent-danger)"   },
          { label:"Total Fees",    value:`$${Math.abs(totalComm+totalSwap).toFixed(2)}`, color:"var(--text-muted)" },
        ].map(m=>(
          <div key={m.label} className="rounded-xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>{m.label}</p>
            <p className="text-lg font-bold" style={{ color:m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Drawdown (%)</h3>
          {drawdownData.length>1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={drawdownData}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.danger} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={C.danger} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                <XAxis dataKey="date" tick={{ fill:C.textMuted, fontSize:10 }} interval="preserveStartEnd"/>
                <YAxis tick={{ fill:C.textMuted, fontSize:10 }} tickFormatter={v=>`${v}%`}/>
                <Tooltip {...tip(C)} formatter={v=>[`${v}%`,"Drawdown"]}/>
                <Area type="monotone" dataKey="drawdown" stroke={C.danger} strokeWidth={2} fill="url(#ddGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>P&L Distribution</h3>
          {trades.length>2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hist}>
                <CartesianGrid stroke={C.border} strokeDasharray="3 3"/>
                <XAxis dataKey="range" tick={{ fill:C.textMuted, fontSize:9 }} tickFormatter={v=>`$${v}`}/>
                <YAxis tick={{ fill:C.textMuted, fontSize:10 }}/>
                <Tooltip {...tip(C)} formatter={v=>[`${v} trades`,"Count"]}/>
                <Bar dataKey="count" radius={[3,3,0,0]}>
                  {hist.map((d,i)=><Cell key={i} fill={d.positive?C.success:C.danger}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
      </div>

      {/* Monthly table */}
      {monthlyData.length>0 && (
        <div className="rounded-xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="px-5 py-3" style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
            <h3 className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>Monthly Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
                {["Month","Trades","Net P&L","Win Rate","Fees"].map(h=>(
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color:"var(--text-muted)" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {monthlyData.map(m=>(
                  <tr key={m.month} style={{ borderBottom:"1px solid var(--border)" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td className="px-4 py-3 font-semibold text-xs" style={{ color:"var(--text-primary)" }}>{m.month}</td>
                    <td className="px-4 py-3 text-xs" style={{ color:"var(--text-secondary)" }}>{m.trades}</td>
                    <td className="px-4 py-3 font-bold text-xs" style={{ color:cssClr(m.pnl) }}>{fmtPnl(m.pnl)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 rounded-full overflow-hidden" style={{ background:"var(--bg-elevated)" }}>
                          <div className="h-full rounded-full" style={{ width:`${m.winRate}%`, background:m.winRate>=50?"var(--accent-success)":"var(--accent-danger)" }}/>
                        </div>
                        <span className="text-xs" style={{ color:m.winRate>=50?"var(--accent-success)":"var(--accent-danger)" }}>{m.winRate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color:"var(--text-muted)" }}>${Math.abs(m.commission||0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id:"Breakdown",  label:"📊 Breakdown" },
  { id:"Overview",   label:"Overview"   },
  { id:"Performance",label:"Performance"},
  { id:"Patterns",   label:"Patterns"   },
  { id:"Advanced",   label:"Advanced"   },
  { id:"MAE/MFE",    label:"📐 MAE/MFE"  },
]


// ─── MAE / MFE Tab ────────────────────────────────────────────────────────────
function MaeMfeTab({ trades }) {
  const { t } = useLanguage()
  const C = useThemeColors()

  // Filter to trades that have MAE/MFE data
  const withData = trades.filter(tr => tr.mae != null && tr.mfe != null)

  // Derived metrics per trade
  const enriched = withData.map(tr => {
    const pnl = parseFloat(tr.pnl)  || 0
    const mae = parseFloat(tr.mae)  || 0
    const mfe = parseFloat(tr.mfe)  || 0
    const captureRatio  = mfe > 0 ? Math.max(0, Math.min(100, pnl / mfe * 100)) : null
    const entryEff      = mfe > 0 ? Math.max(0, Math.min(100, pnl / mfe * 100)) : null
    const exitEff       = (mfe - (-mae)) > 0
      ? Math.max(0, Math.min(100, (pnl - (-mae)) / (mfe - (-mae)) * 100))
      : null
    return { ...tr, pnl, mae, mfe, captureRatio, entryEff, exitEff }
  })

  // Averages
  const avgCaptureRatio = enriched.length
    ? enriched.filter(t => t.captureRatio !== null).reduce((s,t) => s + (t.captureRatio||0), 0) / enriched.filter(t => t.captureRatio !== null).length
    : 0
  const avgExitEff = enriched.length
    ? enriched.filter(t => t.exitEff !== null).reduce((s,t) => s + (t.exitEff||0), 0) / enriched.filter(t => t.exitEff !== null).length
    : 0
  const avgMae = enriched.length
    ? enriched.reduce((s,t) => s + t.mae, 0) / enriched.length : 0
  const avgMfe = enriched.length
    ? enriched.reduce((s,t) => s + t.mfe, 0) / enriched.length : 0

  // Capture ratio histogram buckets
  const buckets = [
    { label:"0-20%",  min:0,  max:20  },
    { label:"20-40%", min:20, max:40  },
    { label:"40-60%", min:40, max:60  },
    { label:"60-80%", min:60, max:80  },
    { label:"80-100%",min:80, max:100 },
  ].map(b => ({
    ...b,
    count: enriched.filter(t => t.captureRatio !== null && t.captureRatio >= b.min && t.captureRatio < b.max).length
  }))

  // MFE vs PnL scatter
  const mfeScatter = enriched.map(t => ({ x: t.mfe, y: t.pnl, outcome: t.outcome }))
  // MAE vs PnL scatter
  const maeScatter = enriched.map(t => ({ x: t.mae, y: t.pnl, outcome: t.outcome }))

  if (withData.length === 0) {
    return (
      <div className="rounded-2xl p-12 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background:"rgba(108,99,255,0.1)" }}>
          <Target size={28} style={{ color:"var(--accent)" }}/>
        </div>
        <p className="text-lg font-bold mb-2" style={{ color:"var(--text-primary)" }}>No MAE/MFE Data Yet</p>
        <p className="text-sm" style={{ color:"var(--text-muted)", maxWidth:380, margin:"0 auto" }}>
          Start recording Maximum Adverse & Favorable Excursion when logging trades.
          Open any trade → Edit → fill in MAE/MFE fields.
        </p>
        <div className="grid grid-cols-2 gap-4 mt-8 max-w-md mx-auto text-left">
          <div className="rounded-xl p-4" style={{ background:"rgba(255,71,87,0.07)", border:"1px solid rgba(255,71,87,0.2)" }}>
            <p className="text-sm font-bold mb-1" style={{ color:"var(--accent-danger)" }}>↓ MAE</p>
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>How far price moved against you before turning. Measures stop placement quality.</p>
          </div>
          <div className="rounded-xl p-4" style={{ background:"rgba(46,213,115,0.07)", border:"1px solid rgba(46,213,115,0.2)" }}>
            <p className="text-sm font-bold mb-1" style={{ color:"var(--accent-success)" }}>↑ MFE</p>
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>How far price moved in your favor. Measures exit timing & profit capture.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>Trades with data</p>
          <p className="text-2xl font-bold" style={{ color:"var(--accent)" }}>{withData.length}</p>
          <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>of {trades.length} total</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>Avg Capture Ratio</p>
          <p className="text-2xl font-bold" style={{ color: avgCaptureRatio >= 50 ? C.success : C.warning }}>
            {avgCaptureRatio.toFixed(1)}%
          </p>
          <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>PnL / MFE</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>Avg MAE</p>
          <p className="text-2xl font-bold" style={{ color:"var(--accent-danger)" }}>
            -{avgMae.toFixed(2)}
          </p>
          <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>price units avg adverse</p>
        </div>
        <div className="rounded-2xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>Avg MFE</p>
          <p className="text-2xl font-bold" style={{ color:"var(--accent-success)" }}>
            +{avgMfe.toFixed(2)}
          </p>
          <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>price units avg favorable</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Capture Ratio Distribution */}
        <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <p className="font-semibold text-sm mb-1" style={{ color:"var(--text-primary)" }}>Capture Ratio Distribution</p>
          <p className="text-xs mb-4" style={{ color:"var(--text-muted)" }}>% of MFE you captured as final PnL</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={buckets} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
              <XAxis dataKey="label" tick={{ fontSize:11, fill:C.textMuted }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:11, fill:C.textMuted }} axisLine={false} tickLine={false} allowDecimals={false}/>
              <Tooltip contentStyle={{ background:C.bgElev, border:`1px solid ${C.border}`, borderRadius:8 }} labelStyle={{ color:C.textPri }} itemStyle={{ color:C.accent }}/>
              <Bar dataKey="count" name="Trades" radius={[6,6,0,0]}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={
                    b.min >= 60 ? C.success :
                    b.min >= 40 ? C.accent  :
                    b.min >= 20 ? C.warning : C.danger
                  }/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* MFE vs PnL Scatter */}
        <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <p className="font-semibold text-sm mb-1" style={{ color:"var(--text-primary)" }}>MFE vs P&L</p>
          <p className="text-xs mb-4" style={{ color:"var(--text-muted)" }}>Points above diagonal = left money on the table</p>
          <ResponsiveContainer width="100%" height={180}>
            <ScatterChart margin={{ top:4, right:8, bottom:4, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="x" name="MFE" type="number" tick={{ fontSize:10, fill:C.textMuted }} axisLine={false} tickLine={false} label={{ value:"MFE", position:"insideRight", offset:0, fontSize:10, fill:C.textMuted }}/>
              <YAxis dataKey="y" name="PnL" type="number" tick={{ fontSize:10, fill:C.textMuted }} axisLine={false} tickLine={false} label={{ value:"P&L", angle:-90, position:"insideLeft", offset:10, fontSize:10, fill:C.textMuted }}/>
              <Tooltip cursor={{ strokeDasharray:"3 3" }} contentStyle={{ background:C.bgElev, border:`1px solid ${C.border}`, borderRadius:8 }}
                formatter={(v, n) => [`${v.toFixed(2)}`, n]}/>
              <Scatter data={mfeScatter} fill={C.success} opacity={0.7}
                shape={props => <circle cx={props.cx} cy={props.cy} r={4} fill={props.payload.outcome==="WIN"?C.success:C.danger} opacity={0.75}/>}/>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* MAE vs PnL Scatter */}
        <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <p className="font-semibold text-sm mb-1" style={{ color:"var(--text-primary)" }}>MAE vs P&L</p>
          <p className="text-xs mb-4" style={{ color:"var(--text-muted)" }}>Large MAE + small PnL = tight stop or bad entry</p>
          <ResponsiveContainer width="100%" height={180}>
            <ScatterChart margin={{ top:4, right:8, bottom:4, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
              <XAxis dataKey="x" name="MAE" type="number" tick={{ fontSize:10, fill:C.textMuted }} axisLine={false} tickLine={false} label={{ value:"MAE (adverse)", position:"insideRight", offset:0, fontSize:10, fill:C.textMuted }}/>
              <YAxis dataKey="y" name="PnL" type="number" tick={{ fontSize:10, fill:C.textMuted }} axisLine={false} tickLine={false} label={{ value:"P&L", angle:-90, position:"insideLeft", offset:10, fontSize:10, fill:C.textMuted }}/>
              <Tooltip cursor={{ strokeDasharray:"3 3" }} contentStyle={{ background:C.bgElev, border:`1px solid ${C.border}`, borderRadius:8 }}
                formatter={(v, n) => [`${v.toFixed(2)}`, n]}/>
              <Scatter data={maeScatter}
                shape={props => <circle cx={props.cx} cy={props.cy} r={4} fill={props.payload.outcome==="WIN"?C.success:C.danger} opacity={0.75}/>}/>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Exit Efficiency Gauge */}
        <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <p className="font-semibold text-sm mb-1" style={{ color:"var(--text-primary)" }}>Exit Efficiency</p>
          <p className="text-xs mb-4" style={{ color:"var(--text-muted)" }}>(PnL − (−MAE)) / (MFE − (−MAE)) × 100%</p>
          <div className="flex flex-col items-center justify-center h-36 gap-3">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="48" fill="none" stroke="var(--bg-elevated)" strokeWidth="12"/>
                <circle cx="60" cy="60" r="48" fill="none"
                  stroke={avgExitEff >= 60 ? C.success : avgExitEff >= 35 ? C.warning : C.danger}
                  strokeWidth="12"
                  strokeDasharray={`${2 * Math.PI * 48 * Math.min(avgExitEff,100) / 100} 999`}
                  strokeLinecap="round"/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-black" style={{ color: avgExitEff >= 60 ? "var(--accent-success)" : avgExitEff >= 35 ? "var(--accent-warning)" : "var(--accent-danger)" }}>
                  {avgExitEff.toFixed(0)}%
                </p>
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>avg exit eff.</p>
              </div>
            </div>
            <p className="text-xs text-center" style={{ color:"var(--text-muted)" }}>
              {avgExitEff >= 65 ? "🎯 Strong exit discipline — you capture most of the move" :
               avgExitEff >= 40 ? "📊 Average — consider holding winning trades longer" :
               "⚠️ Early exits — you exit before capturing the full potential"}
            </p>
          </div>
        </div>
      </div>

      {/* Per-trade table */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <p className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>Per-Trade MAE/MFE Breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
                {["Symbol","Date","Outcome","PnL","MAE","MFE","Capture %","Exit Eff %"].map(h=>(
                  <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color:"var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.slice(0,20).map(tr=>(
                <tr key={tr.id} style={{ borderBottom:"1px solid var(--border)" }}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td className="px-4 py-3 font-bold" style={{ color:"var(--text-primary)" }}>{tr.symbol}</td>
                  <td className="px-4 py-3" style={{ color:"var(--text-muted)" }}>
                    {tr.entry_time ? new Date(tr.entry_time).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full font-semibold" style={{
                      background: tr.outcome==="WIN"?"rgba(46,213,115,0.12)":"rgba(255,71,87,0.12)",
                      color: tr.outcome==="WIN"?"var(--accent-success)":"var(--accent-danger)"
                    }}>{tr.outcome}</span>
                  </td>
                  <td className="px-4 py-3 font-bold font-mono" style={{ color:tr.pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                    {tr.pnl>=0?"+":""}${tr.pnl.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color:"var(--accent-danger)" }}>-{tr.mae.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono" style={{ color:"var(--accent-success)" }}>+{tr.mfe.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono" style={{ color: tr.captureRatio >= 50 ? C.success : C.warning }}>
                    {tr.captureRatio !== null ? `${tr.captureRatio.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono" style={{ color: tr.exitEff >= 50 ? C.success : C.warning }}>
                    {tr.exitEff !== null ? `${tr.exitEff.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function Analytics() {
  const { t } = useLanguage()
  const [allTrades,  setAllTrades]  = useState([])
  const [eaAccounts, setEaAccounts] = useState([])
  const [activeTab,  setActiveTab]  = useState("Breakdown")
  const [filterSym,  setFilterSym]  = useState("ALL")
  const [filterAcct, setFilterAcct] = useState("ALL")
  const [period,     setPeriod]     = useState("all")

  useEffect(()=>{
    Trade.list().then(d=>setAllTrades((d||[]).map(safeTrade).filter(Boolean)))
    BrokerConnection.list().then(d=>setEaAccounts((d||[]).filter(c=>c.is_mt5_live)))
  },[])

  const accounts = useMemo(()=>["ALL",...Array.from(new Set(allTrades.map(t=>t.account_login).filter(Boolean))).sort()],[allTrades])
  const symbols  = useMemo(()=>["ALL",...Array.from(new Set(allTrades.map(t=>t.symbol))).sort()],[allTrades])

  // Chain filters: account → period → symbol
  const trades = useMemo(()=>{
    let t = filterAcct==="ALL" ? allTrades : allTrades.filter(x=>(x.account_login||"MANUAL")===filterAcct)
    t = applyPeriod(t, period)
    t = filterSym==="ALL" ? t : t.filter(x=>x.symbol===filterSym)
    return t
  },[allTrades, filterAcct, period, filterSym])

  const activeAcctInfo = filterAcct==="ALL" ? null : eaAccounts.find(a=>a.mt5_login===filterAcct)

  // Summary stats
  const wins    = trades.filter(t=>t.outcome==="WIN")
  const losses  = trades.filter(t=>t.outcome==="LOSS")
  const netPnl  = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate = trades.length ? wins.length/trades.length*100 : 0
  const avgWin  = wins.length   ? wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length) : 0
  const pf      = avgLoss>0 ? avgWin/avgLoss : avgWin>0?99:0
  const exp     = trades.length ? netPnl/trades.length : 0
  let pk=0,c2=0,mDD=0
  trades.slice().sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time)).forEach(t=>{ c2+=t.pnl||0; pk=Math.max(pk,c2); if(pk>0) mDD=Math.min(mDD,(c2-pk)/pk*100) })
  const totalComm = trades.reduce((s,t)=>s+(t.commission||0),0)

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>Analytics</h1>
            <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
              {trades.length} trades{filterAcct!=="ALL"&&activeAcctInfo?` · ${activeAcctInfo.broker_name} #${filterAcct}`:""}
              {period!=="all" ? ` · ${PERIODS.find(p=>p.id===period)?.label}` : ""}
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-xl p-3 flex flex-col gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>

          {/* Period row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold flex-shrink-0" style={{ color:"var(--text-muted)" }}>PERIOD:</span>
            {PERIODS.map(p=>(
              <button key={p.id} onClick={()=>setPeriod(p.id)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background:period===p.id?"var(--accent)":"var(--bg-elevated)", color:period===p.id?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:period===p.id?"var(--accent)":"var(--border)" }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Account + Symbol row */}
          <div className="flex flex-wrap gap-2 items-center">
            {accounts.length > 1 && (
              <>
                <span className="text-xs font-bold flex-shrink-0" style={{ color:"var(--text-muted)" }}>ACCOUNT:</span>
                {accounts.map(a=>{
                  const info = a==="ALL" ? null : eaAccounts.find(acc=>acc.mt5_login===a)
                  return (
                    <button key={a} onClick={()=>{ setFilterAcct(a); setFilterSym("ALL") }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all"
                      style={{ background:filterAcct===a?"var(--accent)":"var(--bg-elevated)", color:filterAcct===a?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:filterAcct===a?"var(--accent)":"var(--border)" }}>
                      {a==="ALL" ? "All" : <><span className="w-1.5 h-1.5 rounded-full" style={{ background:info?.type==="live"?"var(--accent-success)":"var(--accent-warning)" }}/>{info?.broker_name||"MT5"} #{a}</>}
                    </button>
                  )
                })}
                <div className="w-px h-4 self-center" style={{ background:"var(--border)" }}/>
              </>
            )}
            <span className="text-xs font-bold flex-shrink-0" style={{ color:"var(--text-muted)" }}>SYMBOL:</span>
            {symbols.map(s=>(
              <button key={s} onClick={()=>setFilterSym(s)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background:filterSym===s?"var(--accent)":"var(--bg-elevated)", color:filterSym===s?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:filterSym===s?"var(--accent)":"var(--border)" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <StatBox label="Net P&L"      value={`${netPnl>=0?"+":""}$${netPnl.toFixed(2)}`} color={netPnl>=0?"var(--accent-success)":"var(--accent-danger)"}/>
        <StatBox label="Win Rate"     value={`${winRate.toFixed(1)}%`} sub={`${wins.length}W / ${losses.length}L`} color={winRate>=50?"var(--accent-success)":"var(--accent-danger)"}/>
        <StatBox label="Profit Factor"value={pf>=99?"∞":pf.toFixed(2)} color={pf>=1?"var(--accent-success)":"var(--accent-danger)"}/>
        <StatBox label="Expectancy"   value={`${exp>=0?"+":""}$${exp.toFixed(2)}`} sub="Per trade" color={exp>=0?"var(--accent-success)":"var(--accent-danger)"}/>
        <StatBox label="Max Drawdown" value={`${mDD.toFixed(1)}%`} color="var(--accent-warning)"/>
        <StatBox label="Avg R:R"      value={avgLoss>0?(avgWin/avgLoss).toFixed(2):"—"} color="var(--accent)"/>
        <StatBox label="Total Fees"   value={totalComm!==0?`$${Math.abs(totalComm).toFixed(2)}`:"—"} color="var(--text-muted)"/>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 rounded-xl p-1" style={{ background:"var(--bg-elevated)", width:"fit-content" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background:activeTab===t.id?"var(--accent)":"transparent", color:activeTab===t.id?"#fff":"var(--text-secondary)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab==="Breakdown"  && <BreakdownTab   trades={trades}/>}
      {activeTab==="Overview"   && <OverviewTab    trades={trades}/>}
      {activeTab==="Performance"&& <PerformanceTab trades={trades}/>}
      {activeTab==="Patterns"   && <PatternsTab    trades={trades}/>}
      {activeTab==="Advanced"   && <AdvancedTab    trades={trades}/>}
      {activeTab==="MAE/MFE"    && <MaeMfeTab      trades={trades}/>}
      <HelpOverlay page="analytics"/>
    </div>
  )
}
