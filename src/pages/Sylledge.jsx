// src/pages/Sylledge.jsx  — SYLLEDGE AI v3.0
// ✅ File generation from chat (HTML/CSV/JSON download)
// ✅ File upload (PDF, image, CSV — SYLLEDGE reads them)
// ✅ Market Data EA command system (SYLLEDGE requests candles on demand)
// ✅ Backtesting memory: compares user trades vs backtested strategies
// ✅ Deep strategy analysis: best session, entry time, SL, RR, winrate prediction
// ✅ Playbook integration in every analysis
// ✅ Advanced HTML report generation with interactive charts

import { useState, useEffect, useRef } from "react"
import { useUser }  from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import {
  Send, Bot, User, Sparkles, TrendingUp, BarChart2,
  FileText, Download, Upload, Brain, Zap,
  AlertCircle, CheckCircle, Clock, Target, Shield,
  BookOpen, Activity, Database, RefreshCw, X,
  MessageSquare, LineChart, Paperclip, File,
  FileSpreadsheet
} from "lucide-react"

const MODEL    = "claude-sonnet-4-20250514"
const MAX_MSGS = 40

const TABS = [
  { id:"chat",     label:"Chat",     Icon:MessageSquare },
  { id:"insights", label:"Insights", Icon:Brain },
  { id:"charts",   label:"Charts",   Icon:LineChart },
]

const QUICK_PROMPTS = [
  { label:"Best session for me",  icon:Clock,     prompt:"Based on my trade history, which trading session gives me the best results? Give a detailed breakdown with win rates, avg P&L, and specific hours." },
  { label:"Best entry times",     icon:Target,    prompt:"Analyze my entry times (entry_time field) across all sessions. When exactly should I enter? Build an entry time heatmap from my data." },
  { label:"SL improvement",       icon:Shield,    prompt:"Analyze my stop loss placements. Where should I have placed them based on market structure? Build an advanced SL strategy for my setups." },
  { label:"RR audit",             icon:TrendingUp,prompt:"Audit my risk/reward. Compare my actual RR vs market-offered RR. How do I improve my TP system? Give concrete rules." },
  { label:"Strategy vs Backtest", icon:Activity,  prompt:"Compare my live trading results vs my backtested strategies. Find the gap. What am I doing differently live vs backtest?" },
  { label:"Playbook deep dive",   icon:BookOpen,  prompt:"Examine my playbook strategies. Which ones perform best live? Which need refinement? Give specific rule improvements." },
  { label:"Win rate prediction",  icon:BarChart2, prompt:"Based on my patterns and data, predict my win rate for the next 20 trades if I follow my current setup strictly. Show your reasoning." },
  { label:"Generate report",      icon:FileText,  prompt:"Generate a comprehensive performance report as a downloadable HTML file with charts, statistics, session analysis, and AI recommendations." },
]

function fmtTime(iso){ return new Date(iso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) }
function fmtBytes(n){ if(n<1024)return n+" B"; if(n<1048576)return(n/1024).toFixed(1)+" KB"; return(n/1048576).toFixed(1)+" MB" }

function FileIcon({type}){
  if(type?.startsWith("image/"))         return <Sparkles size={12}/>
  if(type==="application/pdf")           return <FileText size={12}/>
  if(type?.includes("csv"))              return <FileSpreadsheet size={12}/>
  return <File size={12}/>
}

