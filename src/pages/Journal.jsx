import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Trade } from "@/api/supabaseStore"
import { toast } from "@/components/ui/toast"
import {
  Plus, Pencil, Trash2, X, List, CalendarDays,
  TrendingUp, TrendingDown, Activity, ChevronLeft, ChevronRight
, Upload, CheckCircle} from "lucide-react"


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
function CalendarView({ trades, onNewTrade }) {
  const [current, setCurrent] = useState(new Date())
  const year  = current.getFullYear()
  const month = current.getMonth()
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
  const firstDay   = new Date(year, month, 1).getDay()
  const daysInMonth= new Date(year, month+1, 0).getDate()

  const byDay = {}
  trades.forEach(t => {
    if (!t.entry_time) return
    const key = new Date(t.entry_time).toISOString().slice(0,10)
    if (!byDay[key]) byDay[key]=[]
    byDay[key].push(t)
  })

  const monthTotal = Object.entries(byDay)
    .filter(([d]) => d.startsWith(`${year}-${String(month+1).padStart(2,"0")}`))
    .reduce((s,[,arr])=>s+arr.reduce((a,t)=>a+(t.pnl||0),0),0)

  return (
    <div>
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={()=>setCurrent(new Date(year,month-1,1))} className="p-2 rounded-lg hover:opacity-70" style={{ background:"var(--bg-elevated)", color:"var(--text-secondary)" }}>
            <ChevronLeft size={16}/>
          </button>
          <h2 className="text-base font-bold" style={{ color:"var(--text-primary)" }}>{MONTHS[month]} {year}</h2>
          <button onClick={()=>setCurrent(new Date(year,month+1,1))} className="p-2 rounded-lg hover:opacity-70" style={{ background:"var(--bg-elevated)", color:"var(--text-secondary)" }}>
            <ChevronRight size={16}/>
          </button>
          <button onClick={()=>setCurrent(new Date())} className="px-3 py-1 rounded-lg text-xs font-medium" style={{ background:"rgba(108,99,255,0.15)", color:"var(--accent)" }}>
            Today
          </button>
        </div>
        <span className="text-sm font-semibold" style={{ color: monthTotal>=0?"var(--accent-success)":"var(--accent-danger)" }}>
          {monthTotal>=0?"+":""} ${monthTotal.toFixed(0)} this month
        </span>
      </div>

      {/* Grid */}
      <div className="rounded-xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
        {/* Day headers */}
        <div className="grid grid-cols-7" style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
          {DAYS.map(d=>(
            <div key={d} className="text-center text-xs font-semibold py-2.5" style={{ color:"var(--text-muted)" }}>{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {Array.from({ length: firstDay }).map((_,i)=>(
            <div key={`e${i}`} style={{ borderBottom:"1px solid var(--border)", borderRight:"1px solid var(--border)", minHeight:80 }}/>
          ))}
          {Array.from({ length: daysInMonth }).map((_,i)=>{
            const day = i+1
            const key = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`
            const dayTrades = byDay[key] || []
            const pnl  = dayTrades.reduce((s,t)=>s+(t.pnl||0),0)
            const wins = dayTrades.filter(t=>t.outcome==="WIN").length
            const losses= dayTrades.filter(t=>t.outcome==="LOSS").length
            const hasTrades = dayTrades.length>0
            const isToday = key===new Date().toISOString().slice(0,10)
            const dow = new Date(year,month,day).getDay()
            const isLastInRow = dow===6 || day===daysInMonth
            return (
              <div key={day} className="p-2" style={{
                borderBottom:"1px solid var(--border)",
                borderRight: isLastInRow?"none":"1px solid var(--border)",
                minHeight:80,
                background: hasTrades?(pnl>=0?"rgba(46,213,115,0.05)":"rgba(255,71,87,0.05)"):"transparent"
              }}>
                <div className="text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1"
                  style={{ color:isToday?"#fff":"var(--text-secondary)", background:isToday?"var(--accent)":"transparent" }}>
                  {day}
                </div>
                {hasTrades && (
                  <div>
                    <div className="text-xs font-bold" style={{ color:pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                      {pnl>=0?"+":""} ${Math.abs(pnl)>=1000?(pnl/1000).toFixed(1)+"k":pnl.toFixed(0)}
                    </div>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {wins>0 && (
                        <span className="text-xs px-1 rounded" style={{ background:"rgba(46,213,115,0.15)", color:"var(--accent-success)" }}>{wins}W</span>
                      )}
                      {losses>0 && (
                        <span className="text-xs px-1 rounded" style={{ background:"rgba(255,71,87,0.15)", color:"var(--accent-danger)" }}>{losses}L</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Table View ───────────────────────────────────────────────────────────────
function TableView({ trades, onEdit, onDelete }) {
  const COLS = ["Symbol","Dir","Entry","Exit","P&L","Pips","Outcome","Session","TF","Quality","Date","Actions"]

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
            {trades.map(t=>(
              <tr key={t.id} className="transition-colors" style={{ borderBottom:"1px solid var(--border)" }}
                onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
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
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={()=>onEdit(t)} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color:"var(--accent)" }}>
                      <Pencil size={13}/>
                    </button>
                    <button onClick={()=>onDelete(t)} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color:"var(--accent-danger)" }}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Journal Page ────────────────────────────────────────────────────────

// ─── CSV/XLS Smart Importer ───────────────────────────────────────────────────
const FIELD_MAP_J = {
  symbol:     ["symbol","pair","instrument","asset","market","ticker","currency pair","item"],
  direction:  ["direction","type","side","action","trade type","order type","buy/sell","b/s"],
  entry_price:["entry price","entry","open price","open","price open","entryprice","entry_price","open rate"],
  exit_price: ["exit price","exit","close price","close","price close","exitprice","exit_price","close rate"],
  pnl:        ["pnl","p&l","profit","profit/loss","net profit","net p&l","gain/loss","profit loss","realized pl","realized p&l","net","result"],
  pips:       ["pips","points","pip","ticks"],
  entry_time: ["open time","open date","date","time","entry time","entry date","trade date","datetime","opened"],
  session:    ["session","market session"],
  timeframe:  ["timeframe","time frame","tf","period"],
  outcome:    ["outcome","result","win/loss","trade result","status","win loss"],
  notes:      ["notes","comment","comments","remark","description","note"],
  quality:    ["quality","rating","score","grade"],
}
function normH(h) { return h.toLowerCase().trim().replace(/[_\-\.]/g," ") }

function safeFloat(val) {
  if (val === undefined || val === null || val === "") return 0
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g,""))
  return isNaN(n) ? 0 : n
}

function safeDate(val) {
  if (!val) return new Date().toISOString()
  const d = new Date(val)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function sanitizeTrade(t) {
  // Guarantee every field the app needs has a safe value
  const pnl = safeFloat(t.pnl)
  let outcome = (t.outcome || "").toUpperCase()
  if (!["WIN","LOSS","BREAKEVEN"].includes(outcome)) {
    outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN"
  }
  let direction = (t.direction || "").toUpperCase()
  if (!["BUY","SELL"].includes(direction)) direction = "BUY"

  return {
    symbol:      (t.symbol || "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
    direction,
    entry_price: safeFloat(t.entry_price),
    exit_price:  safeFloat(t.exit_price),
    pnl,
    pips:        safeFloat(t.pips),
    outcome,
    session:     ["LONDON","NEW_YORK","ASIAN","SYDNEY"].includes((t.session||"").toUpperCase())
                   ? t.session.toUpperCase() : "LONDON",
    timeframe:   ["M1","M5","M15","M30","H1","H4","D1"].includes((t.timeframe||"").toUpperCase())
                   ? t.timeframe.toUpperCase() : "H1",
    entry_time:  safeDate(t.entry_time),
    quality:     Math.min(10, Math.max(1, parseInt(t.quality) || 5)),
    notes:       t.notes || "",
    screenshots: [],
    chart_url:   "",
    playbook_id: "",
  }
}

function mapRow(headers, row) {
  const mapped = {}
  for (const [field, aliases] of Object.entries(FIELD_MAP_J)) {
    for (let hi = 0; hi < headers.length; hi++) {
      if (aliases.some(a => normH(headers[hi]) === a || normH(headers[hi]).includes(a))) {
        mapped[field] = row[hi]?.trim() || ""; break
      }
    }
  }
  return sanitizeTrade(mapped)
}
function parseCSVJ(text) {
  const lines = text.split(/\r?\n/).filter(l=>l.trim())
  if (lines.length < 2) return { trades:[], skipped:0 }
  const delim = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ","
  const parseRow = (line) => {
    const r=[]; let inQ=false, cur=""
    for (let c of line) {
      if (c==='"'){inQ=!inQ} else if(c===delim&&!inQ){r.push(cur);cur=""} else{cur+=c}
    }
    r.push(cur); return r
  }
  const headers = parseRow(lines[0])
  const trades=[]; let skipped=0
  for (let i=1;i<lines.length;i++) {
    if (!lines[i].trim()) continue
    const row = parseRow(lines[i])
    const m   = mapRow(headers, row)
    if (m.symbol === "UNKNOWN" && m.pnl === 0 && m.entry_price === 0) { skipped++; continue }
    trades.push(m)
  }
  return { trades, skipped }
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────
function CSVImportModal({ open, onClose, onImported }) {
  const [file,     setFile]     = useState(null)
  const [preview,  setPreview]  = useState(null)
  const [importing,setImporting]= useState(false)
  const [result,   setResult]   = useState(null)

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f); setResult(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        setPreview(parseCSVJ(ev.target.result))
      } catch(err) {
        console.error("CSV parse error:", err)
        toast.error("Could not read file — make sure it's a valid CSV.")
        setFile(null)
      }
    }
    reader.onerror = () => { toast.error("Failed to read file"); setFile(null) }
    reader.readAsText(f)
    e.target.value = ""
  }

  const doImport = async () => {
    if (!preview?.trades?.length) return
    setImporting(true)
    let imported = 0
    for (const t of preview.trades) {
      try { await Trade.create(t); imported++ } catch {}
    }
    setImporting(false)
    setResult({ imported, skipped: preview.skipped })
    setFile(null); setPreview(null)
    onImported()
    toast.success(imported + " trades imported!")
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h2 className="font-bold" style={{ color:"var(--text-primary)" }}>Import Trades from CSV</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={15}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {["MT4","MT5","cTrader","TradingView","Generic CSV"].map(b=>(
              <span key={b} className="px-2 py-0.5 rounded-lg text-xs" style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>{b}</span>
            ))}
          </div>
          {!file ? (
            <label className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer hover:opacity-80"
              style={{ borderColor:"var(--border)" }}>
              <Upload size={24} style={{ color:"var(--accent)" }}/>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>Drop CSV file or click to browse</p>
                <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>Unrecognized columns are automatically ignored</p>
              </div>
              <input type="file" accept=".csv,.txt,.tsv" onChange={handleFile} className="hidden"/>
            </label>
          ) : preview && (
            <div className="rounded-xl p-4 space-y-3" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} style={{ color:"var(--accent-success)" }}/>
                  <span className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{file.name}</span>
                </div>
                <button onClick={()=>{setFile(null);setPreview(null)}} className="text-xs px-2 py-1 rounded" style={{ color:"var(--text-muted)", background:"var(--bg-card)" }}>✕</button>
              </div>
              <p className="text-sm" style={{ color:"var(--accent-success)" }}>✓ {preview.trades.length} trades ready to import</p>
              {preview.skipped>0 && <p className="text-xs" style={{ color:"var(--accent-warning)" }}>⚠ {preview.skipped} rows skipped</p>}
              {preview.trades.slice(0,3).map((t,i)=>(
                <div key={i} className="flex gap-3 text-xs p-2 rounded-lg" style={{ background:"var(--bg-card)" }}>
                  <span className="font-bold" style={{ color:"var(--text-primary)" }}>{t.symbol}</span>
                  <span style={{ color:t.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>{t.direction}</span>
                  {t.pnl!==undefined && <span style={{ color:t.pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>{t.pnl>=0?"+":""}{t.pnl}</span>}
                  <span style={{ color:t.outcome==="WIN"?"var(--accent-success)":t.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>{t.outcome}</span>
                </div>
              ))}
            </div>
          )}
          {result && (
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background:"rgba(46,213,115,0.1)", border:"1px solid rgba(46,213,115,0.2)" }}>
              <CheckCircle size={14} style={{ color:"var(--accent-success)" }}/>
              <p className="text-sm" style={{ color:"var(--accent-success)" }}>Imported {result.imported} trades{result.skipped>0?` · ${result.skipped} skipped`:""}</p>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Close</button>
          {preview?.trades?.length>0 && (
            <button onClick={doImport} disabled={importing} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
              style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity:importing?0.7:1 }}>
              {importing?"Importing...":"Import "+preview.trades.length+" Trades"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Journal() {
  const [searchParams, setSearchParams] = useSearchParams()
  const viewMode = searchParams.get("view") === "calendar" ? "calendar" : "table"

  const [trades, setTrades]         = useState([])
  const [modalOpen, setModalOpen]   = useState(false)
  const [editTrade, setEditTrade]   = useState(null)
  const [deleteTrade, setDeleteTrade] = useState(null)

  // Filters
  const [filterSymbol,   setFilterSymbol]   = useState("ALL")
  const [filterOutcome,  setFilterOutcome]  = useState("ALL")
  const [filterDirection,setFilterDirection]= useState("ALL")
  const [filterSession,  setFilterSession]  = useState("ALL")

  const loadTrades = async () => {
    const data = await Trade.list()
    const safe = data.map(safeTrade).filter(Boolean)
    setTrades(safe.sort((a,b)=>new Date(b.entry_time)-new Date(a.entry_time)))
  }
  useEffect(() => { loadTrades() }, [])

  // Unique symbols from actual data
  const symbols = ["ALL", ...Array.from(new Set(trades.map(t=>t.symbol))).sort()]

  // Filtered trades
  const filtered = trades.filter(t => {
    if (filterSymbol!=="ALL"    && t.symbol    !== filterSymbol)    return false
    if (filterOutcome!=="ALL"   && t.outcome   !== filterOutcome)   return false
    if (filterDirection!=="ALL" && t.direction !== filterDirection) return false
    if (filterSession!=="ALL"   && t.session   !== filterSession)   return false
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
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>Trade Journal</h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
            {trades.length} trade{trades.length!==1?"s":""} logged &middot; {filtered.length} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border:"1px solid var(--border)" }}>
            <button onClick={()=>setView("table")} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all"
              style={{ background:viewMode==="table"?"var(--accent)":"var(--bg-elevated)", color:viewMode==="table"?"#fff":"var(--text-secondary)" }}>
              <List size={13}/> Table
            </button>
            <button onClick={()=>setView("calendar")} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all"
              style={{ background:viewMode==="calendar"?"var(--accent)":"var(--bg-elevated)", color:viewMode==="calendar"?"#fff":"var(--text-secondary)" }}>
              <CalendarDays size={13}/> Calendar
            </button>
          </div>
          {/* New Trade */}
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
            <Plus size={14}/> New Trade
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl p-4 mb-5 flex flex-wrap gap-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        {/* Symbol filter */}
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Symbol</p>
          <div className="flex flex-wrap gap-1.5">
            {symbols.map(s=>(
              <button key={s} onClick={()=>setFilterSymbol(s)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background:filterSymbol===s?"var(--accent)":"var(--bg-elevated)", color:filterSymbol===s?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:filterSymbol===s?"var(--accent)":"var(--border)" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
        {/* Outcome filter */}
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Outcome</p>
          <div className="flex gap-1.5">
            {["ALL","WIN","LOSS","BREAKEVEN"].map(o=>(
              <button key={o} onClick={()=>setFilterOutcome(o)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background:filterOutcome===o?(o==="WIN"?"rgba(46,213,115,0.25)":o==="LOSS"?"rgba(255,71,87,0.25)":o==="BREAKEVEN"?"rgba(108,99,255,0.25)":"var(--accent)"):"var(--bg-elevated)",
                  color:filterOutcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":o==="BREAKEVEN"?"var(--accent)":"#fff"):"var(--text-secondary)",
                  border:"1px solid", borderColor:filterOutcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":o==="BREAKEVEN"?"var(--accent)":"var(--accent)"):"var(--border)" }}>
                {o}
              </button>
            ))}
          </div>
        </div>
        {/* Direction filter */}
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Direction</p>
          <div className="flex gap-1.5">
            {["ALL","BUY","SELL"].map(d=>(
              <button key={d} onClick={()=>setFilterDirection(d)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background:filterDirection===d?"var(--accent)":"var(--bg-elevated)", color:filterDirection===d?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:filterDirection===d?"var(--accent)":"var(--border)" }}>
                {d}
              </button>
            ))}
          </div>
        </div>
        {/* Session filter */}
        <div>
          <p className="text-xs mb-2 font-medium" style={{ color:"var(--text-muted)" }}>Session</p>
          <div className="flex flex-wrap gap-1.5">
            {["ALL",...SESSIONS].map(s=>(
              <button key={s} onClick={()=>setFilterSession(s)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{ background:filterSession===s?"var(--accent)":"var(--bg-elevated)", color:filterSession===s?"#fff":"var(--text-secondary)", border:"1px solid", borderColor:filterSession===s?"var(--accent)":"var(--border)" }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode==="calendar"
        ? <CalendarView trades={filtered} onNewTrade={openNew}/>
        : <TableView trades={filtered} onEdit={handleEdit} onDelete={setDeleteTrade}/>
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
