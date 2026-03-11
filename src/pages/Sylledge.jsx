import { useState, useEffect, useRef, useCallback } from "react"
import { Trade, Playbook, SylledgeInsight } from "@/api/supabaseStore"
import { useUser } from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/toast"
import {
  Brain, Sparkles, Send, RefreshCw, TrendingUp, TrendingDown,
  Target, BarChart3, Shield, Zap, Clock, X, Database,
  AlertTriangle, CheckCircle, Lightbulb, MessageSquare, Activity,
  BookOpen, Camera, Cpu, MemoryStick
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────────────────────
const MEMORY_KEY = "sylledge_chat"
const MAX_HISTORY = 30  // messages to keep in memory
const AI_MODEL   = "claude-haiku-4-5-20251001"

// ─── Memory helpers (Supabase-persisted) ─────────────────────────────────────
async function loadMemory(userId, key) {
  try {
    const { data } = await supabase.from("sylledge_memory")
      .select("value").eq("user_id", userId).eq("key", key).single()
    return data?.value || null
  } catch { return null }
}

async function saveMemory(userId, key, value) {
  try {
    await supabase.from("sylledge_memory").upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    )
  } catch(e) { console.warn("Memory save failed:", e) }
}

// ─── Context builders ─────────────────────────────────────────────────────────
function buildTradeContext(trades) {
  if (!trades.length) return "No trades logged yet."
  const wins      = trades.filter(t=>t.outcome==="WIN")
  const losses    = trades.filter(t=>t.outcome==="LOSS")
  const netPnl    = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate   = (wins.length/trades.length*100).toFixed(1)
  const avgWin    = wins.length   ? wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length   : 0
  const avgLoss   = losses.length ? Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length) : 0

  // Sessions
  const bySess={}
  trades.forEach(t=>{ const k=t.session||"UNKNOWN"; if(!bySess[k]) bySess[k]={pnl:0,n:0,wins:0}; bySess[k].pnl+=t.pnl||0; bySess[k].n++; if(t.outcome==="WIN") bySess[k].wins++ })
  const sessLines = Object.entries(bySess).sort((a,b)=>b[1].pnl-a[1].pnl)
    .map(([s,d])=>`  ${s}: ${d.n} trades | P&L $${d.pnl.toFixed(2)} | ${(d.wins/d.n*100).toFixed(0)}% WR`).join("\n")

  // Symbols
  const bySym={}
  trades.forEach(t=>{ const k=t.symbol||"UNKNOWN"; if(!bySym[k]) bySym[k]={pnl:0,n:0,wins:0}; bySym[k].pnl+=t.pnl||0; bySym[k].n++; if(t.outcome==="WIN") bySym[k].wins++ })
  const symLines = Object.entries(bySym).sort((a,b)=>b[1].pnl-a[1].pnl)
    .map(([s,d])=>`  ${s}: ${d.n} trades | $${d.pnl.toFixed(2)} | ${(d.wins/d.n*100).toFixed(0)}% WR`).join("\n")

  // Recent 20 trades with chart availability
  const recent = [...trades].sort((a,b)=>new Date(b.entry_time)-new Date(a.entry_time)).slice(0,20)
  const recentLines = recent.map(t=>
    `  ${t.direction} ${t.symbol} | ${t.outcome} | $${(t.pnl||0).toFixed(2)} | ${t.session}/${t.timeframe} | SL:${t.sl||0} TP:${t.tp||0} RR:${t.rr||"?"} | Q:${t.quality||5}/10`
  ).join("\n")

  return `TRADE PERFORMANCE (${trades.length} total trades):
- Net P&L: $${netPnl.toFixed(2)} | Win Rate: ${winRate}% | Profit Factor: ${avgLoss>0?(avgWin/avgLoss).toFixed(2):"N/A"}
- Wins: ${wins.length} | Losses: ${losses.length} | Avg Win: $${avgWin.toFixed(2)} | Avg Loss: $${avgLoss.toFixed(2)}

SESSIONS:
${sessLines}

SYMBOLS:
${symLines}

LAST 20 TRADES (Direction Symbol | Outcome | P&L | Session/TF | SL TP RR | Quality):
${recentLines}`
}