// ════════════════════════════════════════════════════════════════════
export default function Sylledge() {
  const { user } = useUser()

  const [tab,        setTab]        = useState("chat")
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState("")
  const [loading,    setLoading]    = useState(false)
  const [apiKey,     setApiKey]     = useState("")
  const [memory,     setMemory]     = useState("")
  const [trades,     setTrades]     = useState([])
  const [playbooks,  setPlaybooks]  = useState([])
  const [backtests,  setBacktests]  = useState([])
  const [selPlaybook,setSelPlaybook]= useState("")
  const [attachments,setAttachments]= useState([])
  const [insights,   setInsights]   = useState([])
  const [chartData,  setChartData]  = useState([])
  const [eaStatus,   setEaStatus]   = useState("idle")

  const bottomRef = useRef(null)
  const fileRef   = useRef(null)

  useEffect(() => {
    setApiKey(localStorage.getItem("ts_anthropic_key")||"")
    loadAll()
    loadMemory()
  }, [user?.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}) }, [messages,loading])

  async function loadAll() {
    if(!user?.id) return
    const [{ data:t },{ data:p },{ data:b }] = await Promise.all([
      supabase.from("trades").select("*").eq("user_id",user.id).order("exit_time",{ascending:false}).limit(500),
      supabase.from("playbooks").select("*").eq("user_id",user.id),
      supabase.from("backtest_sessions").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(20),
    ])
    if(t){ setTrades(t); buildInsights(t,b||[]) }
    if(p) setPlaybooks(p)
    if(b) setBacktests(b)
  }

  async function loadMemory() {
    if(!user?.id) return
    try {
      const { data } = await supabase.from("sylledge_memory").select("content").eq("user_id",user.id).single()
      if(data?.content) setMemory(data.content)
    } catch { const l=localStorage.getItem("sylledge_memory"); if(l) setMemory(l) }
  }

  async function saveMemory(content) {
    setMemory(content)
    localStorage.setItem("sylledge_memory",content)
    if(!user?.id) return
    await supabase.from("sylledge_memory").upsert({user_id:user.id,content,updated_at:new Date().toISOString()},{onConflict:"user_id"})
  }

  function buildInsights(t,b) {
    if(!t.length) return
    const wins  = t.filter(x=>x.outcome==="WIN")
    const losses= t.filter(x=>x.outcome==="LOSS")
    const wr    = (wins.length/t.length*100).toFixed(1)
    const pnl   = t.reduce((s,x)=>s+(x.total_pnl||0),0)
    const avgW  = wins.length?wins.reduce((s,x)=>s+(x.total_pnl||0),0)/wins.length:0
    const avgL  = losses.length?losses.reduce((s,x)=>s+(x.total_pnl||0),0)/losses.length:0

    const sess = {}
    t.forEach(x=>{ if(!x.session)return; if(!sess[x.session])sess[x.session]={w:0,n:0,p:0}; sess[x.session].n++; sess[x.session].p+=(x.total_pnl||0); if(x.outcome==="WIN")sess[x.session].w++ })
    const bestS = Object.entries(sess).sort((a,b)=>(b[1].w/b[1].n)-(a[1].w/a[1].n))[0]

    const tf = {}
    t.forEach(x=>{ if(!x.timeframe)return; if(!tf[x.timeframe])tf[x.timeframe]={w:0,n:0}; tf[x.timeframe].n++; if(x.outcome==="WIN")tf[x.timeframe].w++ })
    const bestTF = Object.entries(tf).sort((a,b)=>(b[1].w/b[1].n)-(a[1].w/a[1].n))[0]

    setInsights([
      { label:"Win Rate",    value:wr+"%",           color:parseFloat(wr)>50?"var(--accent-success)":"var(--accent-danger)" },
      { label:"Total P&L",  value:"$"+pnl.toFixed(2),color:pnl>=0?"var(--accent-success)":"var(--accent-danger)" },
      { label:"Avg Win",    value:"$"+avgW.toFixed(2),color:"var(--accent-success)" },
      { label:"Avg Loss",   value:"$"+avgL.toFixed(2),color:"var(--accent-danger)" },
      { label:"Best Session",value:bestS?.[0]||"N/A", color:"var(--accent)" },
      { label:"Best TF",    value:bestTF?.[0]||"N/A", color:"var(--accent-secondary)" },
    ])

    const qd = [1,2,3,4,5,6,7,8,9,10].map(q=>{
      const g=t.filter(x=>(x.quality||5)===q)
      return { q, n:g.length, avg:g.length?g.reduce((s,x)=>s+(x.total_pnl||0),0)/g.length:0 }
    }).filter(x=>x.n>0)
    setChartData(qd)
  }

  // ── File attach ────────────────────────────────────────────────────────────
  async function handleFiles(e) {
    const files = Array.from(e.target.files)
    const atts  = []
    for(const f of files) {
      if(f.size > 5*1024*1024){ alert(f.name+" too large (max 5MB)"); continue }
      await new Promise(res => {
        const r = new FileReader()
        r.onload = async () => {
          if(f.type.startsWith("image/")) {
            atts.push({ name:f.name, type:f.type, size:f.size, b64:r.result.split(",")[1], isImage:true })
          } else if(f.type==="application/pdf") {
            atts.push({ name:f.name, type:f.type, size:f.size, b64:r.result.split(",")[1], isPdf:true })
          } else {
            atts.push({ name:f.name, type:f.type, size:f.size, text:await f.text(), isText:true })
          }
          res()
        }
        if(f.type.startsWith("image/")||f.type==="application/pdf") r.readAsDataURL(f)
        else r.readAsText(f)
      })
    }
    setAttachments(p=>[...p,...atts])
    fileRef.current.value=""
  }

  // ── Market data request ────────────────────────────────────────────────────
  async function reqMarketData(symbol,timeframe,from,to) {
    if(!user?.id) return null
    setEaStatus("requesting")
    try {
      const { data:cmd } = await supabase.from("sylledge_commands")
        .insert({ user_id:user.id, type:"fetch_candles", symbol, timeframe, from:from||null, to:to||null, limit:1000, status:"pending" })
        .select().single()
      if(!cmd){ setEaStatus("idle"); return null }
      for(let i=0;i<30;i++){
        await new Promise(r=>setTimeout(r,1000))
        const { data:u } = await supabase.from("sylledge_commands").select("status,response").eq("id",cmd.id).single()
        if(u?.status==="done"){ setEaStatus("received"); setTimeout(()=>setEaStatus("idle"),3000); return u.response }
        if(u?.status==="error"){ setEaStatus("idle"); return null }
      }
    } catch {}
    setEaStatus("idle")
    return null
  }

  // ── System prompt ─────────────────────────────────────────────────────────
  function buildSystem() {
    const wins   = trades.filter(x=>x.outcome==="WIN")
    const losses = trades.filter(x=>x.outcome==="LOSS")
    const wr     = trades.length?(wins.length/trades.length*100).toFixed(1):"0"
    const pnl    = trades.reduce((s,x)=>s+(x.total_pnl||0),0).toFixed(2)
    const avgQ   = trades.length?(trades.reduce((s,x)=>s+(x.quality||5),0)/trades.length).toFixed(1):"5"

    const sess = {}
    trades.forEach(x=>{ if(!x.session)return; if(!sess[x.session])sess[x.session]={w:0,n:0,p:0}; sess[x.session].n++; sess[x.session].p+=(x.total_pnl||0); if(x.outcome==="WIN")sess[x.session].w++ })
    const sessStr = Object.entries(sess).map(([s,v])=>`${s}:${v.n}trades,${(v.w/v.n*100).toFixed(0)}%WR,$${v.p.toFixed(2)}`).join(" | ")

    const hourMap = {}
    trades.forEach(x=>{ if(!x.entry_time)return; const h=new Date(x.entry_time).getUTCHours(); if(!hourMap[h])hourMap[h]={w:0,n:0}; hourMap[h].n++; if(x.outcome==="WIN")hourMap[h].w++ })
    const bestHours = Object.entries(hourMap).filter(([,v])=>v.n>=3).sort((a,b)=>(b[1].w/b[1].n)-(a[1].w/a[1].n)).slice(0,5).map(([h,v])=>`${h}:00UTC(${(v.w/v.n*100).toFixed(0)}%WR,${v.n}trades)`).join(", ")

    const pb = selPlaybook ? playbooks.find(p=>p.id===selPlaybook) : null
    const pbTxt = pb ? `\n\nACTIVE PLAYBOOK: "${pb.name}"\n${pb.description||""}\nRules:${JSON.stringify(pb.rules||{})}` : ""

    const btTxt = backtests.length
      ? "\n\nBACKTESTED STRATEGIES:\n"+backtests.slice(0,5).map(b=>`• ${b.name||"Strategy"}: ${b.total_trades||0}trades,${b.win_rate||0}%WR,$${b.total_pnl||0}`).join("\n")
      : ""

    const sample = trades.slice(0,20).map(t=>`${t.symbol} ${t.direction} ${t.outcome} $${(t.total_pnl||0).toFixed(2)} Q:${t.quality||5} Sess:${t.session||"?"} TF:${t.timeframe||"?"} In:${t.entry_time?new Date(t.entry_time).toISOString().slice(11,16):""} Out:${t.exit_time?new Date(t.exit_time).toISOString().slice(11,16):""}`).join("\n")

    return `You are SYLLEDGE, an elite professional trading coach and quant analyst embedded in TradeSylla. You have deep knowledge of price action, market structure, risk management, and trading psychology.

TRADER DATA:
Trades: ${trades.length} | Win Rate: ${wr}% | P&L: $${pnl} | Avg Quality: ${avgQ}/10
Sessions: ${sessStr||"none yet"}
Best Entry Hours: ${bestHours||"not enough data"}
${pbTxt}${btTxt}

RECENT TRADES:
${sample||"none yet"}

YOUR MEMORY:
${memory||"no memory yet"}

YOUR CAPABILITIES:
1. DEEP ANALYSIS of entry times, sessions, SL, TP, RR — use the actual data above
2. MARKET DATA: request live candles from MT5 EA using <<<REQUEST_MARKET_DATA>>>
3. BACKTEST COMPARISON: compare live vs backtest results
4. FILE GENERATION: create downloadable reports, CSVs, interactive HTML charts
5. FILE READING: read uploaded PDFs, images, CSVs
6. STRATEGY INTEGRATION: use the active playbook in all recommendations
7. RISK MANAGEMENT: position sizing, session exposure, max daily loss rules

FILE GENERATION:
When user wants a file/report:
• HTML report: <<<HTML_FILE>>><!DOCTYPE html>...</html><<<END_HTML>>>
• CSV: <<<CSV_FILE>>>header1,header2\nval1,val2<<<END_CSV>>>
• JSON: <<<JSON_FILE>>>{...}<<<END_JSON>>>

MARKET DATA REQUEST:
<<<REQUEST_MARKET_DATA>>>{"symbol":"XAUUSD","timeframe":"H1","from":"2025-01-01","to":"2025-03-01"}<<<END_REQUEST>>>

MEMORY UPDATE (end of important conversations):
<<<MEMORY_UPDATE>>>key finding about this trader<<<END_MEMORY>>>

Be specific, data-driven, and actionable. You have their actual trade data above — use it.`
  }

  // ── Parse AI response ─────────────────────────────────────────────────────
  function parseResp(text) {
    const files=[]; let clean=text; let mdReq=null

    const htmlM=text.match(/<<<HTML_FILE>>>([\s\S]*?)<<<END_HTML>>>/)
    if(htmlM){ files.push({type:"html",name:"sylledge_report.html",content:htmlM[1].trim()}); clean=clean.replace(htmlM[0],"") }

    const csvM=text.match(/<<<CSV_FILE>>>([\s\S]*?)<<<END_CSV>>>/)
    if(csvM){ files.push({type:"csv",name:"sylledge_data.csv",content:csvM[1].trim()}); clean=clean.replace(csvM[0],"") }

    const jsonM=text.match(/<<<JSON_FILE>>>([\s\S]*?)<<<END_JSON>>>/)
    if(jsonM){ files.push({type:"json",name:"sylledge_analysis.json",content:jsonM[1].trim()}); clean=clean.replace(jsonM[0],"") }

    const mdM=text.match(/<<<REQUEST_MARKET_DATA>>>([\s\S]*?)<<<END_REQUEST>>>/)
    if(mdM){ try{ mdReq=JSON.parse(mdM[1].trim()) }catch{} ; clean=clean.replace(mdM[0],"") }

    const memM=text.match(/<<<MEMORY_UPDATE>>>([\s\S]*?)<<<END_MEMORY>>>/)
    if(memM){ saveMemory(((memory?memory+"\n\n":"")+memM[1].trim()).slice(-4000)); clean=clean.replace(memM[0],"") }

    return { clean:clean.trim(), files, mdReq }
  }

  // ── Download ───────────────────────────────────────────────────────────────
  function download(f) {
    const mime={html:"text/html",csv:"text/csv",json:"application/json"}
    const blob=new Blob([f.content],{type:mime[f.type]||"text/plain"})
    const url=URL.createObjectURL(blob)
    const a=document.createElement("a"); a.href=url; a.download=f.name; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Build API messages ─────────────────────────────────────────────────────
  function buildContent(text, atts) {
    if(!atts.length) return text
    const parts=[]
    atts.forEach(a=>{
      if(a.isImage) parts.push({type:"image",source:{type:"base64",media_type:a.type,data:a.b64}})
      else if(a.isPdf) parts.push({type:"document",source:{type:"base64",media_type:"application/pdf",data:a.b64}})
      else parts.push({type:"text",text:`[File: ${a.name}]\n${a.text}`})
    })
    parts.push({type:"text",text})
    return parts
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  async function send(override) {
    const text=(override||input).trim()
    if(!text&&!attachments.length) return
    if(!apiKey){ alert("Add Anthropic API key in Settings → API Keys"); return }

    const atts=[...attachments]
    const userMsg={ id:Date.now(), role:"user", content:text,
      attachments:atts.map(a=>({name:a.name,type:a.type,size:a.size})),
      time:new Date().toISOString() }
    setMessages(p=>[...p,userMsg])
    setInput(""); setAttachments([]); setLoading(true)

    try {
      const history=messages.slice(-MAX_MSGS).map(m=>({
        role:m.role, content:m._rawContent||m.content||""
      }))
      history.push({role:"user",content:buildContent(text,atts)})

      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
        body:JSON.stringify({ model:MODEL, max_tokens:4096, system:buildSystem(), messages:history })
      })
      const data=await res.json()
      const raw=data.content?.map(c=>c.text||"").join("")||"No response"
      const { clean, files, mdReq } = parseResp(raw)

      if(mdReq) {
        // Show partial response then fetch market data
        const partialId=Date.now()+1
        setMessages(p=>[...p,{id:partialId,role:"assistant",content:clean+"\n\n⏳ Fetching market data from your MT5 EA…",files:[],time:new Date().toISOString()}])

        const mdData=await reqMarketData(mdReq.symbol,mdReq.timeframe,mdReq.from,mdReq.to)

        const followRes=await fetch("https://api.anthropic.com/v1/messages",{
          method:"POST",
          headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},
          body:JSON.stringify({
            model:MODEL, max_tokens:4096, system:buildSystem(),
            messages:[
              ...history,
              {role:"assistant",content:raw},
              {role:"user",content:mdData
                ? `Market data received from MT5 EA:\n${JSON.stringify(mdData,null,2)}\n\nNow complete your full analysis using this data.`
                : "The MT5 EA is offline or not responding. Complete your analysis using only the available trade history data."}
            ]
          })
        })
        const fd=await followRes.json()
        const fr=fd.content?.map(c=>c.text||"").join("")||""
        const { clean:fc, files:ff } = parseResp(fr)
        setMessages(p=>p.map(m=>m.id===partialId?{...m,content:fc,files:[...files,...ff]}:m))
      } else {
        setMessages(p=>[...p,{id:Date.now()+1,role:"assistant",content:clean,files,_rawContent:raw,time:new Date().toISOString()}])
      }
    } catch(err) {
      setMessages(p=>[...p,{id:Date.now()+1,role:"assistant",content:"Error: "+err.message,files:[],time:new Date().toISOString()}])
    }
    setLoading(false)
  }

  const noKey = !apiKey

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))"}}>
            <Bot size={20} className="text-white"/>
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{color:"var(--text-primary)"}}>SYLLEDGE AI</h1>
            <p className="text-xs" style={{color:"var(--text-muted)"}}>
              {trades.length} trades · {playbooks.length} strategies · {backtests.length} backtests
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {eaStatus!=="idle"&&(
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{background:eaStatus==="received"?"rgba(46,213,115,0.15)":"rgba(108,99,255,0.15)",
                border:`1px solid ${eaStatus==="received"?"var(--accent-success)":"var(--accent)"}`,
                color:eaStatus==="received"?"var(--accent-success)":"var(--accent)"}}>
              {eaStatus==="requesting"?<><RefreshCw size={11} className="animate-spin"/> Requesting EA data…</>:<><CheckCircle size={11}/> Data received!</>}
            </div>
          )}
          {playbooks.length>0&&(
            <select value={selPlaybook} onChange={e=>setSelPlaybook(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg border"
              style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-secondary)"}}>
              <option value="">No playbook</option>
              {playbooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-4 flex-shrink-0 w-fit"
        style={{background:"var(--bg-elevated)"}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{background:tab===t.id?"var(--accent)":"transparent",color:tab===t.id?"#fff":"var(--text-muted)"}}>
            <t.Icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {noKey&&(
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-4 flex-shrink-0"
          style={{background:"rgba(255,165,2,0.08)",border:"1px solid rgba(255,165,2,0.3)"}}>
          <AlertCircle size={16} style={{color:"var(--accent-warning)"}}/>
          <p className="text-sm" style={{color:"var(--text-secondary)"}}>
            Add your Anthropic API key in <strong style={{color:"var(--text-primary)"}}>Settings → API Keys</strong> to activate SYLLEDGE.
          </p>
        </div>
      )}

      {/* ── CHAT TAB ─────────────────────────────────────────────────────── */}
      {tab==="chat"&&(
        <div className="flex flex-col flex-1 min-h-0">
          {/* Quick prompts */}
          <div className="flex gap-2 overflow-x-auto pb-2 flex-shrink-0 mb-3">
            {QUICK_PROMPTS.map(qp=>(
              <button key={qp.label} onClick={()=>send(qp.prompt)} disabled={loading||noKey}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 border hover:opacity-80"
                style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-secondary)",opacity:(loading||noKey)?0.5:1}}>
                <qp.icon size={12} style={{color:"var(--accent)"}}/>{qp.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
            {messages.length===0&&(
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))"}}>
                  <Sparkles size={28} className="text-white"/>
                </div>
                <h3 className="text-lg font-bold mb-2" style={{color:"var(--text-primary)"}}>SYLLEDGE is ready</h3>
                <p className="text-sm max-w-md" style={{color:"var(--text-muted)"}}>
                  Ask about your sessions, entry times, SL strategy, or request a full HTML report. Upload PDFs, CSVs, or screenshots to analyze.
                </p>
              </div>
            )}

            {messages.map(msg=>(
              <div key={msg.id} className={`flex gap-3 ${msg.role==="user"?"flex-row-reverse":""}`}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{background:msg.role==="assistant"?"linear-gradient(135deg,var(--accent),var(--accent-secondary))":"var(--bg-elevated)"}}>
                  {msg.role==="assistant"?<Bot size={15} className="text-white"/>:<User size={15} style={{color:"var(--text-muted)"}}/>}
                </div>
                <div className={`max-w-[80%] space-y-2 flex flex-col ${msg.role==="user"?"items-end":""}`}>
                  {msg.attachments?.length>0&&(
                    <div className="flex flex-wrap gap-1.5">
                      {msg.attachments.map((a,i)=>(
                        <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                          style={{background:"var(--bg-elevated)",border:"1px solid var(--border)",color:"var(--text-muted)"}}>
                          <FileIcon type={a.type}/><span className="max-w-20 truncate">{a.name}</span>
                          <span>{fmtBytes(a.size)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-4 py-3 rounded-2xl"
                    style={{
                      background:msg.role==="assistant"?"var(--bg-card)":"var(--accent)",
                      border:msg.role==="assistant"?"1px solid var(--border)":"none",
                      color:msg.role==="assistant"?"var(--text-primary)":"#fff",
                      borderRadius:msg.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",
                    }}>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  </div>
                  {msg.files?.map((f,i)=>(
                    <button key={i} onClick={()=>download(f)}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border hover:opacity-80"
                      style={{background:"rgba(46,213,115,0.1)",borderColor:"var(--accent-success)",color:"var(--accent-success)"}}>
                      <Download size={14}/> Download {f.name} <span className="text-xs opacity-60 uppercase">.{f.type}</span>
                    </button>
                  ))}
                  <p className="text-xs px-1" style={{color:"var(--text-muted)"}}>{fmtTime(msg.time)}</p>
                </div>
              </div>
            ))}

            {loading&&(
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))"}}>
                  <Bot size={15} className="text-white"/>
                </div>
                <div className="px-4 py-3 rounded-2xl flex items-center gap-2"
                  style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
                  {[0,1,2].map(i=><div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{background:"var(--accent)",animationDelay:`${i*0.15}s`}}/>)}
                </div>
              </div>
            )}
            <div ref={bottomRef}/>
          </div>

          {/* Input */}
          <div className="mt-3 flex-shrink-0">
            {attachments.length>0&&(
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((a,i)=>(
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs"
                    style={{background:"var(--bg-elevated)",border:"1px solid var(--accent)",color:"var(--text-secondary)"}}>
                    <FileIcon type={a.type}/><span className="max-w-24 truncate">{a.name}</span>
                    <button onClick={()=>setAttachments(p=>p.filter((_,j)=>j!==i))} className="hover:opacity-70 ml-1"><X size={11}/></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative rounded-2xl overflow-hidden"
                style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
                <textarea value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}}
                  placeholder="Ask SYLLEDGE… (Shift+Enter for new line)"
                  rows={1} disabled={loading||noKey}
                  className="w-full px-4 py-3 pr-10 text-sm resize-none bg-transparent outline-none"
                  style={{color:"var(--text-primary)",maxHeight:120}}/>
                <button onClick={()=>fileRef.current?.click()}
                  className="absolute right-3 bottom-3 hover:opacity-70"
                  style={{color:"var(--text-muted)"}}>
                  <Paperclip size={16}/>
                </button>
                <input ref={fileRef} type="file" multiple
                  accept=".pdf,.csv,.json,.txt,.png,.jpg,.jpeg,.webp"
                  className="hidden" onChange={handleFiles}/>
              </div>
              <button onClick={()=>send()} disabled={loading||noKey||(!input.trim()&&!attachments.length)}
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background:(loading||noKey||(!input.trim()&&!attachments.length))?"var(--bg-elevated)":"linear-gradient(135deg,var(--accent),var(--accent-secondary))",
                  opacity:(loading||noKey||(!input.trim()&&!attachments.length))?0.5:1,
                }}>
                <Send size={16} className="text-white"/>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INSIGHTS TAB ─────────────────────────────────────────────────── */}
      {tab==="insights"&&(
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {insights.map(ins=>(
              <div key={ins.label} className="rounded-xl p-4"
                style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
                <p className="text-xs mb-1" style={{color:"var(--text-muted)"}}>{ins.label}</p>
                <p className="text-xl font-bold" style={{color:ins.color}}>{ins.value}</p>
              </div>
            ))}
          </div>
          {chartData.length>0&&(
            <div className="rounded-2xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
              <div className="px-4 py-3" style={{borderBottom:"1px solid var(--border)"}}>
                <h3 className="font-semibold text-sm" style={{color:"var(--text-primary)"}}>Quality Score → Avg P&L</h3>
              </div>
              {chartData.map(r=>(
                <div key={r.q} className="flex items-center gap-4 px-4 py-2.5 border-b" style={{borderColor:"var(--border)"}}>
                  <span className="w-12 text-sm font-bold" style={{color:"var(--accent)"}}>{r.q}/10</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:"var(--bg-elevated)"}}>
                    <div className="h-full rounded-full" style={{width:`${Math.min(100,Math.abs(r.avg)/3)}%`,background:r.avg>=0?"var(--accent-success)":"var(--accent-danger)"}}/>
                  </div>
                  <span className="text-sm font-semibold w-20 text-right" style={{color:r.avg>=0?"var(--accent-success)":"var(--accent-danger)"}}>
                    ${r.avg.toFixed(2)}
                  </span>
                  <span className="text-xs w-14 text-right" style={{color:"var(--text-muted)"}}>{r.n} trades</span>
                </div>
              ))}
            </div>
          )}
          {backtests.length>0&&(
            <div className="rounded-2xl overflow-hidden" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
              <div className="px-4 py-3" style={{borderBottom:"1px solid var(--border)"}}>
                <h3 className="font-semibold text-sm" style={{color:"var(--text-primary)"}}>Backtested vs Live</h3>
              </div>
              {backtests.slice(0,5).map(b=>(
                <div key={b.id} className="px-4 py-3 flex justify-between border-b" style={{borderColor:"var(--border)"}}>
                  <div><p className="text-sm font-medium" style={{color:"var(--text-primary)"}}>{b.name||"Strategy"}</p>
                    <p className="text-xs" style={{color:"var(--text-muted)"}}>{b.total_trades||0} trades backtested</p></div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{color:(b.win_rate||0)>50?"var(--accent-success)":"var(--accent-danger)"}}>{b.win_rate||0}% WR</p>
                    <p className="text-xs" style={{color:(b.total_pnl||0)>=0?"var(--accent-success)":"var(--accent-danger)"}}>${ (b.total_pnl||0).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {insights.length===0&&<div className="text-center py-12"><Database size={32} className="mx-auto mb-3" style={{color:"var(--text-muted)"}}/><p style={{color:"var(--text-muted)"}}>Sync your MT5 EA to see insights.</p></div>}
        </div>
      )}

      {/* ── CHARTS TAB ───────────────────────────────────────────────────── */}
      {tab==="charts"&&(
        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="rounded-2xl p-4" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
            <h3 className="font-semibold mb-1" style={{color:"var(--text-primary)"}}>Trade Performance by Symbol</h3>
            <p className="text-xs mb-4" style={{color:"var(--text-muted)"}}>Showing latest {Math.min(15,trades.length)} trades</p>
            <div className="space-y-2">
              {trades.slice(0,15).map(t=>{
                const p=t.total_pnl||0
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2 border-b" style={{borderColor:"var(--border)"}}>
                    <span className="text-xs font-bold w-14" style={{color:"var(--text-muted)"}}>{t.symbol}</span>
                    <span className="text-xs w-8" style={{color:t.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)"}}>{t.direction}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{background:"var(--bg-elevated)"}}>
                      <div className="h-full rounded-full" style={{width:`${Math.min(100,Math.abs(p)/5)}%`,background:p>=0?"var(--accent-success)":"var(--accent-danger)"}}/>
                    </div>
                    <span className="text-xs font-bold w-20 text-right" style={{color:p>=0?"var(--accent-success)":"var(--accent-danger)"}}>{p>=0?"+":""}{p.toFixed(2)}</span>
                    <span className="text-xs w-10 text-right" style={{color:"var(--text-muted)"}}>{t.quality||5}/10</span>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="text-center py-4">
            <button onClick={()=>{ setTab("chat"); setTimeout(()=>send("Generate a full interactive HTML performance report with: session heatmap, entry time analysis, quality vs P&L chart, win/loss breakdown, SL analysis, and AI recommendations. Make it professional with inline CSS and Chart.js charts."),100) }}
              disabled={noKey}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))",opacity:noKey?0.5:1}}>
              <Sparkles size={14}/>Generate Full HTML Report
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
