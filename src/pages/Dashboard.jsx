import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { createPageUrl } from "@/utils"
import {
  TrendingUp, TrendingDown, BarChart3, Brain, Target,
  DollarSign, Activity, ArrowUpRight, ArrowDownRight,
  Shield, ChevronRight, Plus, X, Calendar, ImagePlus,
  Wallet, Server, ChevronDown, Users
} from "lucide-react"
import { Trade, Playbook, BrokerConnection, subscribeToTable } from "@/api/supabaseStore"
import { useUser } from "@/lib/UserContext"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
  BarChart, Bar, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts"

// ─── Helpers ────────────────────────────────────────────────────────────────
// ─── Trade sanitizer — prevents crashes from bad/imported data ───────────────
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
      pips:        parseFloat(t.pips) || 0,
      entry_price: parseFloat(t.entry_price) || 0,
      exit_price:  parseFloat(t.exit_price) || 0,
      quality:     Math.min(10, Math.max(1, parseInt(t.quality) || 5)),
      outcome,
      session:     t.session || "LONDON",
      timeframe:   t.timeframe || "H1",
      entry_time,
      notes:       t.notes || "",
      screenshots: Array.isArray(t.screenshots) ? t.screenshots : [],
    }
  } catch { return null }
}

function calcSyllaScore(trades) {
  if (!trades.length) return 0
  const wins   = trades.filter(t => t.outcome === "WIN").length
  const losses = trades.filter(t => t.outcome === "LOSS").length
  const be     = trades.filter(t => t.outcome === "BREAKEVEN").length
  const wr     = wins / trades.length
  const totalPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const avgWin  = wins  ? trades.filter(t=>t.outcome==="WIN").reduce((s,t)=>s+(t.pnl||0),0)/wins   : 0
  const avgLoss = losses? Math.abs(trades.filter(t=>t.outcome==="LOSS").reduce((s,t)=>s+(t.pnl||0),0)/losses): 0
  const pf      = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 2 : 1
  const score = Math.min(100, Math.round(wr * 50 + Math.min(pf, 3) / 3 * 30 + Math.min(trades.length, 20) / 20 * 20))
  return score
}

function fmtDate(iso) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color, positive }) {
  return (
    <div className="metric-card card-hover flex-1 min-w-0">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg" style={{ background: `${color}25` }}>
          <Icon size={15} style={{ color }} />
        </div>
        {sub !== undefined && positive !== undefined && (
          <span className="text-xs font-medium flex items-center gap-0.5" style={{ color: positive ? "var(--accent-success)" : "var(--accent-danger)" }}>
            {positive ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
            {sub}
          </span>
        )}
      </div>
      <p className="text-xl font-bold mb-0.5 truncate" style={{ color: "var(--text-primary)" }}>{value}</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
    </div>
  )
}

// ─── Quick Trade Modal ────────────────────────────────────────────────────────
const SYMBOLS  = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","GBPJPY","USDCAD","NZDUSD","USDCHF","US30","NAS100","SPX500","CUSTOM"]
const SESSIONS = ["LONDON","NEW_YORK","ASIAN","SYDNEY"]
const TFS      = ["M1","M5","M15","M30","H1","H4","D1"]

function ImageUploader({ images, onChange, label }) {
  const handleFile = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = ev => onChange([...images, { id: Date.now() + Math.random(), url: ev.target.result, name: file.name }])
      reader.readAsDataURL(file)
    })
    e.target.value = ""
  }
  const remove = (id) => onChange(images.filter(i => i.id !== id))
  return (
    <div>
      <label className="text-xs mb-1.5 block font-medium" style={{ color:"var(--text-muted)" }}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {images.map(img => (
          <div key={img.id} className="relative w-16 h-16 rounded-lg overflow-hidden group" style={{ border:"1px solid var(--border)" }}>
            <img src={img.url} alt={img.name} className="w-full h-full object-cover"/>
            <button onClick={()=>remove(img.id)} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <X size={14} className="text-white"/>
            </button>
          </div>
        ))}
        <label className="w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer border-2 border-dashed hover:opacity-70 transition-opacity"
          style={{ borderColor:"var(--border)" }}>
          <ImagePlus size={16} style={{ color:"var(--accent)" }}/>
          <span className="text-xs" style={{ color:"var(--text-muted)" }}>Add</span>
          <input type="file" accept="image/*" multiple onChange={handleFile} className="hidden"/>
        </label>
      </div>
    </div>
  )
}

