// src/pages/Dashboard.jsx — v3.0 Visual Upgrade
// Stat cards: gradient accent bar + icon + trend badge + progress bar
// Equity curve: time range selector, glowing endpoint
// Activity feed: cleaner timeline

import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { createPageUrl } from "@/utils"
import {
  TrendingUp, TrendingDown, BarChart3, Brain, Target,
  DollarSign, Activity, ArrowUpRight, ArrowDownRight,
  Shield, ChevronRight, Plus, X, Calendar, CalendarDays,
  Users, ToggleLeft, ToggleRight, Zap
} from "lucide-react"
import { Trade, Playbook, BrokerConnection, subscribeToTable } from "@/api/supabaseStore"
import { useUser } from "@/lib/UserContext"
import { useLanguage } from "@/lib/LanguageContext"
import { toast } from "@/components/ui/toast"
import { InfoTooltip, TOOLTIPS } from "@/components/ui/InfoTooltip"
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
  BarChart, Bar, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis
} from "recharts"

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
    try { if (isNaN(new Date(entry_time).getTime())) entry_time = new Date().toISOString() }
    catch { entry_time = new Date().toISOString() }
    return {
      ...t,
      symbol:      (t.symbol || "UNKNOWN").toString().trim() || "UNKNOWN",
      direction,
      pnl:         isNaN(pnl) ? 0 : pnl,
      gross_pnl:   parseFloat(t.gross_pnl) || pnl,
      commission:  parseFloat(t.commission) || 0,
      swap:        parseFloat(t.swap) || 0,
      pips:        parseFloat(t.pips) || 0,
      entry_price: parseFloat(t.entry_price) || 0,
      exit_price:  parseFloat(t.exit_price)  || 0,
      quality:     Math.min(10, Math.max(1, parseInt(t.quality) || 5)),
      outcome, session: t.session || "LONDON", timeframe: t.timeframe || "H1",
      entry_time, notes: t.notes || "",
      screenshots:       Array.isArray(t.screenshots) ? t.screenshots : [],
      is_withdrawal:     !!t.is_withdrawal,
      withdrawal_amount: parseFloat(t.withdrawal_amount) || 0,
    }
  } catch { return null }
}

function calcSyllaScore(trades) {
  if (!trades.length) return 0
  const wins   = trades.filter(t => t.outcome === "WIN").length
  const losses = trades.filter(t => t.outcome === "LOSS").length
  const wr     = wins / trades.length
  const avgWin  = wins   ? trades.filter(t=>t.outcome==="WIN").reduce((s,t)=>s+(t.pnl||0),0)/wins   : 0
  const avgLoss = losses ? Math.abs(trades.filter(t=>t.outcome==="LOSS").reduce((s,t)=>s+(t.pnl||0),0)/losses) : 0
  const pf      = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 2 : 1
  return Math.min(100, Math.round(wr*50 + Math.min(pf,3)/3*30 + Math.min(trades.length,20)/20*20))
}

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month:"2-digit", day:"2-digit", year:"numeric" })
}

