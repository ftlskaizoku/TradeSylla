import { useState, useEffect, useRef } from "react"
import { Trade, Playbook, BacktestSession, SylledgeInsight } from "@/api/supabaseStore"
import { supabase } from "@/lib/supabase"
import { useUser } from "@/lib/UserContext"
import { toast } from "@/components/ui/toast"
import {
  Brain, Sparkles, Send, RefreshCw, TrendingUp, TrendingDown,
  Target, BarChart3, Shield, Zap, Clock, X,
  AlertTriangle, CheckCircle, Lightbulb, MessageSquare, Activity,
  LineChart, BookOpen, FlaskConical
} from "lucide-react"

// ─── Memory key ───────────────────────────────────────────────────────────────
const MEMORY_KEY = (uid) => `sylledge_memory_${uid}`
const MAX_MEMORY  = 40  // max messages kept in memory

// ─── Context builders ─────────────────────────────────────────────────────────
function buildTradeSummary(trades) {
  if (!trades.length) return "No trades logged yet."
  const wins    = trades.filter(t => t.outcome === "WIN")
  const losses  = trades.filter(t => t.outcome === "LOSS")
  const netPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = (wins.length / trades.length * 100).toFixed(1)
  const avgWin  = wins.length   ? wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length   : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length) : 0
  const pf      = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : "N/A"

  const bySess = {}
  trades.forEach(t => {
    const s = t.session || "UNKNOWN"
    if (!bySess[s]) bySess[s] = { pnl:0, n:0, wins:0 }
    bySess[s].pnl += t.pnl||0; bySess[s].n++
    if (t.outcome==="WIN") bySess[s].wins++
  })
  const bySym = {}
  trades.forEach(t => {
    const s = t.symbol || "UNKNOWN"
    if (!bySym[s]) bySym[s] = { pnl:0, n:0 }
    bySym[s].pnl += t.pnl||0; bySym[s].n++
  })

  const recentTrades = [...trades]
    .sort((a,b)=>new Date(b.entry_time)-new Date(a.entry_time))
    .slice(0, 15)
    .map(t => `  ${t.direction} ${t.symbol} | ${t.outcome} | P&L:$${(t.pnl||0).toFixed(2)} | Entry:${t.entry_price||"?"} Exit:${t.exit_price||"?"} | SL:${t.sl||"?"} TP:${t.tp||"?"} | R:R:${t.rr||"?"} | SLpips:${t.sl_pips||"?"} TPpips:${t.tp_pips||"?"} | Session:${t.session||"?"} | TF:${t.timeframe||"?"} | Quality:${t.quality||"?"}/10 | Duration:${t.duration_min||"?"}min | Notes:${t.notes||"none"}`)
    .join("\n")

  const sessionSummary = Object.entries(bySess)
    .sort((a,b)=>b[1].pnl-a[1].pnl)
    .map(([s,d])=>`${s}: ${d.n} trades | $${d.pnl.toFixed(2)} P&L | ${(d.wins/d.n*100).toFixed(0)}% WR`)
    .join(" | ")

  const symbolSummary = Object.entries(bySym)
    .sort((a,b)=>b[1].pnl-a[1].pnl)
    .slice(0,6)
    .map(([s,d])=>`${s}: ${d.n} trades | $${d.pnl.toFixed(2)}`)
    .join(" | ")

  return `=== TRADE JOURNAL (${trades.length} total trades) ===
Net P&L: $${netPnl.toFixed(2)} | Win Rate: ${winRate}% | W:${wins.length} L:${losses.length}
Avg Win: $${avgWin.toFixed(2)} | Avg Loss: $${avgLoss.toFixed(2)} | Profit Factor: ${pf}
Sessions: ${sessionSummary}
Symbols: ${symbolSummary}
Last 15 trades:
${recentTrades}`
}

