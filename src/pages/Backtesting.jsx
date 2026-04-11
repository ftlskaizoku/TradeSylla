// src/pages/Backtesting.jsx  — Full Virtual Account v3
import { useState, useEffect, useMemo } from "react"
import { BacktestSession, Playbook } from "@/api/supabaseStore"
import { useLanguage } from "@/lib/LanguageContext"
import { toast } from "@/components/ui/toast"
import {
  Plus, ChevronRight, ChevronLeft, Pencil, Trash2, X,
  FlaskConical, TrendingUp, TrendingDown, Trophy, Target,
  BarChart2, BookOpen, Activity, DollarSign, Percent,
  AlertTriangle, CheckSquare, Square, Zap, BarChart3,
  ArrowUpRight, Shield, Clock, RefreshCw
} from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar, Cell, LineChart, Line,
  ComposedChart, ReferenceLine,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts"

const SYMBOLS  = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","GBPJPY","USDCAD","US30","NAS100","UK100","GER30","BTCUSD"]
const SESSIONS = ["LONDON","NEW_YORK","ASIAN","SYDNEY"]
const TFS      = ["M1","M5","M15","M30","H1","H4","D1","W1"]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcRR(entry, sl, tp, dir) {
  const e = parseFloat(entry), s = parseFloat(sl), t = parseFloat(tp)
  if (!e || !s || !t) return null
  const risk   = Math.abs(e - s)
  const reward = Math.abs(t - e)
  if (risk === 0) return null
  return (reward / risk).toFixed(2)
}

function calcRunningBalance(trades, initialCapital) {
  let bal = initialCapital
  return trades.map((t, i) => {
    bal += (t.pnl || 0)
    return { i: i + 1, balance: parseFloat(bal.toFixed(2)), pnl: t.pnl || 0,
      date: t.entry_time ? new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}) : `T${i+1}` }
  })
}

function calcDrawdown(balanceCurve, initialCapital) {
  let peak = initialCapital
  return balanceCurve.map(pt => {
    if (pt.balance > peak) peak = pt.balance
    const dd = peak > 0 ? ((pt.balance - peak) / peak * 100) : 0
    return { ...pt, drawdown: parseFloat(dd.toFixed(2)), peak }
  })
}

function calcStats(trades, initialCapital) {
  const wins    = trades.filter(t => t.outcome === "WIN")
  const losses  = trades.filter(t => t.outcome === "LOSS")
  const netPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = trades.length ? wins.length / trades.length * 100 : 0
  const avgWin  = wins.length   ? wins.reduce((s,t) => s + (t.pnl||0), 0) / wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,t) => s + (t.pnl||0), 0) / losses.length) : 0
  const pf      = avgLoss > 0 ? (avgWin / avgLoss) : (avgWin > 0 ? 99 : 0)
  const exp     = trades.length ? netPnl / trades.length : 0
  const roi     = initialCapital > 0 ? (netPnl / initialCapital * 100) : 0

  // Max drawdown
  const curve = calcRunningBalance(trades, initialCapital)
  const ddCurve = calcDrawdown(curve, initialCapital)
  const maxDD = ddCurve.length ? Math.min(...ddCurve.map(d => d.drawdown)) : 0

  // Max consecutive losses
  let maxConsecLoss = 0, consecLoss = 0
  trades.forEach(t => {
    if (t.outcome === "LOSS") { consecLoss++; maxConsecLoss = Math.max(maxConsecLoss, consecLoss) }
    else consecLoss = 0
  })

  // Avg risk %
  const tradesWithRisk = trades.filter(t => t.risk_pct)
  const avgRisk = tradesWithRisk.length ? tradesWithRisk.reduce((s,t) => s + (t.risk_pct||0), 0) / tradesWithRisk.length : 0

  // Avg RR
  const tradesWithRR = trades.filter(t => t.rr)
  const avgRR = tradesWithRR.length ? tradesWithRR.reduce((s,t) => s + parseFloat(t.rr||0), 0) / tradesWithRR.length : 0

  return { wins: wins.length, losses: losses.length, netPnl, winRate, avgWin, avgLoss, pf, exp, roi, maxDD, maxConsecLoss, avgRisk, avgRR, curve, ddCurve }
}

// ─── Session Modal ─────────────────────────────────────────────────────────────
const EMPTY_SESSION = {
  name:"", description:"", playbook_id:"", initial_capital:10000,
  strategy:"", notes:"", trades:[]
}

