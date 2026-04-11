// src/pages/Sylledge.jsx  — SYLLEDGE AI v3.1 — Visual Upgrade
import { useLanguage } from "@/lib/LanguageContext"
import { useState, useEffect, useRef } from "react"
import { useUser }  from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import {
  Send, Sparkles, TrendingUp, BarChart2, FileText, Download, Upload,
  Brain, AlertCircle, CheckCircle, Clock, Target, Shield,
  BookOpen, Activity, RefreshCw, X, MessageSquare, LineChart,
  Paperclip, File, FileSpreadsheet, Trash2, ChevronRight, Zap,
  ArrowUpRight
} from "lucide-react"
import { Trade, Playbook, BacktestSession, SylledgeInsight } from "@/api/supabaseStore"
import { toast } from "@/components/ui/toast"

const MAX_MSGS   = 40
const MEMORY_KEY = uid => `sylledge_memory_${uid}`

const TABS = [
  { id:"chat",     label:"Chat",     Icon:MessageSquare },
  { id:"insights", label:"Insights", Icon:Brain },
  { id:"charts",   label:"Charts",   Icon:LineChart },
]

const QUICK_PROMPTS = [
  { label:"Best session",        icon:Clock,     color:"#00d4aa", prompt:"Which trading session gives me the best results? Break down win rates, avg P&L, and specific hours." },
  { label:"Entry time analysis", icon:Target,    color:"#6c63ff", prompt:"Analyze my entry times across all sessions. When exactly should I enter? Build a heatmap from my data." },
  { label:"SL improvement",      icon:Shield,    color:"#ffa502", prompt:"Analyze my stop loss placements. Where should they have been? Build a better SL strategy." },
  { label:"R:R audit",           icon:TrendingUp,color:"#2ed573", prompt:"Audit my risk/reward. Compare actual RR vs market-offered RR. How do I improve my TP system?" },
  { label:"vs Backtest",         icon:Activity,  color:"#ff6b35", prompt:"Compare my live trading vs backtested strategies. Find the gap. What am I doing differently live?" },
  { label:"Playbook deep dive",  icon:BookOpen,  color:"#a29bfe", prompt:"Which playbook strategies perform best live? Which need refinement? Give specific rule improvements." },
  { label:"Win rate prediction", icon:BarChart2, color:"#74b9ff", prompt:"Predict my win rate for the next 20 trades if I follow my current setup strictly. Show reasoning." },
  { label:"Generate report",     icon:FileText,  color:"#fd79a8", prompt:"Generate a comprehensive performance report as a downloadable HTML file with interactive charts." },
]

function fmtTime(iso){ return new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) }
function fmtBytes(n){ if(n<1024)return n+" B"; if(n<1048576)return(n/1024).toFixed(1)+" KB"; return(n/1048576).toFixed(1)+" MB" }

function FileIcon({type}){
  if(type?.startsWith("image/")) return <Sparkles size={12}/>
  if(type==="application/pdf")   return <FileText size={12}/>
  if(type?.includes("csv"))      return <FileSpreadsheet size={12}/>
  return <File size={12}/>
}