function buildPlaybookContext(playbooks) {
  if (!playbooks.length) return ""
  const lines = playbooks.map(p => {
    const entry = (p.entry_rules||[]).filter(Boolean).join("; ")
    const exit  = (p.exit_rules||[]).filter(Boolean).join("; ")
    const risk  = (p.risk_rules||[]).filter(Boolean).join("; ")
    return `  • ${p.name} [${p.status||"active"}] | Category: ${p.category||"?"} | Pairs: ${p.custom_pairs||"any"}
    Entry: ${entry||"not defined"} | Exit: ${exit||"not defined"} | Risk: ${risk||"not defined"}
    Stats: WR:${p.win_rate||"?"}% | PF:${p.profit_factor||"?"} | Avg R:R:${p.avg_rr||"?"}`
  }).join("\n")
  return `\n=== PLAYBOOK STRATEGIES (${playbooks.length}) ===\n${lines}`
}

function buildBacktestContext(sessions) {
  if (!sessions.length) return ""
  const lines = sessions.slice(0,5).map(s => {
    const trades = s.trades || []
    const wins   = trades.filter(t=>t.outcome==="WIN").length
    const pnl    = trades.reduce((a,t)=>a+(t.pnl||0),0)
    return `  • "${s.name}" | ${s.symbol} ${s.timeframe} ${s.session} | ${trades.length} trades | $${pnl.toFixed(2)} P&L | ${trades.length?((wins/trades.length)*100).toFixed(0):0}% WR`
  }).join("\n")
  return `\n=== BACKTESTING RESULTS (${sessions.length} sessions) ===\n${lines}`
}

function buildBridgeContext(bridgeCtx) {
  if (!bridgeCtx) return ""
  let ctx = ""
  if (bridgeCtx.account) {
    ctx += `\n=== LIVE MT5 ACCOUNT ===\nBalance: $${bridgeCtx.account.balance} | Equity: $${bridgeCtx.account.equity} | Leverage: 1:${bridgeCtx.account.leverage}`
  }
  if (bridgeCtx.positions?.length) {
    ctx += `\nOpen positions: ${bridgeCtx.positions.map(p=>`${p.direction} ${p.symbol} | ${p.volume}L | Entry:${p.entry_price} | P&L:${p.profit>=0?"+":""}$${p.profit?.toFixed(2)}`).join(" | ")}`
  }
  return ctx
}

// ─── Quick Prompts ────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { icon: TrendingUp,   label: "Best session",     color: "#2ed573", prompt: "Which trading session is my most profitable and why? Give me specific actionable advice to maximize it." },
  { icon: TrendingDown, label: "Biggest weakness", color: "#ff4757", prompt: "What is my biggest trading weakness based on my data? Be direct and specific." },
  { icon: Target,       label: "Win rate boost",   color: "#6c63ff", prompt: "What are the top 3 concrete changes I can make to improve my win rate? Use my actual data." },
  { icon: Shield,       label: "Risk review",      color: "#ffa502", prompt: "Analyze my risk management. Am I over-trading or under-risking? What should I change?" },
  { icon: BarChart3,    label: "Symbol focus",     color: "#00d4aa", prompt: "Which symbol(s) should I focus on and which should I stop trading based on my performance?" },
  { icon: Lightbulb,    label: "Pattern insight",  color: "#a29bfe", prompt: "What patterns do you notice in my winning trades vs losing trades? What should I replicate?" },
  { icon: BookOpen,     label: "Playbook review",  color: "#fd79a8", prompt: "Review my playbook strategies against my actual trade results. Are my strategies being executed correctly? What's working and what isn't?" },
  { icon: FlaskConical, label: "Backtest insight", color: "#74b9ff", prompt: "Analyze my backtesting results. How do they compare to my live trading? What should I focus on testing next?" },
  { icon: Zap,          label: "Quick wins",       color: "#55efc4", prompt: "Give me 3 quick actionable wins I can implement in my next trading session." },
  { icon: Clock,        label: "Timing analysis",  color: "#fdcb6e", prompt: "Analyze my trade timing — am I trading at the right times? When should I be more selective?" },
]