function SessionModal({ open, onClose, onSaved, editSession }) {
  const { t } = useLanguage()
  const [form,  setForm]  = useState(EMPTY_SESSION)
  const [saving,setSaving]= useState(false)
  const [playbooks,setPlaybooks] = useState([])
  const isEdit = !!editSession

  useEffect(()=>{ Playbook.list().then(d=>setPlaybooks((d||[]).filter(p=>p.status==="active"))) },[])
  useEffect(()=>{ setForm(editSession?{...EMPTY_SESSION,...editSession}:EMPTY_SESSION) },[editSession,open])

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const save = async () => {
    if(!form.name.trim()){ toast.error("Session name required"); return }
    setSaving(true)
    try {
      if(isEdit) { await BacktestSession.update(editSession.id, form); toast.success("Session updated!") }
      else       { await BacktestSession.create(form);                  toast.success("Session created!") }
      onSaved(); onClose()
    } catch(e) { toast.error("Failed to save: "+e.message) }
    setSaving(false)
  }

  if(!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="flex items-center justify-between p-6 pb-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h2 className="font-bold text-base" style={{ color:"var(--text-primary)" }}>
            {isEdit ? "Edit Session" : "New Backtest Session"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={16}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Session Name *</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. XAUUSD London Breakout Q2"
              className="w-full h-10 rounded-xl px-3 text-sm border"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Starting Capital ($)</label>
              <input type="number" value={form.initial_capital} onChange={e=>set("initial_capital",parseFloat(e.target.value)||0)}
                className="w-full h-10 rounded-xl px-3 text-sm border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}/>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Linked Playbook</label>
              <select value={form.playbook_id||""} onChange={e=>set("playbook_id",e.target.value)}
                className="w-full h-10 rounded-xl px-3 text-sm border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                <option value="">No playbook</option>
                {playbooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Strategy Summary</label>
            <textarea rows={2} value={form.strategy} onChange={e=>set("strategy",e.target.value)}
              placeholder="What strategy or hypothesis are you testing?"
              className="w-full rounded-xl px-3 py-2 text-sm border resize-none"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)}
              placeholder="Market conditions, timeframe tested, broker, etc."
              className="w-full rounded-xl px-3 py-2 text-sm border resize-none"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity:saving?0.7:1 }}>
            {saving?"Saving…":isEdit?"Update":"Create Session"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ────────────────────────────────────────────────────────────
function DeleteConfirm({ label, onCancel, onConfirm }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <h3 className="font-bold mb-2" style={{ color:"var(--text-primary)" }}>Delete Session?</h3>
        <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>
          <strong style={{ color:"var(--text-primary)" }}>{label}</strong> and all its trades will be permanently removed.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 h-9 rounded-xl text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 h-9 rounded-xl text-sm font-semibold text-white"
            style={{ background:"var(--accent-danger)" }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Trade Form ────────────────────────────────────────────────────────────────
const EMPTY_TRADE = {
  symbol:"XAUUSD", direction:"BUY", outcome:"WIN",
  entry_price:"", sl_price:"", tp_price:"",
  pnl:"", pips:"", risk_pct:"1", risk_amount:"",
  rr:"", session:"LONDON", timeframe:"H1",
  notes:"", rule_checks:[], entry_time: new Date().toISOString().slice(0,16)
}

function TradeForm({ session, playbook, onSave, onCancel }) {
  const { t } = useLanguage()
  const [form, setForm] = useState({ ...EMPTY_TRADE })
  const [saving, setSaving] = useState(false)

  const currentBalance = useMemo(() => {
    const trades = session.trades || []
    return trades.reduce((s, t) => s + (t.pnl||0), session.initial_capital || 0)
  }, [session])

  const set = (k, v) => setForm(f => {
    const next = { ...f, [k]: v }
    // Auto-calculate risk amount from risk %
    if (k === "risk_pct" || k === "balance_snap") {
      const bal = currentBalance
      const pct = parseFloat(k === "risk_pct" ? v : next.risk_pct) || 0
      next.risk_amount = (bal * pct / 100).toFixed(2)
    }
    // Auto-calculate RR from entry/SL/TP
    if (["entry_price","sl_price","tp_price","direction"].includes(k)) {
      const rr = calcRR(
        k==="entry_price"?v:next.entry_price,
        k==="sl_price"?v:next.sl_price,
        k==="tp_price"?v:next.tp_price,
        k==="direction"?v:next.direction
      )
      if (rr) next.rr = rr
    }
    // Auto-calculate PnL from risk amount and outcome
    if (k === "outcome" && next.risk_amount && v !== "BREAKEVEN") {
      if (v === "WIN" && next.rr) {
        next.pnl = (parseFloat(next.risk_amount) * parseFloat(next.rr)).toFixed(2)
      } else if (v === "LOSS") {
        next.pnl = (-parseFloat(next.risk_amount)).toFixed(2)
      }
    }
    return next
  })

  const toggleRule = (rule) => {
    setForm(f => {
      const checks = f.rule_checks || []
      return { ...f, rule_checks: checks.includes(rule) ? checks.filter(r=>r!==rule) : [...checks, rule] }
    })
  }

  const save = async () => {
    if (!form.symbol) { toast.error("Symbol required"); return }
    if (!form.pnl && form.pnl !== 0) { toast.error("P&L required"); return }
    setSaving(true)
    try {
      await onSave({
        ...form,
        pnl:          parseFloat(form.pnl) || 0,
        pips:         parseFloat(form.pips) || 0,
        rr:           parseFloat(form.rr) || 0,
        risk_pct:     parseFloat(form.risk_pct) || 0,
        risk_amount:  parseFloat(form.risk_amount) || 0,
        entry_price:  parseFloat(form.entry_price) || 0,
        sl_price:     parseFloat(form.sl_price) || 0,
        tp_price:     parseFloat(form.tp_price) || 0,
        entry_time:   new Date(form.entry_time).toISOString(),
        id: Date.now().toString(),
      })
    } finally { setSaving(false) }
  }

  const rules = playbook?.entry_rules ? playbook.entry_rules.split("\n").filter(r=>r.trim()).slice(0,6) : []
  const rr = form.rr || calcRR(form.entry_price, form.sl_price, form.tp_price, form.direction)

  return (
    <div className="rounded-2xl p-5 mb-4" style={{ background:"var(--bg-card)", border:"1px solid var(--accent)", boxShadow:"0 0 0 1px rgba(108,99,255,0.15)" }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>Log Backtest Trade</h3>
        <div className="flex items-center gap-2 text-xs" style={{ color:"var(--text-muted)" }}>
          <DollarSign size={12}/>
          <span>Balance: </span>
          <span className="font-bold" style={{ color:"var(--accent)", fontFamily:"var(--font-mono)" }}>
            ${currentBalance.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Symbol */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Symbol</label>
          <select value={form.symbol} onChange={e=>set("symbol",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            {SYMBOLS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>

        {/* Direction */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Direction</label>
          <div className="flex gap-1.5">
            {["BUY","SELL"].map(d=>(
              <button key={d} onClick={()=>set("direction",d)}
                className="flex-1 h-9 rounded-xl text-xs font-bold border transition-all"
                style={{ background:form.direction===d?(d==="BUY"?"rgba(46,213,115,0.2)":"rgba(255,71,87,0.2)"):"var(--bg-elevated)",
                  borderColor:form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--border)",
                  color:form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--text-secondary)" }}>
                {d==="BUY"?"▲ BUY":"▼ SELL"}
              </button>
            ))}
          </div>
        </div>

        {/* Entry Price */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Entry Price</label>
          <input type="number" step="any" placeholder="2340.50" value={form.entry_price} onChange={e=>set("entry_price",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}/>
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Date</label>
          <input type="datetime-local" value={form.entry_time} onChange={e=>set("entry_time",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
        </div>

        {/* SL */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--accent-danger)" }}>Stop Loss</label>
          <input type="number" step="any" placeholder="SL Price" value={form.sl_price} onChange={e=>set("sl_price",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"rgba(255,71,87,0.05)", borderColor:"rgba(255,71,87,0.3)", color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}/>
        </div>

        {/* TP */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--accent-success)" }}>Take Profit</label>
          <input type="number" step="any" placeholder="TP Price" value={form.tp_price} onChange={e=>set("tp_price",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"rgba(46,213,115,0.05)", borderColor:"rgba(46,213,115,0.3)", color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}/>
        </div>

        {/* Risk % */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Risk %</label>
          <div className="relative">
            <input type="number" step="0.1" min="0.1" max="10" placeholder="1.0" value={form.risk_pct} onChange={e=>set("risk_pct",e.target.value)}
              className="w-full h-9 rounded-xl px-3 pr-8 text-sm border"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}/>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color:"var(--text-muted)" }}>%</span>
          </div>
          {form.risk_amount && (
            <p className="text-xs mt-0.5" style={{ color:"var(--accent-warning)" }}>
              = ${parseFloat(form.risk_amount).toFixed(2)} at risk
            </p>
          )}
        </div>

        {/* RR */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>
            R:R {rr && <span style={{ color:"var(--accent)" }}>({rr}:1)</span>}
          </label>
          <input type="number" step="0.1" placeholder="Auto-calc or manual" value={form.rr} onChange={e=>set("rr",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}/>
        </div>
      </div>

      {/* Outcome + PnL row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Outcome */}
        <div className="sm:col-span-2">
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Outcome</label>
          <div className="flex gap-2">
            {["WIN","LOSS","BREAKEVEN"].map(o=>(
              <button key={o} onClick={()=>set("outcome",o)}
                className="flex-1 h-9 rounded-xl text-xs font-bold border transition-all"
                style={{ background:form.outcome===o?(o==="WIN"?"rgba(46,213,115,0.2)":o==="LOSS"?"rgba(255,71,87,0.2)":"rgba(108,99,255,0.15)"):"var(--bg-elevated)",
                  borderColor:form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--border)",
                  color:form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--text-secondary)" }}>
                {o==="WIN"?"✓ WIN":o==="LOSS"?"✗ LOSS":"BE"}
              </button>
            ))}
          </div>
        </div>

        {/* Actual P&L */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>
            Actual P&L ($) <span style={{ color:"var(--accent)", fontWeight:400 }}>auto-filled</span>
          </label>
          <input type="number" step="any" placeholder="Override if needed" value={form.pnl} onChange={e=>set("pnl",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color: parseFloat(form.pnl)>=0?"var(--accent-success)":"var(--accent-danger)", fontFamily:"var(--font-mono)", fontWeight:700 }}/>
        </div>

        {/* Pips */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Pips</label>
          <input type="number" step="any" placeholder="0" value={form.pips} onChange={e=>set("pips",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}/>
        </div>
      </div>

      {/* Session / TF / Notes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Session</label>
          <select value={form.session} onChange={e=>set("session",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            {SESSIONS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Timeframe</label>
          <select value={form.timeframe} onChange={e=>set("timeframe",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            {TFS.map(tf=><option key={tf}>{tf}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color:"var(--text-muted)" }}>Notes</label>
          <input placeholder="Why this trade?" value={form.notes} onChange={e=>set("notes",e.target.value)}
            className="w-full h-9 rounded-xl px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
        </div>
      </div>

      {/* Rule checklist from playbook */}
      {rules.length > 0 && (
        <div className="mb-4 rounded-xl p-3" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
          <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>
            RULE CHECKLIST — {playbook?.name}
          </p>
          <div className="space-y-1.5">
            {rules.map((rule, i) => (
              <button key={i} onClick={()=>toggleRule(rule)}
                className="flex items-center gap-2 w-full text-left py-1 hover:opacity-80 transition-opacity">
                {form.rule_checks?.includes(rule)
                  ? <CheckSquare size={14} style={{ color:"var(--accent-success)", flexShrink:0 }}/>
                  : <Square size={14} style={{ color:"var(--text-muted)", flexShrink:0 }}/>}
                <span className="text-xs" style={{ color: form.rule_checks?.includes(rule) ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {rule}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs mt-2" style={{ color:"var(--text-muted)" }}>
            {form.rule_checks?.length || 0}/{rules.length} rules checked
          </p>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-xl text-sm font-semibold text-white"
          style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity:saving?0.7:1 }}>
          {saving ? "Saving…" : "Add Trade"}
        </button>
        <button onClick={onCancel} className="h-9 px-5 rounded-xl text-sm border"
          style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, onOpen, onEdit, onDelete }) {
  const { t } = useLanguage()
  const trades = session.trades || []
  const stats  = useMemo(() => calcStats(trades, session.initial_capital || 0), [trades, session.initial_capital])
  const finalBalance = (session.initial_capital || 0) + stats.netPnl

  return (
    <div className="rounded-2xl cursor-pointer transition-all hover:scale-[1.01]"
      style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}
      onClick={()=>onOpen(session)}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background:"rgba(108,99,255,0.12)", border:"1px solid rgba(108,99,255,0.2)" }}>
              <FlaskConical size={18} style={{ color:"var(--accent)" }}/>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold truncate text-sm" style={{ color:"var(--text-primary)" }}>{session.name}</h3>
              {session.strategy && <p className="text-xs truncate" style={{ color:"var(--text-muted)" }}>{session.strategy}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>onEdit(session)} className="p-2 rounded-xl hover:opacity-70"
              style={{ color:"var(--accent)", background:"rgba(108,99,255,0.1)" }}><Pencil size={13}/></button>
            <button onClick={()=>onDelete(session)} className="p-2 rounded-xl hover:opacity-70"
              style={{ color:"var(--accent-danger)", background:"rgba(255,71,87,0.1)" }}><Trash2 size={13}/></button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label:"P&L",      v:`${stats.netPnl>=0?"+":""}$${stats.netPnl.toFixed(0)}`, color:stats.netPnl>=0?"var(--accent-success)":"var(--accent-danger)" },
            { label:"Win Rate", v:`${stats.winRate.toFixed(0)}%`, color:stats.winRate>=50?"var(--accent-success)":"var(--accent-danger)" },
            { label:"ROI",      v:`${stats.roi.toFixed(1)}%`, color:stats.roi>=0?"var(--accent-success)":"var(--accent-danger)" },
            { label:"Trades",   v:trades.length, color:"var(--accent)" },
          ].map(s=>(
            <div key={s.label} className="rounded-xl py-2 px-2 text-center" style={{ background:"var(--bg-elevated)" }}>
              <p className="text-sm font-bold" style={{ color:s.color, fontFamily:"var(--font-mono)" }}>{s.v}</p>
              <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)", fontSize:9 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Mini balance curve */}
        {stats.curve.length > 1 && (
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={50}>
              <AreaChart data={stats.curve}>
                <defs><linearGradient id={`g${session.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={stats.netPnl>=0?"#2ed573":"#ff4757"} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={stats.netPnl>=0?"#2ed573":"#ff4757"} stopOpacity={0}/>
                </linearGradient></defs>
                <Area type="monotone" dataKey="balance" stroke={stats.netPnl>=0?"#2ed573":"#ff4757"} strokeWidth={1.5} fill={`url(#g${session.id})`} dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {session.initial_capital > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", fontFamily:"var(--font-mono)" }}>
                ${session.initial_capital.toLocaleString()} → ${finalBalance.toFixed(0)}
              </span>
            )}
            {stats.maxDD < -5 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(255,71,87,0.1)", color:"var(--accent-danger)" }}>
                DD {stats.maxDD.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold" style={{ color:"var(--accent)" }}>
            Open <ChevronRight size={12}/>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Session Detail ───────────────────────────────────────────────────────────
function SessionDetail({ session, onBack, onUpdate }) {
  const { t } = useLanguage()
  const [trades,    setTrades]    = useState(session.trades || [])
  const [adding,    setAdding]    = useState(false)
  const [playbook,  setPlaybook]  = useState(null)
  const [deleteIdx, setDeleteIdx] = useState(null)
  const [activeChart, setActiveChart] = useState("balance")

  useEffect(() => {
    setTrades(session.trades || [])
    if (session.playbook_id) {
      Playbook.list().then(pbs => {
        const pb = pbs.find(p => p.id === session.playbook_id)
        if (pb) setPlaybook(pb)
      })
    }
  }, [session])

  const stats = useMemo(() => calcStats(trades, session.initial_capital || 0), [trades, session.initial_capital])
  const finalBalance = (session.initial_capital || 0) + stats.netPnl

  const handleAddTrade = async (trade) => {
    const updated = [...trades, trade]
    await BacktestSession.update(session.id, { trades: updated })
    setTrades(updated)
    setAdding(false)
    onUpdate()
    toast.success("Trade added!")
  }

  const removeTrade = async (idx) => {
    const updated = trades.filter((_,i) => i !== idx)
    await BacktestSession.update(session.id, { trades: updated })
    setTrades(updated)
    setDeleteIdx(null)
    onUpdate()
    toast.success("Trade removed")
  }

  // Risk/rule adherence
  const tradesWithRules = trades.filter(t => t.rule_checks?.length > 0)
  const avgRuleAdherence = tradesWithRules.length > 0
    ? tradesWithRules.reduce((s,t) => {
        const rules = playbook?.entry_rules?.split("\n").filter(r=>r.trim()) || []
        return s + (rules.length > 0 ? t.rule_checks.length / rules.length * 100 : 100)
      }, 0) / tradesWithRules.length
    : null

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-xl hover:opacity-70"
          style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", color:"var(--text-secondary)" }}>
          <ChevronLeft size={16}/>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-black text-2xl truncate" style={{ color:"var(--text-primary)" }}>{session.name}</h1>
          {session.strategy && <p className="text-sm truncate" style={{ color:"var(--text-muted)" }}>{session.strategy}</p>}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-bold"
          style={{ background: stats.netPnl>=0?"rgba(46,213,115,0.1)":"rgba(255,71,87,0.1)",
            color: stats.netPnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>
          <DollarSign size={14}/>
          {stats.netPnl>=0?"+":""}${stats.netPnl.toFixed(2)}
        </div>
      </div>

      {/* Virtual Account Banner */}
      <div className="rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-4"
        style={{ background:"linear-gradient(135deg,rgba(108,99,255,0.08),rgba(0,212,170,0.06))", border:"1px solid rgba(108,99,255,0.2)" }}>
        <div>
          <p className="text-xs font-semibold mb-0.5" style={{ color:"var(--text-muted)" }}>STARTING BALANCE</p>
          <p className="text-xl font-black" style={{ color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}>
            ${(session.initial_capital||0).toLocaleString("en-US",{minimumFractionDigits:2})}
          </p>
        </div>
        <div className="text-2xl" style={{ color:"var(--text-muted)" }}>→</div>
        <div>
          <p className="text-xs font-semibold mb-0.5" style={{ color:"var(--text-muted)" }}>CURRENT BALANCE</p>
          <p className="text-xl font-black" style={{ color: finalBalance >= (session.initial_capital||0) ? "var(--accent-success)" : "var(--accent-danger)", fontFamily:"var(--font-mono)" }}>
            ${finalBalance.toLocaleString("en-US",{minimumFractionDigits:2})}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-3">
          {[
            { label:"ROI", v:`${stats.roi>=0?"+":""}${stats.roi.toFixed(2)}%`, color:stats.roi>=0?"var(--accent-success)":"var(--accent-danger)" },
            { label:"Max DD", v:`${stats.maxDD.toFixed(1)}%`, color:"var(--accent-warning)" },
            { label:"PF", v:stats.pf>=99?"∞":stats.pf.toFixed(2), color:stats.pf>=1?"var(--accent-success)":"var(--accent-danger)" },
          ].map(s=>(
            <div key={s.label} className="text-center">
              <p className="text-sm font-bold" style={{ color:s.color, fontFamily:"var(--font-mono)" }}>{s.v}</p>
              <p className="text-xs" style={{ color:"var(--text-muted)", fontSize:9 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-5">
        {[
          { label:"Win Rate",    v:`${stats.winRate.toFixed(1)}%`, color:stats.winRate>=50?"var(--accent-success)":"var(--accent-danger)" },
          { label:"Exp/Trade",   v:`${stats.exp>=0?"+":""}$${stats.exp.toFixed(2)}`, color:stats.exp>=0?"var(--accent-success)":"var(--accent-danger)" },
          { label:"Avg Win",     v:`+$${stats.avgWin.toFixed(2)}`, color:"var(--accent-success)" },
          { label:"Avg Loss",    v:`-$${stats.avgLoss.toFixed(2)}`, color:"var(--accent-danger)" },
          { label:"Avg R:R",     v:stats.avgRR>0?`${stats.avgRR.toFixed(2)}:1`:"—", color:"var(--accent)" },
          { label:"Avg Risk",    v:stats.avgRisk>0?`${stats.avgRisk.toFixed(1)}%`:"—", color:"var(--accent-warning)" },
          { label:"Max C.L",     v:stats.maxConsecLoss, color:stats.maxConsecLoss>=3?"var(--accent-danger)":"var(--text-secondary)" },
          { label:"Trades",      v:trades.length, color:"var(--text-primary)" },
        ].map(s=>(
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <p className="font-bold text-sm" style={{ color:s.color, fontFamily:"var(--font-mono)" }}>{s.v}</p>
            <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)", fontSize:9 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Rule Adherence bar (if playbook) */}
      {avgRuleAdherence !== null && (
        <div className="rounded-2xl p-4 mb-5 flex items-center gap-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <Shield size={16} style={{ color:"var(--accent)" }}/>
          <div className="flex-1">
            <div className="flex justify-between mb-1">
              <p className="text-xs font-semibold" style={{ color:"var(--text-primary)" }}>Rule Adherence</p>
              <p className="text-xs font-bold" style={{ color: avgRuleAdherence>=80?"var(--accent-success)":avgRuleAdherence>=50?"var(--accent-warning)":"var(--accent-danger)" }}>
                {avgRuleAdherence.toFixed(0)}%
              </p>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background:"var(--bg-elevated)" }}>
              <div className="h-full rounded-full transition-all"
                style={{ width:`${avgRuleAdherence}%`,
                  background: avgRuleAdherence>=80?"var(--accent-success)":avgRuleAdherence>=50?"var(--accent-warning)":"var(--accent-danger)" }}/>
            </div>
          </div>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>{tradesWithRules.length} trades tracked</p>
        </div>
      )}

      {/* Charts */}
      {stats.curve.length > 1 && (
        <div className="rounded-2xl p-5 mb-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          {/* Tab switcher */}
          <div className="flex items-center gap-3 mb-4">
            {[
              { id:"balance", label:"Balance Curve" },
              { id:"drawdown", label:"Drawdown" },
              { id:"pnl", label:"Trade P&L" },
            ].map(tab=>(
              <button key={tab.id} onClick={()=>setActiveChart(tab.id)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ background:activeChart===tab.id?"var(--accent)":"var(--bg-elevated)",
                  color:activeChart===tab.id?"#fff":"var(--text-secondary)" }}>
                {tab.label}
              </button>
            ))}
          </div>

          {activeChart === "balance" && (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.curve}>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={stats.netPnl>=0?"#2ed573":"#ff4757"} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={stats.netPnl>=0?"#2ed573":"#ff4757"} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:9 }} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:9 }} tickFormatter={v=>`$${v}`} axisLine={false} tickLine={false}/>
                <ReferenceLine y={session.initial_capital||0} stroke="var(--text-muted)" strokeDasharray="4 4" label={{ value:"Start", fill:"var(--text-muted)", fontSize:9 }}/>
                <Tooltip contentStyle={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }}
                  formatter={v=>[`$${v.toFixed(2)}`,"Balance"]}/>
                <Area type="monotone" dataKey="balance" stroke={stats.netPnl>=0?"#2ed573":"#ff4757"} strokeWidth={2} fill="url(#balGrad)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          )}

          {activeChart === "drawdown" && (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.ddCurve}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ff4757" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ff4757" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:9 }} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:9 }} tickFormatter={v=>`${v}%`} axisLine={false} tickLine={false}/>
                <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="4 4"/>
                <Tooltip contentStyle={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }}
                  formatter={v=>[`${v.toFixed(2)}%`,"Drawdown"]}/>
                <Area type="monotone" dataKey="drawdown" stroke="#ff4757" strokeWidth={2} fill="url(#ddGrad)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          )}

          {activeChart === "pnl" && (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trades.map((t,i)=>({ i:i+1, pnl:t.pnl||0 }))}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
                <XAxis dataKey="i" tick={{ fill:"var(--text-muted)", fontSize:9 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:9 }} tickFormatter={v=>`$${v}`} axisLine={false} tickLine={false}/>
                <ReferenceLine y={0} stroke="var(--text-muted)"/>
                <Tooltip contentStyle={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, fontSize:11 }}
                  formatter={v=>[`${v>=0?"+":""}$${v.toFixed(2)}`,"P&L"]}/>
                <Bar dataKey="pnl" radius={[4,4,0,0]}>
                  {trades.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Add trade button */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm" style={{ color:"var(--text-primary)" }}>Trades ({trades.length})</h3>
        {!adding && (
          <button onClick={()=>setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
            <Plus size={13}/> Add Trade
          </button>
        )}
      </div>

      {/* Trade form */}
      {adding && (
        <TradeForm session={{ ...session, trades }} playbook={playbook} onSave={handleAddTrade} onCancel={()=>setAdding(false)}/>
      )}

      {/* Trades table */}
      {trades.length > 0 ? (
        <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
                  {["#","Symbol","Dir","Outcome","P&L","Risk%","R:R","Balance","Session","TF","Rules",""].map(h=>(
                    <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap" style={{ color:"var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((tr, i) => {
                  let runningBal = session.initial_capital || 0
                  for (let j = 0; j <= i; j++) runningBal += (trades[j].pnl || 0)
                  const rules = playbook?.entry_rules?.split("\n").filter(r=>r.trim()) || []
                  const adherence = rules.length > 0 && tr.rule_checks?.length > 0
                    ? (tr.rule_checks.length / rules.length * 100).toFixed(0) : null
                  return (
                    <tr key={tr.id||i} style={{ borderBottom:"1px solid var(--border)" }}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td className="px-3 py-3" style={{ color:"var(--text-muted)" }}>{i+1}</td>
                      <td className="px-3 py-3 font-bold" style={{ color:"var(--accent)" }}>{tr.symbol||"—"}</td>
                      <td className="px-3 py-3">
                        <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
                          style={{ background:tr.direction==="BUY"?"rgba(46,213,115,0.12)":"rgba(255,71,87,0.12)", color:tr.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                          {tr.direction==="BUY"?"▲":"▼"} {tr.direction}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 rounded-full font-semibold"
                          style={{ background:tr.outcome==="WIN"?"rgba(46,213,115,0.12)":tr.outcome==="LOSS"?"rgba(255,71,87,0.12)":"rgba(108,99,255,0.12)",
                            color:tr.outcome==="WIN"?"var(--accent-success)":tr.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>
                          {tr.outcome}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-bold" style={{ color:(tr.pnl||0)>=0?"var(--accent-success)":"var(--accent-danger)", fontFamily:"var(--font-mono)" }}>
                        {(tr.pnl||0)>=0?"+":""}${parseFloat(tr.pnl||0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3" style={{ color:"var(--accent-warning)", fontFamily:"var(--font-mono)" }}>
                        {tr.risk_pct > 0 ? `${tr.risk_pct}%` : "—"}
                      </td>
                      <td className="px-3 py-3" style={{ color:"var(--accent)", fontFamily:"var(--font-mono)" }}>
                        {tr.rr > 0 ? `${parseFloat(tr.rr).toFixed(1)}:1` : "—"}
                      </td>
                      <td className="px-3 py-3 font-bold" style={{ color: runningBal >= (session.initial_capital||0) ? "var(--accent-success)" : "var(--accent-danger)", fontFamily:"var(--font-mono)" }}>
                        ${runningBal.toFixed(2)}
                      </td>
                      <td className="px-3 py-3" style={{ color:"var(--text-secondary)" }}>{tr.session||"—"}</td>
                      <td className="px-3 py-3" style={{ color:"var(--text-secondary)" }}>{tr.timeframe||"—"}</td>
                      <td className="px-3 py-3">
                        {adherence !== null && (
                          <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: parseInt(adherence)>=75?"rgba(46,213,115,0.12)":"rgba(255,165,2,0.12)", color: parseInt(adherence)>=75?"var(--accent-success)":"var(--accent-warning)" }}>
                            {adherence}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {deleteIdx === i ? (
                          <div className="flex gap-1">
                            <button onClick={()=>removeTrade(i)} className="text-xs px-2 py-0.5 rounded"
                              style={{ background:"var(--accent-danger)", color:"#fff" }}>Del</button>
                            <button onClick={()=>setDeleteIdx(null)} className="text-xs px-2 py-0.5 rounded"
                              style={{ background:"var(--bg-elevated)", color:"var(--text-secondary)" }}>×</button>
                          </div>
                        ) : (
                          <button onClick={()=>setDeleteIdx(i)} className="p-1.5 rounded-lg hover:opacity-70"
                            style={{ color:"var(--accent-danger)", background:"rgba(255,71,87,0.1)" }}>
                            <Trash2 size={12}/>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl py-12 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <FlaskConical size={28} className="mx-auto mb-3" style={{ color:"var(--text-muted)" }}/>
          <p className="text-sm" style={{ color:"var(--text-muted)" }}>No trades yet — click "Add Trade" to start logging backtest results.</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Backtesting Page ─────────────────────────────────────────────────────
export default function Backtesting() {
  const { t } = useLanguage()
  const [sessions,     setSessions]     = useState([])
  const [playbooks,    setPlaybooks]    = useState([])
  const [activeSession,setActiveSession]= useState(null)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editSession,  setEditSession]  = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [playbookFilter,setPlaybookFilter] = useState("ALL")

  const load = async () => {
    const [data,pbs] = await Promise.all([BacktestSession.list(), Playbook.list()])
    setSessions(data.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)))
    setPlaybooks((pbs||[]).filter(p=>p.status==="active"))
  }
  useEffect(()=>{ load() },[])

  const openNew     = () => { setEditSession(null); setModalOpen(true) }
  const handleEdit  = s  => { setEditSession(s);   setModalOpen(true) }
  const handleDelete = async () => {
    if(!deleteTarget) return
    await BacktestSession.delete(deleteTarget.id)
    toast.success("Session deleted")
    setDeleteTarget(null)
    if(activeSession?.id===deleteTarget.id) setActiveSession(null)
    load()
  }

  const filteredSessions = playbookFilter==="ALL" ? sessions : sessions.filter(s=>s.playbook_id===playbookFilter)

  // Overall summary
  const totalTrades = sessions.reduce((s,sess)=>s+(sess.trades||[]).length,0)
  const totalPnl    = sessions.reduce((s,sess)=>s+(sess.trades||[]).reduce((a,t)=>a+(t.pnl||0),0),0)
  const bestSession = sessions.reduce((best,sess)=>{
    const p = (sess.trades||[]).reduce((s,t)=>s+(t.pnl||0),0)
    return p > (best?(best.trades||[]).reduce((s,t)=>s+(t.pnl||0),0):-Infinity) ? sess : best
  }, null)
  const avgWinRate = sessions.length > 0
    ? sessions.reduce((s,sess) => {
        const tr = sess.trades||[]; if (!tr.length) return s
        return s + tr.filter(t=>t.outcome==="WIN").length / tr.length * 100
      }, 0) / sessions.filter(s=>(s.trades||[]).length>0).length
    : 0

  if(activeSession) {
    const latest = sessions.find(s=>s.id===activeSession.id)||activeSession
    return <SessionDetail session={latest} onBack={()=>setActiveSession(null)} onUpdate={load}/>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black" style={{ color:"var(--text-primary)" }}>Backtesting</h1>
          <p className="text-xs mt-1" style={{ color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
            {sessions.length} session{sessions.length!==1?"s":""} · {totalTrades} trades
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white self-start"
          style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
          <Plus size={14}/> New Session
        </button>
      </div>

      {/* Summary stats */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label:"Sessions",      v:sessions.length,              color:"var(--accent)",            icon:FlaskConical },
            { label:"Combined P&L",  v:`${totalPnl>=0?"+":""}$${totalPnl.toFixed(0)}`, color:totalPnl>=0?"var(--accent-success)":"var(--accent-danger)", icon:totalPnl>=0?TrendingUp:TrendingDown },
            { label:"Avg Win Rate",  v:`${isNaN(avgWinRate)?0:avgWinRate.toFixed(1)}%`, color:avgWinRate>=50?"var(--accent-success)":"var(--accent-danger)", icon:Target },
            { label:"Best Session",  v:bestSession?.name||"—",       color:"#ffd700",                  icon:Trophy },
          ].map(s=>(
            <div key={s.label} className="rounded-2xl p-4 flex items-center gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background:`${s.color}18` }}>
                <s.icon size={18} style={{ color:s.color }}/>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate" style={{ color:s.color, fontFamily:"var(--font-mono)" }}>{s.v}</p>
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Playbook filter */}
      {playbooks.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {[{id:"ALL",name:"All Sessions"}, ...playbooks].map(pb=>(
            <button key={pb.id} onClick={()=>setPlaybookFilter(pb.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
              style={{ background:playbookFilter===pb.id?"var(--accent)":"var(--bg-elevated)",
                borderColor:playbookFilter===pb.id?"var(--accent)":"var(--border)",
                color:playbookFilter===pb.id?"#fff":"var(--text-secondary)" }}>
              <BookOpen size={10}/> {pb.name}
            </button>
          ))}
        </div>
      )}

      {/* Session grid */}
      {filteredSessions.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background:"rgba(108,99,255,0.1)" }}>
            <FlaskConical size={26} style={{ color:"var(--accent)" }}/>
          </div>
          <p className="font-bold text-base mb-2" style={{ color:"var(--text-primary)" }}>
            {sessions.length === 0 ? "No backtest sessions yet" : "No sessions match this filter"}
          </p>
          <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>
            {sessions.length === 0
              ? "Create a session to test your strategies on historical data with a virtual account."
              : "Try selecting a different playbook filter."}
          </p>
          {sessions.length === 0 && (
            <button onClick={openNew} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white mx-auto"
              style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
              <Plus size={14}/> Create First Session
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map(s=>(
            <SessionCard key={s.id} session={s}
              onOpen={sess=>{ setActiveSession(sess); load() }}
              onEdit={handleEdit}
              onDelete={setDeleteTarget}/>
          ))}
        </div>
      )}

      <SessionModal open={modalOpen} onClose={()=>{setModalOpen(false);setEditSession(null)}} onSaved={load} editSession={editSession}/>
      {deleteTarget && <DeleteConfirm label={deleteTarget.name} onCancel={()=>setDeleteTarget(null)} onConfirm={handleDelete}/>}
    </div>
  )
}
