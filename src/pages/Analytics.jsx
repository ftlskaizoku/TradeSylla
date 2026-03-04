import { useState, useEffect, useMemo } from "react"
import { Trade } from "@/api/localStore"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, ScatterChart, Scatter,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts"
import { TrendingUp, TrendingDown, Target, BarChart3, Activity, Zap } from "lucide-react"


// ─── Trade sanitizer ──────────────────────────────────────────────────────────
function safeTrade(t) {
  if (!t || typeof t !== "object") return null
  try {
    const pnl = parseFloat(t.pnl) || 0
    let outcome = (t.outcome || "").toString().toUpperCase()
    if (!["WIN","LOSS","BREAKEVEN"].includes(outcome))
      outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN"
    let direction = (t.direction || "").toString().toUpperCase()
    if (!["BUY","SELL"].includes(direction)) direction = "BUY"
    let entry_time = t.entry_time
    try { if (!entry_time || isNaN(new Date(entry_time).getTime())) entry_time = new Date().toISOString() }
    catch { entry_time = new Date().toISOString() }
    return {
      ...t,
      symbol:      (t.symbol || "UNKNOWN").toString().trim() || "UNKNOWN",
      direction, pnl: isNaN(pnl) ? 0 : pnl,
      pips:        parseFloat(t.pips) || 0,
      entry_price: parseFloat(t.entry_price) || 0,
      exit_price:  parseFloat(t.exit_price)  || 0,
      quality:     Math.min(10, Math.max(1, parseInt(t.quality) || 5)),
      outcome, session: t.session || "LONDON", timeframe: t.timeframe || "H1",
      entry_time, notes: t.notes || "",
      screenshots: Array.isArray(t.screenshots) ? t.screenshots : [],
    }
  } catch { return null }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt  = (n, dec=2) => n === undefined || n === null ? "—" : `$${parseFloat(n).toFixed(dec)}`
const pct  = (n) => n === undefined || n === null ? "—" : `${parseFloat(n).toFixed(1)}%`

const TABS = ["Overview", "Performance", "Patterns", "Advanced"]

const CHART_TOOLTIP = {
  contentStyle: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontSize: 11,
  },
  cursor: { stroke: "var(--border)" }
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, color }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-xl font-bold truncate" style={{ color: color || "var(--text-primary)" }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function Empty({ text = "Not enough data yet. Log more trades to see this chart." }) {
  return (
    <div className="flex items-center justify-center h-48 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <p className="text-sm text-center px-4" style={{ color: "var(--text-muted)" }}>{text}</p>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ trades }) {
  // Equity curve
  const sortedByDate = [...trades].sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))
  let cum = 0
  const equityCurve = sortedByDate.map(t => {
    cum += t.pnl || 0
    return { date: t.entry_time ? new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}) : "—", equity: parseFloat(cum.toFixed(2)) }
  })

  // Outcome distribution donut
  const wins   = trades.filter(t=>t.outcome==="WIN").length
  const losses = trades.filter(t=>t.outcome==="LOSS").length
  const bes    = trades.filter(t=>t.outcome==="BREAKEVEN").length
  const donut  = [
    { name:"WIN",       value: wins,   color:"#2ed573" },
    { name:"LOSS",      value: losses, color:"#ff4757" },
    { name:"BREAKEVEN", value: bes,    color:"#6c63ff" },
  ].filter(d=>d.value>0)

  // Daily P&L bars
  const byDay = {}
  trades.forEach(t=>{
    if (!t.entry_time) return
    const d = new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"})
    byDay[d] = (byDay[d]||0) + (t.pnl||0)
  })
  const dailyBars = Object.entries(byDay).map(([date,pnl])=>({ date, pnl: parseFloat(pnl.toFixed(2)) }))

  return (
    <div className="space-y-4">
      {/* Equity + Donut side by side */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Equity Curve</h3>
          {equityCurve.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={equityCurve}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6c63ff" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6c63ff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:10 }} interval="preserveStartEnd"/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...CHART_TOOLTIP} formatter={v=>[`$${v}`,"Equity"]}/>
                <Area type="monotone" dataKey="equity" stroke="#6c63ff" strokeWidth={2} fill="url(#eqGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Outcome Distribution</h3>
          {donut.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={donut} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                    {donut.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} formatter={(v,n)=>[v+" trades", n]}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {donut.map(d=>(
                  <div key={d.name} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background:d.color }}/>
                    <span className="text-xs" style={{ color:"var(--text-secondary)" }}>{d.name}: {d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <Empty text="Log trades to see distribution"/>}
        </div>
      </div>

      {/* Daily P&L bars */}
      <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Daily P&L</h3>
        {dailyBars.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyBars}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
              <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:10 }} interval="preserveStartEnd"/>
              <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...CHART_TOOLTIP} formatter={v=>[`$${v}`,"P&L"]}/>
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {dailyBars.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty/>}
      </div>
    </div>
  )
}

