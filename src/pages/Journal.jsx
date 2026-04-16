import { useState, useEffect, useRef, useMemo } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { Trade, Playbook, subscribeToTable } from "@/api/supabaseStore"
import { supabase } from "@/lib/supabase"
import { useLanguage } from "@/lib/LanguageContext"
import { toast } from "@/components/ui/toast"
import {
  Plus, Pencil, Trash2, X, List, CalendarDays,
  TrendingUp, TrendingDown, Activity, ChevronLeft, ChevronRight,
  Upload, CheckCircle, Brain, Sparkles, Download, AlertTriangle, ChevronDown, ChevronUp,
  BarChart2, Clock, Hash, Play, Pause, SkipBack, SkipForward, FastForward, Rewind, BookOpen, FileText
} from "lucide-react"


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
      tags: Array.isArray(t.tags) ? t.tags : [],
    }
  } catch { return null }
}

// ─── Constants ───────────────────────────────────────────────────────────────
const SYMBOLS  = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","GBPJPY","USDCAD","NZDUSD","USDCHF","US30","NAS100","SPX500"]
const SESSIONS = ["LONDON","NEW_YORK","ASIAN","SYDNEY"]
const TFS      = ["M1","M5","M15","M30","H1","H4","D1"]

const OUTCOME_STYLE = {
  WIN:       { bg:"rgba(46,213,115,0.15)",  color:"var(--accent-success)" },
  LOSS:      { bg:"rgba(255,71,87,0.15)",   color:"var(--accent-danger)" },
  BREAKEVEN: { bg:"rgba(108,99,255,0.15)",  color:"var(--accent)" },
}
const DIR_STYLE = {
  BUY:  { bg:"rgba(46,213,115,0.15)", color:"var(--accent-success)" },
  SELL: { bg:"rgba(255,71,87,0.15)", color:"var(--accent-danger)" },
}


// ─── Tag Definitions ──────────────────────────────────────────────────────────
const TRADE_TAGS = {
  mistakes: {
    label: "Mistakes", color: "#ff4757", bg: "rgba(255,71,87,0.12)",
    tags: ["FOMO","Revenge Trade","Overleverage","Early Exit","Late Entry",
           "Moved SL","No Setup","Chased Price","Sized Up","Ignored Plan"]
  },
  setups: {
    label: "Setups", color: "#6c63ff", bg: "rgba(108,99,255,0.12)",
    tags: ["Break & Retest","Structure Break","Supply/Demand","Trend Continuation",
           "Reversal","Scalp","Breakout","Range Play","News Play","Opening Range"]
  },
  habits: {
    label: "Habits", color: "#2ed573", bg: "rgba(46,213,115,0.12)",
    tags: ["Followed Plan","Checked HTF","Waited Confirmation","Respected SL",
           "Took Partial","Sized Down","Reviewed Chart","Journaled Before"]
  },
}

function getTagStyle(tag) {
  for (const cat of Object.values(TRADE_TAGS)) {
    if (cat.tags.includes(tag)) return { color: cat.color, bg: cat.bg }
  }
  return { color: "var(--accent)", bg: "rgba(108,99,255,0.12)" }
}

// ─── Trade Form Modal ─────────────────────────────────────────────────────────
const EMPTY_FORM = {
  symbol:"EURUSD", direction:"BUY", entry_price:"", exit_price:"",
  pnl:"", pips:"", session:"LONDON", timeframe:"H1",
  outcome:"WIN", quality:"7", notes:"",
  entry_time: new Date().toISOString().slice(0,16)
}