function QuickTradeModal({ open, onClose, onSaved }) {
  const empty = {
    symbol:"EURUSD", customSymbol:"", direction:"BUY",
    entry_price:"", exit_price:"", pnl:"", pips:"",
    session:"LONDON", timeframe:"H1", outcome:"WIN",
    quality:"7", notes:"", entry_time: new Date().toISOString().slice(0,16),
    chart_url:"", playbook_id:"", screenshots:[]
  }
  const [form,      setForm]      = useState(empty)
  const [saving,    setSaving]    = useState(false)
  const [playbooks, setPlaybooks] = useState([])
  const [tab,       setTab]       = useState("details") // "details" | "media"

  useEffect(() => {
    if (open) Playbook.list().then(setPlaybooks)
  }, [open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    const sym = form.symbol === "CUSTOM" ? form.customSymbol.trim() : form.symbol
    if (!sym) { toast.error("Symbol is required"); return }
    setSaving(true)
    try {
      await Trade.create({
        ...form,
        symbol:       sym,
        entry_price:  parseFloat(form.entry_price) || 0,
        exit_price:   parseFloat(form.exit_price)  || 0,
        pnl:          parseFloat(form.pnl)         || 0,
        pips:         parseFloat(form.pips)        || 0,
        quality:      parseInt(form.quality)       || 5,
        entry_time:   new Date(form.entry_time).toISOString(),
        screenshots:  form.screenshots,
        chart_url:    form.chart_url,
        playbook_id:  form.playbook_id,
      })
      toast.success("Trade logged!")
      setForm(empty)
      setTab("details")
      onSaved()
      onClose()
    } catch(e) {
      toast.error("Failed to save trade")
    }
    setSaving(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl z-10 flex flex-col max-h-[92vh]"
        style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom:"1px solid var(--border)" }}>
          <h2 className="text-base font-bold" style={{ color:"var(--text-primary)" }}>Log New Trade</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={16}/></button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-1 flex-shrink-0">
          {[{id:"details",label:"Trade Details"},{id:"media",label:"Charts & Strategy"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{ background:tab===t.id?"var(--accent)":"var(--bg-elevated)", color:tab===t.id?"#fff":"var(--text-secondary)" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {tab === "details" && (
            <div className="grid grid-cols-2 gap-3">
              {/* Symbol */}
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Symbol</label>
                <select value={form.symbol} onChange={e=>set("symbol",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                  {SYMBOLS.map(s=><option key={s} value={s}>{s==="CUSTOM"?"+ Custom...":s}</option>)}
                </select>
                {form.symbol === "CUSTOM" && (
                  <input value={form.customSymbol} onChange={e=>set("customSymbol",e.target.value)} placeholder="Enter symbol..." className="w-full h-9 rounded-lg px-3 text-sm border mt-1.5" style={{ background:"var(--bg-elevated)", borderColor:"var(--accent)", color:"var(--text-primary)" }}/>
                )}
              </div>
              {/* Direction */}
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Direction</label>
                <div className="flex gap-2">
                  {["BUY","SELL"].map(d=>(
                    <button key={d} onClick={()=>set("direction",d)} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-all"
                      style={{ background:form.direction===d?(d==="BUY"?"rgba(46,213,115,0.2)":"rgba(255,71,87,0.2)"):"var(--bg-elevated)",
                        borderColor:form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--border)",
                        color:form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--text-secondary)" }}>
                      {d==="BUY"?"▲":"▼"} {d}
                    </button>
                  ))}
                </div>
              </div>
              {/* Entry / Exit */}
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Entry Price</label>
                <input type="number" step="any" placeholder="1.0845" value={form.entry_price} onChange={e=>set("entry_price",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Exit Price</label>
                <input type="number" step="any" placeholder="1.0883" value={form.exit_price} onChange={e=>set("exit_price",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              {/* PnL / Pips */}
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>P&L ($)</label>
                <input type="number" step="any" placeholder="38.00" value={form.pnl} onChange={e=>set("pnl",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Pips</label>
                <input type="number" step="any" placeholder="38" value={form.pips} onChange={e=>set("pips",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              {/* Outcome */}
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Outcome</label>
                <div className="flex gap-1.5">
                  {["WIN","LOSS","BREAKEVEN"].map(o=>(
                    <button key={o} onClick={()=>set("outcome",o)} className="flex-1 h-9 rounded-lg text-xs font-medium border transition-all"
                      style={{ background:form.outcome===o?(o==="WIN"?"rgba(46,213,115,0.2)":o==="LOSS"?"rgba(255,71,87,0.2)":"rgba(108,99,255,0.2)"):"var(--bg-elevated)",
                        borderColor:form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--border)",
                        color:form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--text-secondary)" }}>
                      {o==="BREAKEVEN"?"BE":o}
                    </button>
                  ))}
                </div>
              </div>
              {/* Session */}
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Session</label>
                <select value={form.session} onChange={e=>set("session",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                  {SESSIONS.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              {/* Timeframe */}
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Timeframe</label>
                <select value={form.timeframe} onChange={e=>set("timeframe",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                  {TFS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              {/* Quality */}
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Quality (1-10)</label>
                <input type="number" min="1" max="10" value={form.quality} onChange={e=>set("quality",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              {/* Date */}
              <div className="col-span-2">
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Date & Time</label>
                <input type="datetime-local" value={form.entry_time} onChange={e=>set("entry_time",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              {/* Notes */}
              <div className="col-span-2">
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Notes</label>
                <textarea rows={2} placeholder="Setup, reasoning, lessons learned..." value={form.notes} onChange={e=>set("notes",e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
            </div>
          )}

          {tab === "media" && (
            <div className="space-y-5">
              {/* Strategy link */}
              <div>
                <label className="text-xs mb-1.5 block font-medium" style={{ color:"var(--text-muted)" }}>
                  <BookOpen size={11} className="inline mr-1"/>Strategy Used (from Playbook)
                </label>
                <select value={form.playbook_id} onChange={e=>set("playbook_id",e.target.value)}
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                  <option value="">— No strategy selected —</option>
                  {playbooks.map(p=>(
                    <option key={p.id} value={p.id}>{p.name} ({p.status})</option>
                  ))}
                </select>
                {playbooks.length === 0 && (
                  <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>No strategies yet — add them in the Playbook page.</p>
                )}
              </div>

              {/* Chart URL */}
              <div>
                <label className="text-xs mb-1.5 block font-medium" style={{ color:"var(--text-muted)" }}>
                  <Link2 size={11} className="inline mr-1"/>Chart URL (TradingView, etc.)
                </label>
                <input value={form.chart_url} onChange={e=>set("chart_url",e.target.value)}
                  placeholder="https://www.tradingview.com/x/..."
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
                {form.chart_url && (
                  <a href={form.chart_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs mt-1 inline-flex items-center gap-1 hover:opacity-70" style={{ color:"var(--accent)" }}>
                    <Link2 size={10}/> Open chart
                  </a>
                )}
              </div>

              {/* Screenshots */}
              <ImageUploader
                images={form.screenshots}
                onChange={v=>set("screenshots",v)}
                label="Chart Screenshots"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop:"1px solid var(--border)" }}>
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)", opacity:saving?0.7:1 }}>
            {saving ? "Saving..." : "Save Trade"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Activity Feed ────────────────────────────────────────────────────────────
function ActivityFeed({ trades }) {
  if (!trades.length) return <p className="text-sm py-4" style={{ color:"var(--text-muted)" }}>No recent activity. Log your first trade!</p>
  const items = [...trades].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8)
  const color = { WIN:"var(--accent-success)", LOSS:"var(--accent-danger)", BREAKEVEN:"var(--accent)" }
  return (
    <div className="space-y-3">
      {items.map(t=>(
        <div key={t.id} className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: t.outcome==="WIN"?"rgba(46,213,115,0.15)":t.outcome==="LOSS"?"rgba(255,71,87,0.15)":"rgba(108,99,255,0.15)" }}>
            {t.outcome==="WIN" ? <TrendingUp size={12} style={{ color:"var(--accent-success)" }}/> : t.outcome==="LOSS" ? <TrendingDown size={12} style={{ color:"var(--accent-danger)" }}/> : <Activity size={12} style={{ color:"var(--accent)" }}/>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium" style={{ color:"var(--text-primary)" }}>
              {t.direction} {t.symbol} <span style={{ color: color[t.outcome] }}>{t.outcome}</span>
            </p>
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>
              {t.pnl >= 0 ? "+" : ""}${(t.pnl||0).toFixed(2)} · {t.session} · {fmtDate(t.entry_time)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useUser()
  const [allTrades,      setAllTrades]      = useState([])
  const [eaAccounts,     setEaAccounts]     = useState([])
  const [selectedAccount,setSelectedAccount]= useState("ALL")
  const [tradeModalOpen, setTradeModalOpen] = useState(false)

  const loadTrades = async () => {
    try {
      const data = await Trade.list()
      const safe = (data || []).map(safeTrade).filter(Boolean)
      setAllTrades(safe.sort((a,b)=>new Date(b.entry_time)-new Date(a.entry_time)))
    } catch(e) { console.error("Dashboard loadTrades:", e) }
  }

  const loadAccounts = async () => {
    try {
      const data = await BrokerConnection.list()
      setEaAccounts((data||[]).filter(c=>c.is_mt5_live).sort((a,b)=>new Date(b.last_sync||0)-new Date(a.last_sync||0)))
    } catch {}
  }

  useEffect(() => {
    loadTrades()
    loadAccounts()
    const unsub = subscribeToTable('trades', loadTrades)
    return () => { try { unsub() } catch {} }
  }, [])

  // Filter trades by selected account
  const trades = selectedAccount === "ALL"
    ? allTrades
    : allTrades.filter(t => (t.account_login || "MANUAL") === selectedAccount)

  // Active account HUD data
  const activeAccount = selectedAccount === "ALL" ? null
    : eaAccounts.find(a => a.mt5_login === selectedAccount) || null

  // ── Stats ──────────────────────────────────────────────────────────────────
  const wins   = trades.filter(t=>t.outcome==="WIN")
  const losses = trades.filter(t=>t.outcome==="LOSS")
  const netPnl = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate= trades.length ? (wins.length/trades.length*100).toFixed(1) : "0.0"
  const avgWin = wins.length  ? wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length : 0
  const avgLoss= losses.length? Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length) : 0
  const profitFactor = avgLoss>0 ? (avgWin/avgLoss).toFixed(2) : avgWin>0?"∞":"0.00"
  const expectancy= trades.length ? (netPnl/trades.length).toFixed(2) : "0.00"
  const syllaScore= calcSyllaScore(trades)

  // ── Chart data ─────────────────────────────────────────────────────────────
  const tradesByDay = {}
  trades.forEach(t=>{
    if (!t.entry_time) return
    const d = new Date(t.entry_time).toISOString().slice(0,10)
    if (!tradesByDay[d]) tradesByDay[d]=[]
    tradesByDay[d].push(t)
  })
  const sortedDays = Object.keys(tradesByDay).sort()
  let cum = 0
  const cumulativePnlData = sortedDays.map(d=>{
    const dayPnl = tradesByDay[d].reduce((s,t)=>s+(t.pnl||0),0)
    cum += dayPnl
    return { date: d.slice(5), cumPnl: parseFloat(cum.toFixed(2)) }
  })
  const dailyPnlData = sortedDays.map(d=>({
    date: d.slice(5),
    pnl: parseFloat(tradesByDay[d].reduce((s,t)=>s+(t.pnl||0),0).toFixed(2))
  }))

  // Radar data for SYLLA score
  const radarData = [
    { metric:"Win %",  value: trades.length ? parseFloat(winRate) : 0, max:100 },
    { metric:"Prof. F", value: Math.min(parseFloat(profitFactor)||0, 5)*20, max:100 },
    { metric:"W/L",    value: wins.length>0 && losses.length>0 ? Math.min(wins.length/losses.length,3)/3*100 : wins.length>0?100:0, max:100 },
  ]

  const today = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})
  const recentTrades = trades.slice(0,8)

  return (
    <div>

      {/* ── Account HUD ── shown when EA accounts exist */}
      {eaAccounts.length > 0 && (
        <div className="mb-5 rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          {/* Account selector strip */}
          <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto" style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
            <Users size={13} style={{ color:"var(--text-muted)", flexShrink:0 }}/>
            <span className="text-xs font-semibold mr-1" style={{ color:"var(--text-muted)", flexShrink:0 }}>VIEW:</span>
            <button
              onClick={()=>setSelectedAccount("ALL")}
              className="px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all"
              style={{ background:selectedAccount==="ALL"?"var(--accent)":"transparent", color:selectedAccount==="ALL"?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:selectedAccount==="ALL"?"var(--accent)":"var(--border)" }}>
              All Accounts
            </button>
            {eaAccounts.map(acc => (
              <button key={acc.id}
                onClick={()=>setSelectedAccount(acc.mt5_login||acc.account_number||acc.id)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-all"
                style={{ background:selectedAccount===(acc.mt5_login||acc.account_number||acc.id)?"var(--accent)":"transparent", color:selectedAccount===(acc.mt5_login||acc.account_number||acc.id)?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:selectedAccount===(acc.mt5_login||acc.account_number||acc.id)?"var(--accent)":"var(--border)" }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: acc.type==="live"?"var(--accent-success)":"var(--accent-warning)" }}/>
                {acc.broker_name || "MT5"} #{acc.mt5_login || acc.account_number}
              </button>
            ))}
          </div>

          {/* Active account details */}
          {activeAccount ? (
            <div className="px-4 py-3 flex flex-wrap gap-4 items-center">
              <div>
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>Account</p>
                <p className="text-sm font-bold" style={{ color:"var(--text-primary)" }}>{activeAccount.account_name || activeAccount.broker_name}</p>
              </div>
              <div className="w-px h-8 self-center" style={{ background:"var(--border)" }}/>
              <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Login</p><p className="text-sm font-bold" style={{ color:"var(--text-primary)" }}>#{activeAccount.mt5_login||"—"}</p></div>
              <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Broker</p><p className="text-sm font-bold" style={{ color:"var(--text-primary)" }}>{activeAccount.broker_name||"—"}</p></div>
              <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Server</p><p className="text-sm font-bold truncate max-w-[140px]" style={{ color:"var(--text-primary)" }}>{activeAccount.server||"—"}</p></div>
              <div className="w-px h-8 self-center" style={{ background:"var(--border)" }}/>
              <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Balance</p><p className="text-sm font-bold" style={{ color:"var(--accent-success)" }}>{activeAccount.balance ? `$${parseFloat(activeAccount.balance).toLocaleString()}` : "—"}</p></div>
              <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Equity</p><p className="text-sm font-bold" style={{ color:"var(--accent)" }}>{activeAccount.equity ? `$${parseFloat(activeAccount.equity).toLocaleString()}` : "—"}</p></div>
              <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Leverage</p><p className="text-sm font-bold" style={{ color:"var(--text-primary)" }}>{activeAccount.leverage ? `1:${activeAccount.leverage}` : "—"}</p></div>
              <div><p className="text-xs" style={{ color:"var(--text-muted)" }}>Currency</p><p className="text-sm font-bold" style={{ color:"var(--text-primary)" }}>{activeAccount.currency||"—"}</p></div>
              <div className="ml-auto flex-shrink-0">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: activeAccount.type==="live"?"rgba(46,213,115,0.15)":"rgba(255,165,0,0.15)", color: activeAccount.type==="live"?"var(--accent-success)":"var(--accent-warning)" }}>
                  {activeAccount.type==="live" ? "🟢 LIVE" : "🟡 DEMO"}
                </span>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3 flex flex-wrap gap-6 items-center">
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Showing combined stats across {eaAccounts.length} account{eaAccounts.length!==1?"s":""} · Select an account above to filter</p>
              <div className="flex flex-wrap gap-4">
                {eaAccounts.map(acc=>(
                  <div key={acc.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: acc.type==="live"?"var(--accent-success)":"var(--accent-warning)" }}/>
                    <span className="text-xs font-semibold" style={{ color:"var(--text-primary)" }}>{acc.broker_name} #{acc.mt5_login}</span>
                    {acc.balance ? <span className="text-xs" style={{ color:"var(--text-muted)" }}>${parseFloat(acc.balance).toLocaleString()}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>
            Good morning, {user?.full_name?.split(" ")[0] || "Trader"} 👋
          </h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={createPageUrl("Journal?view=calendar")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>
            <Calendar size={14}/> Calendar
          </Link>
          <Link to={createPageUrl("Sylledge")}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <Brain size={14}/> SYLLEDGE AI
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="flex flex-wrap gap-3 mb-4">
        <StatCard label="Net P&L" value={`$${netPnl.toFixed(2)}`} sub="All time"
          icon={DollarSign} color="#2ed573" positive={netPnl>=0} />
        <StatCard label="Win Rate" value={`${winRate}%`} sub={`${wins.length}W / ${losses.length}L`}
          icon={Target} color="#6c63ff" positive={parseFloat(winRate)>=50} />
        <StatCard label="Profit Factor" value={profitFactor} sub="Avg W/L"
          icon={BarChart3} color="#00d4aa" positive={parseFloat(profitFactor)>=1} />
        <StatCard label="Expectancy" value={`$${expectancy}`} sub="Per trade"
          icon={Activity} color="#ffa502" positive={parseFloat(expectancy)>=0} />
        {/* SYLLA Score card */}
        <div className="metric-card card-hover flex-1 min-w-0" style={{ minWidth:120 }}>
          <div className="flex items-start justify-between mb-2">
            <div className="p-2 rounded-lg" style={{ background:"rgba(108,99,255,0.15)" }}>
              <Shield size={15} style={{ color:"var(--accent)" }}/>
            </div>
            <span className="text-xs" style={{ color:"var(--text-muted)" }}>{trades.length} trades</span>
          </div>
          <p className="text-xl font-bold mb-0.5" style={{ color: syllaScore>=70?"var(--accent-success)":syllaScore>=40?"var(--accent-warning)":"var(--accent-danger)" }}>{syllaScore}</p>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>SYLLA Score</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {/* SYLLA Score Radar */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h2 className="font-semibold text-sm mb-3" style={{ color:"var(--text-primary)" }}>SYLLA Score</h2>
          {trades.length>=2 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill:"var(--text-muted)", fontSize:10 }}/>
                  <Radar dataKey="value" stroke="#6c63ff" fill="#6c63ff" fillOpacity={0.3}/>
                </RadarChart>
              </ResponsiveContainer>
              <p className="text-center text-sm mt-1" style={{ color:"var(--text-secondary)" }}>
                Score: <span className="font-bold" style={{ color: syllaScore>=70?"var(--accent-success)":syllaScore>=40?"var(--accent-warning)":"var(--accent-danger)" }}>{syllaScore}</span>
              </p>
            </>
          ) : (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm text-center" style={{ color:"var(--text-muted)" }}>Log 2+ trades to see score</p>
            </div>
          )}
        </div>

        {/* Cumulative P&L */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h2 className="font-semibold text-sm mb-3" style={{ color:"var(--text-primary)" }}>Daily Net Cumulative P&L</h2>
          {cumulativePnlData.length>1 ? (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={cumulativePnlData}>
                <defs>
                  <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00d4aa" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#00d4aa" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:9 }} interval="preserveStartEnd"/>
                <YAxis hide/>
                <Tooltip contentStyle={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:11 }} formatter={v=>[`$${v}`,"Cum P&L"]}/>
                <Area type="monotone" dataKey="cumPnl" stroke="#00d4aa" strokeWidth={2} fill="url(#cumGrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center">
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>Log trades to see chart</p>
            </div>
          )}
        </div>

        {/* Daily P&L Bars */}
        <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h2 className="font-semibold text-sm mb-3" style={{ color:"var(--text-primary)" }}>Net Daily P&L</h2>
          {dailyPnlData.length>0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyPnlData}>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:9 }} interval="preserveStartEnd"/>
                <YAxis hide/>
                <Tooltip contentStyle={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:11 }} formatter={v=>[`$${v}`,"P&L"]}/>
                <Bar dataKey="pnl" radius={[3,3,0,0]}>
                  {dailyPnlData.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-44 flex items-center justify-center">
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>No daily data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom row: Activity + Recent Trades */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Activity Feed */}
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>Activity Feed</h2>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
          </div>
          <ActivityFeed trades={trades}/>
        </div>

        {/* Recent Trades Table */}
        <div className="lg:col-span-3 rounded-xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
            <h2 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>Recent Trades</h2>
            <Link to={createPageUrl("Journal")} className="text-xs flex items-center gap-1" style={{ color:"var(--accent)" }}>
              View All <ChevronRight size={12}/>
            </Link>
          </div>
          <div className="overflow-x-auto">
            {recentTrades.length===0 ? (
              <div className="py-12 text-center">
                <p className="text-sm" style={{ color:"var(--text-muted)" }}>No trades yet. Hit the <span style={{ color:"var(--accent)" }}>+</span> button to log your first trade!</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom:"1px solid var(--border)" }}>
                    {["Symbol","Direction","P&L","Outcome","Date"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color:"var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map(t=>(
                    <tr key={t.id} className="transition-colors" style={{ borderBottom:"1px solid var(--border)" }}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td className="px-4 py-3 font-semibold" style={{ color:"var(--text-primary)" }}>{t.symbol}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium" style={{
                          background: t.direction==="BUY"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)",
                          color: t.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                          {t.direction==="BUY"?"▲":"▼"} {t.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color:(t.pnl||0)>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                        {t.pnl!==undefined?`${t.pnl>=0?"+":""}$${(t.pnl).toFixed(2)}`:"—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{
                          background: t.outcome==="WIN"?"rgba(46,213,115,0.15)":t.outcome==="LOSS"?"rgba(255,71,87,0.15)":"rgba(108,99,255,0.15)",
                          color: t.outcome==="WIN"?"var(--accent-success)":t.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>
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

      {/* Floating + button */}
      <button
        onClick={()=>setTradeModalOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-40 transition-transform hover:scale-110"
        style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
        <Plus size={24} className="text-white"/>
      </button>

      <QuickTradeModal open={tradeModalOpen} onClose={()=>setTradeModalOpen(false)} onSaved={loadTrades}/>
    </div>
  )
}