// ─── v3 Stat Card with gradient bar ──────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, positive, tooltip, barPct = 0, gradient }) {
  const gradColors = gradient || (positive !== false
    ? [color, color === "var(--accent-success)" ? "#00d4aa" : color]
    : [color, color])

  return (
    <div className="metric-card flex-1 min-w-0" style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      {/* Icon + trend */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{
          width:32, height:32, borderRadius:9,
          background:`${color}20`,
          display:"flex", alignItems:"center", justifyContent:"center",
          flexShrink:0
        }}>
          <Icon size={15} style={{ color }} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {sub !== undefined && positive !== undefined && (
            <span style={{
              fontFamily:"var(--font-mono)", fontSize:10,
              padding:"2px 8px", borderRadius:100,
              background: positive ? "rgba(46,213,115,0.1)" : "rgba(255,71,87,0.1)",
              border: `1px solid ${positive ? "rgba(46,213,115,0.2)" : "rgba(255,71,87,0.2)"}`,
              color: positive ? "var(--accent-success)" : "var(--accent-danger)",
              display:"flex", alignItems:"center", gap:3
            }}>
              {positive ? <ArrowUpRight size={10}/> : <ArrowDownRight size={10}/>}
              {sub}
            </span>
          )}
          {tooltip && <InfoTooltip content={tooltip} position="top" />}
        </div>
      </div>

      {/* Value */}
      <div style={{
        fontFamily:"var(--font-display)", fontSize:24, fontWeight:800,
        letterSpacing:"-0.03em", lineHeight:1, color:"var(--text-primary)"
      }}>{value}</div>

      {/* Label */}
      <div style={{
        fontFamily:"var(--font-mono)", fontSize:10,
        color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.12em"
      }}>{label}</div>

      {/* Gradient progress bar */}
      <div style={{
        height:3, borderRadius:100,
        background:"rgba(255,255,255,0.05)",
        overflow:"hidden", marginTop:2
      }}>
        <div style={{
          height:"100%", borderRadius:100,
          width: `${Math.min(100, Math.max(5, barPct || 50))}%`,
          background: `linear-gradient(90deg, ${gradColors[0]}, ${gradColors[1]})`,
          transition:"width 1s cubic-bezier(0.4,0,0.2,1)",
          position:"relative"
        }}>
          {/* Glow dot at end */}
          <div style={{
            position:"absolute", right:0, top:"50%",
            transform:"translateY(-50%)",
            width:6, height:6, borderRadius:"50%",
            background:gradColors[1], opacity:0.8,
            filter:"blur(2px)"
          }}/>
        </div>
      </div>
    </div>
  )
}

// ─── P&L Mode Toggle ──────────────────────────────────────────────────────────
function PnlToggle({ mode, onChange }) {
  const { t } = useLanguage()
  return (
    <div className="flex items-center gap-2">
      <InfoTooltip content={TOOLTIPS.commissionToggle} position="bottom" />
      <button onClick={() => onChange(mode === "net" ? "gross" : "net")}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
        style={{
          background:  mode === "net" ? "rgba(108,99,255,0.15)" : "rgba(0,212,170,0.15)",
          borderColor: mode === "net" ? "var(--accent)" : "var(--accent-secondary)",
          color:       mode === "net" ? "var(--accent)" : "var(--accent-secondary)",
        }}>
        {mode === "net" ? <ToggleRight size={13}/> : <ToggleLeft size={13}/>}
        {mode === "net" ? t("dash_net_pnl") : "Gross P&L"}
      </button>
      <span className="text-xs" style={{ color:"var(--text-muted)" }}>
        {mode === "net" ? "(after fees)" : "(before fees)"}
      </span>
    </div>
  )
}