function buildTradeSummary(trades) {
  if(!trades.length) return "No trades logged yet."
  const wins   = trades.filter(t=>t.outcome==="WIN").length
  const losses = trades.filter(t=>t.outcome==="LOSS").length
  const wr     = (wins/trades.length*100).toFixed(1)
  const pnl    = trades.reduce((s,x)=>s+(x.total_pnl||x.pnl||0),0).toFixed(2)
  const avgQ   = (trades.reduce((s,x)=>s+(x.quality||5),0)/trades.length).toFixed(1)

  // Session breakdown
  const sess = {}
  trades.forEach(x=>{ if(!x.session)return; if(!sess[x.session])sess[x.session]={w:0,n:0,p:0}; sess[x.session].n++; sess[x.session].p+=(x.total_pnl||x.pnl||0); if(x.outcome==="WIN")sess[x.session].w++ })
  const sessStr=Object.entries(sess).map(([s,v])=>`${s}:${v.n}t,${(v.w/v.n*100).toFixed(0)}%WR,$${v.p.toFixed(2)}`).join(" | ")

  // Best hours
  const hourMap={}
  trades.forEach(x=>{ if(!x.entry_time)return; const h=new Date(x.entry_time).getUTCHours(); if(!hourMap[h])hourMap[h]={w:0,n:0}; hourMap[h].n++; if(x.outcome==="WIN")hourMap[h].w++ })
  const bestHours=Object.entries(hourMap).filter(([,v])=>v.n>=3).sort((a,b)=>(b[1].w/b[1].n)-(a[1].w/a[1].n)).slice(0,5).map(([h,v])=>`${h}:00UTC(${(v.w/v.n*100).toFixed(0)}%WR,${v.n}t)`).join(", ")

  // ── Symbol breakdown (the key fix — AI now sees ALL symbols) ──────────────
  const symMap = {}
  trades.forEach(t => {
    const s = t.symbol || "UNKNOWN"
    if (!symMap[s]) symMap[s] = { n:0, w:0, p:0 }
    symMap[s].n++
    symMap[s].p += (t.total_pnl||t.pnl||0)
    if (t.outcome==="WIN") symMap[s].w++
  })
  const symStr = Object.entries(symMap)
    .sort((a,b) => b[1].n - a[1].n)
    .map(([sym,v]) => `${sym}:${v.n}t,${(v.w/v.n*100).toFixed(0)}%WR,$${v.p.toFixed(2)}`)
    .join(" | ")

  // ── Representative sample — 3 trades per symbol, not just first 20 ───────
  const perSym = {}
  trades.forEach(t => {
    const s = t.symbol || "UNKNOWN"
    if (!perSym[s]) perSym[s] = []
    if (perSym[s].length < 3) perSym[s].push(t)
  })
  const sampleTrades = Object.values(perSym).flat()
  const sample = sampleTrades.map(t =>
    `${t.symbol} ${t.direction} ${t.outcome} $${(t.total_pnl||t.pnl||0).toFixed(2)} Q:${t.quality||5} Sess:${t.session||"?"} TF:${t.timeframe||"?"}`
  ).join("\n")

  return `TRADER DATA: Trades:${trades.length} | WR:${wr}% | P&L:$${pnl} | AvgQ:${avgQ}/10
Sessions: ${sessStr||"none"}
Best Hours: ${bestHours||"insufficient data"}

SYMBOLS TRADED (complete breakdown):
${symStr}

SAMPLE TRADES (3 per symbol):
${sample}`
}

// Fetch live market context from MarketCharts data (sylledge_market_data table)
async function fetchMarketContext(trades, supabaseClient) {
  if(!trades.length) return ""
  const symCount = {}
  trades.forEach(t => { symCount[t.symbol] = (symCount[t.symbol]||0)+1 })
  const topSyms = Object.entries(symCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([s])=>s)
  const parts = []
  for(const sym of topSyms) {
    try {
      const { data } = await supabaseClient
        .from("sylledge_market_data")
        .select("candle_time,open_price,high_price,low_price,close_price")
        .eq("symbol", sym).eq("timeframe", "H1")
        .order("candle_time", { ascending: false }).limit(24)
      if(data?.length) {
        const latest = data[0], oldest = data[data.length-1]
        const chg = ((latest.close_price - oldest.close_price)/oldest.close_price*100).toFixed(2)
        const hi = Math.max(...data.map(d=>d.high_price))
        const lo = Math.min(...data.map(d=>d.low_price))
        const dp = latest.close_price < 10 ? 5 : 2
        parts.push(`${sym}: Price=${latest.close_price.toFixed(dp)} | 24h Chg=${chg}% | Range ${lo.toFixed(dp)}-${hi.toFixed(dp)}`)
      }
    } catch {}
  }
  return parts.length ? "\n\nLIVE MARKET DATA (MarketCharts):\n" + parts.join("\n") : ""
}