function buildPlaybookContext(playbooks) {
  if (!playbooks.length) return ""
  const lines = playbooks.filter(p=>p.status==="active").map(p => {
    const hasBuyImages  = (p.buy_images  || []).length > 0
    const hasSellImages = (p.sell_images || []).length > 0
    return `STRATEGY: "${p.name}" [${p.category}]
  Description: ${p.description || "—"}
  Entry rules: ${(p.entry_rules || []).join("; ") || "—"}
  Exit rules:  ${(p.exit_rules  || []).join("; ") || "—"}
  Risk rules:  ${(p.risk_rules  || []).join("; ") || "—"}
  Buy rules:   ${(p.buy_rules   || []).join("; ") || "—"}
  Sell rules:  ${(p.sell_rules  || []).join("; ") || "—"}
  Sessions:    ${(p.sessions    || []).join(", ")  || "—"}
  Timeframes:  ${(p.timeframes  || []).join(", ")  || "—"}
  Pairs:       ${(p.pairs       || []).join(", ")  || "—"}
  Notes:       ${p.notes || "—"}
  Win Rate: ${p.win_rate||"?"} | Profit Factor: ${p.profit_factor||"?"} | Avg RR: ${p.avg_rr||"?"}
  Setup images: ${hasBuyImages?`${p.buy_images.length} BUY`:"none"} | ${hasSellImages?`${p.sell_images.length} SELL`:"none"}`
  }).join("\n\n")
  return `\n\nPLAYBOOK STRATEGIES (${playbooks.filter(p=>p.status==="active").length} active):\n${lines}`
}

function buildInsightContext(insights) {
  if (!insights.length) return ""
  const lines = insights.slice(0,10).map(i=>
    `  [${i.type}] ${i.title||""}: ${i.content}`
  ).join("\n")
  return `\n\nSAVED INSIGHTS (your previous AI takeaways):\n${lines}`
}

// ─── Build image content blocks for Claude (screenshots + playbook images) ───
async function buildImageBlocks(trades, playbooks) {
  const blocks = []

  // Trade screenshots (last 5 trades with screenshots)
  const tradesWithScreenshots = [...trades]
    .sort((a,b)=>new Date(b.entry_time)-new Date(a.entry_time))
    .filter(t=>(t.screenshots||[]).length>0)
    .slice(0,5)

  for (const trade of tradesWithScreenshots) {
    const screenshots = (trade.screenshots || []).slice(0,2) // max 2 per trade
    for (const url of screenshots) {
      try {
        const res  = await fetch(url)
        const blob = await res.blob()
        const b64  = await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result.split(",")[1]); fr.readAsDataURL(blob) })
        blocks.push({ type:"image", source:{ type:"base64", media_type:blob.type||"image/jpeg", data:b64 } })
        blocks.push({ type:"text", text:`↑ Trade screenshot: ${trade.direction} ${trade.symbol} | ${trade.outcome} | $${(trade.pnl||0).toFixed(2)} | ${new Date(trade.entry_time).toLocaleDateString()} | SL:${trade.sl||"?"} TP:${trade.tp||"?"}` })
      } catch {}
    }
  }

  // Playbook images (buy/sell setup images from active strategies)
  for (const pb of playbooks.filter(p=>p.status==="active").slice(0,3)) {
    const imgs = [...(pb.buy_images||[]).slice(0,1), ...(pb.sell_images||[]).slice(0,1)]
    for (const url of imgs) {
      try {
        const res  = await fetch(url)
        const blob = await res.blob()
        const b64  = await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result.split(",")[1]); fr.readAsDataURL(blob) })
        blocks.push({ type:"image", source:{ type:"base64", media_type:blob.type||"image/jpeg", data:b64 } })
        blocks.push({ type:"text", text:`↑ Playbook setup image from strategy: "${pb.name}"` })
      } catch {}
    }
  }

  return blocks
}