function TradeModal({ open, onClose, onSaved, editTrade }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const isEdit = !!editTrade

  useEffect(() => {
    if (editTrade) {
      setForm({
        ...editTrade,
        entry_price: editTrade.entry_price ?? "",
        exit_price:  editTrade.exit_price  ?? "",
        pnl:         editTrade.pnl         ?? "",
        pips:        editTrade.pips        ?? "",
        quality:     editTrade.quality     ?? "7",
        entry_time:  editTrade.entry_time
          ? new Date(editTrade.entry_time).toISOString().slice(0,16)
          : new Date().toISOString().slice(0,16),
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [editTrade, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.symbol) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        entry_price: parseFloat(form.entry_price) || 0,
        exit_price:  parseFloat(form.exit_price)  || 0,
        pnl:         parseFloat(form.pnl)         || 0,
        pips:        parseFloat(form.pips)        || 0,
        quality:     parseInt(form.quality)       || 5,
        entry_time:  new Date(form.entry_time).toISOString(),
      }
      if (isEdit) {
        await Trade.update(editTrade.id, payload)
        toast.success("Trade updated!")
      } else {
        await Trade.create(payload)
        toast.success("Trade logged!")
      }
      onSaved()
      onClose()
    } catch(e) {
      toast.error("Failed to save trade")
    }
    setSaving(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-lg rounded-2xl shadow-2xl z-10 max-h-[90vh] overflow-y-auto" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="sticky top-0 flex items-center justify-between p-6 pb-4" style={{ background:"var(--bg-card)", borderBottom:"1px solid var(--border)" }}>
          <h2 className="text-lg font-bold" style={{ color:"var(--text-primary)" }}>
            {isEdit ? "Edit Trade" : "Log New Trade"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={16}/></button>
        </div>

        <div className="p-6 grid grid-cols-2 gap-3">
          {/* Symbol */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Symbol</label>
            <select value={form.symbol} onChange={e=>set("symbol",e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {SYMBOLS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          {/* Direction */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Direction</label>
            <div className="flex gap-2">
              {["BUY","SELL"].map(d=>(
                <button key={d} onClick={()=>set("direction",d)} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-all"
                  style={{ background: form.direction===d?(d==="BUY"?"rgba(46,213,115,0.2)":"rgba(255,71,87,0.2)"):"var(--bg-elevated)",
                    borderColor: form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--border)",
                    color: form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--text-secondary)" }}>
                  {d==="BUY"?"▲":"▼"} {d}
                </button>
              ))}
            </div>
          </div>
          {/* Entry */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Entry Price</label>
            <input type="number" step="any" placeholder="1.0845" value={form.entry_price} onChange={e=>set("entry_price",e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          {/* Exit */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Exit Price</label>
            <input type="number" step="any" placeholder="1.0883" value={form.exit_price} onChange={e=>set("exit_price",e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          {/* P&L */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>P&L ($)</label>
            <input type="number" step="any" placeholder="38.00" value={form.pnl} onChange={e=>set("pnl",e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          {/* Pips */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Pips</label>
            <input type="number" step="any" placeholder="38" value={form.pips} onChange={e=>set("pips",e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          {/* Outcome */}
          <div className="col-span-2">
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Outcome</label>
            <div className="flex gap-2">
              {["WIN","LOSS","BREAKEVEN"].map(o=>(
                <button key={o} onClick={()=>set("outcome",o)} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-all"
                  style={{ background: form.outcome===o?(o==="WIN"?"rgba(46,213,115,0.2)":o==="LOSS"?"rgba(255,71,87,0.2)":"rgba(108,99,255,0.2)"):"var(--bg-elevated)",
                    borderColor: form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--border)",
                    color: form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--text-secondary)" }}>
                  {o==="BREAKEVEN"?"BREAKEVEN":o}
                </button>
              ))}
            </div>
          </div>
          {/* Session */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Session</label>
            <select value={form.session} onChange={e=>set("session",e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {SESSIONS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          {/* Timeframe */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Timeframe</label>
            <select value={form.timeframe} onChange={e=>set("timeframe",e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {TFS.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          {/* Quality */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Quality (1–10)</label>
            <input type="number" min="1" max="10" value={form.quality} onChange={e=>set("quality",e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          {/* Date */}
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Date & Time</label>
            <input type="datetime-local" value={form.entry_time} onChange={e=>set("entry_time",e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          {/* Notes */}
          <div className="col-span-2">
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Notes</label>
            <textarea rows={3} placeholder="Setup, reasoning, lessons learned..." value={form.notes} onChange={e=>set("notes",e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)", opacity: saving?0.7:1 }}>
            {saving ? "Saving..." : isEdit ? "Update Trade" : "Save Trade"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ trade, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <h3 className="text-base font-bold mb-2" style={{ color:"var(--text-primary)" }}>Delete Trade?</h3>
        <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>
          This will permanently remove the <strong style={{ color:"var(--text-primary)" }}>{trade?.symbol}</strong> trade. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white" style={{ background:"var(--accent-danger)" }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Calendar View ────────────────────────────────────────────────────────────
function CalendarView({ trades, onNewTrade, onEdit, onDelete, onAI, playbooks = [] }) {
  const navigate = useNavigate()
  const { user } = useUser()
  const [current,     setCurrent]     = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)  // "YYYY-MM-DD"
  const [dayNote,     setDayNote]     = useState(null)  // daily_notes row for selectedDay
  const [noteLoading, setNoteLoading] = useState(false)

  const year  = current.getFullYear()
  const month = current.getMonth()
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()
  const todayKey    = new Date().toISOString().slice(0,10)

  const byDay = {}
  trades.forEach(t => {
    if (!t.entry_time) return
    const key = new Date(t.entry_time).toISOString().slice(0,10)
    if (!byDay[key]) byDay[key] = []
    byDay[key].push(t)
  })

  const monthTotal = Object.entries(byDay)
    .filter(([d]) => d.startsWith(`${year}-${String(month+1).padStart(2,"0")}`))
    .reduce((s,[,arr]) => s + arr.reduce((a,t) => a+(t.pnl||0), 0), 0)

  const selectedTrades = selectedDay ? (byDay[selectedDay] || []) : []

  // Load notebook note for selected day
  useEffect(() => {
    if (!selectedDay || !user?.id) { setDayNote(null); return }
    setNoteLoading(true)
    supabase.from('daily_notes').select('*').eq('user_id', user.id).eq('date', selectedDay).single()
      .then(({ data }) => { setDayNote(data || null); setNoteLoading(false) })
      .catch(() => { setDayNote(null); setNoteLoading(false) })
  }, [selectedDay, user?.id])

  const selectedPnl    = selectedTrades.reduce((s,t) => s+(t.pnl||0), 0)

  const fmtDate = (key) => new Date(key + "T12:00:00").toLocaleDateString("en-US", {
    weekday:"long", month:"long", day:"numeric"
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* ── Calendar grid (2/3 width) ──────────────────────────────── */}
      <div className="lg:col-span-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrent(new Date(year,month-1,1))} className="p-2 rounded-lg hover:opacity-70"
              style={{ background:"var(--bg-elevated)", color:"var(--text-secondary)" }}>
              <ChevronLeft size={16}/>
            </button>
            <h2 className="text-base font-bold" style={{ color:"var(--text-primary)" }}>{MONTHS[month]} {year}</h2>
            <button onClick={() => setCurrent(new Date(year,month+1,1))} className="p-2 rounded-lg hover:opacity-70"
              style={{ background:"var(--bg-elevated)", color:"var(--text-secondary)" }}>
              <ChevronRight size={16}/>
            </button>
            <button onClick={() => { setCurrent(new Date()); setSelectedDay(todayKey) }}
              className="px-3 py-1 rounded-lg text-xs font-medium"
              style={{ background:"rgba(108,99,255,0.15)", color:"var(--accent)" }}>
              Today
            </button>
          </div>
          <span className="text-sm font-semibold"
            style={{ color: monthTotal>=0?"var(--accent-success)":"var(--accent-danger)" }}>
            {monthTotal>=0?"+":""}${monthTotal.toFixed(0)} this month
          </span>
        </div>

        {/* Grid */}
        <div className="rounded-2xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
          <div className="grid grid-cols-7" style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-semibold py-2.5" style={{ color:"var(--text-muted)" }}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstDay }).map((_,i) => (
              <div key={`e${i}`} style={{ borderBottom:"1px solid var(--border)", borderRight:"1px solid var(--border)", minHeight:88 }}/>
            ))}
            {Array.from({ length: daysInMonth }).map((_,i) => {
              const day = i+1
              const key = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`
              const dayTrades = byDay[key] || []
              const pnl    = dayTrades.reduce((s,t) => s+(t.pnl||0), 0)
              const wins   = dayTrades.filter(t => t.outcome==="WIN").length
              const losses = dayTrades.filter(t => t.outcome==="LOSS").length
              const hasTrades  = dayTrades.length > 0
              const isToday    = key === todayKey
              const isSelected = key === selectedDay
              const hasNote    = false  // will use dayNotes map when available
              const dow = new Date(year,month,day).getDay()
              const isLastInRow = dow===6 || day===daysInMonth

              return (
                <div key={day}
                  className="p-2 cursor-pointer transition-all"
                  onClick={() => setSelectedDay(isSelected ? null : key)}
                  style={{
                    borderBottom:  "1px solid var(--border)",
                    borderRight:   isLastInRow ? "none" : "1px solid var(--border)",
                    minHeight:     88,
                    background:    isSelected
                      ? "rgba(108,99,255,0.12)"
                      : hasTrades
                      ? pnl>=0 ? "rgba(46,213,115,0.04)" : "rgba(255,71,87,0.04)"
                      : "transparent",
                    outline:       isSelected ? "2px solid rgba(108,99,255,0.5)" : "none",
                    outlineOffset: "-1px",
                  }}
                  onMouseEnter={e => { if(!isSelected) e.currentTarget.style.background = "var(--bg-elevated)" }}
                  onMouseLeave={e => { if(!isSelected) e.currentTarget.style.background = hasTrades ? (pnl>=0?"rgba(46,213,115,0.04)":"rgba(255,71,87,0.04)") : "transparent" }}>

                  {/* Day number */}
                  <div className="text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1"
                    style={{ color:isToday?"#fff":isSelected?"var(--accent)":"var(--text-secondary)",
                      background:isToday?"var(--accent)":isSelected?"rgba(108,99,255,0.15)":"transparent" }}>
                    {day}
                  </div>

                  {hasTrades && (
                    <div>
                      <div className="text-xs font-bold"
                        style={{ color: pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                        {pnl>=0?"+":""}${Math.abs(pnl)>=1000?(pnl/1000).toFixed(1)+"k":pnl.toFixed(0)}
                      </div>
                      <div className="flex gap-0.5 mt-0.5 flex-wrap">
                        {wins>0 && <span className="text-xs px-1 rounded" style={{ background:"rgba(46,213,115,0.15)", color:"var(--accent-success)", fontSize:10 }}>{wins}W</span>}
                        {losses>0 && <span className="text-xs px-1 rounded" style={{ background:"rgba(255,71,87,0.15)", color:"var(--accent-danger)", fontSize:10 }}>{losses}L</span>}
                        <span className="text-xs" style={{ color:"var(--text-muted)", fontSize:10 }}>{dayTrades.length}t</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Day detail panel (1/3 width) ────────────────────────────── */}
      <div className="lg:col-span-1">
        {selectedDay ? (
          <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            {/* Panel header */}
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
              <div>
                <p className="text-xs font-bold" style={{ color:"var(--accent)" }}>{fmtDate(selectedDay)}</p>
                <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>
                  {selectedTrades.length} trade{selectedTrades.length!==1?"s":""}
                  {selectedTrades.length > 0 && (
                    <span style={{ color: selectedPnl>=0?"var(--accent-success)":"var(--accent-danger)", marginLeft:6 }}>
                      {selectedPnl>=0?"+":""}${selectedPnl.toFixed(2)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate(`/Notebook?date=${selectedDay}`)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background:"rgba(108,99,255,0.12)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}
                  title="Open Notebook for this day">
                  <FileText size={12}/> Notebook
                </button>
                <button onClick={() => setSelectedDay(null)}
                  className="p-1 rounded-lg hover:opacity-70"
                  style={{ color:"var(--text-muted)" }}>
                  <X size={14}/>
                </button>
              </div>
            </div>

            {/* Notebook note preview */}
            {(dayNote || noteLoading) && (
              <div className="px-4 py-3" style={{ borderBottom:"1px solid var(--border)", background:"rgba(108,99,255,0.04)" }}>
                {noteLoading ? (
                  <p className="text-xs animate-pulse" style={{ color:"var(--text-muted)" }}>Loading note…</p>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <FileText size={11} style={{ color:"var(--accent)" }}/>
                        <p className="text-xs font-semibold" style={{ color:"var(--accent)" }}>Notebook Entry</p>
                      </div>
                      <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: dayNote.discipline >= 7 ? "rgba(46,213,115,0.1)" : dayNote.discipline >= 4 ? "rgba(255,165,2,0.1)" : "rgba(255,71,87,0.1)",
                          color: dayNote.discipline >= 7 ? "var(--accent-success)" : dayNote.discipline >= 4 ? "var(--accent-warning)" : "var(--accent-danger)" }}>
                        Discipline: {dayNote.discipline || "—"}/10
                      </span>
                    </div>
                    {dayNote.pre_market && (
                      <div className="mb-1.5">
                        <p className="text-xs font-medium mb-0.5" style={{ color:"var(--text-muted)" }}>Pre-Market</p>
                        <p className="text-xs line-clamp-2" style={{ color:"var(--text-secondary)" }}>{dayNote.pre_market}</p>
                      </div>
                    )}
                    {dayNote.post_market && (
                      <div>
                        <p className="text-xs font-medium mb-0.5" style={{ color:"var(--text-muted)" }}>Post-Market Review</p>
                        <p className="text-xs line-clamp-2" style={{ color:"var(--text-secondary)" }}>{dayNote.post_market}</p>
                      </div>
                    )}
                    {!dayNote.pre_market && !dayNote.post_market && dayNote.lessons && (
                      <p className="text-xs line-clamp-2" style={{ color:"var(--text-secondary)" }}>{dayNote.lessons}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Day stats strip */}
            {selectedTrades.length > 0 && (() => {
              const wins   = selectedTrades.filter(t=>t.outcome==="WIN").length
              const losses = selectedTrades.filter(t=>t.outcome==="LOSS").length
              const wr     = Math.round(wins/selectedTrades.length*100)
              return (
                <div className="grid grid-cols-3 gap-0" style={{ borderBottom:"1px solid var(--border)" }}>
                  {[
                    { label:"Trades", value:selectedTrades.length, color:"var(--accent)" },
                    { label:"Win Rate", value:`${wr}%`, color:wr>=50?"var(--accent-success)":"var(--accent-danger)" },
                    { label:"Net P&L", value:`${selectedPnl>=0?"+":""}$${selectedPnl.toFixed(2)}`, color:selectedPnl>=0?"var(--accent-success)":"var(--accent-danger)" },
                  ].map((s,i) => (
                    <div key={s.label} className="py-2.5 text-center"
                      style={{ borderRight: i<2?"1px solid var(--border)":"none" }}>
                      <p className="text-sm font-bold" style={{ color:s.color, fontFamily:"var(--font-mono)" }}>{s.value}</p>
                      <p className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Trade list */}
            <div className="overflow-y-auto" style={{ maxHeight:520 }}>
              {selectedTrades.length === 0 ? (
                <div className="py-12 text-center">
                  <CalendarDays size={28} className="mx-auto mb-2" style={{ color:"var(--text-muted)" }}/>
                  <p className="text-sm" style={{ color:"var(--text-muted)" }}>No trades on this day</p>
                  <button onClick={() => { onNewTrade && onNewTrade() }}
                    className="mt-3 text-xs px-3 py-1.5 rounded-lg"
                    style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)" }}>
                    + Log a trade
                  </button>
                </div>
              ) : selectedTrades.map((trade, idx) => {
                const pnl    = parseFloat(trade.pnl||0)
                const pnlClr = pnl>=0?"var(--accent-success)":"var(--accent-danger)"
                const dp     = (trade.entry_price||0) < 10 ? 5 : 2

                return (
                  <div key={trade.id || idx}
                    className="px-4 py-3"
                    style={{ borderBottom: idx<selectedTrades.length-1?"1px solid var(--border)":"none" }}>

                    {/* Trade header row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm" style={{ color:"var(--accent)", fontFamily:"var(--font-mono)" }}>
                          {trade.symbol}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                          style={{ background:trade.direction==="BUY"?"rgba(46,213,115,0.12)":"rgba(255,71,87,0.12)",
                            color:trade.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                          {trade.direction==="BUY"?"▲":"▼"} {trade.direction}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background:trade.outcome==="WIN"?"rgba(46,213,115,0.12)":trade.outcome==="LOSS"?"rgba(255,71,87,0.12)":"rgba(108,99,255,0.12)",
                            color:trade.outcome==="WIN"?"var(--accent-success)":trade.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>
                          {trade.outcome}
                        </span>
                      </div>
                      <span className="font-bold text-sm" style={{ color:pnlClr, fontFamily:"var(--font-mono)" }}>
                        {pnl>=0?"+":""}${pnl.toFixed(2)}
                      </span>
                    </div>

                    {/* Trade details grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2">
                      {[
                        { label:"Entry", value:parseFloat(trade.entry_price||0).toFixed(dp) },
                        { label:"Exit",  value:parseFloat(trade.exit_price||0).toFixed(dp)  },
                        { label:"Pips",  value:trade.pips||"—"   },
                        { label:"Vol",   value:trade.volume||"—" },
                        { label:"TF",    value:trade.timeframe||"—" },
                        { label:"Session",value:trade.session||"—"  },
                        { label:"Quality",value:`${trade.quality||"—"}/10` },
                        { label:"Time",  value:trade.entry_time ? new Date(trade.entry_time).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:false}) : "—" },
                      ].map(s => (
                        <div key={s.label} className="flex justify-between">
                          <span className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}</span>
                          <span className="text-xs font-medium" style={{ color:"var(--text-secondary)", fontFamily:"var(--font-mono)" }}>{s.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Tags */}
                    {Array.isArray(trade.tags) && trade.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {trade.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 rounded-full text-xs"
                            style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", fontSize:10 }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {trade.notes && (
                      <p className="text-xs mb-2" style={{ color:"var(--text-muted)", lineHeight:1.5 }}>
                        {trade.notes}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={() => onAI && onAI(trade)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background:"rgba(0,212,170,0.1)", color:"var(--accent-secondary)", border:"1px solid rgba(0,212,170,0.2)" }}>
                        <Brain size={11}/> AI Review
                      </button>
                      <button onClick={() => onEdit && onEdit(trade)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold"
                        style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>
                        <Pencil size={11}/> Edit
                      </button>
                      <button onClick={() => onDelete && onDelete(trade)}
                        className="px-2 py-1.5 rounded-lg text-xs"
                        style={{ background:"rgba(255,71,87,0.08)", color:"var(--accent-danger)", border:"1px solid rgba(255,71,87,0.15)" }}>
                        <Trash2 size={11}/>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl flex flex-col items-center justify-center py-16 gap-3"
            style={{ background:"var(--bg-card)", border:"1px dashed var(--border)" }}>
            <CalendarDays size={36} style={{ color:"var(--text-muted)" }}/>
            <p className="text-sm font-medium" style={{ color:"var(--text-secondary)" }}>Click any day to see trades</p>
            <p className="text-xs text-center px-6" style={{ color:"var(--text-muted)" }}>
              Days with trades show P&L and win/loss counts
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Mini Candlestick Chart (SVG) ────────────────────────────────────────────
// ─── Quality Score Editor ──────────────────────────────────────────────────────
// Quality is a self-assessed score 1–10 based on how well the trade matched
// your playbook rules: entry clarity, level quality, risk definition, and
// emotional discipline. EA imports default to 5 (neutral) — edit it here.
const QUALITY_CRITERIA = [
  { min:9, label:"S-Tier",  desc:"Textbook setup — every rule met, high conviction", color:"#2ed573" },
  { min:7, label:"A-Tier",  desc:"Strong setup — most rules met, clear SL/TP",       color:"#00d4aa" },
  { min:5, label:"B-Tier",  desc:"Decent setup — some hesitation or compromise",      color:"#ffa502" },
  { min:3, label:"C-Tier",  desc:"Weak setup — rules bent, emotional bias present",  color:"#ff6b35" },
  { min:1, label:"D-Tier",  desc:"Revenge/FOMO trade — should not have been taken",  color:"#ff4757" },
]

function QualityEditor({ trade, onUpdate }) {
  const [q,       setQ]       = useState(trade.quality || 5)
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [tooltip, setTooltip] = useState(false)

  const tier = QUALITY_CRITERIA.find(c => q >= c.min) || QUALITY_CRITERIA[4]

  const save = async (val) => {
    setSaving(true)
    try {
      await Trade.update(trade.id, { quality: val })
      if (onUpdate) onUpdate({ ...trade, quality: val })
    } catch {}
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="rounded-lg p-2 col-span-2 relative" style={{ background:"var(--bg-card)", border:`1px solid ${tier.color}30` }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold" style={{ color: tier.color }}>{q}/10 · {tier.label}</p>
          <button onMouseEnter={()=>setTooltip(true)} onMouseLeave={()=>setTooltip(false)}
            className="w-4 h-4 rounded-full text-xs flex items-center justify-center hover:opacity-70"
            style={{ background:"var(--bg-elevated)", color:"var(--text-muted)" }}>?</button>
        </div>
        <button onClick={()=>setEditing(e=>!e)} className="text-xs px-1.5 py-0.5 rounded hover:opacity-70"
          style={{ background:"var(--bg-elevated)", color:"var(--text-muted)" }}>
          {editing ? "close" : "edit"}
        </button>
      </div>
      <p className="text-xs" style={{ color:"var(--text-muted)" }}>Setup Quality</p>

      {tooltip && (
        <div className="absolute left-0 bottom-full mb-2 z-50 rounded-xl p-3 w-64 shadow-xl"
          style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
          <p className="text-xs font-bold mb-2" style={{ color:"var(--text-primary)" }}>Quality Score Guide</p>
          {QUALITY_CRITERIA.slice().reverse().map(c => (
            <div key={c.min} className="flex items-start gap-2 mb-1">
              <span className="text-xs font-bold w-12 flex-shrink-0" style={{ color:c.color }}>{c.label}</span>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>{c.desc}</p>
            </div>
          ))}
          <p className="text-xs mt-2" style={{ color:"var(--text-muted)", borderTop:"1px solid var(--border)", paddingTop:6 }}>
            EA imports default to 5. Update based on how well the trade matched your Playbook rules.
          </p>
        </div>
      )}

      {editing && (
        <div className="mt-2">
          <input type="range" min="1" max="10" step="1" value={q}
            onChange={e=>setQ(parseInt(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ accentColor: tier.color }}/>
          <div className="flex justify-between text-xs mt-1" style={{ color:"var(--text-muted)" }}>
            <span>1</span><span>5</span><span>10</span>
          </div>
          <p className="text-xs mt-1" style={{ color: tier.color }}>{tier.desc}</p>
          <button onClick={()=>save(q)} disabled={saving}
            className="mt-2 w-full py-1 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: tier.color }}>
            {saving ? "Saving…" : `Save ${q}/10`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Star Rating ──────────────────────────────────────────────────────────────
// 1–5 stars for quick emotional/execution rating, separate from quality score
function StarRating({ trade }) {
  const [rating, setRating] = useState(trade.star_rating || 0)
  const [hover,  setHover]  = useState(0)
  const [saving, setSaving] = useState(false)

  const save = async (val) => {
    const next = rating === val ? 0 : val  // click same star = clear
    setRating(next)
    setSaving(true)
    try { await supabase.from("trades").update({ star_rating: next }).eq("id", trade.id) }
    catch {}
    setSaving(false)
  }

  const labels = ["", "Poor execution", "Below average", "Average", "Good trade", "Perfect trade"]
  const active  = hover || rating

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(n => (
          <button key={n}
            onClick={() => save(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="transition-transform hover:scale-110 active:scale-95"
            style={{ fontSize:18, lineHeight:1 }}>
            <span style={{ color: n <= active ? "#ffa502" : "var(--text-muted)", filter: n <= active ? "drop-shadow(0 0 4px rgba(255,165,2,0.4))" : "none" }}>
              {n <= active ? "★" : "☆"}
            </span>
          </button>
        ))}
      </div>
      <span className="text-xs" style={{ color:"var(--text-muted)" }}>
        {saving ? "…" : active ? labels[active] : "Rate this trade"}
      </span>
    </div>
  )
}

// ─── Trade Executions Table ───────────────────────────────────────────────────
// Shows partial fills / multiple entries from MT5 if stored as executions JSON
// Falls back to single entry/exit display for manual trades
function ExecutionsTable({ trade }) {
  // Executions can be stored as JSON array in trade.executions field
  const executions = useMemo(() => {
    if (Array.isArray(trade.executions) && trade.executions.length > 0) {
      return trade.executions
    }
    // Fallback: build synthetic entry/exit rows from trade fields
    const rows = []
    if (trade.entry_price && trade.entry_time) {
      rows.push({
        type:      "ENTRY",
        price:     parseFloat(trade.entry_price),
        time:      trade.entry_time,
        volume:    parseFloat(trade.lot_size || trade.volume || 0),
        direction: trade.direction,
      })
    }
    if (trade.exit_price && trade.exit_time) {
      rows.push({
        type:      "EXIT",
        price:     parseFloat(trade.exit_price),
        time:      trade.exit_time,
        volume:    parseFloat(trade.lot_size || trade.volume || 0),
        direction: trade.direction === "BUY" ? "SELL" : "BUY",
        pnl:       parseFloat(trade.pnl || 0),
      })
    }
    return rows
  }, [trade])

  if (!executions.length) return null

  const dp = trade.entry_price < 10 ? 5 : 2

  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>Executions</p>
      <div className="rounded-xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
              {["Type","Direction","Price","Volume","Time","P&L"].map(h => (
                <th key={h} className="px-3 py-1.5 text-left text-xs font-semibold" style={{ color:"var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {executions.map((ex, i) => (
              <tr key={i} style={{ borderBottom: i < executions.length-1 ? "1px solid var(--border)" : "none" }}>
                <td className="px-3 py-1.5">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                    style={{ background: ex.type==="ENTRY" ? "rgba(108,99,255,0.12)" : "rgba(255,165,2,0.12)",
                      color: ex.type==="ENTRY" ? "var(--accent)" : "var(--accent-warning)" }}>
                    {ex.type}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  <span className="text-xs font-bold"
                    style={{ color: ex.direction==="BUY" ? "var(--accent-success)" : "var(--accent-danger)" }}>
                    {ex.direction==="BUY" ? "▲" : "▼"} {ex.direction}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-xs" style={{ color:"var(--text-primary)", fontFamily:"var(--font-mono)" }}>
                  {ex.price?.toFixed(dp) || "—"}
                </td>
                <td className="px-3 py-1.5 text-xs" style={{ color:"var(--text-secondary)", fontFamily:"var(--font-mono)" }}>
                  {ex.volume || "—"}
                </td>
                <td className="px-3 py-1.5 text-xs" style={{ color:"var(--text-muted)" }}>
                  {ex.time ? new Date(ex.time).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}) : "—"}
                </td>
                <td className="px-3 py-1.5 text-xs font-bold" style={{ fontFamily:"var(--font-mono)",
                  color: ex.pnl !== undefined ? (ex.pnl >= 0 ? "var(--accent-success)" : "var(--accent-danger)") : "var(--text-muted)" }}>
                  {ex.pnl !== undefined ? `${ex.pnl >= 0 ? "+" : ""}$${ex.pnl.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CandlestickChart({ candles, entryPrice, exitPrice, entryTime, exitTime, sl, tp }) {
  if (!candles || candles.length === 0) return (
    <div className="flex items-center justify-center h-40 rounded-xl" style={{ background:"var(--bg-elevated)" }}>
      <p className="text-xs" style={{ color:"var(--text-muted)" }}>No chart data available for this trade</p>
    </div>
  )

  const W = 600, H = 160, PAD = { top:8, right:8, bottom:20, left:48 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const highs  = candles.map(c => parseFloat(c.h))
  const lows   = candles.map(c => parseFloat(c.l))
  const minP   = Math.min(...lows,  entryPrice || Infinity, exitPrice || Infinity, sl > 0 ? sl : Infinity)
  const maxP   = Math.max(...highs, entryPrice || 0,        exitPrice || 0, tp > 0 ? tp : 0)
  const range  = maxP - minP || 0.0001

  const toY = p => PAD.top + chartH - ((p - minP) / range) * chartH
  const toX = i => PAD.left + (i / (candles.length - 1 || 1)) * chartW

  // Find entry/exit candle indices by time
  const entryIdx = entryTime ? candles.findIndex(c => new Date(c.t) >= new Date(entryTime)) : -1
  const exitIdx  = exitTime  ? candles.findIndex(c => new Date(c.t) >= new Date(exitTime))  : -1

  const candleW = Math.max(2, Math.min(8, chartW / candles.length - 1))

  // Price axis labels
  const steps = 4
  const priceLabels = Array.from({length: steps+1}, (_,i) => minP + (range/steps)*i)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight:160 }}>
      {/* Grid lines */}
      {priceLabels.map((p,i) => (
        <g key={i}>
          <line x1={PAD.left} x2={W-PAD.right} y1={toY(p)} y2={toY(p)}
            stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3,3"/>
          <text x={PAD.left-3} y={toY(p)+3} textAnchor="end" fontSize="8"
            fill="var(--text-muted)">{p.toFixed(p>100?0:4)}</text>
        </g>
      ))}

      {/* Entry/exit zone shading */}
      {entryIdx>=0 && exitIdx>entryIdx && (
        <rect
          x={toX(entryIdx)} y={PAD.top}
          width={toX(exitIdx)-toX(entryIdx)} height={chartH}
          fill="rgba(108,99,255,0.06)"
        />
      )}

      {/* Candles */}
      {candles.map((c,i) => {
        const o = parseFloat(c.o), cl = parseFloat(c.c)
        const h = parseFloat(c.h), l  = parseFloat(c.l)
        const isBull = cl >= o
        const color  = isBull ? "#2ed573" : "#ff4757"
        const x      = toX(i)
        const bodyTop    = toY(Math.max(o, cl))
        const bodyBottom = toY(Math.min(o, cl))
        const bodyH      = Math.max(1, bodyBottom - bodyTop)
        return (
          <g key={i}>
            {/* Wick */}
            <line x1={x} x2={x} y1={toY(h)} y2={toY(l)} stroke={color} strokeWidth="1"/>
            {/* Body */}
            <rect x={x - candleW/2} y={bodyTop} width={candleW} height={bodyH}
              fill={isBull ? color : color} opacity={0.85} rx="0.5"/>
          </g>
        )
      })}

      {/* Entry price line */}
      {entryPrice > 0 && (
        <g>
          <line x1={PAD.left} x2={W-PAD.right} y1={toY(entryPrice)} y2={toY(entryPrice)}
            stroke="#6c63ff" strokeWidth="1" strokeDasharray="4,2"/>
          <text x={W-PAD.right+2} y={toY(entryPrice)+3} fontSize="7" fill="#6c63ff">E</text>
        </g>
      )}
      {/* Exit price line */}
      {exitPrice > 0 && (
        <g>
          <line x1={PAD.left} x2={W-PAD.right} y1={toY(exitPrice)} y2={toY(exitPrice)}
            stroke="#ffa502" strokeWidth="1" strokeDasharray="4,2"/>
          <text x={W-PAD.right+2} y={toY(exitPrice)+3} fontSize="7" fill="#ffa502">X</text>
        </g>
      )}

      {/* SL line */}
      {sl > 0 && (
        <g>
          <line x1={PAD.left} x2={W-PAD.right} y1={toY(sl)} y2={toY(sl)}
            stroke="#ff4757" strokeWidth="1.2" strokeDasharray="5,3"/>
          <rect x={W-PAD.right+2} y={toY(sl)-6} width={18} height={11} fill="#ff475720" rx="2"/>
          <text x={W-PAD.right+11} y={toY(sl)+3} textAnchor="middle" fontSize="7" fill="#ff4757" fontWeight="600">SL</text>
        </g>
      )}
      {/* TP line */}
      {tp > 0 && (
        <g>
          <line x1={PAD.left} x2={W-PAD.right} y1={toY(tp)} y2={toY(tp)}
            stroke="#2ed573" strokeWidth="1.2" strokeDasharray="5,3"/>
          <rect x={W-PAD.right+2} y={toY(tp)-6} width={18} height={11} fill="#2ed57320" rx="2"/>
          <text x={W-PAD.right+11} y={toY(tp)+3} textAnchor="middle" fontSize="7" fill="#2ed573" fontWeight="600">TP</text>
        </g>
      )}

      {/* Time axis — first and last candle */}
      {candles.length > 1 && (
        <>
          <text x={PAD.left}   y={H-4} fontSize="8" fill="var(--text-muted)">
            {new Date(candles[0].t).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"})}
          </text>
          <text x={W-PAD.right} y={H-4} fontSize="8" fill="var(--text-muted)" textAnchor="end">
            {new Date(candles[candles.length-1].t).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"})}
          </text>
        </>
      )}
    </svg>
  )
}

// ─── Running P&L Chart (SVG) ─────────────────────────────────────────────────
// No SVG defs/clipPath/gradients — avoids ID conflicts when multiple rows expand
function RunningPnLChart({ candles, entryTime, exitTime, entryPrice, direction, finalPnl }) {
  if (!Array.isArray(candles) || candles.length === 0) return null

  try {
    const entryMs = entryTime ? new Date(entryTime).getTime() : 0
    const exitMs  = exitTime  ? new Date(exitTime).getTime()  : null

    // Filter to candles within the trade window (entry → exit)
    let tradeCandles = candles.filter(c => {
      const t = new Date(c.t).getTime()
      if (t < entryMs) return false
      if (exitMs && t > exitMs) return false
      return true
    })
    if (tradeCandles.length < 2) tradeCandles = candles

    const sign      = direction === "SELL" ? -1 : 1
    const ep        = parseFloat(entryPrice) || 0
    const rawPoints = tradeCandles.map(c => sign * (parseFloat(c.c) - ep))
    const lastRaw   = rawPoints[rawPoints.length - 1] || 0
    const scale     = (lastRaw !== 0 && finalPnl !== 0) ? finalPnl / lastRaw : 1
    const points    = [0, ...rawPoints.map(r => r * scale)]

    const n   = points.length
    if (n < 2) return null

    const W = 700, H = 110
    const PAD = { top: 14, bottom: 20, left: 58, right: 12 }
    const cW  = W - PAD.left - PAD.right
    const cH  = H - PAD.top  - PAD.bottom

    const minV  = Math.min(0, ...points)
    const maxV  = Math.max(0, ...points)
    const range = (maxV - minV) || 1

    const toX   = i  => PAD.left + (i / (n - 1)) * cW
    const toY   = v  => PAD.top + cH - ((v - minV) / range) * cH
    const zeroY = toY(0)

    const fmtPnl  = v => `${v >= 0 ? "+" : ""}$${Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.abs(v).toFixed(0)}`
    const fmtTime = d => d ? new Date(d).toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit", hour12:false }) : ""

    // Build polygon segments: green above zero, red below zero
    // Walk through points, detect zero-crossings, emit separate filled polygons
    const greenSegs = [] // arrays of {x,y} for above-zero fills
    const redSegs   = [] // arrays of {x,y} for below-zero fills

    let cur = null
    let curSign = null

    const lerp = (i, v1, v2) => {
      // find x where line from (i-1,v1) to (i,v2) crosses zero
      const t = Math.abs(v1) / (Math.abs(v1) + Math.abs(v2))
      return toX(i - 1 + t)
    }

    for (let i = 0; i < n; i++) {
      const v  = points[i]
      const sg = v >= 0 ? "green" : "red"
      if (curSign === null) {
        cur = [{ x: toX(i), y: zeroY }, { x: toX(i), y: toY(v) }]
        curSign = sg
      } else if (sg !== curSign) {
        // zero crossing between i-1 and i
        const cx = lerp(i, points[i-1], v)
        cur.push({ x: cx, y: zeroY })
        if (curSign === "green") greenSegs.push(cur)
        else redSegs.push(cur)
        cur = [{ x: cx, y: zeroY }, { x: toX(i), y: toY(v) }]
        curSign = sg
      } else {
        cur.push({ x: toX(i), y: toY(v) })
      }
    }
    if (cur && cur.length > 1) {
      cur.push({ x: toX(n - 1), y: zeroY })
      if (curSign === "green") greenSegs.push(cur)
      else redSegs.push(cur)
    }

    const toD = pts => pts.map((p,i) => `${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z"

    // Full line path
    const linePath = points.map((v,i) => `${i===0?"M":"L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ")

    return (
      <div className="rounded-xl p-2 mt-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <Activity size={11} style={{ color:"var(--accent)" }}/>
          <span className="text-xs font-semibold" style={{ color:"var(--text-primary)" }}>Running P&amp;L</span>
          <span className="ml-auto text-xs font-bold" style={{ color: finalPnl >= 0 ? "var(--accent-success)" : "var(--accent-danger)" }}>
            {fmtPnl(finalPnl)}
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 110 }}>
          {/* Zero baseline */}
          <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY}
            stroke="var(--border)" strokeWidth="1"/>
          <text x={PAD.left - 3} y={zeroY + 3} textAnchor="end" fontSize="8" fill="var(--text-muted)">$0</text>

          {/* Y-axis labels */}
          {minV < -0.01 && (
            <text x={PAD.left - 3} y={toY(minV) + 3} textAnchor="end" fontSize="8" fill="#ff4757">{fmtPnl(minV)}</text>
          )}
          {maxV > 0.01 && (
            <text x={PAD.left - 3} y={toY(maxV) + 3} textAnchor="end" fontSize="8" fill="#2ed573">{fmtPnl(maxV)}</text>
          )}

          {/* Filled area segments — no SVG defs needed */}
          {greenSegs.map((seg, i) => (
            <path key={`g${i}`} d={toD(seg)} fill="rgba(46,213,115,0.18)" stroke="none"/>
          ))}
          {redSegs.map((seg, i) => (
            <path key={`r${i}`} d={toD(seg)} fill="rgba(255,71,87,0.18)" stroke="none"/>
          ))}

          {/* P&L line */}
          <path d={linePath} fill="none" stroke="#6c63ff" strokeWidth="1.5" strokeLinejoin="round"/>

          {/* Entry dot (always at $0) */}
          <circle cx={toX(0)} cy={zeroY} r="3.5" fill="var(--bg-card)" stroke="#2ed573" strokeWidth="1.5"/>

          {/* Exit dot */}
          <circle cx={toX(n - 1)} cy={toY(points[n - 1])} r="3.5" fill="var(--bg-card)"
            stroke={finalPnl >= 0 ? "#2ed573" : "#ff4757"} strokeWidth="1.5"/>

          {/* Time axis */}
          <text x={PAD.left} y={H - 4} fontSize="8" fill="var(--text-muted)">{fmtTime(entryTime)}</text>
          <text x={W - PAD.right} y={H - 4} fontSize="8" fill="var(--text-muted)" textAnchor="end">
            {fmtTime(exitTime || tradeCandles[tradeCandles.length - 1]?.t)}
          </text>
        </svg>
      </div>
    )
  } catch {
    return null
  }
}


// ─── Trade Replay Mode ────────────────────────────────────────────────────────
function TradeReplay({ trade, candles, onClose }) {
  const [frame,   setFrame]   = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed,   setSpeed]   = useState(1)
  const timerRef = useRef(null)

  const entryMs  = trade.entry_time ? new Date(trade.entry_time).getTime() : 0
  const exitMs   = trade.exit_time  ? new Date(trade.exit_time).getTime()  : null
  const entryIdx = Math.max(0, candles.findIndex(c => new Date(c.t).getTime() >= entryMs))
  const exitIdx  = exitMs ? candles.findIndex(c => new Date(c.t).getTime() >= exitMs) : candles.length - 1
  const startIdx = Math.max(0, entryIdx - 8)
  const [dispStart] = useState(startIdx)
  const n = candles.length - dispStart

  const currentCandles = candles.slice(dispStart, dispStart + frame + 1)

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setFrame(f => {
          if (f >= n - 1) { setPlaying(false); return f }
          return f + 1
        })
      }, Math.max(30, 400 / speed))
    } else { clearInterval(timerRef.current) }
    return () => clearInterval(timerRef.current)
  }, [playing, speed, n])

  const toggle    = () => setPlaying(p => !p)
  const stepBack  = () => { setPlaying(false); setFrame(f => Math.max(0, f - 1)) }
  const stepFwd   = () => { setPlaying(false); setFrame(f => Math.min(n - 1, f + 1)) }
  const rewindAll = () => { setPlaying(false); setFrame(0) }
  const skipEnd   = () => { setPlaying(false); setFrame(n - 1) }

  const currentCandle = candles[dispStart + frame]
  const ep    = parseFloat(trade.entry_price) || 0
  const xp    = parseFloat(trade.exit_price)  || 0
  const sl    = parseFloat(trade.sl) || 0
  const tp    = parseFloat(trade.tp) || 0
  const sign  = trade.direction === "SELL" ? -1 : 1
  const rawPnl   = currentCandle ? sign * (parseFloat(currentCandle.c) - ep) : 0
  const lastRaw  = candles.length ? sign * (parseFloat(candles[candles.length-1].c) - ep) : 0
  const scale    = (lastRaw !== 0 && trade.pnl !== 0) ? trade.pnl / lastRaw : 1
  const livePnl  = rawPnl * scale
  const entryShown = (dispStart + frame) >= entryIdx
  const exitShown  = exitIdx > 0 && (dispStart + frame) >= exitIdx
  const progress   = n > 1 ? (frame / (n - 1)) * 100 : 0

  // Chart dimensions — leave space for volume bars at bottom
  const W = 900, H = 300
  const VOL_H = 40
  const PAD = { top:12, right:70, bottom:VOL_H+24, left:10 }
  const cW = W - PAD.left - PAD.right
  const cH = H - PAD.top - PAD.bottom

  const cc = currentCandles
  const highs = cc.map(c => parseFloat(c.h))
  const lows  = cc.map(c => parseFloat(c.l))
  const vals  = [ep, xp > 0 ? xp : ep]
  if (sl > 0) vals.push(sl)
  if (tp > 0) vals.push(tp)
  const maxP  = Math.max(...highs, ...vals) || 1
  const minP  = Math.min(...lows,  ...vals) || 0
  const range = (maxP - minP) || 0.0001
  const toY   = p  => PAD.top + cH - ((p - minP) / range) * cH
  const toX   = i  => PAD.left + (i / Math.max(cc.length - 1, 1)) * cW
  const cW2   = Math.max(1, Math.min(12, cW / Math.max(cc.length, 1) - 1))
  const volBase = PAD.top + cH + VOL_H
  const maxVol = Math.max(...cc.map(c => parseFloat(c.v)||0)) || 1
  const dp = ep < 10 ? 5 : 2

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background:"#05050d", backdropFilter:"blur(8px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
        style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-card)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background:"rgba(108,99,255,0.15)" }}>
            <Play size={14} style={{ color:"var(--accent)" }}/>
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color:"var(--text-primary)" }}>
              Trade Replay — {trade.symbol}
              <span className="ml-2 px-1.5 py-0.5 rounded text-xs"
                style={{ background:trade.direction==="BUY"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)",
                  color:trade.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                {trade.direction==="BUY"?"▲":"▼"} {trade.direction}
              </span>
            </p>
            <p className="text-xs" style={{ color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
              {trade.timeframe} · {new Date(trade.entry_time).toLocaleDateString()}
              {sl > 0 && <span className="ml-2" style={{ color:"var(--accent-danger)" }}>SL {sl.toFixed(dp)}</span>}
              {tp > 0 && <span className="ml-2" style={{ color:"var(--accent-success)" }}>TP {tp.toFixed(dp)}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Stats strip */}
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Current</p>
              <p className="text-sm font-bold" style={{ fontFamily:"var(--font-mono)", color:"var(--text-primary)" }}>
                {currentCandle ? parseFloat(currentCandle.c).toFixed(dp) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Running P&L</p>
              <p className="text-lg font-black" style={{
                fontFamily:"var(--font-mono)",
                color: livePnl >= 0 ? "var(--accent-success)" : "var(--accent-danger)"
              }}>
                {livePnl >= 0 ? "+" : ""}${livePnl.toFixed(2)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:opacity-70"
            style={{ background:"var(--bg-elevated)", color:"var(--text-secondary)" }}>
            <X size={16}/>
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative overflow-hidden px-4 pt-3 pb-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">

          {/* Grid lines */}
          {[0.2,0.4,0.6,0.8].map(f => (
            <line key={f} x1={PAD.left} x2={W-PAD.right}
              y1={PAD.top+cH*f} y2={PAD.top+cH*f}
              stroke="rgba(255,255,255,0.04)" strokeWidth="0.5"/>
          ))}

          {/* Trade window shading */}
          {entryShown && (() => {
            const eix = entryIdx - dispStart
            const ex = toX(Math.min(eix, cc.length-1))
            const ew = Math.max(0, toX(cc.length-1) - ex)
            return <rect x={ex} y={PAD.top} width={ew} height={cH}
              fill={exitShown ? (livePnl>=0?"rgba(46,213,115,0.05)":"rgba(255,71,87,0.05)") : "rgba(108,99,255,0.04)"}/>
          })()}

          {/* SL line (shows from entry) */}
          {entryShown && sl > 0 && sl >= minP && sl <= maxP && <>
            <line x1={PAD.left} x2={W-PAD.right} y1={toY(sl)} y2={toY(sl)}
              stroke="rgba(255,71,87,0.7)" strokeWidth="1" strokeDasharray="4,3"/>
            <rect x={W-PAD.right+1} y={toY(sl)-7} width={30} height={13}
              fill="rgba(255,71,87,0.85)" rx="3"/>
            <text x={W-PAD.right+16} y={toY(sl)+3} textAnchor="middle"
              fontSize="8" fill="#fff" fontWeight="700">SL</text>
          </>}

          {/* TP line (shows from entry) */}
          {entryShown && tp > 0 && tp >= minP && tp <= maxP && <>
            <line x1={PAD.left} x2={W-PAD.right} y1={toY(tp)} y2={toY(tp)}
              stroke="rgba(46,213,115,0.7)" strokeWidth="1" strokeDasharray="4,3"/>
            <rect x={W-PAD.right+1} y={toY(tp)-7} width={30} height={13}
              fill="rgba(46,213,115,0.85)" rx="3"/>
            <text x={W-PAD.right+16} y={toY(tp)+3} textAnchor="middle"
              fontSize="8" fill="#fff" fontWeight="700">TP</text>
          </>}

          {/* Candles */}
          {cc.map((c,i) => {
            const o=parseFloat(c.o),cl=parseFloat(c.c),h=parseFloat(c.h),l=parseFloat(c.l)
            const isBull=cl>=o, color=isBull?"#2ed573":"#ff4757"
            const x=toX(i), bodyTop=toY(Math.max(o,cl)), bodyH=Math.max(1,toY(Math.min(o,cl))-bodyTop)
            // Volume bar
            const v=parseFloat(c.v)||0
            const vh = (v/maxVol) * (VOL_H - 4)
            return <g key={i}>
              <line x1={x} x2={x} y1={toY(h)} y2={toY(l)} stroke={color} strokeWidth="1"/>
              <rect x={x-cW2/2} y={bodyTop} width={cW2} height={bodyH} fill={color} opacity={0.9} rx="0.5"/>
              {vh > 0 && <rect x={x-cW2/2} y={volBase-vh} width={cW2} height={vh}
                fill={isBull?"rgba(46,213,115,0.3)":"rgba(255,71,87,0.3)"} rx="0.5"/>}
            </g>
          })}

          {/* Volume baseline */}
          <line x1={PAD.left} x2={W-PAD.right} y1={volBase} y2={volBase}
            stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>

          {/* Current price line */}
          {currentCandle && (() => {
            const cp = parseFloat(currentCandle.c)
            const cy = toY(cp)
            return <>
              <line x1={PAD.left} x2={W-PAD.right} y1={cy} y2={cy}
                stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3,3"/>
              <rect x={W-PAD.right+1} y={cy-7} width={58} height={13}
                fill="rgba(30,30,50,0.95)" rx="3" stroke="rgba(255,255,255,0.15)" strokeWidth="0.5"/>
              <text x={W-PAD.right+30} y={cy+3} textAnchor="middle"
                fontSize="8.5" fill="rgba(240,240,248,0.9)" fontFamily="monospace" fontWeight="600">
                {cp.toFixed(dp)}
              </text>
            </>
          })()}

          {/* Entry price line */}
          {entryShown && ep > 0 && <>
            <line x1={PAD.left} x2={W-PAD.right} y1={toY(ep)} y2={toY(ep)}
              stroke="rgba(108,99,255,0.8)" strokeWidth="1.5" strokeDasharray="5,3"/>
            <rect x={W-PAD.right+1} y={toY(ep)-7} width={58} height={13}
              fill="rgba(108,99,255,0.9)" rx="3"/>
            <text x={W-PAD.right+30} y={toY(ep)+3} textAnchor="middle"
              fontSize="8" fill="#fff" fontFamily="monospace">E {ep.toFixed(dp)}</text>
          </>}

          {/* Exit price line */}
          {exitShown && xp > 0 && <>
            <line x1={PAD.left} x2={W-PAD.right} y1={toY(xp)} y2={toY(xp)}
              stroke={livePnl>=0?"rgba(46,213,115,0.8)":"rgba(255,71,87,0.8)"}
              strokeWidth="1.5" strokeDasharray="5,3"/>
            <rect x={W-PAD.right+1} y={toY(xp)-7} width={58} height={13}
              fill={livePnl>=0?"rgba(46,213,115,0.9)":"rgba(255,71,87,0.9)"} rx="3"/>
            <text x={W-PAD.right+30} y={toY(xp)+3} textAnchor="middle"
              fontSize="8" fill="#fff" fontFamily="monospace">X {xp.toFixed(dp)}</text>
          </>}

          {/* Price axis */}
          {[0,0.25,0.5,0.75,1].map((f,i) => {
            const p = minP + range*(1-f), y = toY(p)
            return <text key={i} x={W-PAD.right+3} y={y+3} fontSize="8.5"
              fill="rgba(100,100,130,0.8)" fontFamily="monospace">
              {p.toFixed(dp)}
            </text>
          })}

          {/* Time label */}
          {currentCandle && <text x={W/2} y={H-4} textAnchor="middle" fontSize="10"
            fill="rgba(100,100,130,0.8)" fontFamily="monospace">
            {new Date(currentCandle.t).toLocaleString("en-US",{month:"2-digit",day:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})}
          </text>}
        </svg>

        {/* Status badges */}
        <div className="absolute top-5 left-6 flex gap-2 flex-wrap">
          {!entryShown && (
            <span className="px-2 py-1 rounded-lg text-xs font-semibold"
              style={{ background:"rgba(108,99,255,0.12)", color:"var(--text-muted)", border:"1px solid var(--border)" }}>
              Context (pre-entry)
            </span>
          )}
          {entryShown && !exitShown && (
            <span className="px-2 py-1 rounded-lg text-xs font-bold animate-pulse"
              style={{ background:"rgba(108,99,255,0.2)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.3)" }}>
              ● In trade — {trade.direction} @ {ep.toFixed(dp)}
            </span>
          )}
          {exitShown && (
            <span className="px-2 py-1 rounded-lg text-xs font-bold"
              style={{ background:livePnl>=0?"rgba(46,213,115,0.2)":"rgba(255,71,87,0.2)",
                color:livePnl>=0?"var(--accent-success)":"var(--accent-danger)",
                border:`1px solid ${livePnl>=0?"rgba(46,213,115,0.3)":"rgba(255,71,87,0.3)"}` }}>
              ● Closed {livePnl>=0?"✓ Profit":"✗ Loss"} — {livePnl >= 0 ? "+" : ""}${livePnl.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Transport */}
      <div className="flex-shrink-0 px-5 py-4" style={{ borderTop:"1px solid var(--border)", background:"var(--bg-card)" }}>
        {/* Progress bar */}
        <div className="mb-3 h-2.5 rounded-full overflow-hidden relative cursor-pointer group"
          style={{ background:"var(--bg-elevated)" }}
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect()
            setFrame(Math.round(((e.clientX - r.left) / r.width) * (n-1)))
            setPlaying(false)
          }}>
          <div className="h-full rounded-full" style={{
            width:`${progress}%`,
            background:"linear-gradient(90deg,var(--accent),var(--accent-secondary))",
            transition:"width 0.08s"
          }}/>
          {/* Entry marker on bar */}
          {entryIdx >= dispStart && n > 1 && (
            <div className="absolute inset-y-0 w-0.5"
              style={{ left:`${((entryIdx-dispStart)/(n-1))*100}%`, background:"rgba(108,99,255,0.8)" }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs px-1 rounded"
                style={{ background:"rgba(108,99,255,0.9)", color:"#fff", fontSize:8 }}>E</div>
            </div>
          )}
          {/* Exit marker on bar */}
          {exitIdx > 0 && exitIdx >= dispStart && n > 1 && (
            <div className="absolute inset-y-0 w-0.5"
              style={{ left:`${((exitIdx-dispStart)/(n-1))*100}%`,
                background:livePnl>=0?"rgba(46,213,115,0.8)":"rgba(255,71,87,0.8)" }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs px-1 rounded"
                style={{ background:livePnl>=0?"rgba(46,213,115,0.9)":"rgba(255,71,87,0.9)", color:"#fff", fontSize:8 }}>X</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color:"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
            {dispStart+frame+1} / {dispStart+n} bars
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={rewindAll} className="p-2 rounded-lg hover:opacity-70"
              style={{ color:"var(--text-secondary)", background:"var(--bg-elevated)" }}>
              <Rewind size={13}/>
            </button>
            <button onClick={stepBack} className="p-2 rounded-lg hover:opacity-70"
              style={{ color:"var(--text-secondary)", background:"var(--bg-elevated)" }}>
              <SkipBack size={13}/>
            </button>
            <button onClick={toggle}
              className="w-10 h-10 flex items-center justify-center rounded-xl transition-transform active:scale-95"
              style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", color:"#fff" }}>
              {playing ? <Pause size={16}/> : <Play size={16}/>}
            </button>
            <button onClick={stepFwd} className="p-2 rounded-lg hover:opacity-70"
              style={{ color:"var(--text-secondary)", background:"var(--bg-elevated)" }}>
              <SkipForward size={13}/>
            </button>
            <button onClick={skipEnd} className="p-2 rounded-lg hover:opacity-70"
              style={{ color:"var(--text-secondary)", background:"var(--bg-elevated)" }}>
              <FastForward size={13}/>
            </button>
          </div>
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background:"var(--bg-elevated)" }}>
            {[1,2,4,8,16].map(s => (
              <button key={s} onClick={()=>setSpeed(s)}
                className="px-2 py-1 rounded-md text-xs font-bold"
                style={{ background:speed===s?"var(--accent)":"transparent", color:speed===s?"#fff":"var(--text-muted)" }}>
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Inline Trade Detail Row ──────────────────────────────────────────────────
function TradeDetailRow({ trade, colSpan, onEdit, onDelete, onAI, playbooks = [] }) {
  const { t } = useLanguage()
  const [candles,   setCandles]  = useState(null)
  const [loading,   setLoading]  = useState(true)
  const [replaying, setReplaying]= useState(false)
  const [tradeTags, setTradeTags]= useState(Array.isArray(trade.tags) ? trade.tags : [])
  const [tagSaving, setTagSaving]= useState(false)
  const [tagOpen,   setTagOpen]  = useState(false)

  const [chartTF, setChartTF] = useState(null)

  const toggleTag = async (tag) => {
    const next = tradeTags.includes(tag)
      ? tradeTags.filter(t => t !== tag)
      : [...tradeTags, tag]
    setTradeTags(next)
    setTagSaving(true)
    try {
      await supabase.from("trades").update({ tags: next }).eq("id", trade.id)
    } catch {}
    setTagSaving(false)
  }

  useEffect(() => {
    const fetchChart = async () => {
      setLoading(true)
      try {
        // 1. Try trade_charts first
        const { data } = await supabase
          .from("trade_charts")
          .select("candles, timeframe")
          .eq("trade_id", trade.id)
          .single()

        if (data?.candles?.length) {
          setCandles(data.candles)
          setChartTF(data.timeframe || trade.timeframe || "M15")
          setLoading(false)
          return
        }
      } catch {}

      // 2. Fallback: pull M15 candles from sylledge_market_data around trade time
      try {
        const entryMs  = trade.entry_time ? new Date(trade.entry_time).getTime() : Date.now()
        const exitMs   = trade.exit_time  ? new Date(trade.exit_time).getTime()  : entryMs + 100 * 15 * 60 * 1000
        const BAR_MS   = 15 * 60 * 1000
        const from = new Date(entryMs - 25 * BAR_MS).toISOString()
        const to   = new Date(exitMs  + 15 * BAR_MS).toISOString()

        const { data: mkt } = await supabase
          .from("sylledge_market_data")
          .select("candle_time,open_price,high_price,low_price,close_price,volume")
          .eq("symbol", trade.symbol)
          .eq("timeframe", "M15")
          .gte("candle_time", from)
          .lte("candle_time", to)
          .order("candle_time", { ascending: true })
          .limit(200)

        if (mkt?.length) {
          setCandles(mkt.map(r => ({
            t: r.candle_time, o: r.open_price, h: r.high_price,
            l: r.low_price,   c: r.close_price, v: r.volume || 0
          })))
          setChartTF("M15")
          setLoading(false)
          return
        }
      } catch {}

      setCandles([])
      setLoading(false)
    }
    fetchChart()
  }, [trade.id])

  const pnlColor = (trade.pnl||0) >= 0 ? "var(--accent-success)" : "var(--accent-danger)"

  return (
    <>
      {replaying && candles?.length && (
        <TradeReplay trade={trade} candles={candles} onClose={() => setReplaying(false)}/>
      )}
      <tr>
      <td colSpan={colSpan} style={{ background:"var(--bg-elevated)", borderBottom:"2px solid var(--accent)", padding:0 }}>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Chart */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 size={13} style={{ color:"var(--accent)" }}/>
              <span className="text-xs font-semibold" style={{ color:"var(--text-primary)" }}>
                {trade.symbol} · {chartTF || trade.timeframe || "M15"} chart
              </span>
              <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(108,99,255,0.12)", color:"var(--accent)" }}>— Entry</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(255,165,2,0.12)", color:"var(--accent-warning)" }}>— Exit</span>
              {trade.sl > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(255,71,87,0.12)", color:"var(--accent-danger)" }}>— SL</span>}
              {trade.tp > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background:"rgba(46,213,115,0.12)", color:"var(--accent-success)" }}>— TP</span>}
            </div>
            </div>
            {loading ? (
              <div className="h-40 flex items-center justify-center rounded-xl" style={{ background:"var(--bg-card)" }}>
                <p className="text-xs animate-pulse" style={{ color:"var(--text-muted)" }}>Loading chart…</p>
              </div>
            ) : (
              <>
                <div className="rounded-xl p-2" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                  <CandlestickChart
                    candles={candles}
                    entryPrice={trade.entry_price}
                    exitPrice={trade.exit_price}
                    entryTime={trade.entry_time}
                    exitTime={trade.exit_time}
                    sl={trade.sl || 0}
                    tp={trade.tp || 0}
                  />
                </div>
                <RunningPnLChart
                  candles={candles}
                  entryTime={trade.entry_time}
                  exitTime={trade.exit_time}
                  entryPrice={trade.entry_price}
                  direction={trade.direction}
                  finalPnl={trade.pnl || 0}
                />
                <ExecutionsTable trade={trade}/>
              </>
            )}
          </div>

          {/* Trade stats + actions */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label:"P&L",       value:`${(trade.pnl||0)>=0?"+":""}$${parseFloat(trade.pnl||0).toFixed(2)}`, color:pnlColor },
                { label:"Pips",      value:`${trade.pips||"—"}`, color:"var(--text-primary)" },
                { label:"Entry",     value:trade.entry_price||"—", color:"var(--text-secondary)" },
                { label:"Exit",      value:trade.exit_price||"—",  color:"var(--text-secondary)" },
                { label:"Volume",    value:trade.volume||"—",      color:"var(--text-secondary)" },
                { label:"Session",   value:trade.session||"—",    color:"var(--text-secondary)" },
                { label:"Timeframe", value:trade.timeframe||"—",  color:"var(--text-secondary)" },
                { label:"R:R",       value:trade.rr > 0 ? `${parseFloat(trade.rr).toFixed(2)}:1` : "—", color:"var(--accent)" },
              ].map(st => (
                <div key={st.label} className="rounded-lg p-2" style={{ background:"var(--bg-card)" }}>
                  <p className="text-xs font-bold" style={{ color:st.color }}>{st.value}</p>
                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>{st.label}</p>
                </div>
              ))}
              {/* Quality — inline editable */}
              <QualityEditor trade={trade} onUpdate={onEdit}/>
            </div>

            {/* Star Rating */}
            <div className="px-1">
              <StarRating trade={trade}/>
            </div>

            {trade.notes && (
              <div className="rounded-lg p-2.5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
                <p className="text-xs font-medium mb-1" style={{ color:"var(--text-muted)" }}>Notes</p>
                <p className="text-xs" style={{ color:"var(--text-secondary)" }}>{trade.notes}</p>
              </div>
            )}

            {/* ── Trade Tags ─────────────────────────────────────────────── */}
            <div className="rounded-lg p-2.5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color:"var(--text-secondary)" }}>
                  Tags {tagSaving && <span className="text-xs" style={{ color:"var(--text-muted)" }}>saving…</span>}
                </p>
                <button onClick={() => setTagOpen(o => !o)}
                  className="text-xs px-2 py-0.5 rounded-lg transition-all"
                  style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>
                  {tagOpen ? "Done" : "+ Add"}
                </button>
              </div>

              {/* Active tags display */}
              {tradeTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {tradeTags.map(tag => {
                    const st = getTagStyle(tag)
                    return (
                      <span key={tag} onClick={() => toggleTag(tag)}
                        className="px-2 py-0.5 rounded-full text-xs font-semibold cursor-pointer hover:opacity-70 transition-opacity"
                        style={{ background: st.bg, color: st.color, border:`1px solid ${st.color}40` }}>
                        {tag} ×
                      </span>
                    )
                  })}
                </div>
              )}
              {tradeTags.length === 0 && !tagOpen && (
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>No tags yet — click "+ Add"</p>
              )}

              {/* Tag picker */}
              {tagOpen && (
                <div className="flex flex-col gap-2 mt-2 pt-2" style={{ borderTop:"1px solid var(--border)" }}>
                  {Object.entries(TRADE_TAGS).map(([catKey, cat]) => {
                    // For Setups: merge static tags + user's Playbook strategies
                    const allTags = catKey === "setups" && playbooks.length > 0
                      ? [
                          ...cat.tags,
                          ...playbooks
                            .map(p => p.name?.trim())
                            .filter(Boolean)
                            .filter(n => !cat.tags.includes(n)) // no duplicates
                        ]
                      : cat.tags

                    return (
                      <div key={catKey}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <p className="text-xs font-bold" style={{ color: cat.color }}>{cat.label}</p>
                          {catKey === "setups" && playbooks.length > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full"
                              style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", fontSize:9 }}>
                              +{playbooks.length} from Playbook
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {allTags.map(tag => {
                            const active     = tradeTags.includes(tag)
                            const isPlaybook = catKey === "setups" && !cat.tags.includes(tag)
                            return (
                              <button key={tag} onClick={() => toggleTag(tag)}
                                className="px-2 py-0.5 rounded-full text-xs font-medium transition-all flex items-center gap-1"
                                style={{
                                  background: active ? cat.bg : "var(--bg-elevated)",
                                  color:      active ? cat.color : "var(--text-muted)",
                                  border:     `1px solid ${active ? cat.color + "60" : isPlaybook ? "rgba(108,99,255,0.3)" : "var(--border)"}`,
                                }}>
                                {isPlaybook && <span style={{ fontSize:8, opacity:0.7 }}>📋</span>}
                                {active ? "✓ " : ""}{tag}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {trade.mt5_ticket && (
              <p className="text-xs flex items-center gap-1" style={{ color:"var(--text-muted)" }}>
                <Hash size={10}/> Ticket #{trade.mt5_ticket}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={()=>setReplaying(true)} disabled={!candles?.length}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold disabled:opacity-30 flex-shrink-0"
                style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>
                <Play size={11}/> Replay
              </button>
              <button onClick={()=>onAI(trade)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
                style={{ background:"rgba(0,212,170,0.1)", color:"var(--accent-secondary)", border:"1px solid rgba(0,212,170,0.2)" }}>
                <Brain size={12}/> {t("journal_ai_review")}
              </button>
              <button onClick={()=>onEdit(trade)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold"
                style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>
                <Pencil size={12}/> Edit
              </button>
              <button onClick={()=>onDelete(trade)}
                className="py-2 px-3 rounded-lg text-xs"
                style={{ background:"rgba(255,71,87,0.08)", color:"var(--accent-danger)", border:"1px solid rgba(255,71,87,0.15)" }}>
                <Trash2 size={12}/>
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
    </>
  )
}

// ─── Table View ───────────────────────────────────────────────────────────────
function TableView({ trades, onEdit, onDelete, onAI, playbooks = [] }) {
  const [expandedId, setExpandedId] = useState(null)
  const COLS = ["","Symbol","Dir","Entry","Exit","P&L","Pips","Outcome","Tags","Session","TF","Quality","Date","Actions"]

  const toggle = (id) => setExpandedId(prev => prev === id ? null : id)

  if (!trades.length) {
    return (
      <div className="rounded-xl py-16 text-center" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background:"rgba(108,99,255,0.1)" }}>
          <List size={22} style={{ color:"var(--accent)" }}/>
        </div>
        <p className="font-semibold mb-1" style={{ color:"var(--text-primary)" }}>No trades yet</p>
        <p className="text-sm" style={{ color:"var(--text-muted)" }}>Hit the <span style={{ color:"var(--accent)" }}>+ New Trade</span> button to log your first trade.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
              {COLS.map(h=>(
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color:"var(--text-muted)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map(t => {
              const isExpanded = expandedId === t.id
              return (
                <>
                  <tr key={t.id}
                    className="transition-colors cursor-pointer"
                    style={{ borderBottom: isExpanded ? "none" : "1px solid var(--border)", background: isExpanded ? "var(--bg-elevated)" : "transparent" }}
                    onClick={() => toggle(t.id)}
                    onMouseEnter={e=>{ if(!isExpanded) e.currentTarget.style.background="var(--bg-elevated)" }}
                    onMouseLeave={e=>{ if(!isExpanded) e.currentTarget.style.background="transparent" }}>

                    {/* Expand chevron */}
                    <td className="px-2 py-3">
                      <div className="w-5 h-5 flex items-center justify-center rounded" style={{ color:"var(--text-muted)" }}>
                        {isExpanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-bold" style={{ color:"var(--text-primary)" }}>{t.symbol}</td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background:DIR_STYLE[t.direction]?.bg, color:DIR_STYLE[t.direction]?.color }}>
                        {t.direction==="BUY"?"▲":"▼"} {t.direction}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs" style={{ color:"var(--text-secondary)" }}>{t.entry_price||"—"}</td>
                    <td className="px-3 py-3 font-mono text-xs" style={{ color:"var(--text-secondary)" }}>{t.exit_price||"—"}</td>
                    <td className="px-3 py-3 font-bold" style={{ color:(t.pnl||0)>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                      {t.pnl!==undefined?`${t.pnl>=0?"+":""}$${parseFloat(t.pnl).toFixed(2)}`:"—"}
                    </td>
                    <td className="px-3 py-3 text-xs" style={{ color:"var(--text-secondary)" }}>{t.pips||"—"}</td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background:OUTCOME_STYLE[t.outcome]?.bg, color:OUTCOME_STYLE[t.outcome]?.color }}>
                        {t.outcome}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-0.5">
                        {Array.isArray(t.tags) && t.tags.slice(0,2).map(tag => {
                          const st = getTagStyle(tag)
                          return (
                            <span key={tag} className="px-1.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                              style={{ background: st.bg, color: st.color, fontSize:10 }}>
                              {tag}
                            </span>
                          )
                        })}
                        {Array.isArray(t.tags) && t.tags.length > 2 && (
                          <span className="text-xs" style={{ color:"var(--text-muted)", fontSize:10 }}>+{t.tags.length-2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color:"var(--text-secondary)" }}>{t.session||"—"}</td>
                    <td className="px-3 py-3 text-xs" style={{ color:"var(--text-secondary)" }}>{t.timeframe||"—"}</td>
                    <td className="px-3 py-3 text-xs" style={{ color:"var(--text-secondary)" }}>
                      <span className="px-1.5 py-0.5 rounded" style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)" }}>
                        {t.quality||"—"}/10
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color:"var(--text-muted)" }}>
                      {t.entry_time ? new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"}) : "—"}
                    </td>
                    <td className="px-3 py-3" onClick={e=>e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={()=>onAI(t)} title="AI Feedback" className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color:"var(--accent-secondary)" }}>
                          <Brain size={13}/>
                        </button>
                        <button onClick={()=>onEdit(t)} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color:"var(--accent)" }}>
                          <Pencil size={13}/>
                        </button>
                        <button onClick={()=>onDelete(t)} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color:"var(--accent-danger)" }}>
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Inline expanded row */}
                  {isExpanded && (
                    <TradeDetailRow
                      key={t.id + "_detail"}
                      trade={t}
                      colSpan={COLS.length}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onAI={onAI}
                      playbooks={playbooks}
                    />
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Journal Page ────────────────────────────────────────────────────────

// ─── CSV/XLS Smart Importer — Universal Broker Parser ────────────────────────
//
// Strategy: instead of exact column matching, we SCORE every column header
// against every known field and pick the best match. This handles any broker,
// any language, any column order.

const FIELD_SCORES = {
  symbol: {
    keywords: ["symbol","pair","instrument","asset","market","ticker","currency","contract","item","devise","paire","actif","marché"],
    must_not: ["profit","price","time","date","lot","volume","order","deal"]
  },
  direction: {
    keywords: ["direction","type","side","action","operation","deal type","order type","position","sens","côté","opération","transaction type","b/s","buy/sell","long/short"],
    must_not: ["profit","price","time","date","stop","limit","take","order id"]
  },
  entry_price: {
    keywords: ["entry","open price","open rate","price open","entryprice","open","prix entrée","prix ouverture","entry price","entry rate","rate open","price at open","opening price","ouverture"],
    must_not: ["close","exit","time","date","take profit","stop loss"]
  },
  exit_price: {
    keywords: ["exit","close price","close rate","price close","exitprice","closing price","close","prix sortie","prix fermeture","exit price","exit rate","rate close","price at close","fermeture","tp","take profit"],
    must_not: ["open","entry","time","date","stop loss"]
  },
  pnl: {
    keywords: ["profit","p&l","pnl","gain","loss","result","net","pl","bénéfice","perte","résultat","closed p&l","realized","gross profit","profit/loss","profit usd","profit eur","profit $","gain/loss","net p&l","trade p&l","net profit"],
    must_not: ["factor","open","entry","exit","time","date","position","order"]
  },
  pips: {
    keywords: ["pip","pips","point","points","tick","ticks","pip gain","pip loss","pips gained","pips lost","spread"],
    must_not: ["profit","price","time","date","order","lot"]
  },
  volume: {
    keywords: ["volume","lot","lots","size","quantity","position size","lot size","units","contracts","qty","vol"],
    must_not: ["profit","price","time","date","order","deal"]
  },
  entry_time: {
    keywords: ["open time","open date","entry time","entry date","trade date","date","time","datetime","opened","timestamp","date/time","open_time","date ouverture","heure entrée","date entrée","date open","close time","close date"],
    must_not: []
  },
  session: {
    keywords: ["session","market session","trading session","séance"],
    must_not: []
  },
  timeframe: {
    keywords: ["timeframe","time frame","tf","period","interval","chart period","frame","période"],
    must_not: []
  },
  outcome: {
    keywords: ["outcome","result","status","win","loss","win/loss","w/l","résultat","statut","trade result","winning","profit indicator"],
    must_not: ["profit","price","time","date","order","take","stop"]
  },
  notes: {
    keywords: ["note","notes","comment","comments","remark","description","memo","annotation","commentaire","remarque"],
    must_not: []
  },
}

function scoreHeader(header, fieldDef) {
  const h = header.toLowerCase().trim().replace(/[_\-\.\/]/g,' ')
  let score = 0
  for (const kw of fieldDef.keywords) {
    if (h === kw)           { score += 10; break }
    if (h.includes(kw))     { score += 5;  break }
    if (kw.includes(h) && h.length > 2) { score += 3; break }
  }
  if (score > 0) {
    for (const bad of (fieldDef.must_not || [])) {
      if (h.includes(bad)) { score -= 3; break }
    }
  }
  return Math.max(0, score)
}

function buildColumnMap(headers) {
  // For each field, find the best-scoring column index
  const map = {}
  const used = new Set()
  // Sort fields by specificity (more specific ones first)
  const fieldOrder = ['outcome','direction','symbol','pnl','entry_price','exit_price','pips','volume','entry_time','session','timeframe','notes']
  for (const field of fieldOrder) {
    const def = FIELD_SCORES[field]
    if (!def) continue
    let best = -1, bestScore = 0
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue
      const s = scoreHeader(headers[i], def)
      if (s > bestScore) { bestScore = s; best = i }
    }
    if (best >= 0 && bestScore >= 3) {
      map[field] = best
      used.add(best)
    }
  }
  return map
}

function normalizeDirection(raw) {
  if (!raw) return null
  const v = raw.toString().toUpperCase().trim()
  const BUY_VALS  = ['BUY','LONG','B','0','OP_BUY','ACHAT','HAUSSE','CALL','UP','BUY LIMIT','BUY STOP','1']
  const SELL_VALS = ['SELL','SHORT','S','1','OP_SELL','VENTE','BAISSE','PUT','DOWN','SELL LIMIT','SELL STOP','0']
  // exact match first
  if (BUY_VALS.includes(v))  return 'BUY'
  if (SELL_VALS.includes(v)) return 'SELL'
  // partial
  if (v.includes('BUY') || v.includes('LONG') || v.includes('ACHAT')) return 'BUY'
  if (v.includes('SELL') || v.includes('SHORT') || v.includes('VENTE')) return 'SELL'
  return null
}

function normalizeOutcome(raw, pnl) {
  const n = parseFloat(String(pnl).replace(/[^\d.\-]/g,'')) || 0
  // PNL is the ground truth — always use it when available
  if (n >  0.001) return 'WIN'
  if (n < -0.001) return 'LOSS'
  // P&L is 0 or missing — try to read from the outcome column
  if (raw) {
    const v = raw.toString().toUpperCase().trim()
    const WIN_VALS  = ['WIN','W','PROFIT','WINNER','WON','WINNING','PROFITABLE','GAGNÉ','GAGNE','YES','TRUE','1','POSITIVE','GREEN']
    const LOSS_VALS = ['LOSS','L','LOSE','LOSER','LOSING','LOST','PERDU','NO','FALSE','-1','NEGATIVE','RED']
    if (WIN_VALS.includes(v)  || WIN_VALS.some(x  => v.includes(x))) return 'WIN'
    if (LOSS_VALS.includes(v) || LOSS_VALS.some(x => v.includes(x))) return 'LOSS'
  }
  return 'BREAKEVEN'
}

function safeNum(val) {
  if (val === undefined || val === null || val === '') return 0
  const n = parseFloat(String(val).replace(/[^\d.\-]/g,''))
  return isNaN(n) ? 0 : n
}

function safeDate(val) {
  if (!val || val.toString().trim() === '') return new Date().toISOString()
  // Try common broker date formats
  const str = val.toString().trim()
  // Try native parse first
  const d1 = new Date(str)
  if (!isNaN(d1.getTime())) return d1.toISOString()
  // DD.MM.YYYY or DD/MM/YYYY
  const m1 = str.match(/^(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/)
  if (m1) { const d = new Date(m1[3], m1[2]-1, m1[1]); if (!isNaN(d.getTime())) return d.toISOString() }
  // YYYY.MM.DD
  const m2 = str.match(/^(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})/)
  if (m2) { const d = new Date(m2[1], m2[2]-1, m2[3]); if (!isNaN(d.getTime())) return d.toISOString() }
  return new Date().toISOString()
}

function rowToTrade(row, colMap) {
  const g = (field) => colMap[field] !== undefined ? (row[colMap[field]] || '').toString().trim() : ''
  const pnlRaw = g('pnl')
  const pnl    = safeNum(pnlRaw)
  const dir    = normalizeDirection(g('direction'))
  const out    = normalizeOutcome(g('outcome'), pnl)
  const sym    = g('symbol').toUpperCase().replace(/\s+/g,'') || 'UNKNOWN'

  return {
    symbol:      sym,
    direction:   dir || 'BUY',
    entry_price: safeNum(g('entry_price')),
    exit_price:  safeNum(g('exit_price')),
    pnl,
    pips:        safeNum(g('pips')),
    volume:      safeNum(g('volume')),
    outcome:     out,
    session:     ['LONDON','NEW_YORK','ASIAN','SYDNEY'].includes(g('session').toUpperCase()) ? g('session').toUpperCase() : 'LONDON',
    timeframe:   ['M1','M5','M15','M30','H1','H4','D1'].includes(g('timeframe').toUpperCase()) ? g('timeframe').toUpperCase() : 'H1',
    entry_time:  safeDate(g('entry_time')),
    quality:     5,
    notes:       g('notes'),
    screenshots: [],
    chart_url:   '',
    playbook_id: '',
  }
}

function parseCSVJ(text) {
  // Detect delimiter from first line
  const firstLine = text.replace(/\r/g, '').split('\n')[0] || ''
  const tabCount   = (firstLine.match(/\t/g)   || []).length
  const semiCount  = (firstLine.match(/;/g)    || []).length
  const commaCount = (firstLine.match(/,/g)    || []).length
  const delim = tabCount > semiCount && tabCount > commaCount ? '\t'
              : semiCount > commaCount ? ';' : ','

  const parseRow = (line) => {
    const r = []; let inQ = false, cur = ''
    for (const c of line) {
      if (c === '"') { inQ = !inQ }
      else if (c === delim && !inQ) { r.push(cur.trim()); cur = '' }
      else { cur += c }
    }
    r.push(cur.trim())
    return r
  }

  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) return { trades: [], skipped: 0, colMap: {}, headers: [] }

  const headers = parseRow(lines[0])
  const colMap  = buildColumnMap(headers)

  const trades = []; let skipped = 0
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const row   = parseRow(lines[i])
    const trade = rowToTrade(row, colMap)
    if (trade.symbol === 'UNKNOWN' && trade.pnl === 0 && trade.entry_price === 0) { skipped++; continue }
    trades.push(trade)
  }

  return { trades, skipped, colMap, headers }
}

// ─── AI Trade Feedback Panel ──────────────────────────────────────────────────
function AiFeedbackPanel({ trade, allTrades, onClose }) {
  const [feedback, setFeedback] = useState("")
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState("")

  useEffect(() => {
    generateFeedback()
  }, [trade.id])

  const generateFeedback = async () => {
    setLoading(true); setError(""); setFeedback("")
    // Build context from all trades
    const wins   = allTrades.filter(t => t.outcome === "WIN").length
    const losses = allTrades.filter(t => t.outcome === "LOSS").length
    const winRate = allTrades.length ? ((wins / allTrades.length) * 100).toFixed(1) : 0
    const netPnl  = allTrades.reduce((s,t) => s + (t.pnl||0), 0).toFixed(2)
    const sameSymbol = allTrades.filter(t => t.symbol === trade.symbol)
    const symWinRate = sameSymbol.length
      ? ((sameSymbol.filter(t=>t.outcome==="WIN").length / sameSymbol.length)*100).toFixed(1)
      : "N/A"

    const prompt = `You are SYLLEDGE AI, an elite trading coach. Analyze this specific trade and give brutally honest, actionable feedback.

TRADE DETAILS:
- Symbol: ${trade.symbol}
- Direction: ${trade.direction}
- Entry: ${trade.entry_price} | Exit: ${trade.exit_price}
- P&L: ${trade.pnl >= 0 ? "+" : ""}$${parseFloat(trade.pnl||0).toFixed(2)}
- Pips: ${trade.pips || "N/A"}
- Outcome: ${trade.outcome}
- Session: ${trade.session} | Timeframe: ${trade.timeframe}
- Setup Quality (self-rated): ${trade.quality}/10
- Notes: ${trade.notes || "None"}
- Date: ${trade.entry_time ? new Date(trade.entry_time).toLocaleDateString() : "N/A"}

TRADER CONTEXT:
- Overall win rate: ${winRate}% (${wins}W / ${losses}L across ${allTrades.length} trades)
- Net P&L all trades: $${netPnl}
- Win rate on ${trade.symbol}: ${symWinRate}% across ${sameSymbol.length} trades

Give feedback in these exact sections:
1. **Trade Assessment** — Was this a good trade execution? (2-3 sentences)
2. **What Went Well** — Specific positives (bullet points)
3. **What To Improve** — Specific critique tied to their numbers (bullet points)
4. **Key Lesson** — One concrete takeaway in 1 sentence

Be direct, reference their actual numbers. No generic advice.`

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages:   [{ role: "user", content: prompt }],
          max_tokens: 600,
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      const text = data.content?.map(b => b.text || "").join("") || ""
      setFeedback(text)
    } catch(e) {
      setError("Failed to get AI feedback: " + (e.message || "unknown error"))
    }
    setLoading(false)
  }

  // Format markdown-ish feedback into JSX
  const formatFeedback = (text) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**"))
        return <p key={i} className="font-bold mt-4 mb-1" style={{ color:"var(--accent)" }}>{line.replace(/\*\*/g,"")}</p>
      if (line.match(/^\*\*(.+)\*\*/))
        return <p key={i} className="font-bold mt-4 mb-1" style={{ color:"var(--accent)" }}>{line.replace(/\*\*/g,"")}</p>
      if (line.startsWith("- ") || line.startsWith("• "))
        return <p key={i} className="text-sm pl-3 border-l-2 my-1" style={{ color:"var(--text-secondary)", borderColor:"var(--border-light)" }}>
          {line.replace(/^[-•]\s/,"")}
        </p>
      if (!line.trim()) return <div key={i} className="h-1"/>
      return <p key={i} className="text-sm" style={{ color:"var(--text-secondary)" }}>{line}</p>
    })
  }

  const pnlColor = (trade.pnl||0) >= 0 ? "var(--accent-success)" : "var(--accent-danger)"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative h-full w-full max-w-md flex flex-col shadow-2xl z-10 overflow-hidden"
        style={{ background:"var(--bg-card)", borderLeft:"1px solid var(--border)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom:"1px solid var(--border)", background:"var(--bg-elevated)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
              <Brain size={15} className="text-white"/>
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color:"var(--text-primary)" }}>SYLLEDGE AI Feedback</p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Per-trade analysis</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-muted)" }}>
            <X size={16}/>
          </button>
        </div>

        {/* Trade summary card */}
        <div className="px-5 py-3 flex-shrink-0" style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold" style={{ color:"var(--text-primary)" }}>{trade.symbol}</span>
              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                style={{ background:trade.direction==="BUY"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)",
                  color:trade.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                {trade.direction==="BUY"?"▲":"▼"} {trade.direction}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background:trade.outcome==="WIN"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)",
                  color:trade.outcome==="WIN"?"var(--accent-success)":"var(--accent-danger)" }}>
                {trade.outcome}
              </span>
            </div>
            <span className="font-bold text-sm" style={{ color:pnlColor }}>
              {(trade.pnl||0)>=0?"+":""}${parseFloat(trade.pnl||0).toFixed(2)}
            </span>
          </div>
          <div className="flex gap-3 mt-1.5 text-xs" style={{ color:"var(--text-muted)" }}>
            <span>{trade.session}</span>
            <span>{trade.timeframe}</span>
            <span>Quality: {trade.quality}/10</span>
            {trade.entry_time && <span>{new Date(trade.entry_time).toLocaleDateString()}</span>}
          </div>
        </div>

        {/* Feedback body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background:"rgba(108,99,255,0.1)" }}>
                <Sparkles size={22} className="animate-pulse" style={{ color:"var(--accent)" }}/>
              </div>
              <p className="text-sm animate-pulse" style={{ color:"var(--text-muted)" }}>
                SYLLEDGE is analysing your trade...
              </p>
            </div>
          )}
          {error && (
            <div className="p-4 rounded-xl mt-4" style={{ background:"rgba(255,71,87,0.08)", border:"1px solid rgba(255,71,87,0.2)" }}>
              <p className="text-sm" style={{ color:"var(--accent-danger)" }}>{error}</p>
            </div>
          )}
          {feedback && !loading && (
            <div className="space-y-0.5">
              {formatFeedback(feedback)}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex gap-2 flex-shrink-0" style={{ borderTop:"1px solid var(--border)" }}>
          <button onClick={generateFeedback} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>
            <Sparkles size={12}/> Regenerate
          </button>
          <p className="text-xs my-auto ml-auto" style={{ color:"var(--text-muted)" }}>
            Powered by Claude AI
          </p>
        </div>
      </div>
    </div>
  )
}


// ─── CSV Template Download ────────────────────────────────────────────────────
function downloadCSVTemplate() {
  const headers = ["symbol","direction","entry_price","exit_price","pnl","pips","volume","entry_time","session","timeframe","outcome","notes"]
  const examples = [
    ["EURUSD","BUY","1.08500","1.08750","25.00","25","0.10","2025-01-15 09:30:00","LONDON","H1","WIN","Clean breakout entry"],
    ["GBPUSD","SELL","1.27300","1.27100","20.00","20","0.10","2025-01-15 14:00:00","NEW_YORK","M15","WIN","Rejection at resistance"],
    ["XAUUSD","BUY","2020.00","2015.00","-50.00","-50","0.05","2025-01-16 09:00:00","LONDON","H4","LOSS","Stopped out at news"],
    ["USDJPY","SELL","148.500","148.200","30.00","30","0.10","2025-01-16 15:30:00","NEW_YORK","H1","WIN","Trend continuation"],
  ]
  const rows = [headers, ...examples].map(r => r.join(",")).join("\n")
  const blob = new Blob([rows], { type: "text/csv" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = "tradesylla_template.csv"
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Column Mapping Panel ─────────────────────────────────────────────────────
// Lets the user manually fix any column that the auto-detector got wrong
const FIELD_LABELS = {
  symbol:      { label: "Symbol",      desc: "Asset pair (EURUSD, XAUUSD…)" },
  direction:   { label: "Direction",   desc: "BUY or SELL" },
  entry_price: { label: "Entry Price", desc: "Price at trade open" },
  exit_price:  { label: "Exit Price",  desc: "Price at trade close" },
  pnl:         { label: "P&L",         desc: "Profit or loss (number)" },
  pips:        { label: "Pips",        desc: "Pip gain/loss" },
  volume:      { label: "Volume/Lots", desc: "Position size in lots" },
  entry_time:  { label: "Date/Time",   desc: "Trade open timestamp" },
  session:     { label: "Session",     desc: "LONDON, NEW_YORK…" },
  timeframe:   { label: "Timeframe",   desc: "H1, M15, D1…" },
  outcome:     { label: "Outcome",     desc: "WIN, LOSS, BREAKEVEN" },
  notes:       { label: "Notes",       desc: "Comments or remarks" },
}

function ColumnMappingPanel({ headers, colMap, onMapChange }) {
  const [open, setOpen] = useState(false)

  // Build reverse map: colIndex → fieldName
  const reverseMap = {}
  Object.entries(colMap).forEach(([field, idx]) => { reverseMap[idx] = field })

  const fields = Object.keys(FIELD_LABELS)

  const handleChange = (field, newIdx) => {
    const updated = { ...colMap }
    if (newIdx === "") {
      // Remove this field mapping
      delete updated[field]
    } else {
      // Unassign any other field that had this column
      Object.keys(updated).forEach(f => { if (updated[f] === parseInt(newIdx) && f !== field) delete updated[f] })
      updated[field] = parseInt(newIdx)
    }
    onMapChange(updated)
  }

  const unmappedRequired = ["symbol","direction","pnl"].filter(f => colMap[f] === undefined)

  return (
    <div className="rounded-xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold"
        style={{ background:"var(--bg-elevated)", color:"var(--text-primary)" }}>
        <div className="flex items-center gap-2">
          {unmappedRequired.length > 0
            ? <AlertTriangle size={14} style={{ color:"var(--accent-warning)" }}/>
            : <CheckCircle  size={14} style={{ color:"var(--accent-success)" }}/>}
          <span>Column Mapping</span>
          <span className="text-xs font-normal px-2 py-0.5 rounded-full" style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)" }}>
            {Object.keys(colMap).length}/{fields.length} matched
          </span>
        </div>
        {open ? <ChevronUp size={14} style={{ color:"var(--text-muted)" }}/> : <ChevronDown size={14} style={{ color:"var(--text-muted)" }}/>}
      </button>

      {open && (
        <div className="p-4 space-y-2" style={{ background:"var(--bg-card)" }}>
          {unmappedRequired.length > 0 && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ background:"rgba(255,165,2,0.08)", color:"var(--accent-warning)", border:"1px solid rgba(255,165,2,0.15)" }}>
              ⚠ Required fields not detected: <strong>{unmappedRequired.join(", ")}</strong>. Map them manually below.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2">
            {fields.map(field => {
              const info    = FIELD_LABELS[field]
              const mapped  = colMap[field] !== undefined
              const colName = mapped ? headers[colMap[field]] : null
              const required = ["symbol","direction","pnl"].includes(field)
              return (
                <div key={field} className="flex items-center gap-3 p-2.5 rounded-lg"
                  style={{ background: mapped ? "rgba(46,213,115,0.04)" : required ? "rgba(255,165,2,0.04)" : "var(--bg-elevated)", border:`1px solid ${mapped?"rgba(46,213,115,0.15)":required?"rgba(255,165,2,0.15)":"var(--border)"}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold" style={{ color: mapped?"var(--accent-success)":required?"var(--accent-warning)":"var(--text-secondary)" }}>
                        {info.label}
                      </span>
                      {required && <span className="text-xs" style={{ color:"var(--text-muted)" }}>*</span>}
                    </div>
                    <p className="text-xs truncate" style={{ color:"var(--text-muted)" }}>{info.desc}</p>
                  </div>
                  <select
                    value={colMap[field] !== undefined ? colMap[field] : ""}
                    onChange={e => handleChange(field, e.target.value)}
                    className="h-8 rounded-lg px-2 text-xs border flex-shrink-0"
                    style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", minWidth: 130, maxWidth: 160 }}>
                    <option value="">— not mapped —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h} {reverseMap[i] && reverseMap[i] !== field ? `(→ ${reverseMap[i]})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>* Required for import. Fields not mapped will use defaults.</p>
        </div>
      )}
    </div>
  )
}

function CSVImportModal({ open, onClose, onImported }) {
  const [file,      setFile]      = useState(null)
  const [preview,   setPreview]   = useState(null)
  const [colMap,    setColMap]    = useState({})
  const [rawText,   setRawText]   = useState("")
  const [importing, setImporting] = useState(false)
  const [result,    setResult]    = useState(null)
  const [progress,  setProgress]  = useState(0)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f); setResult(null); setPreview(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const text   = ev.target.result
        const parsed = parseCSVJ(text)
        setPreview(parsed)
        setColMap(parsed.colMap || {})
        setRawText(text)
      } catch(err) {
        console.error("CSV parse error:", err)
        toast.error("Could not read file \u2014 make sure it's a valid CSV.")
        setFile(null)
      }
    }
    reader.onerror = () => { toast.error("Failed to read file"); setFile(null) }
    reader.readAsText(f, 'UTF-8')
    e.target.value = ""
  }

  // Re-parse trades from raw text using the current colMap (updated by user)
  const getTrades = () => {
    if (!preview || !rawText) return []
    try {
      const lines = rawText.replace(/\r/g, "").split("\n").filter(l => l.trim())
      if (lines.length < 2) return []
      const parseRow = (line) => {
        const r=[]; let inQ=false, cur=""
        for (const c of line) {
          if (c==='"') { inQ=!inQ }
          else if (!inQ && (line.includes("\t") ? c==="\t" : c===",")) { r.push(cur.trim()); cur="" }
          else { cur+=c }
        }
        r.push(cur.trim()); return r
      }
      const trades=[]
      for (let i=1; i<lines.length; i++) {
        if (!lines[i].trim()) continue
        const row = parseRow(lines[i])
        const t   = rowToTrade(row, colMap)
        if (t.symbol==="UNKNOWN" && t.pnl===0 && t.entry_price===0) continue
        trades.push(t)
      }
      return trades
    } catch { return preview.trades || [] }
  }

  const doImport = async () => {
    const trades = getTrades()
    if (!trades.length) return
    setImporting(true); setProgress(0)
    let imported = 0
    for (let i = 0; i < trades.length; i++) {
      try { await Trade.create(trades[i]); imported++ } catch(e) { console.warn("row skip:", e) }
      setProgress(Math.round(((i+1)/trades.length)*100))
    }
    setImporting(false)
    setResult({ imported, skipped: (preview?.skipped||0) + (trades.length - imported) })
    setFile(null); setPreview(null); setColMap({}); setRawText("")
    onImported()
    toast.success(imported + " trades imported!")
  }

  const liveTrades    = preview ? getTrades() : []
  const detectedFields = Object.keys(colMap || {})

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={!importing ? onClose : undefined}/>
      <div className="relative w-full max-w-lg rounded-2xl shadow-2xl z-10 flex flex-col max-h-[90vh]" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom:"1px solid var(--border)" }}>
          <div>
            <h2 className="font-bold" style={{ color:"var(--text-primary)" }}>Import Trades from CSV</h2>
            <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>Works with any broker export</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadCSVTemplate} title="Download template CSV"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--accent)" }}>
              <Download size={12}/> Template
            </button>
            <button onClick={onClose} disabled={importing} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={15}/></button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Broker badges */}
          <div className="flex flex-wrap gap-1.5">
            {["MT4","MT5","cTrader","TradingView","FTMO","IC Markets","Pepperstone","Any CSV"].map(b=>(
              <span key={b} className="px-2 py-0.5 rounded-lg text-xs font-medium" style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>{b}</span>
            ))}
          </div>

          {/* Drop zone */}
          {!file && !result && (
            <label className="flex flex-col items-center gap-3 p-10 rounded-xl border-2 border-dashed cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor:"var(--border)" }}>
              <Upload size={28} style={{ color:"var(--accent)" }}/>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>Click to browse or drop your CSV here</p>
                <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>The importer auto-detects all columns — unknown ones are ignored</p>
              </div>
              <input type="file" accept=".csv,.txt,.tsv,.xls" onChange={handleFile} className="hidden"/>
            </label>
          )}

          {/* Preview */}
          {file && preview && (
            <div className="space-y-3">
              {/* File info */}
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <CheckCircle size={15} style={{ color:"var(--accent-success)" }}/>
                  <span className="text-sm font-semibold truncate max-w-48" style={{ color:"var(--text-primary)" }}>{file.name}</span>
                </div>
                <button onClick={()=>{setFile(null);setPreview(null)}} className="text-xs px-2 py-1 rounded-lg" style={{ color:"var(--text-muted)", background:"var(--bg-card)", border:"1px solid var(--border)" }}>Change</button>
              </div>

              {/* Detected fields */}
              {detectedFields.length > 0 && (
                <div className="p-3 rounded-xl" style={{ background:"rgba(108,99,255,0.06)", border:"1px solid rgba(108,99,255,0.15)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color:"var(--accent)" }}>✓ Detected fields ({detectedFields.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedFields.map(f => (
                      <span key={f} className="px-2 py-0.5 rounded text-xs font-medium" style={{ background:"rgba(108,99,255,0.15)", color:"var(--accent)" }}>{f}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Column Mapping */}
              <ColumnMappingPanel
                headers={preview.headers || []}
                colMap={colMap}
                onMapChange={setColMap}
              />

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl text-center" style={{ background:"rgba(46,213,115,0.08)", border:"1px solid rgba(46,213,115,0.15)" }}>
                  <p className="text-lg font-bold" style={{ color:"var(--accent-success)" }}>{liveTrades.length}</p>
                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>Trades found</p>
                </div>
                <div className="p-2.5 rounded-xl text-center" style={{ background:"rgba(46,213,115,0.08)", border:"1px solid rgba(46,213,115,0.15)" }}>
                  <p className="text-lg font-bold" style={{ color:"var(--accent-success)" }}>{liveTrades.filter(t=>t.outcome==='WIN').length}</p>
                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>Wins</p>
                </div>
                <div className="p-2.5 rounded-xl text-center" style={{ background:"rgba(255,71,87,0.08)", border:"1px solid rgba(255,71,87,0.15)" }}>
                  <p className="text-lg font-bold" style={{ color:"var(--accent-danger)" }}>{liveTrades.filter(t=>t.outcome==='LOSS').length}</p>
                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>Losses</p>
                </div>
              </div>

              {/* Sample rows */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color:"var(--text-muted)" }}>PREVIEW (first 3 trades)</p>
                <div className="space-y-1.5">
                  {liveTrades.slice(0,3).map((t,i)=>(
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg text-xs" style={{ background:"var(--bg-elevated)" }}>
                      <span className="font-bold w-16 truncate" style={{ color:"var(--text-primary)" }}>{t.symbol}</span>
                      <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background:t.direction==="BUY"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)", color:t.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>{t.direction}</span>
                      <span className="flex-1 font-semibold" style={{ color:t.pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>{t.pnl>=0?"+":""}{t.pnl.toFixed(2)}</span>
                      <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background:t.outcome==="WIN"?"rgba(46,213,115,0.15)":t.outcome==="LOSS"?"rgba(255,71,87,0.15)":"rgba(108,99,255,0.15)", color:t.outcome==="WIN"?"var(--accent-success)":t.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>{t.outcome}</span>
                    </div>
                  ))}
                </div>
              </div>

              {preview.skipped > 0 && (
                <p className="text-xs" style={{ color:"var(--accent-warning)" }}>⚠ {preview.skipped} rows skipped (empty or unreadable)</p>
              )}
            </div>
          )}

          {/* Progress bar */}
          {importing && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs" style={{ color:"var(--text-muted)" }}>
                <span>Importing trades...</span><span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background:"var(--bg-elevated)" }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width:progress+"%", background:"linear-gradient(90deg,var(--accent),var(--accent-secondary))" }}/>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="p-4 rounded-xl text-center space-y-1" style={{ background:"rgba(46,213,115,0.08)", border:"1px solid rgba(46,213,115,0.2)" }}>
              <CheckCircle size={22} className="mx-auto" style={{ color:"var(--accent-success)" }}/>
              <p className="font-bold" style={{ color:"var(--accent-success)" }}>Import Complete!</p>
              <p className="text-sm" style={{ color:"var(--text-secondary)" }}>{result.imported} trades imported{result.skipped>0?`, ${result.skipped} skipped`:""}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 flex-shrink-0" style={{ borderTop:"1px solid var(--border)" }}>
          <button onClick={onClose} disabled={importing} className="flex-1 h-10 rounded-xl text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>
            {result ? "Done" : "Cancel"}
          </button>
          {preview?.trades?.length > 0 && !result && (
            <button onClick={doImport} disabled={importing} className="flex-1 h-10 rounded-xl text-sm font-bold text-white"
              style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity:importing?0.8:1 }}>
              {importing ? `Importing... ${progress}%` : `Import ${preview.trades.length} Trades`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Journal() {
  const { t } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const viewMode = searchParams.get("view") === "calendar" ? "calendar" : "table"

  const [trades, setTrades]         = useState([])
  const [playbooks, setPlaybooks]   = useState([])
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTrade, setEditTrade]   = useState(null)
  const [deleteTrade, setDeleteTrade] = useState(null)
  const [aiFeedbackTrade, setAiFeedbackTrade] = useState(null)

  // Filters — 14 dimensions
  const [filterSymbol,    setFilterSymbol]    = useState("ALL")
  const [filterOutcome,   setFilterOutcome]   = useState("ALL")
  const [filterDirection, setFilterDirection] = useState("ALL")
  const [filterSession,   setFilterSession]   = useState("ALL")
  const [filterTF,        setFilterTF]        = useState("ALL")
  const [filterQualMin,   setFilterQualMin]   = useState(0)
  const [filterPnlMin,    setFilterPnlMin]    = useState("")
  const [filterPnlMax,    setFilterPnlMax]    = useState("")
  const [filterDateFrom,  setFilterDateFrom]  = useState("")
  const [filterDateTo,    setFilterDateTo]    = useState("")
  const [filterSearch,    setFilterSearch]    = useState("")
  const [filterTag,       setFilterTag]       = useState("")
  const [filtersOpen,     setFiltersOpen]     = useState(false)

  const loadTrades = async () => {
    try {
      const data = await Trade.list()
      const safe = (data || []).map(safeTrade).filter(Boolean)
      setTrades(safe.sort((a,b)=>new Date(b.entry_time)-new Date(a.entry_time)))
    } catch(e) { console.error("Journal loadTrades:", e) }
  }
  useEffect(() => {
    loadTrades()
    Playbook.list().then(data => setPlaybooks(data || [])).catch(() => {})
    const unsub = subscribeToTable('trades', loadTrades)
    return () => { try { unsub() } catch {} }
  }, [])

  // Unique symbols from actual data
  const symbols = ["ALL", ...Array.from(new Set(trades.map(t=>t.symbol))).sort()]

  // Active filter count
  const activeFilters = [
    filterSymbol !== "ALL", filterOutcome !== "ALL", filterDirection !== "ALL",
    filterSession !== "ALL", filterTF !== "ALL", filterQualMin > 0,
    filterPnlMin !== "", filterPnlMax !== "",
    filterDateFrom !== "", filterDateTo !== "", filterSearch !== "",
    filterTag !== ""
  ].filter(Boolean).length

  const resetFilters = () => {
    setFilterSymbol("ALL"); setFilterOutcome("ALL"); setFilterDirection("ALL")
    setFilterSession("ALL"); setFilterTF("ALL"); setFilterQualMin(0)
    setFilterPnlMin(""); setFilterPnlMax(""); setFilterDateFrom("")
    setFilterDateTo(""); setFilterSearch(""); setFilterTag("")
  }

  // Filtered trades
  const filtered = trades.filter(t => {
    if (filterSymbol    !== "ALL" && t.symbol    !== filterSymbol)    return false
    if (filterOutcome   !== "ALL" && t.outcome   !== filterOutcome)   return false
    if (filterDirection !== "ALL" && t.direction !== filterDirection) return false
    if (filterSession   !== "ALL" && t.session   !== filterSession)   return false
    if (filterTF        !== "ALL" && t.timeframe !== filterTF)        return false
    if (filterQualMin   > 0       && (t.quality || 0) < filterQualMin) return false
    if (filterPnlMin    !== ""    && (t.pnl || 0) < parseFloat(filterPnlMin)) return false
    if (filterPnlMax    !== ""    && (t.pnl || 0) > parseFloat(filterPnlMax)) return false
    if (filterDateFrom  !== "" && t.entry_time && new Date(t.entry_time) < new Date(filterDateFrom)) return false
    if (filterDateTo    !== "" && t.entry_time && new Date(t.entry_time) > new Date(filterDateTo + "T23:59:59")) return false
    if (filterTag !== "" && !(Array.isArray(t.tags) && t.tags.includes(filterTag))) return false
    if (filterSearch    !== "") {
      const q = filterSearch.toLowerCase()
      const match = (t.symbol||"").toLowerCase().includes(q) ||
                    (t.notes||"").toLowerCase().includes(q)  ||
                    (t.mt5_ticket||"").includes(q)
      if (!match) return false
    }
    return true
  })

  const handleEdit = (t) => { setEditTrade(t); setModalOpen(true) }
  const handleDeleteConfirm = async () => {
    if (!deleteTrade) return
    await Trade.delete(deleteTrade.id)
    toast.success("Trade deleted")
    setDeleteTrade(null)
    loadTrades()
  }
  const openNew = () => { setEditTrade(null); setModalOpen(true) }

  const setView = (v) => {
    if (v==="calendar") setSearchParams({ view:"calendar" })
    else setSearchParams({})
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>{t("journal_title")}</h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
            {trades.length} {t("journal_logged")} · {filtered.length} {t("journal_shown")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border:"1px solid var(--border)" }}>
            <button onClick={()=>setView("table")} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all"
              style={{ background:viewMode==="table"?"var(--accent)":"var(--bg-elevated)", color:viewMode==="table"?"#fff":"var(--text-secondary)" }}>
              <List size={13}/> {t("journal_table")}
            </button>
            <button onClick={()=>setView("calendar")} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all"
              style={{ background:viewMode==="calendar"?"var(--accent)":"var(--bg-elevated)", color:viewMode==="calendar"?"#fff":"var(--text-secondary)" }}>
              <CalendarDays size={13}/> {t("journal_calendar")}
            </button>
          </div>
          {/* New Trade */}
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
            <Plus size={14}/> {t("journal_new_trade")}
          </button>
        </div>
      </div>

      {/* Filters — 14 dimensions */}
      <div className="rounded-xl mb-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        {/* Filter bar header */}
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer"
          onClick={() => setFiltersOpen(o => !o)}
          style={{ borderBottom: filtersOpen ? "1px solid var(--border)" : "none" }}>
          <div className="flex items-center gap-2">
            <Activity size={13} style={{ color:"var(--accent)" }}/>
            <span className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{t("journal_filters")}</span>
            {activeFilters > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background:"var(--accent)", color:"#fff" }}>{activeFilters}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFilters > 0 && (
              <button onClick={e => { e.stopPropagation(); resetFilters() }}
                className="text-xs px-2 py-1 rounded-lg hover:opacity-70"
                style={{ color:"var(--accent-danger)", background:"rgba(255,71,87,0.08)" }}>
                {t("journal_clear_all")}
              </button>
            )}
            {filtersOpen ? <ChevronUp size={14} style={{ color:"var(--text-muted)" }}/> : <ChevronDown size={14} style={{ color:"var(--text-muted)" }}/>}
          </div>
        </div>

        {filtersOpen && (
          <div className="p-4 flex flex-wrap gap-5">
            {/* Search */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Search</p>
              <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
                placeholder="Symbol, notes, ticket…"
                className="h-8 rounded-lg px-3 text-xs border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", width:180 }}/>
            </div>

            {/* Symbol */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Symbol</p>
              <div className="flex flex-wrap gap-1.5">
                {symbols.map(s => (
                  <button key={s} onClick={() => setFilterSymbol(s)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{ background:filterSymbol===s?"var(--accent)":"var(--bg-elevated)",
                      color:filterSymbol===s?"#fff":"var(--text-secondary)",
                      border:"1px solid", borderColor:filterSymbol===s?"var(--accent)":"var(--border)" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Outcome */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Outcome</p>
              <div className="flex gap-1.5">
                {["ALL","WIN","LOSS","BREAKEVEN"].map(o => (
                  <button key={o} onClick={() => setFilterOutcome(o)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{ background:filterOutcome===o?(o==="WIN"?"rgba(46,213,115,0.25)":o==="LOSS"?"rgba(255,71,87,0.25)":o==="BREAKEVEN"?"rgba(108,99,255,0.25)":"var(--accent)"):"var(--bg-elevated)",
                      color:filterOutcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":o==="BREAKEVEN"?"var(--accent)":"#fff"):"var(--text-secondary)",
                      border:"1px solid", borderColor:filterOutcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--border)" }}>
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Direction</p>
              <div className="flex gap-1.5">
                {["ALL","BUY","SELL"].map(d => (
                  <button key={d} onClick={() => setFilterDirection(d)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{ background:filterDirection===d?"var(--accent)":"var(--bg-elevated)",
                      color:filterDirection===d?"#fff":"var(--text-secondary)",
                      border:"1px solid", borderColor:filterDirection===d?"var(--accent)":"var(--border)" }}>
                    {d==="BUY"?"▲ ":d==="SELL"?"▼ ":""}{d}
                  </button>
                ))}
              </div>
            </div>

            {/* Session */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Session</p>
              <div className="flex flex-wrap gap-1.5">
                {["ALL",...SESSIONS].map(s => (
                  <button key={s} onClick={() => setFilterSession(s)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{ background:filterSession===s?"var(--accent)":"var(--bg-elevated)",
                      color:filterSession===s?"#fff":"var(--text-secondary)",
                      border:"1px solid", borderColor:filterSession===s?"var(--accent)":"var(--border)" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeframe */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Timeframe</p>
              <div className="flex flex-wrap gap-1.5">
                {["ALL",...TFS].map(tf => (
                  <button key={tf} onClick={() => setFilterTF(tf)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                    style={{ background:filterTF===tf?"var(--accent)":"var(--bg-elevated)",
                      color:filterTF===tf?"#fff":"var(--text-secondary)",
                      border:"1px solid", borderColor:filterTF===tf?"var(--accent)":"var(--border)" }}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality min */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>
                Min Quality: <span style={{ color:"var(--accent)" }}>{filterQualMin > 0 ? `${filterQualMin}+` : "Any"}</span>
              </p>
              <input type="range" min="0" max="9" step="1" value={filterQualMin}
                onChange={e => setFilterQualMin(parseInt(e.target.value))}
                className="w-32 h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ accentColor:"var(--accent)" }}/>
              <div className="flex justify-between text-xs mt-1 w-32" style={{ color:"var(--text-muted)" }}>
                <span>Any</span><span>9+</span>
              </div>
            </div>

            {/* P&L range */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>P&L Range ($)</p>
              <div className="flex items-center gap-2">
                <input type="number" placeholder="Min" value={filterPnlMin}
                  onChange={e => setFilterPnlMin(e.target.value)}
                  className="h-8 rounded-lg px-3 text-xs border w-20"
                  style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
                <span className="text-xs" style={{ color:"var(--text-muted)" }}>→</span>
                <input type="number" placeholder="Max" value={filterPnlMax}
                  onChange={e => setFilterPnlMax(e.target.value)}
                  className="h-8 rounded-lg px-3 text-xs border w-20"
                  style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
            </div>

            {/* Date range */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Date Range</p>
              <div className="flex items-center gap-2">
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                  className="h-8 rounded-lg px-2 text-xs border"
                  style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
                <span className="text-xs" style={{ color:"var(--text-muted)" }}>→</span>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                  className="h-8 rounded-lg px-2 text-xs border"
                  style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
            </div>

            {/* Tags filter */}
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Filter by Tag</p>
              <div className="flex flex-col gap-2">
                {Object.entries(TRADE_TAGS).map(([catKey, cat]) => (
                  <div key={catKey} className="flex flex-wrap gap-1">
                    {cat.tags.map(tag => (
                      <button key={tag} onClick={() => setFilterTag(filterTag === tag ? "" : tag)}
                        className="px-2 py-0.5 rounded-full text-xs font-medium transition-all"
                        style={{
                          background: filterTag === tag ? cat.bg : "var(--bg-elevated)",
                          color:      filterTag === tag ? cat.color : "var(--text-muted)",
                          border:     `1px solid ${filterTag === tag ? cat.color + "60" : "var(--border)"}`,
                        }}>
                        {tag}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {viewMode==="calendar"
        ? <CalendarView trades={filtered} onNewTrade={openNew} onEdit={handleEdit} onDelete={setDeleteTrade} onAI={setAiFeedbackTrade} playbooks={playbooks}/>
        : <TableView trades={filtered} onEdit={handleEdit} onDelete={setDeleteTrade} onAI={setAiFeedbackTrade} playbooks={playbooks}/>
      }

      {/* Floating + button */}
      <button onClick={openNew}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center z-40 transition-transform hover:scale-110"
        style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
        <Plus size={24} className="text-white"/>
      </button>

      {/* Modals */}
      <TradeModal
        open={modalOpen}
        onClose={()=>{ setModalOpen(false); setEditTrade(null) }}
        onSaved={loadTrades}
        editTrade={editTrade}
      />
      {deleteTrade && (
        <DeleteConfirm
          trade={deleteTrade}
          onCancel={()=>setDeleteTrade(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  )
}