function buildSystemPrompt(trades,playbooks,backtests,memory,selPlaybook,attachments,marketCtx) {
  const tradeSummary = buildTradeSummary(trades)
  const pbTxt = selPlaybook ? (() => { const pb=playbooks.find(p=>p.id===selPlaybook); return pb?`\n\nACTIVE PLAYBOOK: "${pb.name}"\n${pb.description||""}\nRules:${JSON.stringify(pb.rules||{})}`:"" })() : ""
  const btTxt = backtests.length ? "\n\nBACKTESTED STRATEGIES:\n"+backtests.slice(0,5).map(b=>`• ${b.name||"Strategy"}: ${b.total_trades||0}t,${b.win_rate||0}%WR,$${b.total_pnl||0}`).join("\n") : ""
  const attachTxt = attachments.length ? `\n\nUPLOADED FILES: ${attachments.map(a=>a.name).join(", ")} — analyze their content too if relevant.` : ""
  const mktTxt = marketCtx || ""
  return `You are SYLLEDGE, an elite professional trading coach and quant analyst embedded in TradeSylla.

${tradeSummary}${pbTxt}${btTxt}${mktTxt}${attachTxt}

YOUR MEMORY:\n${memory||"no memory yet"}

YOUR CAPABILITIES:
1. DEEP ANALYSIS of entry times, sessions, SL, TP, RR — use the actual trade data above
2. MARKET CONTEXT: you have live H1 data for the trader's most-traded symbols — use it
3. BACKTEST COMPARISON: compare live vs backtest results
4. FILE GENERATION: downloadable HTML reports, CSVs, JSON analysis
5. FILE READING: analyze uploaded PDFs, images, CSVs
6. STRATEGY INTEGRATION: cross-reference active playbook with live performance
7. RISK MANAGEMENT: position sizing, session exposure, max daily drawdown

⚠️ CRITICAL FILE GENERATION RULES — MUST FOLLOW EXACTLY:
When the user asks for a report, file, HTML, or downloadable document you MUST:
1. Output the COMPLETE file content wrapped in the tags below
2. NEVER show raw code in the chat — always use the tags so the file auto-downloads
3. The file must be COMPLETE and READY TO OPEN — not a snippet, not a template

• HTML report: <<<HTML_FILE>>><!DOCTYPE html><html>...(full complete HTML here)...</html><<<END_HTML>>>
• CSV data:     <<<CSV_FILE>>>col1,col2\nrow1val1,row1val2<<<END_CSV>>>
• JSON:         <<<JSON_FILE>>>{...full json...}<<<END_JSON>>>
• Memory:       <<<MEMORY_UPDATE>>>key finding to remember<<<END_MEMORY>>>

When generating HTML reports: include inline CSS, all data embedded, charts using Chart.js CDN or SVG — no external dependencies except CDN links. Make it professional and dark-themed matching TradeSylla's aesthetic (#0a0b0f background, #6c63ff accent).

Always be specific and data-driven. Reference actual numbers from the trader's data.`
}



function parseResp(text) {
  const files=[]; let clean=text
  // Match with or without closing tag (handles truncated responses)
  const htmlM=text.match(/<<<HTML_FILE>>>([\s\S]*?)(?:<<<END_HTML>>>|$)/)
  if(htmlM && htmlM[1].trim().startsWith("<!")) {
    files.push({type:"html",name:"sylledge_report.html",content:htmlM[1].trim()})
    clean=clean.replace(htmlM[0],"")
  }
  const csvM=text.match(/<<<CSV_FILE>>>([\s\S]*?)(?:<<<END_CSV>>>|$)/)
  if(csvM && csvM[1].trim()){ files.push({type:"csv",name:"sylledge_data.csv",content:csvM[1].trim()}); clean=clean.replace(csvM[0],"") }
  const jsonM=text.match(/<<<JSON_FILE>>>([\s\S]*?)(?:<<<END_JSON>>>|$)/)
  if(jsonM && jsonM[1].trim()){ files.push({type:"json",name:"sylledge_analysis.json",content:jsonM[1].trim()}); clean=clean.replace(jsonM[0],"") }
  const mdM=text.match(/<<<REQUEST_MARKET_DATA>>>([\s\S]*?)<<<END_REQUEST>>>/)
  if(mdM){ try{ mdReq=JSON.parse(mdM[1].trim()) }catch{}; clean=clean.replace(mdM[0],"") }
  const memM=text.match(/<<<MEMORY_UPDATE>>>([\s\S]*?)<<<END_MEMORY>>>/)
  if(memM){ clean=clean.replace(memM[0],"") }
  return { clean:clean.trim(), files, mdReq, memUpdate:memM?memM[1].trim():null }
}