function WithdrawalToggle({ enabled, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <InfoTooltip content={TOOLTIPS.withdrawals} position="bottom" />
      <button onClick={() => onChange(!enabled)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
        style={{
          background:  enabled ? "rgba(255,165,2,0.15)" : "var(--bg-elevated)",
          borderColor: enabled ? "var(--accent-warning)" : "var(--border)",
          color:       enabled ? "var(--accent-warning)" : "var(--text-muted)",
        }}>
        {enabled ? <ToggleRight size={13}/> : <ToggleLeft size={13}/>}
        {enabled ? "Withdrawals: On" : "Withdrawals: Off"}
      </button>
    </div>
  )
}

// ─── Quick Trade Modal ─────────────────────────────────────────────────────────
const SYMBOLS  = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","GBPJPY","USDCAD","NZDUSD","USDCHF","US30","NAS100","SPX500","CUSTOM"]
const SESSIONS = ["LONDON","NEW_YORK","ASIAN","SYDNEY"]

function QuickTradeModal({ open, onClose, onSaved }) {
  const empty = {
    symbol:"EURUSD", customSymbol:"", direction:"BUY",
    entry_price:"", exit_price:"", pnl:"", pips:"",
    session:"LONDON", timeframe:"H1", outcome:"WIN",
    quality:"7", notes:"", entry_time: new Date().toISOString().slice(0,16),
  }
  const [form, setForm]   = useState(empty)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    const sym = form.symbol === "CUSTOM" ? form.customSymbol.trim() : form.symbol
    if (!sym) { toast.error("Symbol is required"); return }
    setSaving(true)
    try {
      await Trade.create({
        ...form, symbol: sym,
        entry_price: parseFloat(form.entry_price) || 0,
        exit_price:  parseFloat(form.exit_price)  || 0,
        pnl:         parseFloat(form.pnl)         || 0,
        pips:        parseFloat(form.pips)        || 0,
        quality:     parseInt(form.quality)       || 5,
        entry_time:  new Date(form.entry_time).toISOString(),
      })
      toast.success("Trade logged!")
      setForm(empty)
      onSaved(); onClose()
    } catch { toast.error("Failed to save trade") }
    setSaving(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 flex flex-col max-h-[92vh]"
        style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom:"1px solid var(--border)" }}>
          <h2 className="text-base font-bold" style={{ color:"var(--text-primary)" }}>{ t("dash_log_trade") }</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={16}/></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-secondary)" }}>Symbol</label>
              <select value={form.symbol} onChange={e=>set("symbol",e.target.value)}
                className="w-full h-9 rounded-lg px-3 text-sm border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                {SYMBOLS.map(s=><option key={s} value={s}>{s==="CUSTOM"?"+ Custom...":s}</option>)}
              </select>
              {form.symbol === "CUSTOM" && (
                <input value={form.customSymbol} onChange={e=>set("customSymbol",e.target.value)}
                  placeholder="Enter symbol..." className="w-full h-9 rounded-lg px-3 text-sm border mt-1.5"
                  style={{ background:"var(--bg-elevated)", borderColor:"var(--accent)", color:"var(--text-primary)" }}/>
              )}
            </div>
            <div>
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-secondary)" }}>Direction</label>
              <div className="flex gap-2">
                {["BUY","SELL"].map(d=>(
                  <button key={d} onClick={()=>set("direction",d)} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-all"
                    style={{ background: form.direction===d?(d==="BUY"?"rgba(46,213,115,0.2)":"rgba(255,71,87,0.2)"):"var(--bg-elevated)",
                      borderColor: form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--border)",
                      color: form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--text-primary)" }}>
                    {d==="BUY"?"▲":"▼"} {d}
                  </button>
                ))}
              </div>
            </div>
            {[
              { label:"Entry Price", key:"entry_price", placeholder:"1.0845" },
              { label:"Exit Price",  key:"exit_price",  placeholder:"1.0883" },
              { label:"P&L ($)",     key:"pnl",         placeholder:"38.00" },
              { label:"Pips",        key:"pips",         placeholder:"38" },
            ].map(f=>(
              <div key={f.key}>
                <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-secondary)" }}>{f.label}</label>
                <input type="number" step="any" placeholder={f.placeholder} value={form[f.key]}
                  onChange={e=>set(f.key, e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border"
                  style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
            ))}
            <div className="col-span-2">
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-secondary)" }}>Outcome</label>
              <div className="flex gap-2">
                {["WIN","LOSS","BREAKEVEN"].map(o=>(
                  <button key={o} onClick={()=>set("outcome",o)} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-all"
                    style={{ background: form.outcome===o?(o==="WIN"?"rgba(46,213,115,0.2)":o==="LOSS"?"rgba(255,71,87,0.2)":"rgba(108,99,255,0.2)"):"var(--bg-elevated)",
                      borderColor: form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--border)",
                      color: form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--text-primary)" }}>
                    {o==="BREAKEVEN"?"BE":o}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-secondary)" }}>Session</label>
              <select value={form.session} onChange={e=>set("session",e.target.value)}
                className="w-full h-9 rounded-lg px-3 text-sm border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                {SESSIONS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-secondary)" }}>Quality (1-10)</label>
              <input type="number" min="1" max="10" value={form.quality} onChange={e=>set("quality",e.target.value)}
                className="w-full h-9 rounded-lg px-3 text-sm border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            </div>
            <div className="col-span-2">
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-secondary)" }}>Date & Time</label>
              <input type="datetime-local" value={form.entry_time} onChange={e=>set("entry_time",e.target.value)}
                className="w-full h-9 rounded-lg px-3 text-sm border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            </div>
            <div className="col-span-2">
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-secondary)" }}>Notes</label>
              <textarea rows={2} placeholder=t("dash_setup_notes") value={form.notes}
                onChange={e=>set("notes",e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop:"1px solid var(--border)" }}>
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)", opacity:saving?0.7:1 }}>
            {saving?"Saving...":"Save Trade"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Activity Feed ─────────────────────────────────────────────────────────────
function ActivityFeed({ trades }) {
  if (!trades.length) return <p className="text-sm py-4" style={{ color:"var(--text-muted)" }}>No recent activity. Log your first trade!</p>
  const items = [...trades].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8)
  return (
    <div className="space-y-3">
      {items.map(t=>(
        <div key={t.id} className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: t.outcome==="WIN"?"rgba(46,213,115,0.12)":t.outcome==="LOSS"?"rgba(255,71,87,0.12)":"rgba(108,99,255,0.12)" }}>
            {t.outcome==="WIN"?<TrendingUp size={12} style={{ color:"var(--accent-success)" }}/>
              :t.outcome==="LOSS"?<TrendingDown size={12} style={{ color:"var(--accent-danger)" }}/>
              :<Activity size={12} style={{ color:"var(--accent)" }}/>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium" style={{ color:"var(--text-primary)" }}>
              <span style={{ fontFamily:"var(--font-mono)", color:"var(--accent)" }}>{t.symbol}</span>
              {" "}{t.direction}
              <span className="ml-1.5 font-semibold" style={{ color:t.outcome==="WIN"?"var(--accent-success)":t.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>
                {t.outcome}
              </span>
            </p>
            <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>
              {t.pnl>=0?"+":""}${(t.pnl||0).toFixed(2)} · {t.session} · {fmtDate(t.entry_time)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Chart Card ────────────────────────────────────────────────────────────────
function ChartCard({ title, tooltip, children }) {
  return (
    <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", position:"relative", overflow:"hidden" }}>
      {/* Top shimmer */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, height:1,
        background:"linear-gradient(90deg,transparent,rgba(108,99,255,0.4),transparent)",
        opacity:0.5
      }}/>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>{title}</h2>
        {tooltip && <InfoTooltip content={tooltip} position="left" />}
      </div>
      {children}
    </div>
  )
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useUser()
  const { t } = useLanguage()
  const [trades,          setTrades]         = useState([])
  const [tradeModalOpen,  setTradeModalOpen]  = useState(false)
  const [eaAccounts,      setEaAccounts]      = useState([])
  const [selectedAccount, setSelectedAccount] = useState("ALL")
  const [pnlMode,         setPnlMode]         = useState("net")
  const [showWithdrawals, setShowWithdrawals] = useState(false)
  const [equityRange,     setEquityRange]     = useState("1M")

  const loadTrades = async () => {
    try {
      const data = await Trade.list()
      const safe = (data||[]).map(safeTrade).filter(Boolean)
      setTrades(safe.sort((a,b)=>new Date(b.entry_time)-new Date(a.entry_time)))
    } catch(e) { console.error("Dashboard loadTrades:", e) }
  }
  const loadAccounts = async () => {
    try {
      const data = await BrokerConnection.list()
      setEaAccounts((data||[]).filter(c=>c.is_mt5_live))
    } catch {}
  }

  useEffect(() => {
    loadTrades(); loadAccounts()
    const unsub = subscribeToTable("trades", loadTrades)
    return () => { try { unsub() } catch {} }
  }, [])

  // ── Account filter ─────────────────────────────────────────────────────────
  const filteredTrades = selectedAccount === "ALL"
    ? trades
    : trades.filter(t => (t.account_login || "MANUAL") === selectedAccount)

  const realTrades  = filteredTrades.filter(t => !t.is_withdrawal)
  const withdrawals = filteredTrades.filter(t => t.is_withdrawal)

  const tradePnl = (t) => pnlMode === "gross"
    ? (t.gross_pnl || t.pnl || 0)
    : (t.pnl || 0)

  // ── Stats ──────────────────────────────────────────────────────────────────
  const wins         = realTrades.filter(t => t.outcome === "WIN")
  const losses       = realTrades.filter(t => t.outcome === "LOSS")
  const netPnl       = realTrades.reduce((s,t) => s + tradePnl(t), 0)
  const totalFees    = realTrades.reduce((s,t) => s + Math.abs(t.commission||0) + Math.abs(t.swap||0), 0)
  const winRate      = realTrades.length ? (wins.length/realTrades.length*100).toFixed(1) : "0.0"
  const avgWin       = wins.length   ? wins.reduce((s,t)=>s+tradePnl(t),0)/wins.length   : 0
  const avgLoss      = losses.length ? Math.abs(losses.reduce((s,t)=>s+tradePnl(t),0)/losses.length) : 0
  const profitFactor = avgLoss>0 ? (avgWin/avgLoss).toFixed(2) : avgWin>0?"∞":"0.00"
  const expectancy   = realTrades.length ? (netPnl/realTrades.length).toFixed(2) : "0.00"
  const syllaScore   = calcSyllaScore(realTrades)

  // ── Equity curve with range filter ────────────────────────────────────────
  const RANGE_DAYS = { "1W":7, "1M":30, "3M":90, "ALL":9999 }
  const rangeFiltered = useMemo(() => {
    const days = RANGE_DAYS[equityRange]
    const cutoff = new Date(Date.now() - days * 86400000)
    return [...realTrades]
      .filter(t => days === 9999 || new Date(t.entry_time) >= cutoff)
      .sort((a,b)=>new Date(a.entry_time)-new Date(b.entry_time))
  }, [realTrades, equityRange])

  let cum = 0
  const cumulativePnlData = rangeFiltered.map(t => {
    cum += tradePnl(t)
    return { date: new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}), cumPnl: parseFloat(cum.toFixed(2)) }
  })

  const dailyPnlData = useMemo(() => {
    const byDay = {}
    realTrades.forEach(t => {
      const d = new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"})
      byDay[d] = (byDay[d]||0) + tradePnl(t)
    })
    return Object.entries(byDay).map(([date,pnl])=>({ date, pnl:parseFloat(pnl.toFixed(2)) }))
  }, [realTrades, pnlMode])

  const radarData = [
    { metric:"Win %",   value: realTrades.length ? parseFloat(winRate) : 0 },
    { metric:"Prof. F", value: Math.min(parseFloat(profitFactor)||0, 5)*20 },
    { metric:"W/L",     value: wins.length>0&&losses.length>0 ? Math.min(wins.length/losses.length,3)/3*100 : wins.length>0?100:0 },
  ]

  const activeAccount = selectedAccount==="ALL" ? null : eaAccounts.find(a=>a.mt5_login===selectedAccount)||null
  const recentTrades  = realTrades.slice(0,8)
  const today = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})

  // Equity curve end value for change badge
  const equityChange = cumulativePnlData.length
    ? cumulativePnlData[cumulativePnlData.length-1].cumPnl
    : 0

  const tipStyle = {
    contentStyle: { background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:11 }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {user?.full_name?.split(" ")[0] || "Trader"} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={createPageUrl("Journal?view=calendar")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            <Calendar size={14}/> Calendar
          </Link>
          <Link to={createPageUrl("Sylledge")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <Brain size={14}/> SYLLEDGE AI
          </Link>
        </div>
      </div>

      {/* View controls */}
      <div className="flex flex-wrap gap-3 items-center mb-4 rounded-xl px-4 py-3"
        style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <PnlToggle mode={pnlMode} onChange={setPnlMode} />
        <div className="w-px h-5 hidden sm:block" style={{ background:"var(--border)" }}/>
        <WithdrawalToggle enabled={showWithdrawals} onChange={setShowWithdrawals} />
        {totalFees > 0 && (
          <>
            <div className="w-px h-5 hidden sm:block" style={{ background:"var(--border)" }}/>
            <div className="flex items-center gap-1.5">
              <InfoTooltip content={TOOLTIPS.totalFees} position="bottom" />
              <span className="text-xs" style={{ color:"var(--text-muted)" }}>
                Fees: <span className="font-semibold" style={{ color:"var(--accent-danger)" }}>
                  ${totalFees.toFixed(2)}
                </span>
              </span>
            </div>
          </>
        )}
      </div>

      {/* Account HUD */}
      {eaAccounts.length > 0 && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto"
            style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
            <Users size={12} style={{ color:"var(--text-muted)", flexShrink:0 }}/>
            <span className="text-xs font-semibold mr-1 flex-shrink-0" style={{ color:"var(--text-muted)" }}>ACCOUNT</span>
            <button onClick={()=>setSelectedAccount("ALL")}
              className="px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all border"
              style={{ background:selectedAccount==="ALL"?"var(--accent)":"transparent",
                color:selectedAccount==="ALL"?"#fff":"var(--text-primary)",
                borderColor:selectedAccount==="ALL"?"var(--accent)":"var(--border)" }}>
              All Accounts
            </button>
            {eaAccounts.map(acc=>(
              <button key={acc.id} onClick={()=>setSelectedAccount(acc.mt5_login||acc.account_number||acc.id)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all border"
                style={{
                  background:  selectedAccount===(acc.mt5_login||acc.id)?"var(--accent)":"transparent",
                  color:       selectedAccount===(acc.mt5_login||acc.id)?"#fff":"var(--text-primary)",
                  borderColor: selectedAccount===(acc.mt5_login||acc.id)?"var(--accent)":"var(--border)"
                }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background:acc.type==="live"?"var(--accent-success)":"var(--accent-warning)" }}/>
                {acc.broker_name||"MT5"} #{acc.mt5_login||acc.account_number}
              </button>
            ))}
          </div>
          {activeAccount && (
            <div className="px-4 py-3 flex flex-wrap gap-x-5 gap-y-2 items-center">
              {[
                { label:"Balance",  value:activeAccount.balance?`${activeAccount.currency||"$"} ${parseFloat(activeAccount.balance).toLocaleString(undefined,{minimumFractionDigits:2})}`:"-", color:"var(--accent-success)" },
                { label:"Equity",   value:activeAccount.equity?`${activeAccount.currency||"$"} ${parseFloat(activeAccount.equity).toLocaleString(undefined,{minimumFractionDigits:2})}`:"-", color:"var(--accent)" },
                { label:"Leverage", value:activeAccount.leverage?`1:${activeAccount.leverage}`:"—" },
                { label:"Login",    value:`#${activeAccount.mt5_login||"—"}` },
              ].map(s=>(
                <div key={s.label}>
                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}</p>
                  <p className="text-sm font-bold" style={{ color:s.color||"var(--text-primary)" }}>{s.value}</p>
                </div>
              ))}
              <div className="ml-auto">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background:activeAccount.type==="live"?"rgba(46,213,115,0.15)":"rgba(255,165,0,0.15)",
                    color:activeAccount.type==="live"?"var(--accent-success)":"var(--accent-warning)" }}>
                  {activeAccount.type==="live"?"🟢 LIVE":"🟡 DEMO"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Stat Cards v3 ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-4">
        <StatCard
          label={`${pnlMode === "net" ? "Net" : "Gross"} P&L`}
          value={`${netPnl>=0?"+":""}$${netPnl.toFixed(2)}`}
          icon={DollarSign}
          color={netPnl>=0?"var(--accent-success)":"var(--accent-danger)"}
          positive={netPnl>=0}
          sub={`${wins.length}W / ${losses.length}L`}
          tooltip={pnlMode === "net" ? TOOLTIPS.netPnl : TOOLTIPS.grossPnl}
          barPct={Math.min(100, Math.max(5, (wins.length/(realTrades.length||1))*100))}
          gradient={netPnl>=0?["#2ed573","#00d4aa"]:["#ff4757","#ff6b81"]}
        />
        <StatCard
          label={t("dash_win_rate")}
          value={`${winRate}%`}
          icon={Target}
          color="var(--accent)"
          positive={parseFloat(winRate)>=50}
          sub={`${(parseFloat(winRate)-50).toFixed(1)}% vs 50%`}
          tooltip={TOOLTIPS.winRate}
          barPct={parseFloat(winRate)}
          gradient={["#6c63ff","#4facfe"]}
        />
        <StatCard
          label={t("dash_profit_factor")}
          value={profitFactor}
          icon={BarChart3}
          color="var(--accent-secondary)"
          positive={parseFloat(profitFactor)>=1}
          sub="Avg W/L ratio"
          tooltip={TOOLTIPS.profitFactor}
          barPct={Math.min(100, (parseFloat(profitFactor)||0)/3*100)}
          gradient={["#00d4aa","#0fd"]}
        />
        <StatCard
          label={t("dash_expectancy")}
          value={`$${expectancy}`}
          icon={Activity}
          color="var(--accent-warning)"
          positive={parseFloat(expectancy)>=0}
          sub="Per trade"
          tooltip={TOOLTIPS.expectancy}
          barPct={parseFloat(expectancy) > 0 ? Math.min(100, parseFloat(expectancy)/5*100) : 20}
          gradient={["#ffa502","#ff6b35"]}
        />
        {/* SYLLA Score */}
        <div className="metric-card flex-1 min-w-0" style={{ minWidth:120, display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ width:32, height:32, borderRadius:9, background:"rgba(108,99,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <Shield size={15} style={{ color:"var(--accent)" }}/>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)" }}>{realTrades.length} trades</span>
              <InfoTooltip content={TOOLTIPS.syllaScore} position="top" />
            </div>
          </div>
          <div style={{
            fontFamily:"var(--font-display)", fontSize:24, fontWeight:800,
            letterSpacing:"-0.03em", lineHeight:1,
            color: syllaScore>=70?"var(--accent-success)":syllaScore>=40?"var(--accent-warning)":"var(--accent-danger)"
          }}>{syllaScore}</div>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.12em" }}>{ t("dash_sylla_score") }</div>
          <div style={{ height:3, borderRadius:100, background:"rgba(255,255,255,0.05)", overflow:"hidden" }}>
            <div style={{
              height:"100%", borderRadius:100,
              width:`${syllaScore}%`,
              background:syllaScore>=70?"linear-gradient(90deg,#2ed573,#00d4aa)":syllaScore>=40?"linear-gradient(90deg,#ffa502,#ff6b35)":"linear-gradient(90deg,#ff4757,#ff6b81)",
              transition:"width 1s cubic-bezier(0.4,0,0.2,1)"
            }}/>
          </div>
        </div>
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* SYLLA Radar */}
        <ChartCard title=t("dash_sylla_score") tooltip={TOOLTIPS.syllaRadar}>
          {realTrades.length >= 2 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)"/>
                  <PolarAngleAxis dataKey="metric" tick={{ fill:"var(--text-secondary)", fontSize:10 }}/>
                  <Radar dataKey="value" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25}/>
                </RadarChart>
              </ResponsiveContainer>
              <p className="text-center text-sm mt-1" style={{ color:"var(--text-secondary)" }}>
                Score: <span className="font-bold" style={{ color:syllaScore>=70?"var(--accent-success)":syllaScore>=40?"var(--accent-warning)":"var(--accent-danger)" }}>{syllaScore}</span>
              </p>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm text-center" style={{ color:"var(--text-muted)" }}>{ t("dash_log_2_trades") }</p>
            </div>
          )}
        </ChartCard>

        {/* Equity Curve with range selector */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)", position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:"linear-gradient(90deg,transparent,rgba(46,213,115,0.5),transparent)", opacity:0.6 }}/>
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>
                {pnlMode === "net" ? "Net" : "Gross"} Equity
              </p>
              <p className="text-lg font-bold mt-0.5" style={{ color:equityChange>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                {equityChange>=0?"+":""}${equityChange.toFixed(2)}
              </p>
            </div>
            {/* Range selector */}
            <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
              {["1W","1M","3M","ALL"].map(r=>(
                <button key={r} onClick={()=>setEquityRange(r)}
                  className="px-2 py-1 rounded text-xs font-semibold transition-all"
                  style={{ background:equityRange===r?"var(--accent)":"transparent", color:equityRange===r?"#fff":"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          {cumulativePnlData.length > 1 ? (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={cumulativePnlData}>
                <defs>
                  <linearGradient id="eqGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={equityChange>=0?"#2ed573":"#ff4757"} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={equityChange>=0?"#2ed573":"#ff4757"} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:9 }} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                <Tooltip {...tipStyle} formatter={v=>[`$${v}`,"Equity"]}/>
                <Area type="monotone" dataKey="cumPnl" stroke={equityChange>=0?"#2ed573":"#ff4757"} strokeWidth={2} fill="url(#eqGrad2)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-36 flex items-center justify-center">
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>{ t("dash_log_to_see") }</p>
            </div>
          )}
        </div>

        {/* Daily P&L */}
        <ChartCard title=t("dash_daily_pnl") tooltip={TOOLTIPS.dailyPnl}>
          {dailyPnlData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyPnlData}>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:9 }} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`} axisLine={false} tickLine={false}/>
                <Tooltip {...tipStyle} formatter={v=>[`$${v}`,"P&L"]}/>
                <Bar dataKey="pnl" radius={[3,3,0,0]}>
                  {dailyPnlData.map((d,i) => <Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center">
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>{ t("dash_no_daily") }</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Bottom row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>{ t("dash_activity") }</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
              <span className="text-xs" style={{ color:"var(--accent-success)" }}>Live</span>
            </div>
          </div>
          <ActivityFeed trades={realTrades}/>
        </div>

        <div className="lg:col-span-3 rounded-xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
            <h2 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>{ t("dash_recent_trades") }</h2>
            <Link to={createPageUrl("Journal")} className="text-xs flex items-center gap-1" style={{ color:"var(--accent)" }}>
              View All <ChevronRight size={12}/>
            </Link>
          </div>
          <div className="overflow-x-auto">
            {recentTrades.length===0 ? (
              <div className="py-12 text-center">
                <p className="text-sm" style={{ color:"var(--text-muted)" }}>No trades yet. Hit the <span style={{ color:"var(--accent)" }}>+</span> button!</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)" }}>
                    {["Symbol","Direction","P&L","Outcome","Date"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color:"var(--text-secondary)", fontFamily:"var(--font-mono)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map(t=>(
                    <tr key={t.id} style={{ borderBottom:"1px solid var(--border)" }}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td className="px-4 py-3 font-semibold" style={{ color:"var(--accent)", fontFamily:"var(--font-mono)", fontSize:12 }}>{t.symbol}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ background:t.direction==="BUY"?"rgba(46,213,115,0.12)":"rgba(255,71,87,0.12)",
                            color:t.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                          {t.direction==="BUY"?"▲":"▼"} {t.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-xs" style={{ color:tradePnl(t)>=0?"var(--accent-success)":"var(--accent-danger)", fontFamily:"var(--font-mono)" }}>
                        {tradePnl(t)>=0?"+":""}${tradePnl(t).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background:t.outcome==="WIN"?"rgba(46,213,115,0.12)":t.outcome==="LOSS"?"rgba(255,71,87,0.12)":"rgba(108,99,255,0.12)",
                            color:t.outcome==="WIN"?"var(--accent-success)":t.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>
                          {t.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color:"var(--text-muted)" }}>{fmtDate(t.entry_time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Floating + */}
      <button onClick={()=>setTradeModalOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-40 transition-transform hover:scale-110"
        style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)", boxShadow:"0 8px 32px rgba(108,99,255,0.4)" }}>
        <Plus size={24} className="text-white"/>
      </button>

      <QuickTradeModal open={tradeModalOpen} onClose={()=>setTradeModalOpen(false)} onSaved={loadTrades}/>
    </div>
  )
}