// ─── Typing dots ──────────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0,1,2].map(i=>(
        <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background:"var(--accent)", animationDelay:`${i*0.15}s` }}/>
      ))}
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === "user"
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: isUser ? "rgba(108,99,255,0.2)" : "linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
        {isUser ? <MessageSquare size={14} style={{ color:"var(--accent)" }}/> : <Brain size={14} className="text-white"/>}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser?"rounded-tr-sm":"rounded-tl-sm"}`}
        style={{ background: isUser?"rgba(108,99,255,0.15)":"var(--bg-elevated)", border:"1px solid var(--border)" }}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color:"var(--text-primary)" }}>{msg.content}</p>
        {msg.timestamp && (
          <p className="text-xs mt-1.5" style={{ color:"var(--text-muted)" }}>
            {new Date(msg.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insight, onDelete }) {
  const icons  = { strength:CheckCircle, weakness:AlertTriangle, opportunity:Lightbulb, general:Brain }
  const colors = { strength:"var(--accent-success)", weakness:"var(--accent-danger)", opportunity:"var(--accent-warning)", general:"var(--accent)" }
  const Icon  = icons[insight.type]  || icons.general
  const color = colors[insight.type] || colors.general
  return (
    <div className="rounded-xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:`${color}20` }}>
            <Icon size={14} style={{ color }}/>
          </div>
          <span className="text-xs font-semibold capitalize" style={{ color }}>{insight.type||"insight"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color:"var(--text-muted)" }}>
            {insight.created_at ? new Date(insight.created_at).toLocaleDateString() : ""}
          </span>
          <button onClick={()=>onDelete(insight.id)} className="p-1 rounded hover:opacity-70" style={{ color:"var(--text-muted)" }}>
            <X size={12}/>
          </button>
        </div>
      </div>
      {insight.title && <p className="text-sm font-semibold mb-1" style={{ color:"var(--text-primary)" }}>{insight.title}</p>}
      <p className="text-xs leading-relaxed" style={{ color:"var(--text-secondary)" }}>{insight.content}</p>
    </div>
  )
}

// ─── Quick Save Insight ───────────────────────────────────────────────────────
function QuickSaveInsight({ onSave }) {
  const [title,   setTitle]   = useState("")
  const [content, setContent] = useState("")
  const [type,    setType]    = useState("general")
  const [saving,  setSaving]  = useState(false)
  const save = async () => {
    if (!content.trim()) { toast.error("Content is required"); return }
    setSaving(true)
    await onSave(content.trim(), type, title.trim())
    setTitle(""); setContent(""); setType("general")
    setSaving(false)
  }
  return (
    <div>
      <p className="text-xs font-semibold mb-3" style={{ color:"var(--text-muted)" }}>SAVE NEW INSIGHT</p>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title (optional)"
            className="flex-1 h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          <select value={type} onChange={e=>setType(e.target.value)} className="h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            <option value="general">General</option>
            <option value="strength">Strength</option>
            <option value="weakness">Weakness</option>
            <option value="opportunity">Opportunity</option>
          </select>
        </div>
        <textarea rows={3} value={content} onChange={e=>setContent(e.target.value)} placeholder="Paste or type your insight…"
          className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
        <button onClick={save} disabled={saving||!content.trim()} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
          <Sparkles size={13}/> {saving?"Saving…":"Save Insight"}
        </button>
      </div>
    </div>
  )
}

// ─── Main Sylledge Page ───────────────────────────────────────────────────────
export default function Sylledge() {
  const { user }                      = useUser()
  const [trades,       setTrades]     = useState([])
  const [playbooks,    setPlaybooks]  = useState([])
  const [backtests,    setBacktests]  = useState([])
  const [insights,     setInsights]   = useState([])
  const [messages,     setMessages]   = useState([])
  const [input,        setInput]      = useState("")
  const [loading,      setLoading]    = useState(false)
  const [activeTab,    setActiveTab]  = useState("chat")
  const [bridgeCtx,    setBridgeCtx]  = useState(null)
  const [bridgeStatus, setBridgeStatus] = useState("idle")
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // ── Load all data ─────────────────────────────────────────────────────────
  useEffect(() => {
    Trade.list().then(setTrades)
    Playbook.list().then(setPlaybooks)
    BacktestSession.list().then(setBacktests)
    SylledgeInsight.list().then(d =>
      setInsights(d.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)))
    )
    fetchBridgeContext()
  }, [])

  // ── Load memory from localStorage ────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    try {
      const saved = localStorage.getItem(MEMORY_KEY(user.id))
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.length > 0) {
          setMessages(parsed)
          return
        }
      }
    } catch {}
    // No memory — show welcome message
    setMessages([{
      role: "assistant",
      content: `Hey! I'm SYLLEDGE AI — your personal trading coach powered by Claude.\n\nI have full access to your:\n• Trade journal (${trades.length} trades)\n• Playbook strategies\n• Backtesting results\n• Live MT5 data (when connected)\n\nI remember our full conversation history. Ask me anything about your performance, or use one of the quick prompts below. 🎯`,
      timestamp: new Date().toISOString()
    }])
  }, [user?.id])

  // ── Save memory on every message change ──────────────────────────────────
  useEffect(() => {
    if (!user?.id || messages.length === 0) return
    try {
      // Keep last MAX_MEMORY messages
      const toSave = messages.slice(-MAX_MEMORY)
      localStorage.setItem(MEMORY_KEY(user.id), JSON.stringify(toSave))
    } catch {}
  }, [messages, user?.id])

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" })
  }, [messages, loading])

  // ── MT5 Bridge ────────────────────────────────────────────────────────────
  const fetchBridgeContext = async () => {
    setBridgeStatus("fetching")
    try {
      const res = await fetch("http://localhost:5001/api/context?timeframe=H1&bars=50", {
        signal: AbortSignal.timeout(3000)
      })
      if (!res.ok) throw new Error()
      setBridgeCtx(await res.json())
      setBridgeStatus("connected")
    } catch {
      setBridgeStatus("offline")
      setBridgeCtx(null)
    }
  }

  // ── Call Claude ───────────────────────────────────────────────────────────
  const callAI = async (userMessage) => {
    if (!userMessage.trim()) return ""

    const systemPrompt = `You are SYLLEDGE AI, an elite trading coach and performance analyst embedded in TradeSylla — a professional trading journal app. You have deep, persistent access to the trader's full data across their journal, playbook strategies, and backtesting results.

${buildTradeSummary(trades)}
${buildPlaybookContext(playbooks)}
${buildBacktestContext(backtests)}
${buildBridgeContext(bridgeCtx)}

Your role:
- Analyze trading performance with precision — always cite actual numbers from the data above
- Cross-reference journal results with playbook strategies: are the rules being followed?
- Compare live trading with backtesting results: is the edge translating to real trades?
- Give brutally honest, actionable feedback
- Use trader terminology (R:R, drawdown, expectancy, session, structure, liquidity)
- Format with line breaks for readability
- Remember: you have full conversation history — reference previous discussions when relevant
- When the trader asks about a strategy by name, look it up in their playbook above

Be direct, specific, and encouraging. The trader wants to improve.`

    // Send full conversation history for memory — Claude sees everything
    const history = messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-20)  // last 20 messages = full context window memory
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system:     systemPrompt,
          messages:   [...history, { role:"user", content:userMessage }],
          max_tokens: 1200,
        })
      })
      const data = await res.json()
      if (data.error) return `⚠️ ${data.error}`
      return data.content?.[0]?.text || "Sorry, I couldn't generate a response. Please try again."
    } catch {
      return "Connection error. Please check your internet and try again."
    }
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput("")
    setMessages(prev => [...prev, { role:"user", content:msg, timestamp:new Date().toISOString() }])
    setLoading(true)
    const reply = await callAI(msg)
    setMessages(prev => [...prev, { role:"assistant", content:reply, timestamp:new Date().toISOString() }])
    setLoading(false)
    inputRef.current?.focus()
  }

  const clearMemory = () => {
    if (!user?.id) return
    localStorage.removeItem(MEMORY_KEY(user.id))
    setMessages([{
      role: "assistant",
      content: "Memory cleared! Fresh start. What would you like to analyze? 🎯",
      timestamp: new Date().toISOString()
    }])
  }

  const handleKey = (e) => {
    if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const saveInsight = async (content, type="general", title="") => {
    try {
      const saved = await SylledgeInsight.create({ content, type, title })
      setInsights(prev => [saved, ...prev])
      toast.success("Insight saved!")
    } catch { toast.error("Failed to save insight") }
  }

  const deleteInsight = async (id) => {
    await SylledgeInsight.delete(id)
    setInsights(prev => prev.filter(i=>i.id!==id))
    toast.success("Insight removed")
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const wins    = trades.filter(t=>t.outcome==="WIN")
  const losses  = trades.filter(t=>t.outcome==="LOSS")
  const netPnl  = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate = trades.length ? (wins.length/trades.length*100).toFixed(1) : "0.0"

  return (
    <div className="flex flex-col h-full" style={{ maxHeight:"calc(100vh - 80px)" }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <Brain size={22} className="text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>SYLLEDGE AI</h1>
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>
              {trades.length} trades · {playbooks.length} strategies · {backtests.length} backtests analyzed
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {/* Bridge status */}
              {bridgeStatus==="connected" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background:"rgba(46,213,115,0.1)", color:"var(--accent-success)", border:"1px solid rgba(46,213,115,0.2)" }}>
                  <Activity size={9} className="animate-pulse"/> MT5 live
                </span>
              ) : bridgeStatus==="offline" ? (
                <button onClick={fetchBridgeContext}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs hover:opacity-80"
                  style={{ background:"var(--bg-elevated)", color:"var(--text-muted)", border:"1px solid var(--border)" }}>
                  <LineChart size={9}/> Connect MT5
                </button>
              ) : null}
              {/* Memory indicator */}
              {messages.length > 1 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>
                  <Brain size={9}/> {messages.length} msg memory
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
          {["chat","insights"].map(t=>(
            <button key={t} onClick={()=>setActiveTab(t)}
              className="px-5 py-2 text-sm font-medium capitalize transition-all"
              style={{ background:activeTab===t?"var(--accent)":"var(--bg-elevated)", color:activeTab===t?"#fff":"var(--text-secondary)" }}>
              {t==="chat" ? "💬 Chat" : `💡 Saved (${insights.length})`}
            </button>
          ))}
        </div>
      </div>

      {/* ── CHAT TAB ───────────────────────────────────────────────────────── */}
      {activeTab==="chat" && (
        <div className="flex flex-col gap-4 flex-1 min-h-0">

          {/* Stats strip */}
          {trades.length > 0 && (
            <div className="flex flex-wrap gap-3 rounded-xl px-4 py-3 flex-shrink-0" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              {[
                { label:"Trades",        value:trades.length,                            color:"var(--accent)" },
                { label:"Net P&L",       value:`${netPnl>=0?"+":""}$${netPnl.toFixed(0)}`, color:netPnl>=0?"var(--accent-success)":"var(--accent-danger)" },
                { label:"Win Rate",      value:`${winRate}%`,                            color:parseFloat(winRate)>=50?"var(--accent-success)":"var(--accent-danger)" },
                { label:"W / L",         value:`${wins.length} / ${losses.length}`,      color:"var(--text-secondary)" },
                { label:"Strategies",    value:playbooks.length,                         color:"var(--accent-secondary)" },
                { label:"Backtests",     value:backtests.length,                         color:"#74b9ff" },
              ].map(s=>(
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}:</span>
                  <span className="text-xs font-bold" style={{ color:s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Chat window */}
          <div className="flex-1 overflow-y-auto rounded-2xl p-4 space-y-4 min-h-0" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            {messages.map((msg,i)=><MessageBubble key={i} msg={msg}/>)}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
                  <Brain size={14} className="text-white"/>
                </div>
                <div className="rounded-2xl rounded-tl-sm" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
                  <TypingDots/>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Quick prompts */}
          <div className="flex-shrink-0">
            <p className="text-xs mb-2" style={{ color:"var(--text-muted)" }}>Quick analysis:</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {QUICK_PROMPTS.map((p,i)=>(
                <button key={i} onClick={()=>sendMessage(p.prompt)} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-all hover:opacity-80 disabled:opacity-40"
                  style={{ background:`${p.color}15`, borderColor:`${p.color}30`, color:p.color }}>
                  <p.icon size={12}/> {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input row */}
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={clearMemory} title="Clear memory & start fresh"
              className="p-2.5 rounded-xl border flex-shrink-0 hover:opacity-70 transition-opacity"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-muted)" }}>
              <RefreshCw size={15}/>
            </button>
            <div className="flex-1 flex rounded-xl overflow-hidden" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about your performance, strategies, backtests…"
                rows={1}
                className="flex-1 px-4 py-2.5 text-sm resize-none bg-transparent border-0 outline-none"
                style={{ color:"var(--text-primary)", minHeight:44, maxHeight:120 }}
              />
              <button onClick={()=>sendMessage()} disabled={loading||!input.trim()}
                className="px-4 m-1.5 rounded-lg text-white flex items-center gap-1.5 text-sm font-medium disabled:opacity-40"
                style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)", flexShrink:0 }}>
                <Send size={14}/>
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
          <p className="text-center text-xs flex-shrink-0" style={{ color:"var(--text-muted)" }}>
            Press <kbd className="px-1 py-0.5 rounded text-xs" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>Enter</kbd> to send ·{" "}
            <kbd className="px-1 py-0.5 rounded text-xs" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>Shift+Enter</kbd> for new line ·{" "}
            🔄 clears memory
          </p>
        </div>
      )}

      {/* ── INSIGHTS TAB ─────────────────────────────────────────────────── */}
      {activeTab==="insights" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="rounded-xl p-4 mb-4 flex items-center gap-3" style={{ background:"rgba(108,99,255,0.08)", border:"1px solid rgba(108,99,255,0.2)" }}>
            <Sparkles size={18} style={{ color:"var(--accent)", flexShrink:0 }}/>
            <p className="text-sm" style={{ color:"var(--text-secondary)" }}>
              Save important AI insights for future reference. Go to the{" "}
              <button onClick={()=>setActiveTab("chat")} className="font-semibold underline" style={{ color:"var(--accent)" }}>Chat tab</button>{" "}
              and copy key takeaways below.
            </p>
          </div>
          <div className="rounded-xl p-4 mb-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <QuickSaveInsight onSave={saveInsight}/>
          </div>
          {insights.length===0 ? (
            <div className="rounded-2xl py-16 text-center" style={{ background:"var(--bg-card)", border:"1px dashed var(--border)" }}>
              <Lightbulb size={32} className="mx-auto mb-3" style={{ color:"var(--text-muted)" }}/>
              <p className="font-semibold mb-1" style={{ color:"var(--text-primary)" }}>No saved insights yet</p>
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>Chat with SYLLEDGE AI and save your key takeaways here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map(insight=>(
                <InsightCard key={insight.id} insight={insight} onDelete={deleteInsight}/>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