// ─── Performance Tab ──────────────────────────────────────────────────────────
function PerformanceTab({ trades }) {
  // P&L by session
  const sessionMap = {}
  trades.forEach(t=>{
    const s = t.session||"UNKNOWN"
    if (!sessionMap[s]) sessionMap[s]={ session:s, pnl:0, trades:0, wins:0 }
    sessionMap[s].pnl    += t.pnl||0
    sessionMap[s].trades += 1
    if (t.outcome==="WIN") sessionMap[s].wins++
  })
  const sessionData = Object.values(sessionMap).map(s=>({
    ...s,
    pnl: parseFloat(s.pnl.toFixed(2)),
    winRate: parseFloat((s.wins/s.trades*100).toFixed(1))
  }))

  // P&L by symbol
  const symbolMap = {}
  trades.forEach(t=>{
    const s = t.symbol||"UNKNOWN"
    if (!symbolMap[s]) symbolMap[s]={ symbol:s, pnl:0, trades:0, wins:0 }
    symbolMap[s].pnl    += t.pnl||0
    symbolMap[s].trades += 1
    if (t.outcome==="WIN") symbolMap[s].wins++
  })
  const symbolData = Object.values(symbolMap)
    .map(s=>({ ...s, pnl: parseFloat(s.pnl.toFixed(2)), winRate: parseFloat((s.wins/s.trades*100).toFixed(1)) }))
    .sort((a,b)=>b.pnl-a.pnl)

  // P&L by timeframe
  const tfMap = {}
  trades.forEach(t=>{
    const tf = t.timeframe||"UNKNOWN"
    if (!tfMap[tf]) tfMap[tf]={ tf, pnl:0, trades:0 }
    tfMap[tf].pnl    += t.pnl||0
    tfMap[tf].trades += 1
  })
  const tfData = Object.values(tfMap).map(t=>({ ...t, pnl: parseFloat(t.pnl.toFixed(2)) }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* By Session */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>P&L by Session</h3>
          {sessionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sessionData} layout="vertical">
                <XAxis type="number" tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`}/>
                <YAxis dataKey="session" type="category" tick={{ fill:"var(--text-secondary)", fontSize:11 }} width={72}/>
                <Tooltip {...CHART_TOOLTIP} formatter={v=>[`$${v}`,"P&L"]}/>
                <Bar dataKey="pnl" radius={[0,3,3,0]}>
                  {sessionData.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        {/* By Timeframe */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>P&L by Timeframe</h3>
          {tfData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tfData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="tf" tick={{ fill:"var(--text-muted)", fontSize:10 }}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...CHART_TOOLTIP} formatter={v=>[`$${v}`,"P&L"]}/>
                <Bar dataKey="pnl" radius={[3,3,0,0]}>
                  {tfData.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
      </div>

      {/* By Symbol table */}
      <div className="rounded-xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>Performance by Symbol</h3>
        </div>
        {symbolData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
                  {["Symbol","Trades","Net P&L","Win Rate","Avg P&L"].map(h=>(
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color:"var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {symbolData.map(s=>(
                  <tr key={s.symbol} style={{ borderBottom:"1px solid var(--border)" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td className="px-4 py-3 font-bold" style={{ color:"var(--text-primary)" }}>{s.symbol}</td>
                    <td className="px-4 py-3 text-xs" style={{ color:"var(--text-secondary)" }}>{s.trades}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color:s.pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                      {s.pnl>=0?"+":""} ${s.pnl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background:"var(--bg-elevated)", maxWidth:80 }}>
                          <div className="h-full rounded-full" style={{ width:`${s.winRate}%`, background:s.winRate>=50?"#2ed573":"#ff4757" }}/>
                        </div>
                        <span className="text-xs" style={{ color:s.winRate>=50?"var(--accent-success)":"var(--accent-danger)" }}>{s.winRate}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color:s.pnl/s.trades>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                      {s.pnl/s.trades>=0?"+":""} ${(s.pnl/s.trades).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-8 text-center text-sm" style={{ color:"var(--text-muted)" }}>No data yet</div>}
      </div>
    </div>
  )
}

// ─── Patterns Tab ─────────────────────────────────────────────────────────────
function PatternsTab({ trades }) {
  // Win rate by day of week
  const dowMap = { 0:"Sun",1:"Mon",2:"Tue",3:"Wed",4:"Thu",5:"Fri",6:"Sat" }
  const byDow = {}
  trades.forEach(t=>{
    if (!t.entry_time) return
    const dow = new Date(t.entry_time).getDay()
    const name = dowMap[dow]
    if (!byDow[name]) byDow[name]={ day:name, wins:0, total:0 }
    byDow[name].total++
    if (t.outcome==="WIN") byDow[name].wins++
  })
  const dowOrder = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
  const dowData = dowOrder.filter(d=>byDow[d]).map(d=>({
    day: d,
    winRate: parseFloat((byDow[d].wins/byDow[d].total*100).toFixed(1)),
    trades: byDow[d].total
  }))

  // P&L by direction
  const dirData = ["BUY","SELL"].map(dir=>{
    const t = trades.filter(x=>x.direction===dir)
    const pnl = t.reduce((s,x)=>s+(x.pnl||0),0)
    const wins = t.filter(x=>x.outcome==="WIN").length
    return { dir, trades:t.length, pnl:parseFloat(pnl.toFixed(2)), winRate: t.length?parseFloat((wins/t.length*100).toFixed(1)):0 }
  }).filter(d=>d.trades>0)

  // Quality vs P&L scatter
  const qualityScatter = trades
    .filter(t=>t.quality && t.pnl!==undefined)
    .map(t=>({ quality: parseInt(t.quality)||0, pnl: parseFloat((t.pnl||0).toFixed(2)), outcome:t.outcome }))

  // Consecutive wins/losses
  const sorted = [...trades].sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))
  let maxWinStreak=0, maxLossStreak=0, curW=0, curL=0
  sorted.forEach(t=>{
    if (t.outcome==="WIN")      { curW++; curL=0; maxWinStreak=Math.max(maxWinStreak,curW) }
    else if (t.outcome==="LOSS"){ curL++; curW=0; maxLossStreak=Math.max(maxLossStreak,curL) }
    else { curW=0; curL=0 }
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Win rate by day */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Win Rate by Day of Week</h3>
          {dowData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dowData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="day" tick={{ fill:"var(--text-muted)", fontSize:10 }}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`${v}%`} domain={[0,100]}/>
                <Tooltip {...CHART_TOOLTIP} formatter={v=>[`${v}%`,"Win Rate"]}/>
                <Bar dataKey="winRate" radius={[3,3,0,0]}>
                  {dowData.map((d,i)=><Cell key={i} fill={d.winRate>=50?"#2ed573":"#ff4757"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        {/* Buy vs Sell */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>BUY vs SELL Performance</h3>
          {dirData.length > 0 ? (
            <div className="space-y-3 mt-2">
              {dirData.map(d=>(
                <div key={d.dir} className="rounded-xl p-4" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm px-2 py-0.5 rounded"
                      style={{ background:d.dir==="BUY"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)", color:d.dir==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                      {d.dir==="BUY"?"▲":"▼"} {d.dir}
                    </span>
                    <span className="text-sm font-bold" style={{ color:d.pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                      {d.pnl>=0?"+":""}${d.pnl}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs" style={{ color:"var(--text-muted)" }}>
                    <span>{d.trades} trades</span>
                    <span style={{ color:d.winRate>=50?"var(--accent-success)":"var(--accent-danger)" }}>{d.winRate}% win rate</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty/>}
        </div>
      </div>

      {/* Quality vs P&L scatter + streaks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Trade Quality vs P&L</h3>
          {qualityScatter.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="quality" name="Quality" type="number" domain={[0,11]} tick={{ fill:"var(--text-muted)", fontSize:10 }} label={{ value:"Quality", position:"insideBottom", offset:-2, fill:"var(--text-muted)", fontSize:10 }}/>
                <YAxis dataKey="pnl" name="P&L" tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...CHART_TOOLTIP} formatter={(v,n)=>[n==="pnl"?`$${v}`:v, n==="pnl"?"P&L":"Quality"]}/>
                <Scatter data={qualityScatter} fill="#6c63ff" fillOpacity={0.7}/>
              </ScatterChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Streaks</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background:"var(--bg-elevated)" }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:"rgba(46,213,115,0.15)" }}>
                  <TrendingUp size={15} style={{ color:"var(--accent-success)" }}/>
                </div>
                <span className="text-sm" style={{ color:"var(--text-secondary)" }}>Best Win Streak</span>
              </div>
              <span className="text-2xl font-bold" style={{ color:"var(--accent-success)" }}>{maxWinStreak}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background:"var(--bg-elevated)" }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:"rgba(255,71,87,0.15)" }}>
                  <TrendingDown size={15} style={{ color:"var(--accent-danger)" }}/>
                </div>
                <span className="text-sm" style={{ color:"var(--text-secondary)" }}>Worst Loss Streak</span>
              </div>
              <span className="text-2xl font-bold" style={{ color:"var(--accent-danger)" }}>{maxLossStreak}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl" style={{ background:"var(--bg-elevated)" }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:"rgba(108,99,255,0.15)" }}>
                  <Activity size={15} style={{ color:"var(--accent)" }}/>
                </div>
                <span className="text-sm" style={{ color:"var(--text-secondary)" }}>Total Trades</span>
              </div>
              <span className="text-2xl font-bold" style={{ color:"var(--accent)" }}>{trades.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Advanced Tab ─────────────────────────────────────────────────────────────
function AdvancedTab({ trades }) {
  const sorted = [...trades].sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))

  // Running drawdown
  let peak = 0, cum = 0
  const drawdownData = sorted.map(t=>{
    cum  += t.pnl||0
    peak  = Math.max(peak, cum)
    const dd = peak>0 ? parseFloat(((cum-peak)/peak*100).toFixed(2)) : 0
    return { date: t.entry_time?new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}):"—", drawdown: dd, equity: parseFloat(cum.toFixed(2)) }
  })

  // P&L distribution histogram
  const pnls  = trades.map(t=>t.pnl||0)
  const min   = Math.min(...pnls)
  const max2  = Math.max(...pnls)
  const range = max2-min || 1
  const bins  = 8
  const binSize= range/bins
  const histMap = Array.from({length:bins},(_,i)=>({
    range: `${(min+i*binSize).toFixed(0)}`,
    count: 0,
    positive: (min+i*binSize+binSize/2)>=0
  }))
  pnls.forEach(p=>{
    const idx = Math.min(Math.floor((p-min)/binSize), bins-1)
    if (histMap[idx]) histMap[idx].count++
  })

  // Monthly P&L
  const monthMap = {}
  trades.forEach(t=>{
    if (!t.entry_time) return
    const d = new Date(t.entry_time)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`
    if (!monthMap[key]) monthMap[key]={ month:key, pnl:0, trades:0 }
    monthMap[key].pnl    += t.pnl||0
    monthMap[key].trades += 1
  })
  const monthlyData = Object.values(monthMap)
    .sort((a,b)=>a.month.localeCompare(b.month))
    .map(m=>({ ...m, pnl: parseFloat(m.pnl.toFixed(2)) }))

  // Key metrics
  const wins   = trades.filter(t=>t.outcome==="WIN")
  const losses = trades.filter(t=>t.outcome==="LOSS")
  const avgWin  = wins.length  ? wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length : 0
  const avgLoss = losses.length? Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length) : 0
  const maxDD   = drawdownData.length ? Math.min(...drawdownData.map(d=>d.drawdown)) : 0
  const grossP  = wins.reduce((s,t)=>s+(t.pnl||0),0)
  const grossL  = Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0))

  return (
    <div className="space-y-4">
      {/* Key metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:"Avg Win",       value:`$${avgWin.toFixed(2)}`,        color:"var(--accent-success)" },
          { label:"Avg Loss",      value:`$${avgLoss.toFixed(2)}`,       color:"var(--accent-danger)" },
          { label:"Max Drawdown",  value:`${maxDD.toFixed(1)}%`,         color:"var(--accent-warning)" },
          { label:"Gross Profit",  value:`$${grossP.toFixed(2)}`,        color:"var(--accent-secondary)" },
          { label:"Gross Loss",    value:`$${grossL.toFixed(2)}`,        color:"var(--accent-danger)" },
          { label:"Profit Factor", value: avgLoss>0?(grossP/grossL).toFixed(2):avgWin>0?"∞":"0", color:"var(--accent)" },
          { label:"Expectancy",    value: trades.length?`$${(trades.reduce((s,t)=>s+(t.pnl||0),0)/trades.length).toFixed(2)}`:"—", color:"var(--text-primary)" },
          { label:"Avg R:R",       value: avgLoss>0?(avgWin/avgLoss).toFixed(2):"—",             color:"var(--accent)" },
        ].map(m=>(
          <div key={m.label} className="rounded-xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>{m.label}</p>
            <p className="text-lg font-bold" style={{ color:m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drawdown chart */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Drawdown (%)</h3>
          {drawdownData.length>1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={drawdownData}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ff4757" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#ff4757" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:10 }} interval="preserveStartEnd"/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`${v}%`}/>
                <Tooltip {...CHART_TOOLTIP} formatter={v=>[`${v}%`,"Drawdown"]}/>
                <Area type="monotone" dataKey="drawdown" stroke="#ff4757" strokeWidth={2} fill="url(#ddGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>

        {/* P&L histogram */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>P&L Distribution</h3>
          {trades.length>2 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={histMap}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="range" tick={{ fill:"var(--text-muted)", fontSize:9 }} tickFormatter={v=>`$${v}`}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }}/>
                <Tooltip {...CHART_TOOLTIP} formatter={v=>[v+" trades","Count"]}/>
                <Bar dataKey="count" radius={[3,3,0,0]}>
                  {histMap.map((d,i)=><Cell key={i} fill={d.positive?"#2ed573":"#ff4757"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty/>}
        </div>
      </div>

      {/* Monthly P&L */}
      <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Monthly P&L</h3>
        {monthlyData.length>0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
              <XAxis dataKey="month" tick={{ fill:"var(--text-muted)", fontSize:10 }}/>
              <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`}/>
              <Tooltip {...CHART_TOOLTIP} formatter={v=>[`$${v}`,"P&L"]}/>
              <Bar dataKey="pnl" radius={[3,3,0,0]}>
                {monthlyData.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : <Empty/>}
      </div>
    </div>
  )
}

// ─── Main Analytics Page ──────────────────────────────────────────────────────
export default function Analytics() {
  const [allTrades, setAllTrades] = useState([])
  const [activeTab,  setActiveTab]  = useState("Overview")
  const [filterSym,  setFilterSym]  = useState("ALL")

  useEffect(()=>{ Trade.list().then(d=>setAllTrades(d)) }, [])

  const symbols = ["ALL", ...Array.from(new Set(allTrades.map(t=>t.symbol))).sort()]
  const trades  = filterSym==="ALL" ? allTrades : allTrades.filter(t=>t.symbol===filterSym)

  // Summary stats
  const wins      = trades.filter(t=>t.outcome==="WIN")
  const losses    = trades.filter(t=>t.outcome==="LOSS")
  const netPnl    = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate   = trades.length ? wins.length/trades.length*100 : 0
  const avgWin    = wins.length   ? wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length : 0
  const avgLoss   = losses.length ? Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length) : 0
  const pf        = avgLoss>0 ? avgWin/avgLoss : avgWin>0?99:0
  const exp       = trades.length ? netPnl/trades.length : 0

  // Max drawdown
  let peak2=0, cum2=0, maxDD=0;
  const sortedForDD = trades.slice().sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))
  sortedForDD.forEach(t=>{
    cum2  += t.pnl||0
    peak2  = Math.max(peak2, cum2)
    if (peak2>0) maxDD = Math.min(maxDD, (cum2-peak2)/peak2*100)
  })

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>Analytics</h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
            Deep performance analysis across {trades.length} trade{trades.length!==1?"s":""}
          </p>
        </div>
        {/* Symbol filter */}
        <div className="flex flex-wrap gap-1.5">
          {symbols.map(s=>(
            <button key={s} onClick={()=>setFilterSym(s)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background:filterSym===s?"var(--accent)":"var(--bg-elevated)", color:filterSym===s?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:filterSym===s?"var(--accent)":"var(--border)" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats bar */}
      <div className="rounded-xl p-4 mb-5 flex flex-wrap gap-6" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <StatBox label="Total P&L"     value={`${netPnl>=0?"+":""}$${netPnl.toFixed(2)}`} color={netPnl>=0?"var(--accent-success)":"var(--accent-danger)"}/>
        <StatBox label="Win Rate"      value={`${winRate.toFixed(1)}%`} sub={`${wins.length}W / ${losses.length}L`} color={winRate>=50?"var(--accent-success)":"var(--accent-danger)"}/>
        <StatBox label="Profit Factor" value={pf>=99?"∞":pf.toFixed(2)} color={pf>=1?"var(--accent-success)":"var(--accent-danger)"}/>
        <StatBox label="Expectancy"    value={`${exp>=0?"+":""}$${exp.toFixed(2)}`} sub="Per trade" color={exp>=0?"var(--accent-success)":"var(--accent-danger)"}/>
        <StatBox label="Max Drawdown"  value={`${maxDD.toFixed(1)}%`} color="var(--accent-warning)"/>
        <StatBox label="Avg R:R"       value={avgLoss>0?(avgWin/avgLoss).toFixed(2):"—"} color="var(--accent)"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 rounded-xl p-1" style={{ background:"var(--bg-elevated)", width:"fit-content" }}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setActiveTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background:activeTab===t?"var(--accent)":"transparent", color:activeTab===t?"#fff":"var(--text-secondary)" }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab==="Overview"     && <OverviewTab     trades={trades}/>}
      {activeTab==="Performance"  && <PerformanceTab  trades={trades}/>}
      {activeTab==="Patterns"     && <PatternsTab     trades={trades}/>}
      {activeTab==="Advanced"     && <AdvancedTab     trades={trades}/>}
    </div>
  )
}
