// src/pages/Backtesting.jsx  — Visual Upgrade v2
import { useLanguage } from "@/lib/LanguageContext"
import { useState, useEffect } from "react"
import { BacktestSession, Playbook } from "@/api/supabaseStore"
import { toast } from "@/components/ui/toast"
import {
  Plus, ChevronRight, ChevronLeft, Pencil, Trash2, X,
  FlaskConical, TrendingUp, TrendingDown, Trophy, Target,
  BarChart2, BookOpen, Activity, ArrowUpRight
} from "lucide-react"
import { AreaChart, Area, BarChart, Bar, Cell, LineChart, Line,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"

// ─── Session Modal ─────────────────────────────────────────────────────────────
const EMPTY_SESSION = {
  name:"", description:"", playbook_id:"", initial_capital:10000,
  strategy:"", notes:"", trades:[]
}

function SessionModal({ open, onClose, onSaved, editSession }) {
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
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 card">
        <div className="flex items-center justify-between p-6 pb-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h2 className="font-bold" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>
            {isEdit?"Edit Session":"New Backtest Session"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:opacity-70" style={{ color:"var(--text-secondary)" }}><X size={16}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="stat-card-label block mb-1">Session Name *</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder={t("bt_session_ph")}
              className="w-full h-10 rounded-xl px-3 text-sm border"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-display)" }}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="stat-card-label block mb-1">Initial Capital</label>
              <input type="number" value={form.initial_capital} onChange={e=>set("initial_capital",parseFloat(e.target.value)||0)}
                className="w-full h-10 rounded-xl px-3 text-sm border mono"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            </div>
            <div>
              <label className="stat-card-label block mb-1">Playbook</label>
              <select value={form.playbook_id||""} onChange={e=>set("playbook_id",e.target.value)}
                className="w-full h-10 rounded-xl px-3 text-sm border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-display)" }}>
                <option value="">No playbook</option>
                {playbooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="stat-card-label block mb-1">Strategy Summary</label>
            <textarea rows={2} value={form.strategy} onChange={e=>set("strategy",e.target.value)} placeholder={t("bt_strategy_ph")}
              className="w-full rounded-xl px-3 py-2 text-sm border resize-none"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-display)" }}/>
          </div>
          <div>
            <label className="stat-card-label block mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Market conditions, hypothesis, observations…"
              className="w-full rounded-xl px-3 py-2 text-sm border resize-none"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-display)" }}/>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn btn-secondary flex-1">{ t("cancel") }</button>
          <button onClick={save} disabled={saving} className="btn btn-primary flex-1" style={{ opacity:saving?0.7:1 }}>
            {saving?"Saving…":isEdit?"Update":"Create Session"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirm({ label, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative card p-6 w-full max-w-sm z-10">
        <h3 className="font-bold mb-2" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>Delete Session?</h3>
        <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>
          <strong style={{ color:"var(--text-primary)" }}>{label}</strong> and all its trades will be permanently removed.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn btn-secondary flex-1">{ t("cancel") }</button>
          <button onClick={onConfirm} className="btn flex-1 text-white" style={{ background:"var(--accent-danger)" }}>{ t("delete") }</button>
        </div>
      </div>
    </div>
  )
}

// ─── Session Card ─────────────────────────────────────────────────────────────
function SessionCard({ session, onOpen, onEdit, onDelete }) {
  const trades     = session.trades || []
  const wins       = trades.filter(t=>t.outcome==="WIN").length
  const losses     = trades.filter(t=>t.outcome==="LOSS").length
  const netPnl     = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate    = trades.length?(wins/trades.length*100).toFixed(1):0
  const roi        = session.initial_capital>0?((netPnl/session.initial_capital)*100).toFixed(1):0
  const positive   = netPnl >= 0

  // Mini equity curve
  let cum = 0
  const curve = trades.slice(0,20).map((t,i)=>({ i, eq:parseFloat((cum+=t.pnl||0).toFixed(2)) }))

  return (
    <div className="card card-hover cursor-pointer" onClick={()=>onOpen(session)}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background:"rgba(108,99,255,0.12)", border:"1px solid rgba(108,99,255,0.2)" }}>
              <FlaskConical size={18} style={{ color:"var(--accent)" }}/>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold truncate" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>{session.name}</h3>
              {session.strategy && <p className="text-xs truncate" style={{ color:"var(--text-muted)" }}>{session.strategy}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>onEdit(session)} className="p-2 rounded-xl hover:opacity-70" style={{ color:"var(--accent)", background:"rgba(108,99,255,0.1)" }}><Pencil size={13}/></button>
            <button onClick={()=>onDelete(session)} className="p-2 rounded-xl hover:opacity-70" style={{ color:"var(--accent-danger)", background:"rgba(255,71,87,0.1)" }}><Trash2 size={13}/></button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label:"Net P&L",  v:`${positive?"+":""}$${netPnl.toFixed(0)}`, color:positive?"var(--accent-success)":"var(--accent-danger)" },
            { label:"Win Rate", v:`${winRate}%`,                               color:parseFloat(winRate)>=50?"var(--accent-success)":"var(--accent-danger)" },
            { label:"ROI",      v:`${roi}%`,                                   color:parseFloat(roi)>=0?"var(--accent-success)":"var(--accent-danger)" },
            { label:"Trades",   v:trades.length,                               color:"var(--accent)" },
          ].map(s=>(
            <div key={s.label} className="rounded-xl py-2 px-2 text-center" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
              <p className="text-sm font-bold mono" style={{ color:s.color }}>{s.v}</p>
              <p className="stat-card-label" style={{ fontSize:9 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Mini chart */}
        {curve.length>1 && (
          <div className="mb-3">
            <ResponsiveContainer width="100%" height={60}>
              <AreaChart data={curve}>
                <defs><linearGradient id={`g${session.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={positive?"#2ed573":"#ff4757"} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={positive?"#2ed573":"#ff4757"} stopOpacity={0}/>
                </linearGradient></defs>
                <Area type="monotone" dataKey="eq" stroke={positive?"#2ed573":"#ff4757"} strokeWidth={1.5} fill={`url(#g${session.id})`}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="badge badge-success">{wins}W</span>
            <span className="badge badge-danger">{losses}L</span>
            {session.initial_capital>0 && <span className="badge badge-accent mono">${session.initial_capital.toLocaleString()}</span>}
          </div>
          <div className="flex items-center gap-1 text-xs font-semibold" style={{ color:"var(--accent)", fontFamily:"var(--font-display)" }}>
            Open <ChevronRight size={12}/>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Session Detail ───────────────────────────────────────────────────────────
function SessionDetail({ session, onBack, onUpdate }) {
  const [trades,  setTrades]  = useState(session.trades || [])
  const [adding,  setAdding]  = useState(false)
  const [newTrade,setNewTrade]= useState({ symbol:"EURUSD",direction:"BUY",outcome:"WIN",pnl:"",pips:"",session:"LONDON",timeframe:"H1",notes:"" })

  useEffect(()=>setTrades(session.trades||[]),[session])

  const addTrade = async () => {
    if(!newTrade.pnl&&!newTrade.pips){ toast.error("Enter at least P&L or pips"); return }
    const t = { ...newTrade, pnl:parseFloat(newTrade.pnl)||0, pips:parseFloat(newTrade.pips)||0, id:Date.now().toString(), entry_time:new Date().toISOString() }
    const updated = [...trades, t]
    await BacktestSession.update(session.id, { trades:updated })
    setTrades(updated); setAdding(false); onUpdate()
    toast.success("Trade added!")
  }

  const removeTrade = async id => {
    const updated = trades.filter(t=>t.id!==id)
    await BacktestSession.update(session.id, { trades:updated })
    setTrades(updated); onUpdate()
  }

  const wins    = trades.filter(t=>t.outcome==="WIN").length
  const losses  = trades.filter(t=>t.outcome==="LOSS").length
  const netPnl  = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate = trades.length?(wins/trades.length*100).toFixed(1):0
  const roi     = session.initial_capital>0?((netPnl/session.initial_capital)*100).toFixed(1):0
  const positive = netPnl >= 0

  let cum=0
  const curve = trades.map((t,i)=>({ i, eq:parseFloat((cum+=t.pnl||0).toFixed(2)), date:new Date(t.entry_time||Date.now()).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}) }))
  const barData= trades.map((t,i)=>({ i, pnl:t.pnl||0 }))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 rounded-xl hover:opacity-70"
          style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", color:"var(--text-secondary)" }}>
          <ChevronLeft size={16}/>
        </button>
        <div>
          <h1 className="font-black gradient-text" style={{ fontFamily:"var(--font-display)", fontSize:24 }}>{session.name}</h1>
          {session.strategy && <p className="text-sm" style={{ color:"var(--text-muted)" }}>{session.strategy}</p>}
        </div>
      </div>

      {/* Summary cards */}
      <div className="flex flex-wrap gap-3 mb-5">
        {[
          { label:"Net P&L",    v:`${positive?"+":""}$${netPnl.toFixed(2)}`, color:positive?"var(--accent-success)":"var(--accent-danger)", icon:TrendingUp },
          { label:"Win Rate",   v:`${winRate}%`, color:parseFloat(winRate)>=50?"var(--accent-success)":"var(--accent-danger)", icon:Target },
          { label:"ROI",        v:`${roi}%`, color:parseFloat(roi)>=0?"var(--accent-success)":"var(--accent-danger)", icon:BarChart2 },
          { label:"Trades",     v:trades.length, color:"var(--accent)", icon:Activity },
          { label:"Wins",       v:wins, color:"var(--accent-success)", icon:TrendingUp },
          { label:"Losses",     v:losses, color:"var(--accent-danger)", icon:TrendingDown },
        ].map(s=>(
          <div key={s.label} className="stat-card flex-none px-4 py-3">
            <div className="stat-card-icon-row">
              <div className="stat-card-icon" style={{ background:`${s.color}18` }}>
                <s.icon size={14} style={{ color:s.color }}/>
              </div>
            </div>
            <p className="stat-card-value mono" style={{ color:s.color, fontSize:18 }}>{s.v}</p>
            <p className="stat-card-label">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {curve.length>1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="card p-5">
            <h3 className="text-sm font-bold mb-3" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>{ t("bt_equity_curve") }</h3>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={curve}>
                <defs><linearGradient id="eCurve" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={positive?"#2ed573":"#ff4757"} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={positive?"#2ed573":"#ff4757"} stopOpacity={0}/>
                </linearGradient></defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="date" tick={{ fill:"var(--text-muted)", fontSize:9 }} interval="preserveStartEnd"/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:9 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip contentStyle={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:11 }} formatter={v=>[`$${v}`,"Equity"]}/>
                <Area type="monotone" dataKey="eq" stroke={positive?"#2ed573":"#ff4757"} strokeWidth={2} fill="url(#eCurve)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-bold mb-3" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>{ t("bt_trade_pnl") }</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={barData}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3"/>
                <XAxis dataKey="i" tick={{ fill:"var(--text-muted)", fontSize:9 }}/>
                <YAxis tick={{ fill:"var(--text-muted)", fontSize:9 }} tickFormatter={v=>`$${v}`}/>
                <Tooltip contentStyle={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-primary)", fontSize:11 }} formatter={v=>[`$${v}`,"P&L"]}/>
                <Bar dataKey="pnl" radius={[3,3,0,0]}>{barData.map((d,i)=><Cell key={i} fill={d.pnl>=0?"#2ed573":"#ff4757"}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Add trade */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>Trades ({trades.length})</h3>
        <button onClick={()=>setAdding(a=>!a)} className="btn btn-primary"><Plus size={13}/> Add Trade</button>
      </div>

      {adding && (
        <div className="card p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[["symbol","Symbol"],["pnl","P&L ($)"],["pips","Pips"]].map(([k,l])=>(
            <div key={k}>
              <label className="stat-card-label block mb-1">{l}</label>
              <input value={newTrade[k]} onChange={e=>setNewTrade(x=>({...x,[k]:e.target.value}))} placeholder={k==="symbol"?"EURUSD":"0"}
                className="w-full h-9 rounded-xl px-3 text-sm border mono"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            </div>
          ))}
          <div>
            <label className="stat-card-label block mb-1">Outcome</label>
            <div className="flex gap-1.5">
              {["WIN","LOSS","BREAKEVEN"].map(o=>(
                <button key={o} onClick={()=>setNewTrade(x=>({...x,outcome:o}))}
                  className="flex-1 h-9 rounded-xl text-xs font-semibold border transition-all"
                  style={{ background:newTrade.outcome===o?(o==="WIN"?"rgba(46,213,115,0.2)":o==="LOSS"?"rgba(255,71,87,0.2)":"rgba(108,99,255,0.2)"):"var(--bg-elevated)", borderColor:newTrade.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--border)", color:newTrade.outcome===o?(o==="WIN"?"var(--accent-success)":o==="LOSS"?"var(--accent-danger)":"var(--accent)"):"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
                  {o.slice(0,1)}
                </button>
              ))}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-4 flex gap-2">
            <button onClick={addTrade} className="btn btn-primary flex-1">{ t("bt_save_trade") }</button>
            <button onClick={()=>setAdding(false)} className="btn btn-secondary">{ t("cancel") }</button>
          </div>
        </div>
      )}

      {/* Trades table */}
      {trades.length>0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background:"var(--bg-elevated)", borderBottom:"1px solid var(--border)" }}>
                  {["#","Symbol","Direction","Outcome","P&L","Pips","Session","TF",""].map(h=>(
                    <th key={h} className="px-3 py-3 text-left stat-card-label">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t,i)=>(
                  <tr key={t.id||i} style={{ borderBottom:"1px solid var(--border)" }}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <td className="px-3 py-2.5 mono text-xs" style={{ color:"var(--text-muted)" }}>{i+1}</td>
                    <td className="px-3 py-2.5"><span className="symbol-tag">{t.symbol||"—"}</span></td>
                    <td className="px-3 py-2.5"><span className={`dir-badge ${(t.direction||"BUY")==="BUY"?"buy":"sell"}`}>{(t.direction||"BUY")==="BUY"?"▲ BUY":"▼ SELL"}</span></td>
                    <td className="px-3 py-2.5">
                      <span className="badge" style={{ background:t.outcome==="WIN"?"rgba(46,213,115,0.12)":t.outcome==="LOSS"?"rgba(255,71,87,0.12)":"rgba(108,99,255,0.12)", color:t.outcome==="WIN"?"var(--accent-success)":t.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>{t.outcome}</span>
                    </td>
                    <td className="px-3 py-2.5 font-semibold mono text-xs" style={{ color:(t.pnl||0)>=0?"var(--accent-success)":"var(--accent-danger)" }}>{(t.pnl||0)>=0?"+":""}${parseFloat(t.pnl||0).toFixed(2)}</td>
                    <td className="px-3 py-2.5 mono text-xs" style={{ color:"var(--text-secondary)" }}>{t.pips||"—"}</td>
                    <td className="px-3 py-2.5 mono text-xs" style={{ color:"var(--text-secondary)" }}>{t.session||"—"}</td>
                    <td className="px-3 py-2.5 mono text-xs" style={{ color:"var(--text-secondary)" }}>{t.timeframe||"—"}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={()=>removeTrade(t.id||i.toString())} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--accent-danger)", background:"rgba(255,71,87,0.1)" }}><Trash2 size={12}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card py-12 text-center">
          <p className="text-sm" style={{ color:"var(--text-muted)" }}>No trades yet — click t("bt_add_trade") to start logging backtest results.</p>
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
  const handleDelete= async () => {
    if(!deleteTarget) return
    await BacktestSession.delete(deleteTarget.id)
    toast.success("Session deleted")
    setDeleteTarget(null)
    if(activeSession?.id===deleteTarget.id) setActiveSession(null)
    load()
  }

  const filteredSessions = playbookFilter==="ALL" ? sessions : sessions.filter(s=>s.playbook_id===playbookFilter)

  // Summary stats
  const totalTrades= sessions.reduce((s,sess)=>s+(sess.trades||[]).length,0)
  const totalPnl   = sessions.reduce((s,sess)=>s+(sess.trades||[]).reduce((a,t)=>a+(t.pnl||0),0),0)
  const bestSession= sessions.reduce((best,sess)=>{ const p=(sess.trades||[]).reduce((s,t)=>s+(t.pnl||0),0); return p>(best?(best.trades||[]).reduce((s,t)=>s+(t.pnl||0),0):-Infinity)?sess:best },null)

  if(activeSession) {
    const latest = sessions.find(s=>s.id===activeSession.id)||activeSession
    return <SessionDetail session={latest} onBack={()=>setActiveSession(null)} onUpdate={load}/>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="gradient-text font-black" style={{ fontFamily:"var(--font-display)", fontSize:28 }}>{ t("bt_title") }</h1>
          <p className="mono text-xs mt-1" style={{ color:"var(--text-muted)" }}>
            {sessions.length} session{sessions.length!==1?"s":""} · {totalTrades} trades logged
          </p>
        </div>
        <button onClick={openNew} className="btn btn-primary self-start">
          <Plus size={14}/> New Session
        </button>
      </div>

      {/* Summary stat cards */}
      {sessions.length>0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {[
            { label:"Sessions",    v:sessions.length,                    color:"var(--accent)",            icon:FlaskConical },
            { label:"Combined P&L",v:`${totalPnl>=0?"+":""}$${totalPnl.toFixed(0)}`, color:totalPnl>=0?"var(--accent-success)":"var(--accent-danger)", icon:totalPnl>=0?TrendingUp:TrendingDown },
            { label:"Best Session",v:bestSession?.name||"—",             color:"#ffd700",                  icon:Trophy },
          ].map(s=>(
            <div key={s.label} className="stat-card flex items-center gap-3">
              <div className="stat-card-icon" style={{ background:`${s.color}18` }}>
                <s.icon size={18} style={{ color:s.color }}/>
              </div>
              <div className="min-w-0">
                <p className="stat-card-value mono truncate" style={{ color:s.color, fontSize:18 }}>{s.v}</p>
                <p className="stat-card-label">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Playbook filter */}
      {playbooks.length>0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {[{id:"ALL",name:"All Sessions"}, ...playbooks].map(pb=>(
            <button key={pb.id} onClick={()=>setPlaybookFilter(pb.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
              style={{ background:playbookFilter===pb.id?"var(--accent)":"var(--bg-elevated)", borderColor:playbookFilter===pb.id?"var(--accent)":"var(--border)", color:playbookFilter===pb.id?"#fff":"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
              <BookOpen size={10}/>{pb.name}
            </button>
          ))}
        </div>
      )}

      {/* Session grid */}
      {filteredSessions.length===0 ? (
        <div className="card py-20 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background:"rgba(108,99,255,0.1)" }}>
            <FlaskConical size={26} style={{ color:"var(--accent)" }}/>
          </div>
          <p className="font-bold text-base mb-1" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>
            {sessions.length===0?"No backtest sessions yet":"No sessions match this filter"}
          </p>
          <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>
            {sessions.length===0?"Create a session to start testing your strategies on historical data.":"Try selecting a different playbook filter."}
          </p>
          {sessions.length===0 && <button onClick={openNew} className="btn btn-primary"><Plus size={14}/> Create First Session</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map(s=>(
            <SessionCard key={s.id} session={s} onOpen={sess=>{setActiveSession(sess);load()}}
              onEdit={handleEdit} onDelete={setDeleteTarget}/>
          ))}
        </div>
      )}

      <SessionModal open={modalOpen} onClose={()=>{setModalOpen(false);setEditSession(null)}} onSaved={load} editSession={editSession}/>
      {deleteTarget && <DeleteConfirm label={deleteTarget.name} onCancel={()=>setDeleteTarget(null)} onConfirm={handleDelete}/>}
    </div>
  )
}