// ─── Quick prompts ────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { icon:TrendingUp,   label:"Best session",       color:"#2ed573", prompt:"Which trading session is my best? Give concrete data and what to do about it." },
  { icon:TrendingDown, label:"Biggest weakness",   color:"#ff4757", prompt:"What is my biggest trading weakness? Be direct and specific with data." },
  { icon:Target,       label:"Win rate boost",     color:"#6c63ff", prompt:"What are 3 specific changes I can make right now to improve my win rate?" },
  { icon:Shield,       label:"Risk review",        color:"#ffa502", prompt:"Analyze my risk management. Am I over-trading or taking too much risk?" },
  { icon:BarChart3,    label:"Symbol focus",       color:"#00d4aa", prompt:"Which symbol should I focus on and which should I stop trading?" },
  { icon:Lightbulb,    label:"Pattern insight",    color:"#a29bfe", prompt:"What patterns do you see in my winning trades vs losing trades?" },
  { icon:BookOpen,     label:"Playbook audit",     color:"#fd79a8", prompt:"Looking at my playbook strategies and my trade screenshots, how well am I following my own rules? What rules am I breaking most?" },
  { icon:Camera,       label:"Review my charts",   color:"#74b9ff", prompt:"Look at my trade screenshots carefully. What do you see in my setups? What areas, price levels, or chart patterns am I trading and what should I improve?" },
  { icon:Cpu,          label:"Full analysis",      color:"#ff6b35", prompt:"Give me a complete deep analysis of my trading: performance, playbook adherence, trade quality, risk, and top 3 improvements." },
  { icon:Zap,          label:"Quick wins",         color:"#55efc4", prompt:"Give me 3 actionable improvements for my next session based on my data." },
]

