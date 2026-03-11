import { useState, useEffect } from "react"
import { BacktestSession, Playbook } from "@/api/supabaseStore"
import { toast } from "@/components/ui/toast"
import {
  Plus, Play, Trash2, X, ChevronDown, ChevronUp,
  FlaskConical, TrendingUp, TrendingDown, Target,
  BarChart3, Clock, CheckCircle, XCircle, Circle,
  Pencil, RefreshCw, Trophy, BookOpen, ChevronRight
} from "lucide-react"
import {
  LineChart, Line, BarChart, Bar, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts"

// ─── Constants ────────────────────────────────────────────────────────────────
const SYMBOLS   = ["EURUSD","GBPUSD","USDJPY","XAUUSD","AUDUSD","GBPJPY","USDCAD","NZDUSD","US30","NAS100","SPX500"]
const SESSIONS  = ["LONDON","NEW_YORK","ASIAN","SYDNEY","ALL"]
const TIMEFRAMES= ["M1","M5","M15","M30","H1","H4","D1"]
const OUTCOMES  = ["WIN","LOSS","BREAKEVEN"]

const CHART_TIP = {
  contentStyle: { background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:11 }
}

// ─── Empty session form ───────────────────────────────────────────────────────
const EMPTY_SESSION = {
  name: "", symbol: "EURUSD", timeframe: "H1", session: "LONDON",
  description: "", start_date: "", end_date: "", initial_balance: "10000",
  playbook_id: "",
}

// ─── Empty trade row ──────────────────────────────────────────────────────────
const EMPTY_TRADE = {
  direction: "BUY", entry: "", exit: "", pnl: "", pips: "", outcome: "WIN", notes: ""
}

// ─── Session Form Modal ───────────────────────────────────────────────────────
function SessionModal({ open, onClose, onSaved, editSession }) {
  const [form,      setForm]      = useState(EMPTY_SESSION)
  const [saving,    setSaving]    = useState(false)
  const [playbooks, setPlaybooks] = useState([])
  const isEdit = !!editSession

  useEffect(() => {
    setForm(editSession ? { ...EMPTY_SESSION, ...editSession } : EMPTY_SESSION)
    Playbook.list().then(data => setPlaybooks((data||[]).filter(p=>p.status==="active")))
  }, [editSession, open])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { toast.error("Session name is required"); return }
    setSaving(true)
    try {
      const linked = playbooks.find(p=>p.id===form.playbook_id)
      const payload = {
        ...form,
        initial_balance: parseFloat(form.initial_balance) || 10000,
        trades: editSession?.trades || [],
        status: editSession?.status || "active",
        playbook_id: form.playbook_id || null,
        playbook_name: linked?.name || null,
      }
      if (isEdit) { await BacktestSession.update(editSession.id, payload); toast.success("Session updated!") }
      else        { await BacktestSession.create(payload);                 toast.success("Session created!") }
      onSaved(); onClose()
    } catch { toast.error("Failed to save") }
    setSaving(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-lg rounded-2xl shadow-2xl z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h2 className="text-lg font-bold" style={{ color:"var(--text-primary)" }}>{isEdit ? "Edit Session" : "New Backtest Session"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={16}/></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Session Name *</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. London Breakout H1 Test"
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Symbol</label>
            <select value={form.symbol} onChange={e=>set("symbol",e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {SYMBOLS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Timeframe</label>
            <select value={form.timeframe} onChange={e=>set("timeframe",e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {TIMEFRAMES.map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Session</label>
            <select value={form.session} onChange={e=>set("session",e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {SESSIONS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Initial Balance ($)</label>
            <input type="number" value={form.initial_balance} onChange={e=>set("initial_balance",e.target.value)} placeholder="10000"
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Start Date</label>
            <input type="date" value={form.start_date} onChange={e=>set("start_date",e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>End Date</label>
            <input type="date" value={form.end_date} onChange={e=>set("end_date",e.target.value)}
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          <div className="col-span-2">
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Link to Playbook Strategy (optional)</label>
            <select value={form.playbook_id} onChange={e=>{
              const pb = playbooks.find(p=>p.id===e.target.value)
              set("playbook_id", e.target.value)
              if (pb && !form.name) set("name", `Backtest — ${pb.name}`)
              if (pb && pb.pairs?.[0] && !form.symbol) set("symbol", pb.pairs[0])
              if (pb && pb.timeframes?.[0]) set("timeframe", pb.timeframes[0])
              if (pb && pb.sessions?.[0]) set("session", pb.sessions[0])
              if (pb && !form.description) set("description", pb.description || "")
            }} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              <option value="">— No strategy linked —</option>
              {playbooks.map(p=><option key={p.id} value={p.id}>{p.name} [{p.category}]</option>)}
            </select>
            {form.playbook_id && (() => {
              const pb = playbooks.find(p=>p.id===form.playbook_id)
              if (!pb) return null
              return (
                <div className="mt-2 p-2.5 rounded-lg text-xs" style={{ background:"rgba(108,99,255,0.08)", border:"1px solid rgba(108,99,255,0.2)", color:"var(--text-muted)" }}>
                  <p className="font-semibold mb-1" style={{ color:"var(--accent)" }}>{pb.name}</p>
                  <p>{pb.description || "No description"}</p>
                  {pb.entry_rules?.length > 0 && <p className="mt-1"><span style={{ color:"var(--text-primary)" }}>Entry rules:</span> {pb.entry_rules.join(" · ")}</p>}
                </div>
              )
            })()}
          </div>
          <div className="col-span-2">
            <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Description / Hypothesis</label>
            <textarea rows={2} value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Strategy being tested, conditions, hypothesis..."
              className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)", opacity:saving?0.7:1 }}>
            {saving ? "Saving..." : isEdit ? "Update" : "Create Session"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ label, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative rounded-2xl p-6 w-full max-w-sm z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <h3 className="font-bold mb-2" style={{ color:"var(--text-primary)" }}>Delete?</h3>
        <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>
          <strong style={{ color:"var(--text-primary)" }}>{label}</strong> will be permanently removed.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white" style={{ background:"var(--accent-danger)" }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Session Detail (trade logger + stats) ────────────────────────────────────
function SessionDetail({ session, onBack, onUpdate }) {
  const [trades, setTrades] = useState(session.trades || [])
  const [form,   setForm]   = useState(EMPTY_TRADE)
  const [saving, setSaving] = useState(false)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addTrade = async () => {
    if (!form.entry) { toast.error("Entry price required"); return }
    setSaving(true)
    const t = {
      ...form,
      id:     Date.now().toString(),
      entry:  parseFloat(form.entry)  || 0,
      exit:   parseFloat(form.exit)   || 0,
      pnl:    parseFloat(form.pnl)    || 0,
      pips:   parseFloat(form.pips)   || 0,
      date:   new Date().toISOString(),
    }
    const updated = [...trades, t]
    setTrades(updated)
    await BacktestSession.update(session.id, { ...session, trades: updated })
    setForm(EMPTY_TRADE)
    onUpdate()
    setSaving(false)
    toast.success("Trade added!")
  }

  const removeTrade = async (id) => {
    const updated = trades.filter(t => t.id !== id)
    setTrades(updated)
    await BacktestSession.update(session.id, { ...session, trades: updated })
    onUpdate()
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const wins    = trades.filter(t => t.outcome === "WIN")
  const losses  = trades.filter(t => t.outcome === "LOSS")
  const netPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = trades.length ? (wins.length / trades.length * 100).toFixed(1) : "0.0"
  const avgWin  = wins.length   ? wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length) : 0
  const pf      = avgLoss > 0   ? (avgWin / avgLoss).toFixed(2) : avgWin > 0 ? "∞" : "0.00"
  const finalBal= (session.initial_balance || 10000) + netPnl
  const roi     = session.initial_balance ? (netPnl / session.initial_balance * 100).toFixed(2) : "0.00"

  // Equity curve
  let cum = session.initial_balance || 10000
  const equityCurve = trades.map((t, i) => {
    cum += t.pnl || 0
    return { n: i + 1, equity: parseFloat(cum.toFixed(2)) }
  })

  // P&L bars
  const pnlBars = trades.map((t, i) => ({ n: i + 1, pnl: t.pnl || 0 }))

  return (
    <div>
      {/* Back + title */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border hover:opacity-70 transition-opacity"
          style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>
          ← Back
        </button>
        <div>
          <h2 className="text-xl font-bold" style={{ color:"var(--text-primary)" }}>{session.name}</h2>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>{session.symbol} · {session.timeframe} · {session.session}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label:"Net P&L",      value:`${netPnl>=0?"+":""}$${netPnl.toFixed(2)}`,    color:netPnl>=0?"var(--accent-success)":"var(--accent-danger)" },
          { label:"Win Rate",     value:`${winRate}%`,                                  color:parseFloat(winRate)>=50?"var(--accent-success)":"var(--accent-danger)" },
          { label:"Profit Factor",value:pf,                                             color:"var(--accent)" },
          { label:"ROI",          value:`${roi}%`,                                      color:parseFloat(roi)>=0?"var(--accent-success)":"var(--accent-danger)" },
          { label:"Trades",       value:trades.length,                                  color:"var(--text-primary)" },
          { label:"Final Balance",value:`$${finalBal.toFixed(2)}`,                     color:"var(--accent-secondary)" },
          { label:"Avg Win",      value:`$${avgWin.toFixed(2)}`,                       color:"var(--accent-success)" },
          { label:"Avg Loss",     value:`$${avgLoss.toFixed(2)}`,                      color:"var(--accent-danger)" },
        ].map(s=>(
          <div key={s.label} className="rounded-xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color:"var(--text-muted)" }}>{s.label}</p>
            <p className="text-lg font-bold" style={{ color:s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {trades.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color:"var(--text-primary)" }}>Equity Curve</h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={equityCurve}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="n" tick={{ fill:"var(--text-muted)", fontSize:10 }} label={{ value:"Trade #", position:"insideBottom", offset:-2, fill:"var(--text-muted)", fontSize:10 }}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...CHART_TIP} formatter={v=>[`$${v}`,"Balance"]}/>
                <Line type="monotone" dataKey="equity" stroke="#6c63ff" strokeWidth={2} dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color:"var(--text-primary)" }}>P&L per Trade</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={pnlBars}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="n" tick={{ fill:"var(--text-muted)", fontSize:10 }}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:10 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip {...CHART_TIP} formatter={v=>[`$${v}`,"P&L"]}/>
                <Bar dataKey="pnl" radius={[3,3,0,0]}>
                  {pnlBars.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Add trade form */}
        <div className="lg:col-span-2 rounded-xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <h3 className="font-semibold text-sm mb-4" style={{ color:"var(--text-primary)" }}>Log Backtest Trade</h3>
          <div className="space-y-3">
            {/* Direction */}
            <div>
              <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Direction</label>
              <div className="flex gap-2">
                {["BUY","SELL"].map(d=>(
                  <button key={d} onClick={()=>setF("direction",d)} className="flex-1 h-9 rounded-lg text-sm font-medium border transition-all"
                    style={{ background:form.direction===d?(d==="BUY"?"rgba(46,213,115,0.2)":"rgba(255,71,87,0.2)"):"var(--bg-elevated)",
                      borderColor:form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--border)",
                      color:form.direction===d?(d==="BUY"?"var(--accent-success)":"var(--accent-danger)"):"var(--text-secondary)" }}>
                    {d==="BUY"?"▲":"▼"} {d}
                  </button>
                ))}
              </div>
            </div>
            {/* Entry / Exit */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Entry</label>
                <input type="number" step="any" value={form.entry} onChange={e=>setF("entry",e.target.value)} placeholder="1.0845"
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Exit</label>
                <input type="number" step="any" value={form.exit} onChange={e=>setF("exit",e.target.value)} placeholder="1.0883"
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
            </div>
            {/* P&L / Pips */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>P&L ($)</label>
                <input type="number" step="any" value={form.pnl} onChange={e=>setF("pnl",e.target.value)} placeholder="38.00"
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Pips</label>
                <input type="number" step="any" value={form.pips} onChange={e=>setF("pips",e.target.value)} placeholder="38"
                  className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
              </div>
            </div>
            {/* Outcome */}
            <div>
              <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Outcome</label>
              <div className="flex gap-1.5">
                {OUTCOMES.map(o=>(
                  <button key={o} onClick={()=>setF("outcome",o)} className="flex-1 h-9 rounded-lg text-xs font-semibold border transition-all"
                    style={{ background:form.outcome===o?(o==="WIN"?"rgba(46,213,115,0.2)":o==="LOSS"?"rgba(255,71,87,0.2)":"rgba(108,99,255,0.2)"):"var(--bg-elevated)",
                      borderColor:form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--border)",
                      color:form.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--text-secondary)" }}>
                    {o==="BREAKEVEN"?"BE":o}
                  </button>
                ))}
              </div>
            </div>
            {/* Notes */}
            <div>
              <label className="text-xs mb-1 block" style={{ color:"var(--text-muted)" }}>Notes</label>
              <input value={form.notes} onChange={e=>setF("notes",e.target.value)} placeholder="Setup, confluences..."
                className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            </div>
            <button onClick={addTrade} disabled={saving} className="w-full h-9 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)", opacity:saving?0.7:1 }}>
              <Plus size={14}/> Add Trade
            </button>
          </div>
        </div>

        {/* Trade log table */}
        <div className="lg:col-span-3 rounded-xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
          <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
            <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>
              Trade Log <span className="font-normal text-xs ml-1" style={{ color:"var(--text-muted)" }}>({trades.length} trades)</span>
            </h3>
          </div>
          {trades.length === 0 ? (
            <div className="py-12 text-center">
              <FlaskConical size={28} className="mx-auto mb-2" style={{ color:"var(--text-muted)" }}/>
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>No trades yet. Log your first backtest trade.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
                    {["#","Dir","Entry","Exit","P&L","Pips","Outcome","Notes",""].map(h=>(
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold" style={{ color:"var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={t.id} style={{ borderBottom:"1px solid var(--border)" }}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td className="px-3 py-2.5 text-xs" style={{ color:"var(--text-muted)" }}>{i+1}</td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ background:t.direction==="BUY"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)", color:t.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>
                          {t.direction==="BUY"?"▲":"▼"} {t.direction}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono" style={{ color:"var(--text-secondary)" }}>{t.entry||"—"}</td>
                      <td className="px-3 py-2.5 text-xs font-mono" style={{ color:"var(--text-secondary)" }}>{t.exit||"—"}</td>
                      <td className="px-3 py-2.5 font-bold text-xs" style={{ color:(t.pnl||0)>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                        {t.pnl>=0?"+":""}${parseFloat(t.pnl||0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-xs" style={{ color:"var(--text-secondary)" }}>{t.pips||"—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background:t.outcome==="WIN"?"rgba(46,213,115,0.15)":t.outcome==="LOSS"?"rgba(255,71,87,0.15)":"rgba(108,99,255,0.15)",
                            color:t.outcome==="WIN"?"var(--accent-success)":t.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>
                          {t.outcome}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs max-w-[120px] truncate" style={{ color:"var(--text-muted)" }}>{t.notes||"—"}</td>
                      <td className="px-3 py-2.5">
                        <button onClick={()=>removeTrade(t.id)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--accent-danger)" }}>
                          <Trash2 size={12}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, onOpen, onEdit, onDelete }) {
  const trades  = session.trades || []
  const wins    = trades.filter(t => t.outcome === "WIN")
  const netPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = trades.length ? (wins.length / trades.length * 100).toFixed(1) : "0.0"
  const roi     = session.initial_balance ? (netPnl / session.initial_balance * 100).toFixed(1) : "0.0"
  const positive= netPnl >= 0

  return (
    <div className="rounded-xl p-5 card-hover cursor-pointer" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }} onClick={()=>onOpen(session)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: positive ? "rgba(46,213,115,0.12)" : "rgba(255,71,87,0.12)" }}>
            <FlaskConical size={18} style={{ color: positive ? "var(--accent-success)" : "var(--accent-danger)" }}/>
          </div>
          <div className="min-w-0">
            <h3 className="font-bold truncate" style={{ color:"var(--text-primary)" }}>{session.name}</h3>
            <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>
              {session.symbol} · {session.timeframe} · {session.session}
              {session.start_date && ` · ${session.start_date}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e=>e.stopPropagation()}>
          <button onClick={()=>onEdit(session)} className="p-2 rounded-lg hover:opacity-70" style={{ color:"var(--accent)" }}><Pencil size={13}/></button>
          <button onClick={()=>onDelete(session)} className="p-2 rounded-lg hover:opacity-70" style={{ color:"var(--accent-danger)" }}><Trash2 size={13}/></button>
        </div>
      </div>

      {session.description && (
        <p className="text-xs mb-3 leading-relaxed" style={{ color:"var(--text-secondary)" }}>{session.description}</p>
      )}

      <div className="grid grid-cols-4 gap-2">
        {[
          { label:"Trades",   value:trades.length,                       color:"var(--text-primary)" },
          { label:"Net P&L",  value:`${netPnl>=0?"+":""}$${netPnl.toFixed(0)}`, color:positive?"var(--accent-success)":"var(--accent-danger)" },
          { label:"Win Rate", value:`${winRate}%`,                       color:parseFloat(winRate)>=50?"var(--accent-success)":"var(--accent-danger)" },
          { label:"ROI",      value:`${roi}%`,                           color:parseFloat(roi)>=0?"var(--accent-success)":"var(--accent-danger)" },
        ].map(s=>(
          <div key={s.label} className="text-center rounded-lg py-2" style={{ background:"var(--bg-elevated)" }}>
            <p className="text-xs font-bold" style={{ color:s.color }}>{s.value}</p>
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end mt-3 gap-1 text-xs" style={{ color:"var(--accent)" }}>
        Open session <ChevronRight size={12}/>
      </div>
    </div>
  )
}

// ─── Main Backtesting Page ────────────────────────────────────────────────────
export default function Backtesting() {
  const [sessions,    setSessions]    = useState([])
  const [playbooks,   setPlaybooks]   = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [modalOpen,   setModalOpen]   = useState(false)
  const [editSession, setEditSession] = useState(null)
  const [deleteTarget,setDeleteTarget]= useState(null)
  const [playbookFilter, setPlaybookFilter] = useState("ALL")

  const load = async () => {
    const [data, pbs] = await Promise.all([BacktestSession.list(), Playbook.list()])
    setSessions(data.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)))
    setPlaybooks((pbs||[]).filter(p=>p.status==="active"))
  }
  useEffect(()=>{ load() }, [])

  const openNew  = () => { setEditSession(null); setModalOpen(true) }
  const handleEdit = (s) => { setEditSession(s); setModalOpen(true) }
  const handleDelete = async () => {
    if (!deleteTarget) return
    await BacktestSession.delete(deleteTarget.id)
    toast.success("Session deleted")
    setDeleteTarget(null)
    if (activeSession?.id === deleteTarget.id) setActiveSession(null)
    load()
  }

  const filteredSessions = playbookFilter === "ALL" ? sessions : sessions.filter(s=>s.playbook_id===playbookFilter)

  // Summary stats
  const totalTrades= filteredSessions.reduce((s,sess)=>s+(sess.trades||[]).length, 0)
  const totalPnl   = sessions.reduce((s,sess)=>{
    return s + (sess.trades||[]).reduce((a,t)=>a+(t.pnl||0),0)
  }, 0)
  const bestSession= sessions.reduce((best, sess)=>{
    const pnl = (sess.trades||[]).reduce((s,t)=>s+(t.pnl||0),0)
    return pnl > (best ? (best.trades||[]).reduce((s,t)=>s+(t.pnl||0),0) : -Infinity) ? sess : best
  }, null)

  // If viewing a session detail
  if (activeSession) {
    const latest = sessions.find(s => s.id === activeSession.id) || activeSession
    return (
      <SessionDetail
        session={latest}
        onBack={()=>setActiveSession(null)}
        onUpdate={load}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>Backtesting</h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
            {sessions.length} session{sessions.length!==1?"s":""} · {totalTrades} trades logged
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {playbooks.slice(0,3).map(pb=>(
            <button key={pb.id} onClick={()=>{ setEditSession({ playbook_id:pb.id, playbook_name:pb.name, name:`Backtest — ${pb.name}`, symbol:pb.pairs?.[0]||"EURUSD", timeframe:pb.timeframes?.[0]||"H1", session:pb.sessions?.[0]||"LONDON", description:pb.description||"", initial_balance:"10000", start_date:"", end_date:"" }); setModalOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap"
              style={{ background:"rgba(108,99,255,0.08)", borderColor:"rgba(108,99,255,0.2)", color:"var(--accent)" }}>
              <BookOpen size={11}/> Test: {pb.name.length>18?pb.name.slice(0,18)+"…":pb.name}
            </button>
          ))}
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
            <Plus size={14}/> New Session
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {sessions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:"rgba(108,99,255,0.15)" }}>
              <FlaskConical size={18} style={{ color:"var(--accent)" }}/>
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color:"var(--accent)" }}>{sessions.length}</p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Total Sessions</p>
            </div>
          </div>
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:totalPnl>=0?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)" }}>
              {totalPnl>=0 ? <TrendingUp size={18} style={{ color:"var(--accent-success)" }}/> : <TrendingDown size={18} style={{ color:"var(--accent-danger)" }}/>}
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color:totalPnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>
                {totalPnl>=0?"+":""}${totalPnl.toFixed(0)}
              </p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Combined P&L</p>
            </div>
          </div>
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background:"rgba(255,215,0,0.15)" }}>
              <Trophy size={18} style={{ color:"#ffd700" }}/>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color:"#ffd700" }}>{bestSession?.name || "—"}</p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Best Session</p>
            </div>
          </div>
        </div>
      )}

      {/* Sessions grid */}
      {/* Playbook filter tabs */}
      {playbooks.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button onClick={()=>setPlaybookFilter("ALL")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border"
            style={{ background:playbookFilter==="ALL"?"var(--accent)":"var(--bg-elevated)", color:playbookFilter==="ALL"?"#fff":"var(--text-secondary)", borderColor:playbookFilter==="ALL"?"var(--accent)":"var(--border)" }}>
            All Strategies
          </button>
          {playbooks.map(pb=>(
            <button key={pb.id} onClick={()=>setPlaybookFilter(pb.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border"
              style={{ background:playbookFilter===pb.id?"var(--accent)":"var(--bg-elevated)", color:playbookFilter===pb.id?"#fff":"var(--text-secondary)", borderColor:playbookFilter===pb.id?"var(--accent)":"var(--border)" }}>
              <BookOpen size={10}/>{pb.name}
            </button>
          ))}
        </div>
      )}

      {filteredSessions.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={{ background:"var(--bg-card)", border:"1px dashed var(--border)" }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background:"rgba(108,99,255,0.1)" }}>
            <FlaskConical size={26} style={{ color:"var(--accent)" }}/>
          </div>
          <p className="font-bold text-base mb-1" style={{ color:"var(--text-primary)" }}>No backtest sessions yet</p>
          <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>Create a session to start testing your strategies on historical data.</p>
          <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
            <Plus size={14}/> Create First Session
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map(s=>(
            <SessionCard key={s.id} session={s} onOpen={sess=>{ setActiveSession(sess); load() }}
              onEdit={handleEdit} onDelete={setDeleteTarget}/>
          ))}
        </div>
      )}

      {/* Modals */}
      <SessionModal open={modalOpen} onClose={()=>{setModalOpen(false);setEditSession(null)}} onSaved={load} editSession={editSession}/>
      {deleteTarget && <DeleteConfirm label={deleteTarget.name} onCancel={()=>setDeleteTarget(null)} onConfirm={handleDelete}/>}
    </div>
  )
}