function downloadFile(content,name,type) {
  const mime={ html:"text/html", csv:"text/csv", json:"application/json" }[type]||"text/plain"
  const blob=new Blob([content],{type:mime})
  const url=URL.createObjectURL(blob)
  const a=document.createElement("a"); a.href=url; a.download=name; a.click()
  URL.revokeObjectURL(url)
}

function MessageBubble({ msg, onSave }) {
  const isUser = msg.role === "user"
  const formatContent = text => {
    const lines = text.split("\n")
    return lines.map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/`(.*?)`/g, '<code style="background:var(--bg-elevated);padding:0 4px;border-radius:4px;font-family:var(--font-mono);font-size:11px">$1</code>')
      return (
        <p key={i} className={`text-sm leading-relaxed ${line.trim()===""?"h-2":""}`}
          dangerouslySetInnerHTML={{ __html: bold || "&nbsp;" }}/>
      )
    })
  }
  return (
    <div className={`flex gap-3 ${isUser?"justify-end":""}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1"
          style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
          <Brain size={14} className="text-white"/>
        </div>
      )}
      <div className={`max-w-[85%] ${isUser?"items-end":""} flex flex-col gap-1`}>
        <div className={`px-4 py-3 rounded-2xl ${isUser?"rounded-tr-sm":"rounded-tl-sm"}`}
          style={{
            background: isUser ? "var(--accent)" : "var(--bg-elevated)",
            border: isUser ? "none" : "1px solid var(--border)",
            color: isUser ? "#fff" : "var(--text-secondary)",
          }}>
          {isUser
            ? <p className="text-sm" style={{ fontFamily:"var(--font-display)" }}>{msg.content}</p>
            : <div className="space-y-1">{formatContent(msg.content)}</div>
          }
          {msg.files?.length > 0 && (
            <div className="mt-3 space-y-2">
              {msg.files.map((f,i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:opacity-80"
                  style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}
                  onClick={() => downloadFile(f.content,f.name,f.type)}>
                  <FileText size={13} style={{ color:"var(--accent)" }}/>
                  <span className="text-xs font-medium" style={{ fontFamily:"var(--font-mono)", color:"var(--accent)" }}>{f.name}</span>
                  <Download size={11} className="ml-auto" style={{ color:"var(--text-muted)" }}/>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {msg.timestamp && <span className="text-xs" style={{ fontFamily:"var(--font-mono)", color:"var(--text-muted)", fontSize:10 }}>{fmtTime(msg.timestamp)}</span>}
          {!isUser && onSave && (
            <button onClick={()=>onSave(msg.content)} className="text-xs px-2 py-0.5 rounded-lg hover:opacity-70"
              style={{ background:"rgba(108,99,255,0.12)", color:"var(--accent)", fontFamily:"var(--font-display)" }}>
              Save insight
            </button>
          )}
        </div>
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 text-xs font-bold text-white"
          style={{ background:"var(--accent-secondary)", fontFamily:"var(--font-display)" }}>
          U
        </div>
      )}
    </div>
  )
}

export default function Sylledge() {
  const { t } = useLanguage()
  const { user } = useUser()
  const [tab,        setTab]        = useState("chat")
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState("")
  const [loading,    setLoading]    = useState(false)
  const [memory,     setMemory]     = useState("")
  const [trades,     setTrades]     = useState([])
  const [playbooks,  setPlaybooks]  = useState([])
  const [backtests,  setBacktests]  = useState([])
  const [selPlaybook,setSelPlaybook]= useState("")
  const [attachments,setAttachments]= useState([])
  const [insights,   setInsights]   = useState([])
  const [eaStatus,   setEaStatus]   = useState("idle")
  const bottomRef = useRef(null)
  const fileRef   = useRef(null)

  async function getSessionToken() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token || ""
  }

  useEffect(() => {
    Trade.list().then(setTrades)
    Playbook.list().then(setPlaybooks)
    BacktestSession.list().then(setBacktests)
    SylledgeInsight.list().then(d=>setInsights(d.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))))
    if(user?.id) {
      try {
        const saved = localStorage.getItem(MEMORY_KEY(user.id))
        const parsed = saved ? JSON.parse(saved) : []
        if(parsed.length>0) { setMessages(parsed); return }
      } catch {}
    }
    setMessages([{ role:"assistant", content:"Hey! I'm SYLLEDGE AI — your personal trading coach.\n\nI have access to your full trade history, playbook, and backtests. Ask me anything, or use one of the quick prompts below. 🎯", timestamp:new Date().toISOString() }])
  }, [user?.id])

  useEffect(() => {
    if(user?.id && messages.length>0) {
      try { localStorage.setItem(MEMORY_KEY(user.id), JSON.stringify(messages.slice(-MAX_MSGS))) } catch {}
    }
    bottomRef.current?.scrollIntoView({ behavior:"smooth" })
  }, [messages])

  const callAI = async (userMsg, extraContent) => {
    const jwt   = await getSessionToken()
    // Fetch live market data from MarketCharts and inject into system prompt
    const marketCtx = await fetchMarketContext(trades, supabase)
    const system = buildSystemPrompt(trades,playbooks,backtests,memory,selPlaybook,attachments,marketCtx)
    const history = messages.slice(-12).map(m=>({ role:m.role, content:m.content }))
    let content = userMsg
    if(extraContent?.length) {
      content = [{ type:"text", text:userMsg }, ...extraContent]
    }
    try {
      const res = await fetch("/api/sylledge-chat", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${jwt}` },
        body: JSON.stringify({ system, messages:[...history,{ role:"user",content }], max_tokens:4096 })
      })
      if(!res.ok) {
        const err = await res.text()
        return `SYLLEDGE error (${res.status}): ${err}`
      }
      const data = await res.json()
      if(data.error) return `SYLLEDGE error: ${data.error}`
      return data.content?.map(b=>b.text||"").join("") || "No response."
    } catch(e) { return "Connection error: "+e.message }
  }

  const sendMessage = async (text, extraContent) => {
    const msg = text || input.trim()
    if(!msg||loading) return
    setInput(""); setAttachments([])
    const userMsg = { role:"user", content:msg, timestamp:new Date().toISOString() }
    setMessages(prev=>[...prev,userMsg])
    setLoading(true)
    const raw = await callAI(msg, extraContent)
    const { clean, files, mdReq, memUpdate } = parseResp(raw)
    if(memUpdate) setMemory(m=>m?m+"\n"+memUpdate:memUpdate)
    const assistantMsg = { role:"assistant", content:clean, files, timestamp:new Date().toISOString() }
    setMessages(prev=>[...prev,assistantMsg])
    if(mdReq) { setEaStatus("requested"); toast.info("SYLLEDGE requested market data from your MT5 EA") }
    setLoading(false)
  }

  const handleAttach = async e => {
    const file = e.target.files?.[0]; if(!file)return
    const content = await new Promise(r=>{ const fr=new FileReader(); fr.onload=ev=>r(ev.target.result); if(file.type.startsWith("image/")||file.type==="application/pdf") fr.readAsDataURL(file); else fr.readAsText(file) })
    const att = { name:file.name, type:file.type, size:file.size, content }
    setAttachments(prev=>[...prev,att])
    let extra
    if(file.type.startsWith("image/")||file.type==="application/pdf") {
      extra = [{ type: file.type.startsWith("image/")?"image":"document", source:{ type:"base64", media_type:file.type, data:content.split(",")[1] } }]
    }
    await sendMessage(`I've uploaded ${file.name}. Please analyze it in context of my trading performance.`, extra)
  }

  const saveInsight = async (content, type="general") => {
    const saved = await SylledgeInsight.create({ content:content.slice(0,500), type })
    setInsights(prev=>[saved,...prev])
    toast.success("Insight saved!")
  }
  const deleteInsight = async id => {
    await SylledgeInsight.delete(id)
    setInsights(prev=>prev.filter(i=>i.id!==id))
  }
  const clearChat = () => {
    setMessages([{ role:"assistant", content:"Chat cleared. What would you like to analyze? 🎯", timestamp:new Date().toISOString() }])
    if(user?.id) localStorage.removeItem(MEMORY_KEY(user.id))
  }

  const wins   = trades.filter(t=>t.outcome==="WIN")
  const losses = trades.filter(t=>t.outcome==="LOSS")
  const netPnl = trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate= trades.length?(wins.length/trades.length*100).toFixed(1):"0.0"

  return (
    <div className="flex flex-col" style={{ height:"calc(100vh - 80px)", minHeight:0 }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)", boxShadow:"0 4px 18px rgba(108,99,255,0.35)" }}>
            <Brain size={22} className="text-white"/>
          </div>
          <div>
            <h1 className="gradient-text font-black" style={{ fontFamily:"var(--font-display)", fontSize:26 }}>{t("sylledge_title")}</h1>
            <p className="mono text-xs" style={{ color:"var(--text-muted)" }}>
              {trades.length} trades · {playbooks.length} strategies · {backtests.length} backtests
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* EA status pill */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold`}
            style={{ background:eaStatus==="requested"?"rgba(0,212,170,0.12)":"rgba(108,99,255,0.08)", border:`1px solid ${eaStatus==="requested"?"rgba(0,212,170,0.3)":"rgba(108,99,255,0.2)"}`, color:eaStatus==="requested"?"var(--accent-secondary)":"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
            <Activity size={10} className={eaStatus==="requested"?"animate-pulse":""}/>
            {eaStatus==="requested"?"EA data requested":"MT5 link idle"}
          </div>
          {/* Playbook selector */}
          <select value={selPlaybook} onChange={e=>setSelPlaybook(e.target.value)}
            className="h-8 rounded-xl px-3 text-xs border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
            <option value="">{t("sylledge_no_playbook")}</option>
            {playbooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={clearChat} className="btn btn-secondary h-8 gap-1.5 text-xs">
            <Trash2 size={11}/> Clear
          </button>
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────────────── */}
      <div className="sylledge-stats flex flex-wrap gap-2 mb-4 flex-shrink-0">
        {[
          { label:"Win Rate",  v:`${winRate}%`,  color:parseFloat(winRate)>=50?"var(--accent-success)":"var(--accent-danger)", icon:Target },
          { label:"Net P&L",   v:`${netPnl>=0?"+":""}$${netPnl.toFixed(0)}`, color:netPnl>=0?"var(--accent-success)":"var(--accent-danger)", icon:TrendingUp },
          { label:"Trades",    v:trades.length,  color:"var(--accent)",        icon:Activity },
          { label:"Insights",  v:insights.length,color:"var(--accent-secondary)", icon:Brain },
        ].map(s => (
          <div key={s.label} className="stat-card flex items-center gap-3 flex-none px-4 py-2.5">
            <div className="stat-card-icon" style={{ background:`${s.color}18` }}>
              <s.icon size={14} style={{ color:s.color }}/>
            </div>
            <div>
              <p className="stat-card-value mono" style={{ color:s.color, fontSize:16 }}>{s.v}</p>
              <p className="stat-card-label">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit flex-shrink-0" style={{ background:"var(--bg-elevated)" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background:tab===t.id?"var(--accent)":"transparent", color:tab===t.id?"#fff":"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
            <t.Icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {/* ── Chat Tab ─────────────────────────────────────────────────────────── */}
      {tab==="chat" && (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          {/* Quick prompts */}
          <div className="quick-prompts flex flex-wrap gap-2 flex-shrink-0">
            {QUICK_PROMPTS.map(p=>(
              <button key={p.label} onClick={()=>sendMessage(p.prompt)} disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold hover:opacity-80 transition-opacity"
                style={{ background:`${p.color}12`, border:`1px solid ${p.color}25`, color:p.color, fontFamily:"var(--font-display)" }}>
                <p.icon size={11}/>{p.label}
              </button>
            ))}
          </div>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto rounded-2xl p-4 space-y-4 min-h-0"
            style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
            {messages.map((m,i)=><MessageBubble key={i} msg={m} onSave={m.role==="assistant"?saveInsight:null}/>)}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
                  <Brain size={14} className="text-white"/>
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-tl-sm" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
                  <div className="flex gap-1.5">
                    {[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background:"var(--accent)", animationDelay:`${i*0.15}s` }}/>)}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>
          {/* Input */}
          <div className="flex-shrink-0 flex items-end gap-2">
            <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.csv,.txt" onChange={handleAttach}/>
            <button onClick={()=>fileRef.current?.click()} className="p-2.5 rounded-xl flex-shrink-0"
              style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", color:"var(--text-muted)" }}>
              <Paperclip size={16}/>
            </button>
            <textarea
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage()} }}
              placeholder=t("sylledge_placeholder")
              rows={1}
              className="flex-1 rounded-xl px-4 py-3 text-sm resize-none"
              style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", color:"var(--text-primary)", fontFamily:"var(--font-display)", minHeight:46, maxHeight:120 }}
            />
            <button onClick={()=>sendMessage()} disabled={loading||!input.trim()}
              className="p-3 rounded-xl flex-shrink-0 transition-all"
              style={{ background:input.trim()?"var(--accent)":"var(--bg-elevated)", color:input.trim()?"#fff":"var(--text-muted)", border:`1px solid ${input.trim()?"var(--accent)":"var(--border)"}`, opacity:loading?0.7:1 }}>
              <Send size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* ── Insights Tab ─────────────────────────────────────────────────────── */}
      {tab==="insights" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          {insights.length===0 ? (
            <div className="card py-16 text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background:"rgba(108,99,255,0.1)" }}>
                <Brain size={22} style={{ color:"var(--accent)" }}/>
              </div>
              <p className="font-bold mb-1" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>{t("sylledge_no_insights")}</p>
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>Click "Save insight" on any AI response to save it here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map(ins=>(
                <div key={ins.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:"rgba(108,99,255,0.12)" }}>
                        <Sparkles size={12} style={{ color:"var(--accent)" }}/>
                      </div>
                      <span className="badge badge-accent capitalize">{ins.type||"general"}</span>
                      <span className="mono text-xs" style={{ color:"var(--text-muted)", fontSize:10 }}>
                        {new Date(ins.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button onClick={()=>deleteInsight(ins.id)} className="p-1 rounded hover:opacity-70" style={{ color:"var(--text-muted)" }}>
                      <X size={13}/>
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ fontFamily:"var(--font-display)", color:"var(--text-secondary)" }}>{ins.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Charts Tab ───────────────────────────────────────────────────────── */}
      {tab==="charts" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="card py-12 text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background:"rgba(108,99,255,0.1)" }}>
              <LineChart size={22} style={{ color:"var(--accent)" }}/>
            </div>
            <p className="font-bold mb-1" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>{t("sylledge_market")}</p>
            <p className="text-sm mb-4" style={{ color:"var(--text-muted)" }}>Ask SYLLEDGE to generate a report — it will create downloadable HTML charts you can open in any browser.</p>
            <button onClick={()=>{ setTab("chat"); sendMessage("Generate a comprehensive performance report as a downloadable HTML file with interactive charts.") }}
              className="btn btn-primary">
              <Sparkles size={13}/> Generate Report
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