// ─── Typing animation ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0,1,2].map(i=>(
        <div key={i} className="w-2 h-2 rounded-full animate-bounce"
          style={{ background:"var(--accent)", animationDelay:`${i*0.15}s` }}/>
      ))}
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === "user"
  return (
    <div className={`flex gap-3 ${isUser?"flex-row-reverse":"flex-row"}`}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background:isUser?"rgba(108,99,255,0.2)":"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
        {isUser ? <MessageSquare size={14} style={{ color:"var(--accent)" }}/> : <Brain size={14} className="text-white"/>}
      </div>
      <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${isUser?"rounded-tr-sm":"rounded-tl-sm"}`}
        style={{ background:isUser?"rgba(108,99,255,0.15)":"var(--bg-elevated)", border:"1px solid var(--border)" }}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color:"var(--text-primary)" }}>{msg.content}</p>
        <p className="text-xs mt-1.5" style={{ color:"var(--text-muted)" }}>
          {new Date(msg.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
          {msg.hasImages && <span className="ml-2 opacity-60">📸 charts analyzed</span>}
        </p>
      </div>
    </div>
  )
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insight, onDelete }) {
  const icons   = { strength:CheckCircle, weakness:AlertTriangle, opportunity:Lightbulb, general:Brain }
  const colors  = { strength:"var(--accent-success)", weakness:"var(--accent-danger)", opportunity:"var(--accent-warning)", general:"var(--accent)" }
  const Icon    = icons[insight.type]  || icons.general
  const color   = colors[insight.type] || colors.general
  return (
    <div className="rounded-xl p-4 card-hover" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:`${color}20` }}>
            <Icon size={14} style={{ color }}/>
          </div>
          <span className="text-xs font-semibold capitalize" style={{ color }}>{insight.type||"insight"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color:"var(--text-muted)" }}>{insight.created_at?new Date(insight.created_at).toLocaleDateString():""}</span>
          <button onClick={()=>onDelete(insight.id)} className="p-1 rounded hover:opacity-70" style={{ color:"var(--text-muted)" }}><X size={12}/></button>
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
    if (!content.trim()) { toast.error("Insight content required"); return }
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
        <button onClick={save} disabled={saving||!content.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background:"linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
          <Sparkles size={13}/>{saving?"Saving…":"Save Insight"}
        </button>
      </div>
    </div>
  )
}

// ─── Memory Status Pill ───────────────────────────────────────────────────────
function MemoryPill({ count, onClear }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background:"rgba(108,99,255,0.08)", border:"1px solid rgba(108,99,255,0.2)" }}>
      <MemoryStick size={11} style={{ color:"var(--accent)" }}/>
      <span className="text-xs" style={{ color:"var(--text-muted)" }}>Memory: {count} messages</span>
      <button onClick={onClear} className="text-xs hover:opacity-70 px-1.5 py-0.5 rounded"
        style={{ color:"var(--accent-danger)", background:"rgba(255,71,87,0.08)" }}>clear</button>
    </div>
  )
}

// ─── Main Sylledge Page ───────────────────────────────────────────────────────
export default function Sylledge() {
  const { user } = useUser()
  const [trades,      setTrades]      = useState([])
  const [playbooks,   setPlaybooks]   = useState([])
  const [insights,    setInsights]    = useState([])
  const [messages,    setMessages]    = useState([])
  const [input,       setInput]       = useState("")
  const [loading,     setLoading]     = useState(false)
  const [activeTab,   setActiveTab]   = useState("chat")
  const [memoryLoaded,setMemoryLoaded]= useState(false)
  const [imageCtx,    setImageCtx]    = useState([])  // preloaded image blocks
  const [loadingImages,setLoadingImages] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Load data + memory
  useEffect(() => {
    Promise.all([
      Trade.list(),
      Playbook.list(),
      SylledgeInsight.list(),
    ]).then(([t, p, ins]) => {
      setTrades(t || [])
      setPlaybooks(p || [])
      setInsights((ins||[]).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)))
    })
  }, [])

  // Load persistent memory from Supabase
  useEffect(() => {
    if (!user?.id || memoryLoaded) return
    loadMemory(user.id, MEMORY_KEY).then(mem => {
      if (mem && Array.isArray(mem) && mem.length > 0) {
        setMessages(mem)
      } else {
        setMessages([{
          role:"assistant",
          content:"Hey! I'm SYLLEDGE AI — your personal trading coach with memory.\n\nI have full access to your trade history, playbook strategies, and setup screenshots. I remember our past conversations and get smarter over time.\n\nAsk me anything, or use a quick prompt below. 🎯",
          timestamp:new Date().toISOString()
        }])
      }
      setMemoryLoaded(true)
    })
  }, [user?.id, memoryLoaded])

  // Persist messages to Supabase whenever they change
  useEffect(() => {
    if (!user?.id || !memoryLoaded || messages.length === 0) return
    const toSave = messages.slice(-MAX_HISTORY)
    saveMemory(user.id, MEMORY_KEY, toSave)
  }, [messages, user?.id, memoryLoaded])

  // Preload image context (screenshots + playbook images) in background
  useEffect(() => {
    if (!trades.length && !playbooks.length) return
    setLoadingImages(true)
    buildImageBlocks(trades, playbooks).then(blocks => {
      setImageCtx(blocks)
      setLoadingImages(false)
    })
  }, [trades.length, playbooks.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" })
  }, [messages, loading])

  // ── Build system prompt ────────────────────────────────────────────────────
  const buildSystem = useCallback(() => {
    const tradeCtx    = buildTradeContext(trades)
    const playbookCtx = buildPlaybookContext(playbooks)
    const insightCtx  = buildInsightContext(insights)
    const hasImages   = imageCtx.length > 0

    return `You are SYLLEDGE AI, an elite personal trading coach and performance analyst embedded inside TradeSylla, a professional trading journal app.

You have persistent memory — you remember previous conversations with this trader and build knowledge over time.
You have full access to the trader's: complete trade history, playbook strategies (including setup images), saved insights, and${hasImages ? " live trade screenshots you can see right now." : " trade data."}

YOUR ROLE:
- Analyze performance rigorously with real numbers from their data
- Identify patterns in their wins vs losses based on charts and data
- Cross-reference their actual trades with their playbook rules — call out when they break their own rules
- Give specific, actionable, data-backed advice (not generic trading tips)
- Track their progress over time and celebrate improvements
- Be direct, honest, sometimes blunt — like a real professional coach
- Reference specific trade details, symbols, and dates when relevant
- When analyzing chart screenshots: describe what you see (price action, levels, structure) and assess trade quality

COMMUNICATION STYLE:
- Concise but thorough — no fluff
- Use specific numbers from their data
- Bold insights with clear action items
- Acknowledge what they're doing well AND what needs work
- Remember and reference previous conversations naturally

TRADER'S CURRENT DATA:
${tradeCtx}
${playbookCtx}
${insightCtx}

${hasImages ? `\nYou have been provided ${imageCtx.filter(b=>b.type==="image").length} chart image(s) including trade screenshots and playbook setup examples. Analyze them carefully when relevant.` : ""}

Important: Always base your analysis on their ACTUAL data above. Never give generic advice that ignores their specific numbers and patterns.`
  }, [trades, playbooks, insights, imageCtx])

  // ── Call Claude API ────────────────────────────────────────────────────────
  const callAI = async (userMessage, includeImages = false) => {
    const system    = buildSystem()
    const history   = messages.slice(-20).filter(m=>m.role!=="system")
    const msgHistory= history.map(m=>({
      role: m.role,
      content: m.content
    }))

    // Build user message — include images if available and requested
    let userContent
    if (includeImages && imageCtx.length > 0) {
      userContent = [
        ...imageCtx,
        { type:"text", text: userMessage }
      ]
    } else {
      userContent = userMessage
    }

    const messages_to_send = [
      ...msgHistory.slice(0,-1), // history excluding the last user msg (we'll add it fresh)
      { role:"user", content: userContent }
    ]

    const res = await fetch("/api/ai", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        system,
        messages: messages_to_send,
        max_tokens: 1500,
      })
    })

    if (!res.ok) {
      const err = await res.json().catch(()=>({ error:"Network error" }))
      throw new Error(err.error || "AI request failed")
    }

    const data = await res.json()
    return data.content?.[0]?.text || "No response received."
  }

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async (text, opts = {}) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput("")

    const shouldIncludeImages = opts.includeImages || imageCtx.length > 0
    const userMsg = { role:"user", content:msg, timestamp:new Date().toISOString(), hasImages: shouldIncludeImages && imageCtx.length > 0 }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const reply = await callAI(msg, shouldIncludeImages)
      setMessages(prev => [...prev, {
        role:"assistant", content:reply,
        timestamp:new Date().toISOString(),
        hasImages: shouldIncludeImages && imageCtx.length > 0
      }])
    } catch(e) {
      setMessages(prev => [...prev, {
        role:"assistant",
        content:`⚠️ ${e.message === "Failed to fetch" ? "Connection error — make sure you're online." : e.message}`,
        timestamp:new Date().toISOString()
      }])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  const clearMemory = async () => {
    const welcome = [{ role:"assistant", content:"Memory cleared. Fresh start! What would you like to analyze? 🎯", timestamp:new Date().toISOString() }]
    setMessages(welcome)
    if (user?.id) await saveMemory(user.id, MEMORY_KEY, welcome)
    toast.success("Memory cleared")
  }

  const saveInsight = async (content, type="general", title="") => {
    try {
      const saved = await SylledgeInsight.create({ content, type, title })
      setInsights(prev=>[saved,...prev])
      toast.success("Insight saved!")
    } catch { toast.error("Failed to save insight") }
  }

  const deleteInsight = async (id) => {
    await SylledgeInsight.delete(id)
    setInsights(prev=>prev.filter(i=>i.id!==id))
    toast.success("Removed")
  }

  // Summary stats
  const wins    = trades.filter(t=>t.outcome==="WIN")
  const losses  = trades.filter(t=>t.outcome==="LOSS")
  const netPnl  = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate = trades.length?(wins.length/trades.length*100).toFixed(1):"0.0"
  const hasScreenshots = trades.some(t=>(t.screenshots||[]).length>0)
  const hasPlaybookImages = playbooks.some(p=>(p.buy_images||[]).length>0||(p.sell_images||[]).length>0)

  return (
    <div className="flex flex-col" style={{ height:"calc(100vh - 80px)" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <Brain size={22} className="text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>SYLLEDGE AI</h1>
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>
              {trades.length} trades · {playbooks.filter(p=>p.status==="active").length} strategies · {insights.length} insights saved
            </p>
            {/* Context indicators */}
            <div className="flex flex-wrap gap-1.5 mt-1">
              {imageCtx.filter(b=>b.type==="image").length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background:"rgba(46,213,115,0.1)", color:"var(--accent-success)", border:"1px solid rgba(46,213,115,0.2)" }}>
                  <Camera size={9}/> {imageCtx.filter(b=>b.type==="image").length} charts loaded
                </span>
              )}
              {loadingImages && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background:"var(--bg-elevated)", color:"var(--text-muted)" }}>
                  <RefreshCw size={9} className="animate-spin"/> loading images…
                </span>
              )}
              {hasPlaybookImages && imageCtx.filter(b=>b.type==="image").length === 0 && !loadingImages && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ background:"var(--bg-elevated)", color:"var(--text-muted)" }}>
                  <Database size={9}/> data only
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex rounded-xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
            {["chat","insights"].map(t=>(
              <button key={t} onClick={()=>setActiveTab(t)}
                className="px-5 py-2 text-sm font-medium capitalize transition-all"
                style={{ background:activeTab===t?"var(--accent)":"var(--bg-elevated)", color:activeTab===t?"#fff":"var(--text-secondary)" }}>
                {t==="chat"?"💬 Chat":`💡 Saved (${insights.length})`}
              </button>
            ))}
          </div>
          <MemoryPill count={messages.length} onClear={clearMemory}/>
        </div>
      </div>

      {/* ── CHAT TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === "chat" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Stats strip */}
          {trades.length > 0 && (
            <div className="flex flex-wrap gap-3 rounded-xl px-4 py-2.5 flex-shrink-0" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              {[
                { label:"Trades",   value:trades.length,                    color:"var(--accent)" },
                { label:"Net P&L",  value:`${netPnl>=0?"+":""}$${netPnl.toFixed(0)}`, color:netPnl>=0?"var(--accent-success)":"var(--accent-danger)" },
                { label:"Win Rate", value:`${winRate}%`,                    color:parseFloat(winRate)>=50?"var(--accent-success)":"var(--accent-danger)" },
                { label:"W/L",      value:`${wins.length}W · ${losses.length}L`, color:"var(--text-secondary)" },
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
            <div className="flex gap-2 overflow-x-auto pb-1">
              {QUICK_PROMPTS.map((p,i)=>(
                <button key={i} onClick={()=>sendMessage(p.prompt, { includeImages: true })} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-all hover:opacity-80 disabled:opacity-40"
                  style={{ background:`${p.color}15`, borderColor:`${p.color}30`, color:p.color }}>
                  <p.icon size={12}/>{p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="flex gap-2 flex-shrink-0">
            <div className="flex-1 flex rounded-xl overflow-hidden" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
              <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendMessage() } }}
                placeholder="Ask about your performance, playbook, or any trade…"
                rows={1} className="flex-1 px-4 py-2.5 text-sm resize-none bg-transparent border-0 outline-none"
                style={{ color:"var(--text-primary)", background:"transparent", minHeight:44, maxHeight:120 }}/>
              <button onClick={()=>sendMessage(undefined, { includeImages:true })} disabled={loading||!input.trim()}
                className="px-4 m-1.5 rounded-lg text-white flex items-center gap-1.5 text-sm font-medium transition-all disabled:opacity-40"
                style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)", flexShrink:0 }}>
                <Send size={14}/><span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
          <p className="text-center text-xs flex-shrink-0" style={{ color:"var(--text-muted)" }}>
            Enter to send · Shift+Enter new line · Images are sent automatically when available
          </p>
        </div>
      )}

      {/* ── INSIGHTS TAB ────────────────────────────────────────────────────── */}
      {activeTab === "insights" && (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          <div className="rounded-xl p-4 flex items-center gap-3" style={{ background:"rgba(108,99,255,0.08)", border:"1px solid rgba(108,99,255,0.2)" }}>
            <Sparkles size={18} style={{ color:"var(--accent)", flexShrink:0 }}/>
            <p className="text-sm" style={{ color:"var(--text-secondary)" }}>
              Save key AI takeaways here. These are also fed back to SYLLEDGE in future sessions so it remembers your learning.
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <QuickSaveInsight onSave={saveInsight}/>
          </div>
          {insights.length === 0 ? (
            <div className="rounded-2xl py-16 text-center" style={{ background:"var(--bg-card)", border:"1px dashed var(--border)" }}>
              <Lightbulb size={32} className="mx-auto mb-3" style={{ color:"var(--text-muted)" }}/>
              <p className="font-semibold mb-1" style={{ color:"var(--text-primary)" }}>No saved insights yet</p>
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>Chat with SYLLEDGE and save your key takeaways here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map(i=><InsightCard key={i.id} insight={i} onDelete={deleteInsight}/>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
