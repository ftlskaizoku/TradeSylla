// src/pages/Backtesting.jsx — TradeZella-style Chart Replay v4
import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { BacktestSession, Playbook } from "@/api/supabaseStore"
import { supabase } from "@/lib/supabase"
import { useLanguage } from "@/lib/LanguageContext"
import { toast } from "@/components/ui/toast"
import {
  Plus, ChevronRight, ChevronLeft, Pencil, Trash2, X,
  FlaskConical, TrendingUp, TrendingDown, Trophy, Target,
  BarChart2, BookOpen, Activity, DollarSign, Play, Pause,
  SkipForward, SkipBack, FastForward, Rewind, CheckSquare,
  Square, Shield, Zap
} from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar, Cell, ReferenceLine,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts"

const SYMBOLS=["EURUSD","GBPUSD","USDJPY","USDCHF","USDCAD","AUDUSD","NZDUSD","GBPJPY","EURJPY","GBPAUD","GBPCAD","AUDJPY","EURGBP","EURNZD","XAUUSD","XAGUSD","US30","NAS100","SPX500","UK100","GER30","DE30","FRA40","JPN225","AUS200","BTCUSD","ETHUSD","BNBUSD","XRPUSD","USOIL","UKOIL"]
const TFS      = ["M1","M5","M15","M30","H1","H4","D1"]
const SPEEDS   = [{ label:"1×",ms:800 },{ label:"2×",ms:400 },{ label:"4×",ms:200 },{ label:"8×",ms:100 }]

function calcRR(entry, sl, tp) {
  const e=parseFloat(entry),s=parseFloat(sl),t=parseFloat(tp)
  if(!e||!s||!t) return null
  const risk=Math.abs(e-s),reward=Math.abs(t-e)
  return risk>0?(reward/risk).toFixed(2):null
}

function calcStats(trades,initialCapital) {
  const wins=trades.filter(t=>t.outcome==="WIN")
  const losses=trades.filter(t=>t.outcome==="LOSS")
  const netPnl=trades.reduce((s,t)=>s+(t.pnl||0),0)
  const winRate=trades.length?wins.length/trades.length*100:0
  const avgWin=wins.length?wins.reduce((s,t)=>s+(t.pnl||0),0)/wins.length:0
  const avgLoss=losses.length?Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0)/losses.length):0
  const pf=avgLoss>0?avgWin/avgLoss:avgWin>0?99:0
  const exp=trades.length?netPnl/trades.length:0
  const roi=initialCapital>0?netPnl/initialCapital*100:0
  let bal=initialCapital,peak=initialCapital,maxDD=0
  const curve=trades.map((t,i)=>{
    bal+=t.pnl||0
    if(bal>peak)peak=bal
    if(peak>0)maxDD=Math.min(maxDD,(bal-peak)/peak*100)
    return{i:i+1,balance:parseFloat(bal.toFixed(2)),pnl:t.pnl||0,
      date:t.entry_time?new Date(t.entry_time).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit"}):`T${i+1}`}
  })
  let maxCL=0,cl=0
  trades.forEach(t=>{if(t.outcome==="LOSS"){cl++;maxCL=Math.max(maxCL,cl)}else cl=0})
  const ddCurve=(()=>{
    let p=initialCapital
    return curve.map(pt=>{
      if(pt.balance>p)p=pt.balance
      return{...pt,drawdown:p>0?parseFloat(((pt.balance-p)/p*100).toFixed(2)):0}
    })
  })()
  return{wins:wins.length,losses:losses.length,netPnl,winRate,avgWin,avgLoss,pf,exp,roi,maxDD,maxCL,curve,ddCurve}
}

// ─── Live Candlestick Chart ────────────────────────────────────────────────────
function LiveCandleChart({candles,openTrade,sessionInfo={}}){
  if(!candles||candles.length===0) return(
    <div className="flex items-center justify-center h-full flex-col gap-3 text-center px-8" style={{color:"var(--text-muted)"}}>
      <BarChart2 size={32}/>
      <p className="text-sm font-semibold" style={{color:"var(--text-primary)"}}>No candle data for {sessionInfo.symbol||"this symbol"} {sessionInfo.timeframe||""}</p>
      <p className="text-xs max-w-xs">Your MT5 EA (TradeSylla_MarketData.mq5) must sync data for this symbol/timeframe first. Go to Broker Sync and check the EA is running on this chart.</p>
    </div>
  )
  const W=900,H=340,PAD={top:12,right:72,bottom:28,left:8}
  const cW=W-PAD.left-PAD.right,cH=H-PAD.top-PAD.bottom
  const visible=candles.slice(-80)
  const highs=visible.map(c=>parseFloat(c.h||c.high_price))
  const lows=visible.map(c=>parseFloat(c.l||c.low_price))
  const allPrices=[...highs,...lows]
  if(openTrade?.entry_price)allPrices.push(parseFloat(openTrade.entry_price))
  if(openTrade?.sl_price&&parseFloat(openTrade.sl_price)>0)allPrices.push(parseFloat(openTrade.sl_price))
  if(openTrade?.tp_price&&parseFloat(openTrade.tp_price)>0)allPrices.push(parseFloat(openTrade.tp_price))
  const minP=Math.min(...allPrices)*0.9995,maxP=Math.max(...allPrices)*1.0005
  const range=(maxP-minP)||1
  const toX=i=>PAD.left+(i/(visible.length-1||1))*cW
  const toY=p=>PAD.top+cH-((parseFloat(p)-minP)/range)*cH
  const candleW=Math.max(2,Math.min(12,cW/visible.length*0.7))
  const priceLabels=Array.from({length:6},(_,i)=>minP+(range*i/5))
  const fmtP=p=>{const n=parseFloat(p);return n>=1000?n.toFixed(2):n>=10?n.toFixed(3):n.toFixed(5)}
  const lastC=visible[visible.length-1]
  const lastPrice=lastC?parseFloat(lastC.c||lastC.close_price):null
  return(
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{width:"100%",height:"100%"}}>
      {priceLabels.map((p,i)=>(
        <g key={i}>
          <line x1={PAD.left} y1={toY(p)} x2={W-PAD.right} y2={toY(p)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.5"/>
          <text x={W-PAD.right+4} y={toY(p)+3.5} fontSize="9" fill="var(--text-muted)" fontFamily="monospace">{fmtP(p)}</text>
        </g>
      ))}
      {visible.map((c,i)=>{
        const o=parseFloat(c.o||c.open_price),h=parseFloat(c.h||c.high_price)
        const l=parseFloat(c.l||c.low_price),cl=parseFloat(c.c||c.close_price)
        const bull=cl>=o,color=bull?"#2ed573":"#ff4757"
        const x=toX(i),bodyTop=toY(Math.max(o,cl)),bodyH=Math.max(1,Math.abs(toY(o)-toY(cl)))
        return(
          <g key={i}>
            <line x1={x} y1={toY(h)} x2={x} y2={toY(l)} stroke={color} strokeWidth="1"/>
            <rect x={x-candleW/2} y={bodyTop} width={candleW} height={bodyH} fill={bull?"rgba(46,213,115,0.85)":"rgba(255,71,87,0.85)"} stroke={color} strokeWidth="0.5" rx="0.5"/>
          </g>
        )
      })}
      {openTrade?.entry_price&&(<>
        <line x1={PAD.left} y1={toY(openTrade.entry_price)} x2={W-PAD.right} y2={toY(openTrade.entry_price)} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="6 3"/>
        <rect x={W-PAD.right} y={toY(openTrade.entry_price)-9} width={PAD.right-2} height={17} fill="var(--accent)" rx="2"/>
        <text x={W-PAD.right+3} y={toY(openTrade.entry_price)+4} fontSize="9" fill="white" fontFamily="monospace">{fmtP(openTrade.entry_price)}</text>
      </>)}
      {openTrade?.sl_price&&parseFloat(openTrade.sl_price)>0&&(<>
        <line x1={PAD.left} y1={toY(openTrade.sl_price)} x2={W-PAD.right} y2={toY(openTrade.sl_price)} stroke="#ff4757" strokeWidth="1" strokeDasharray="4 4"/>
        <rect x={W-PAD.right} y={toY(openTrade.sl_price)-8} width={PAD.right-2} height={15} fill="#ff4757" rx="2" opacity="0.9"/>
        <text x={W-PAD.right+3} y={toY(openTrade.sl_price)+3.5} fontSize="8.5" fill="white" fontFamily="monospace">SL {fmtP(openTrade.sl_price)}</text>
      </>)}
      {openTrade?.tp_price&&parseFloat(openTrade.tp_price)>0&&(<>
        <line x1={PAD.left} y1={toY(openTrade.tp_price)} x2={W-PAD.right} y2={toY(openTrade.tp_price)} stroke="#2ed573" strokeWidth="1" strokeDasharray="4 4"/>
        <rect x={W-PAD.right} y={toY(openTrade.tp_price)-8} width={PAD.right-2} height={15} fill="#2ed573" rx="2" opacity="0.9"/>
        <text x={W-PAD.right+3} y={toY(openTrade.tp_price)+3.5} fontSize="8.5" fill="white" fontFamily="monospace">TP {fmtP(openTrade.tp_price)}</text>
      </>)}
      {lastPrice&&(<>
        <line x1={PAD.left} y1={toY(lastPrice)} x2={W-PAD.right} y2={toY(lastPrice)} stroke="var(--accent-warning)" strokeWidth="1" strokeDasharray="2 2" opacity="0.7"/>
        <rect x={W-PAD.right} y={toY(lastPrice)-9} width={PAD.right-2} height={17} fill="var(--accent-warning)" rx="2"/>
        <text x={W-PAD.right+3} y={toY(lastPrice)+4} fontSize="9" fill="#000" fontFamily="monospace" fontWeight="bold">{fmtP(lastPrice)}</text>
      </>)}
    </svg>
  )
}

// ─── Replay Window ─────────────────────────────────────────────────────────────
function BacktestReplayWindow({session,onBack,onUpdate}){
  const {t}=useLanguage()
  const [allCandles,setAllCandles]=useState([])
  const [candleIdx,setCandleIdx]=useState(0)
  const [loadingData,setLoadingData]=useState(true)
  const [loadErrMsg,setLoadErrMsg]=useState(null)
  const [loadKey,setLoadKey]=useState(0)  // increment to retrigger candle load
  const [playing,setPlaying]=useState(false)
  const [speedIdx,setSpeedIdx]=useState(0)
  const [trades,setTrades]=useState(session.trades||[])
  const [openTrade,setOpenTrade]=useState(null)
  const [playbook,setPlaybook]=useState(null)
  const [orderDir,setOrderDir]=useState("BUY")
  const [slPrice,setSlPrice]=useState("")
  const [tpPrice,setTpPrice]=useState("")
  const [riskPct,setRiskPct]=useState("1")
  const [ruleChecks,setRuleChecks]=useState([])
  const [tradeNotes,setTradeNotes]=useState("")
  const [activeChart,setActiveChart]=useState("candles")
  const playRef=useRef(null)
  const initialCap=parseFloat(session.initial_balance||session.initial_capital||10000)

  useEffect(()=>{
    const load=async()=>{
      setLoadingData(true)
      try{
        const sym=session.symbol||"XAUUSD",tf=session.timeframe||"H1"
        let q=supabase.from("sylledge_market_data")
          .select("candle_time,open_price,high_price,low_price,close_price,volume")
          .eq("symbol",sym).eq("timeframe",tf)
          .order("candle_time",{ascending:true}).limit(2000)
        if(session.date_from)q=q.gte("candle_time",session.date_from)
        if(session.date_to)q=q.lte("candle_time",session.date_to+"T23:59:59")
        const{data,error}=await q
        if(error){
          console.error("Supabase error:", error.message, {sym,tf})
          setLoadErrMsg(`DB error: ${error.message}`)
          setLoadingData(false)
          return
        }
        console.log("Candles loaded:", data?.length, "for", sym, tf)
        const mapped=(data||[]).map(r=>({t:r.candle_time,o:r.open_price,h:r.high_price,l:r.low_price,c:r.close_price,v:r.volume||0}))
        setAllCandles(mapped)
        setCandleIdx(mapped.length>0?1:0)
        if(mapped.length===0) setLoadErrMsg(`No data for ${sym} ${tf} in sylledge_market_data. Is the EA syncing this symbol?`)
      }catch(e){
        console.error("Candle load exception:",e.message)
        setLoadErrMsg(`Error: ${e.message}`)
      }
      setLoadingData(false)
    }
    load()
    if(session.playbook_id){
      Playbook.list().then(pbs=>{const pb=pbs.find(p=>p.id===session.playbook_id);if(pb)setPlaybook(pb)})
    }
  },[session.id, loadKey])

  useEffect(()=>{
    if(!playing){clearInterval(playRef.current);return}
    const speed=SPEEDS[speedIdx]?.ms||800
    playRef.current=setInterval(()=>{
      setCandleIdx(i=>{if(i>=allCandles.length){setPlaying(false);return i}return i+1})
    },speed)
    return()=>clearInterval(playRef.current)
  },[playing,speedIdx,allCandles.length])

  const currentBalance=useMemo(()=>trades.reduce((s,t)=>s+(t.pnl||0),initialCap),[trades,initialCap])
  const currentCandle=allCandles[candleIdx-1]||null
  const currentPrice=currentCandle?parseFloat(currentCandle.c):null
  const visibleCandles=allCandles.slice(0,candleIdx)

  useEffect(()=>{
    if(!openTrade||candleIdx===0)return
    const candle=allCandles[candleIdx-1];if(!candle)return
    const high=parseFloat(candle.h),low=parseFloat(candle.l)
    const sl=parseFloat(openTrade.sl_price),tp=parseFloat(openTrade.tp_price)
    const dir=openTrade.direction
    let closePrice=null,outcome=null
    if(dir==="BUY"){
      if(sl>0&&low<=sl){closePrice=sl;outcome="LOSS"}
      else if(tp>0&&high>=tp){closePrice=tp;outcome="WIN"}
    }else{
      if(sl>0&&high>=sl){closePrice=sl;outcome="LOSS"}
      else if(tp>0&&low<=tp){closePrice=tp;outcome="WIN"}
    }
    if(outcome)closeTrade(closePrice,outcome,candle.t)
  },[candleIdx])

  const unrealizedPnl=useMemo(()=>{
    if(!openTrade||!currentPrice)return 0
    const entry=parseFloat(openTrade.entry_price)
    const priceDiff=openTrade.direction==="BUY"?currentPrice-entry:entry-currentPrice
    const riskAmount=currentBalance*(parseFloat(openTrade.risk_pct||1))/100
    const riskDist=Math.abs(entry-parseFloat(openTrade.sl_price||0))
    const pipValue=riskDist>0?riskAmount/riskDist:0
    return priceDiff*pipValue
  },[openTrade,currentPrice,currentBalance])

  const closeTrade=async(closePrice,outcome,closeTime)=>{
    if(!openTrade)return
    const entry=parseFloat(openTrade.entry_price)
    const sl=parseFloat(openTrade.sl_price)
    const riskDist=Math.abs(entry-sl)
    const riskAmt=currentBalance*(openTrade.risk_pct||1)/100
    const pipValue=riskDist>0?riskAmt/riskDist:0
    const priceDiff=openTrade.direction==="BUY"?closePrice-entry:entry-closePrice
    const pnl=parseFloat((priceDiff*pipValue).toFixed(2))
    const trade={...openTrade,exit_price:closePrice,outcome,pnl,pips:priceDiff.toFixed(1),
      exit_time:closeTime||currentCandle?.t,id:Date.now().toString()}
    const updated=[...trades,trade]
    await BacktestSession.update(session.id,{trades:updated})
    setTrades(updated);setOpenTrade(null)
    setSlPrice("");setTpPrice("");setRuleChecks([]);setTradeNotes("")
    onUpdate()
    toast.success(`${outcome==="WIN"?"🎯":"❌"} ${outcome} — ${pnl>=0?"+":""}$${pnl.toFixed(2)}`)
  }

  const placeOrder=()=>{
    if(!currentPrice){toast.error("Step forward first");return}
    if(!slPrice){toast.error("Stop Loss required");return}
    if(openTrade){toast.error("Close open trade first");return}
    const rr=calcRR(currentPrice,slPrice,tpPrice)
    setOpenTrade({direction:orderDir,entry_price:currentPrice,sl_price:slPrice,tp_price:tpPrice,
      rr,risk_pct:parseFloat(riskPct)||1,entry_time:currentCandle?.t,rule_checks:ruleChecks,notes:tradeNotes})
    toast.success(`${orderDir} @ ${currentPrice}`)
  }

  const stats=useMemo(()=>calcStats(trades,initialCap),[trades,initialCap])
  const rules=playbook?.entry_rules?(Array.isArray(playbook.entry_rules)?playbook.entry_rules:playbook.entry_rules.split("\n").filter(r=>r.trim())).slice(0,8):[]
  const rr=calcRR(currentPrice,slPrice,tpPrice)
  const fmtBal=v=>`$${parseFloat(v).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`

  return(
    <div className="flex flex-col" style={{height:"100vh",background:"var(--bg-primary)"}}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0"
        style={{background:"var(--bg-secondary)",borderBottom:"1px solid var(--border)"}}>
        <button onClick={onBack} className="p-1.5 rounded-lg hover:opacity-70"
          style={{background:"var(--bg-elevated)",color:"var(--text-secondary)"}}>
          <ChevronLeft size={15}/>
        </button>
        <div className="flex items-center gap-2">
          <FlaskConical size={14} style={{color:"var(--accent)"}}/>
          <span className="font-bold text-sm" style={{color:"var(--text-primary)"}}>{session.name}</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{background:"rgba(108,99,255,0.12)",color:"var(--accent)"}}>
            {session.symbol} · {session.timeframe}
          </span>
          {playbook&&<span className="text-xs px-2 py-0.5 rounded-full"
            style={{background:"rgba(0,212,170,0.1)",color:"var(--accent-secondary)"}}>{playbook.name}</span>}
        </div>
        <div className="ml-auto flex items-center gap-5">
          {openTrade&&(
            <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{background:unrealizedPnl>=0?"rgba(46,213,115,0.1)":"rgba(255,71,87,0.1)",
                color:unrealizedPnl>=0?"var(--accent-success)":"var(--accent-danger)",
                border:`1px solid ${unrealizedPnl>=0?"rgba(46,213,115,0.3)":"rgba(255,71,87,0.3)"}`}}>
              <Zap size={11}/> Open: {unrealizedPnl>=0?"+":""}${unrealizedPnl.toFixed(2)}
            </div>
          )}
          {[
            {label:"Balance",v:fmtBal(currentBalance),color:"var(--accent)"},
            {label:"P&L",v:`${stats.netPnl>=0?"+":""}$${stats.netPnl.toFixed(2)}`,color:stats.netPnl>=0?"var(--accent-success)":"var(--accent-danger)"},
            {label:"Win Rate",v:`${stats.winRate.toFixed(0)}%`,color:stats.winRate>=50?"var(--accent-success)":"var(--accent-danger)"},
            {label:"Trades",v:trades.length,color:"var(--text-primary)"},
          ].map(s=>(
            <div key={s.label} className="text-center">
              <p className="text-xs" style={{color:"var(--text-muted)"}}>{s.label}</p>
              <p className="text-sm font-bold" style={{color:s.color,fontFamily:"var(--font-mono)"}}>{s.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left sidebar */}
        <div className="w-48 flex-shrink-0 flex flex-col overflow-y-auto"
          style={{background:"var(--bg-secondary)",borderRight:"1px solid var(--border)"}}>
          <div className="p-3 space-y-1.5" style={{borderBottom:"1px solid var(--border)"}}>
            <p className="text-xs font-bold mb-2" style={{color:"var(--text-muted)"}}>SESSION STATS</p>
            {[
              {label:"ROI",v:`${stats.roi>=0?"+":""}${stats.roi.toFixed(1)}%`,color:stats.roi>=0?"var(--accent-success)":"var(--accent-danger)"},
              {label:"Win Rate",v:`${stats.winRate.toFixed(1)}%`,color:stats.winRate>=50?"var(--accent-success)":"var(--accent-danger)"},
              {label:"Prof. Factor",v:stats.pf>=99?"∞":stats.pf.toFixed(2),color:stats.pf>=1?"var(--accent-success)":"var(--accent-danger)"},
              {label:"Expectancy",v:`${stats.exp>=0?"+":""}$${stats.exp.toFixed(2)}`,color:stats.exp>=0?"var(--accent-success)":"var(--accent-danger)"},
              {label:"Max Drawdown",v:`${stats.maxDD.toFixed(1)}%`,color:"var(--accent-warning)"},
              {label:"Avg Win",v:`+$${stats.avgWin.toFixed(2)}`,color:"var(--accent-success)"},
              {label:"Avg Loss",v:`-$${stats.avgLoss.toFixed(2)}`,color:"var(--accent-danger)"},
            ].map(s=>(
              <div key={s.label} className="flex justify-between items-center">
                <span className="text-xs" style={{color:"var(--text-muted)"}}>{s.label}</span>
                <span className="text-xs font-bold" style={{color:s.color,fontFamily:"var(--font-mono)"}}>{s.v}</span>
              </div>
            ))}
          </div>
          {stats.curve.length>1&&(
            <div className="p-3" style={{borderBottom:"1px solid var(--border)"}}>
              <p className="text-xs font-bold mb-2" style={{color:"var(--text-muted)"}}>EQUITY</p>
              <ResponsiveContainer width="100%" height={55}>
                <AreaChart data={stats.curve}>
                  <defs><linearGradient id="eqG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={stats.netPnl>=0?"#2ed573":"#ff4757"} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={stats.netPnl>=0?"#2ed573":"#ff4757"} stopOpacity={0}/>
                  </linearGradient></defs>
                  <Area type="monotone" dataKey="balance" stroke={stats.netPnl>=0?"#2ed573":"#ff4757"} strokeWidth={1.5} fill="url(#eqG)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {rules.length>0&&(
            <div className="p-3 flex-1">
              <p className="text-xs font-bold mb-2" style={{color:"var(--text-muted)"}}>PLAYBOOK RULES</p>
              <div className="space-y-1.5">
                {rules.map((rule,i)=>(
                  <button key={i} onClick={()=>setRuleChecks(r=>r.includes(rule)?r.filter(x=>x!==rule):[...r,rule])}
                    className="flex items-start gap-1.5 w-full text-left hover:opacity-80 transition-opacity">
                    {ruleChecks.includes(rule)
                      ?<CheckSquare size={12} style={{color:"var(--accent-success)",flexShrink:0,marginTop:1}}/>
                      :<Square size={12} style={{color:"var(--text-muted)",flexShrink:0,marginTop:1}}/>}
                    <span className="text-xs leading-tight" style={{color:ruleChecks.includes(rule)?"var(--text-primary)":"var(--text-muted)"}}>{rule}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-2" style={{borderTop:"1px solid var(--border)"}}>
                <div className="flex justify-between text-xs mb-1">
                  <span style={{color:"var(--text-muted)"}}>Checked</span>
                  <span style={{color:ruleChecks.length===rules.length?"var(--accent-success)":"var(--accent-warning)"}}>{ruleChecks.length}/{rules.length}</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{background:"var(--bg-elevated)"}}>
                  <div className="h-full rounded-full" style={{width:`${rules.length>0?ruleChecks.length/rules.length*100:0}%`,
                    background:ruleChecks.length===rules.length?"var(--accent-success)":"var(--accent-warning)"}}/>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center chart */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0" style={{borderBottom:"1px solid var(--border)"}}>
            {[{id:"candles",label:"Candles"},{id:"balance",label:"Balance"},{id:"trades",label:`Trades (${trades.length})`}].map(tab=>(
              <button key={tab.id} onClick={()=>setActiveChart(tab.id)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                style={{background:activeChart===tab.id?"var(--accent)":"var(--bg-elevated)",
                  color:activeChart===tab.id?"#fff":"var(--text-secondary)"}}>
                {tab.label}
              </button>
            ))}
            <div className="ml-auto text-xs" style={{color:"var(--text-muted)"}}>
              {loadingData?<span className="animate-pulse">Loading {session.symbol} {session.timeframe}…</span>:loadErrMsg?<span style={{color:"var(--accent-danger)"}}>⚠️ No data</span>:<span style={{color:"var(--accent-success)"}}>{allCandles.length} candles loaded ✓</span>}
              {currentPrice&&<span className="ml-3 font-bold" style={{color:"var(--accent-warning)",fontFamily:"var(--font-mono)"}}>{currentPrice}</span>}
            </div>
          </div>
          <div className="flex-1 min-h-0 p-2">
            {activeChart==="candles"&&(
              <div className="w-full h-full rounded-xl overflow-hidden" style={{background:"var(--bg-card)"}}>
                {loadingData?(
                  <div className="flex items-center justify-center h-full flex-col gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{borderColor:"var(--accent)"}}/>
                    <p className="text-xs" style={{color:"var(--text-muted)"}}>Loading {session.symbol} {session.timeframe}…</p>
                  </div>
                ):loadErrMsg?(
                  <div className="flex items-center justify-center h-full flex-col gap-3 text-center px-8">
                    <p className="text-sm font-semibold" style={{color:"var(--accent-danger)"}}>Failed to load candles</p>
                    <p className="text-xs font-mono" style={{color:"var(--text-muted)"}}>{loadErrMsg}</p>
                    <button onClick={()=>{setLoadErrMsg(null);setLoadingData(true);/* retrigger */}} 
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-white mt-2"
                      style={{background:"var(--accent)"}}>Retry</button>
                  </div>
                ):<LiveCandleChart candles={visibleCandles} openTrade={openTrade} sessionInfo={{symbol:session.symbol,timeframe:session.timeframe}}/>}
              </div>
            )}
            {activeChart==="balance"&&stats.curve.length>0&&(
              <div className="w-full h-full rounded-xl p-4 grid grid-cols-2 gap-4" style={{background:"var(--bg-card)"}}>
                <div>
                  <p className="text-xs font-semibold mb-2" style={{color:"var(--text-muted)"}}>Balance Curve</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <AreaChart data={stats.curve}>
                      <defs><linearGradient id="bc2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={stats.netPnl>=0?"#2ed573":"#ff4757"} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={stats.netPnl>=0?"#2ed573":"#ff4757"} stopOpacity={0}/>
                      </linearGradient></defs>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="date" tick={{fill:"var(--text-muted)",fontSize:9}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                      <YAxis tick={{fill:"var(--text-muted)",fontSize:9}} tickFormatter={v=>`$${v}`} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:8,fontSize:11}} formatter={v=>[`$${v.toFixed(2)}`,"Balance"]}/>
                      <ReferenceLine y={initialCap} stroke="var(--text-muted)" strokeDasharray="4 4"/>
                      <Area type="monotone" dataKey="balance" stroke={stats.netPnl>=0?"#2ed573":"#ff4757"} strokeWidth={2} fill="url(#bc2)" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs font-semibold mb-2" style={{color:"var(--text-muted)"}}>Drawdown</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <AreaChart data={stats.ddCurve}>
                      <defs><linearGradient id="dd2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff4757" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ff4757" stopOpacity={0}/>
                      </linearGradient></defs>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="date" tick={{fill:"var(--text-muted)",fontSize:9}} axisLine={false} tickLine={false} interval="preserveStartEnd"/>
                      <YAxis tick={{fill:"var(--text-muted)",fontSize:9}} tickFormatter={v=>`${v}%`} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{background:"var(--bg-elevated)",border:"1px solid var(--border)",borderRadius:8,fontSize:11}} formatter={v=>[`${v.toFixed(2)}%`,"DD"]}/>
                      <Area type="monotone" dataKey="drawdown" stroke="#ff4757" strokeWidth={2} fill="url(#dd2)" dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            {activeChart==="trades"&&(
              <div className="w-full h-full rounded-xl overflow-auto" style={{background:"var(--bg-card)"}}>
                {trades.length===0?(
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{color:"var(--text-muted)"}}>No trades yet</p>
                  </div>
                ):(
                  <table className="w-full text-xs">
                    <thead style={{background:"var(--bg-elevated)",position:"sticky",top:0}}>
                      <tr style={{borderBottom:"1px solid var(--border)"}}>
                        {["#","Dir","Entry","Exit","SL","TP","R:R","Outcome","P&L","Balance","Rules"].map(h=>(
                          <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{color:"var(--text-muted)"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((tr,i)=>{
                        let bal=initialCap;for(let j=0;j<=i;j++)bal+=trades[j].pnl||0
                        const rules2=playbook?.entry_rules?(Array.isArray(playbook.entry_rules)?playbook.entry_rules:playbook.entry_rules.split("\n").filter(r=>r.trim())):[]
                        const adh=rules2.length>0&&tr.rule_checks?.length>0?(tr.rule_checks.length/rules2.length*100).toFixed(0):null
                        return(
                          <tr key={tr.id||i} style={{borderBottom:"1px solid var(--border)"}}
                            onMouseEnter={e=>e.currentTarget.style.background="var(--bg-elevated)"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <td className="px-3 py-2" style={{color:"var(--text-muted)"}}>{i+1}</td>
                            <td className="px-3 py-2"><span className="px-1.5 py-0.5 rounded font-semibold" style={{background:tr.direction==="BUY"?"rgba(46,213,115,0.12)":"rgba(255,71,87,0.12)",color:tr.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)"}}>{tr.direction==="BUY"?"▲":"▼"} {tr.direction}</span></td>
                            <td className="px-3 py-2" style={{color:"var(--text-secondary)",fontFamily:"var(--font-mono)"}}>{tr.entry_price}</td>
                            <td className="px-3 py-2" style={{color:"var(--text-secondary)",fontFamily:"var(--font-mono)"}}>{tr.exit_price}</td>
                            <td className="px-3 py-2" style={{color:"var(--accent-danger)",fontFamily:"var(--font-mono)"}}>{tr.sl_price||"—"}</td>
                            <td className="px-3 py-2" style={{color:"var(--accent-success)",fontFamily:"var(--font-mono)"}}>{tr.tp_price||"—"}</td>
                            <td className="px-3 py-2" style={{color:"var(--accent)",fontFamily:"var(--font-mono)"}}>{tr.rr?`${tr.rr}:1`:"—"}</td>
                            <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full font-semibold" style={{background:tr.outcome==="WIN"?"rgba(46,213,115,0.12)":"rgba(255,71,87,0.12)",color:tr.outcome==="WIN"?"var(--accent-success)":"var(--accent-danger)"}}>{tr.outcome}</span></td>
                            <td className="px-3 py-2 font-bold" style={{color:(tr.pnl||0)>=0?"var(--accent-success)":"var(--accent-danger)",fontFamily:"var(--font-mono)"}}>{(tr.pnl||0)>=0?"+":""}${parseFloat(tr.pnl||0).toFixed(2)}</td>
                            <td className="px-3 py-2 font-bold" style={{color:bal>=initialCap?"var(--accent-success)":"var(--accent-danger)",fontFamily:"var(--font-mono)"}}>${bal.toFixed(2)}</td>
                            <td className="px-3 py-2">{adh&&<span className="px-1.5 py-0.5 rounded" style={{background:parseInt(adh)>=75?"rgba(46,213,115,0.12)":"rgba(255,165,2,0.12)",color:parseInt(adh)>=75?"var(--accent-success)":"var(--accent-warning)"}}>{adh}%</span>}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
          {/* Playback controls */}
          <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
            style={{background:"var(--bg-secondary)",borderTop:"1px solid var(--border)"}}>
            <span className="text-xs" style={{color:"var(--text-muted)",fontFamily:"var(--font-mono)",minWidth:70}}>{candleIdx}/{allCandles.length}</span>
            <input type="range" min="1" max={allCandles.length||1} value={candleIdx}
              onChange={e=>{setPlaying(false);setCandleIdx(parseInt(e.target.value))}}
              className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer" style={{accentColor:"var(--accent)"}}/>
            <button onClick={()=>{setPlaying(false);setCandleIdx(i=>Math.max(1,i-10))}}
              className="p-1.5 rounded-lg hover:opacity-70" style={{color:"var(--text-secondary)",background:"var(--bg-elevated)"}}><Rewind size={13}/></button>
            <button onClick={()=>{setPlaying(false);setCandleIdx(i=>Math.max(1,i-1))}}
              className="p-1.5 rounded-lg hover:opacity-70" style={{color:"var(--text-secondary)",background:"var(--bg-elevated)"}}><SkipBack size={13}/></button>
            <button onClick={()=>setPlaying(p=>!p)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{background:playing?"var(--accent-warning)":"var(--accent)",color:"#fff"}}>
              {playing?<Pause size={14}/>:<Play size={14}/>}{playing?"Pause":"Play"}
            </button>
            <button onClick={()=>{setPlaying(false);setCandleIdx(i=>Math.min(allCandles.length,i+1))}}
              className="p-1.5 rounded-lg hover:opacity-70" style={{color:"var(--text-secondary)",background:"var(--bg-elevated)"}}><SkipForward size={13}/></button>
            <button onClick={()=>{setPlaying(false);setCandleIdx(i=>Math.min(allCandles.length,i+10))}}
              className="p-1.5 rounded-lg hover:opacity-70" style={{color:"var(--text-secondary)",background:"var(--bg-elevated)"}}><FastForward size={13}/></button>
            <div className="flex items-center gap-1">
              {SPEEDS.map((s,i)=>(
                <button key={i} onClick={()=>setSpeedIdx(i)}
                  className="px-2 py-1 rounded text-xs font-bold"
                  style={{background:speedIdx===i?"var(--accent)":"var(--bg-elevated)",color:speedIdx===i?"#fff":"var(--text-muted)"}}>
                  {s.label}
                </button>
              ))}
            </div>
            {/* Date display + jump to date */}
            {currentCandle&&(
              <span className="text-xs" style={{color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>
                {new Date(currentCandle.t).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"2-digit"})}
              </span>
            )}
            <input type="date" onChange={e=>{
              if(!e.target.value||!allCandles.length) return
              const target = new Date(e.target.value).getTime()
              let closest = 0
              allCandles.forEach((c,i)=>{ if(Math.abs(new Date(c.t).getTime()-target)<Math.abs(new Date(allCandles[closest].t).getTime()-target)) closest=i })
              setPlaying(false); setCandleIdx(closest+1)
            }}
            className="h-7 rounded px-2 text-xs border" title="Jump to date"
            style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)",width:120}}/>
          </div>
        </div>

        {/* Right sidebar: order entry */}
        <div className="w-52 flex-shrink-0 flex flex-col overflow-y-auto"
          style={{background:"var(--bg-secondary)",borderLeft:"1px solid var(--border)"}}>
          <div className="p-3" style={{borderBottom:"1px solid var(--border)"}}>
            <p className="text-xs font-bold mb-1" style={{color:"var(--text-muted)"}}>CURRENT PRICE</p>
            <p className="text-xl font-black" style={{color:"var(--accent-warning)",fontFamily:"var(--font-mono)"}}>{currentPrice??"—"}</p>
          </div>

          {openTrade?(
            <div className="p-3 flex-1">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold" style={{color:"var(--accent)"}}>OPEN POSITION</p>
                <span className="text-xs px-1.5 py-0.5 rounded"
                  style={{background:openTrade.direction==="BUY"?"rgba(46,213,115,0.15)":"rgba(255,71,87,0.15)",
                    color:openTrade.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)"}}>
                  {openTrade.direction==="BUY"?"▲":"▼"} {openTrade.direction}
                </span>
              </div>
              <div className="space-y-1.5 text-xs mb-4">
                {[
                  {label:"Entry",v:openTrade.entry_price,color:"var(--text-primary)"},
                  {label:"SL",v:openTrade.sl_price||"—",color:"var(--accent-danger)"},
                  {label:"TP",v:openTrade.tp_price||"—",color:"var(--accent-success)"},
                  {label:"R:R",v:openTrade.rr?`${openTrade.rr}:1`:"—",color:"var(--accent)"},
                  {label:"Risk",v:`${openTrade.risk_pct}%`,color:"var(--accent-warning)"},
                  {label:"Unrealized",v:`${unrealizedPnl>=0?"+":""}$${unrealizedPnl.toFixed(2)}`,color:unrealizedPnl>=0?"var(--accent-success)":"var(--accent-danger)"},
                ].map(s=>(
                  <div key={s.label} className="flex justify-between">
                    <span style={{color:"var(--text-muted)"}}>{s.label}</span>
                    <span className="font-bold" style={{color:s.color,fontFamily:"var(--font-mono)"}}>{s.v}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs font-bold mb-2" style={{color:"var(--text-muted)"}}>CLOSE TRADE</p>
              <div className="grid grid-cols-3 gap-1 mb-2">
                {[["WIN","var(--accent-success)","rgba(46,213,115,0.2)"],["BE","var(--accent)","rgba(108,99,255,0.15)"],["LOSS","var(--accent-danger)","rgba(255,71,87,0.2)"]].map(([o,c,bg])=>(
                  <button key={o} onClick={()=>closeTrade(currentPrice,o==="BE"?"BREAKEVEN":o,currentCandle?.t)}
                    className="py-2 rounded-xl text-xs font-bold" style={{background:bg,color:c}}>
                    {o}
                  </button>
                ))}
              </div>
              <p className="text-xs text-center" style={{color:"var(--text-muted)"}}>Auto-closes at SL/TP</p>
            </div>
          ):(
            <div className="p-3 flex-1">
              <p className="text-xs font-bold mb-3" style={{color:"var(--text-muted)"}}>PLACE ORDER</p>
              <div className="grid grid-cols-2 gap-1.5 mb-3">
                <button onClick={()=>setOrderDir("BUY")}
                  className="py-2 rounded-xl text-xs font-bold transition-all"
                  style={{background:orderDir==="BUY"?"rgba(46,213,115,0.2)":"var(--bg-elevated)",
                    border:`1px solid ${orderDir==="BUY"?"var(--accent-success)":"var(--border)"}`,
                    color:orderDir==="BUY"?"var(--accent-success)":"var(--text-secondary)"}}>
                  ▲ BUY
                </button>
                <button onClick={()=>setOrderDir("SELL")}
                  className="py-2 rounded-xl text-xs font-bold transition-all"
                  style={{background:orderDir==="SELL"?"rgba(255,71,87,0.2)":"var(--bg-elevated)",
                    border:`1px solid ${orderDir==="SELL"?"var(--accent-danger)":"var(--border)"}`,
                    color:orderDir==="SELL"?"var(--accent-danger)":"var(--text-secondary)"}}>
                  ▼ SELL
                </button>
              </div>
              <div className="mb-2">
                <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>
                  Risk % <span style={{color:"var(--accent-warning)"}}>= ${(currentBalance*(parseFloat(riskPct)||0)/100).toFixed(2)}</span>
                </label>
                <div className="flex gap-1 mb-1.5">
                  {["0.5","1","1.5","2"].map(v=>(
                    <button key={v} onClick={()=>setRiskPct(v)}
                      className="flex-1 py-1 rounded text-xs font-medium transition-all"
                      style={{background:riskPct===v?"var(--accent)":"var(--bg-elevated)",color:riskPct===v?"#fff":"var(--text-secondary)"}}>
                      {v}%
                    </button>
                  ))}
                </div>
                <input type="number" step="0.1" value={riskPct} onChange={e=>setRiskPct(e.target.value)}
                  className="w-full h-8 rounded-lg px-2 text-xs border"
                  style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}/>
              </div>
              <div className="mb-2">
                <label className="text-xs font-medium block mb-1" style={{color:"var(--accent-danger)"}}>Stop Loss *</label>
                <input type="number" step="any" placeholder="Required" value={slPrice} onChange={e=>setSlPrice(e.target.value)}
                  className="w-full h-8 rounded-lg px-2 text-xs border"
                  style={{background:"rgba(255,71,87,0.05)",borderColor:"rgba(255,71,87,0.3)",color:"var(--text-primary)",fontFamily:"var(--font-mono)"}}/>
              </div>
              <div className="mb-2">
                <label className="text-xs font-medium block mb-1" style={{color:"var(--accent-success)"}}>
                  Take Profit {rr&&<span style={{color:"var(--accent)"}}>({rr}:1)</span>}
                </label>
                <input type="number" step="any" placeholder="Optional" value={tpPrice} onChange={e=>setTpPrice(e.target.value)}
                  className="w-full h-8 rounded-lg px-2 text-xs border"
                  style={{background:"rgba(46,213,115,0.05)",borderColor:"rgba(46,213,115,0.3)",color:"var(--text-primary)",fontFamily:"var(--font-mono)"}}/>
              </div>
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>Notes</label>
                <textarea rows={2} value={tradeNotes} onChange={e=>setTradeNotes(e.target.value)}
                  placeholder="Why this trade?" className="w-full rounded-lg px-2 py-1.5 text-xs border resize-none"
                  style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}/>
              </div>
              <button onClick={placeOrder} disabled={!currentPrice}
                className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{background:orderDir==="BUY"?"linear-gradient(135deg,#2ed573,#00b894)":"linear-gradient(135deg,#ff4757,#c0392b)"}}>
                {orderDir==="BUY"?"▲ Buy @ Market":"▼ Sell @ Market"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Session Modal ─────────────────────────────────────────────────────────────
const EMPTY_SESSION={name:"",symbol:"XAUUSD",timeframe:"H1",description:"",date_from:"",date_to:"",initial_balance:"10000",playbook_id:"",notes:""}

async function fetchAvailableSymbols(supabase) {
  try {
    // Use RPC for proper DISTINCT — raw limit(1000) would only show 1 symbol
    const { data: rpcData, error: rpcErr } = await supabase.rpc('get_synced_symbols')
    if (!rpcErr && rpcData?.length) return rpcData  // [{symbol, timeframe, candle_count}]
  } catch {}
  try {
    // Fallback: query with a large range to cover all symbols
    const { data } = await supabase
      .from('sylledge_market_data')
      .select('symbol, timeframe')
      .order('symbol', { ascending: true })
      .limit(50000)  // Large enough to cover all candles
    if (!data?.length) return []
    const seen = new Set()
    return data
      .filter(r => { const k=r.symbol+'|'+r.timeframe; if(seen.has(k))return false; seen.add(k); return true })
      .map(r => ({ symbol: r.symbol, timeframe: r.timeframe, candle_count: 0 }))
  } catch { return [] }
}

function SessionModal({open,onClose,onSaved,editSession}){
  const {t}=useLanguage()
  const [form,setForm]=useState(EMPTY_SESSION)
  const [saving,setSaving]=useState(false)
  const [playbooks,setPlaybooks]=useState([])
  const [availSymbols,setAvailSymbols]=useState([])
  const isEdit=!!editSession
  useEffect(()=>{
    Playbook.list().then(d=>setPlaybooks((d||[]).filter(p=>p.status==="active")))
    fetchAvailableSymbols(supabase).then(setAvailSymbols)
  },[])
  useEffect(()=>{setForm(editSession?{...EMPTY_SESSION,...editSession}:EMPTY_SESSION)},[editSession,open])
  const set=(k,v)=>setForm(f=>({...f,[k]:v}))
  const save=async()=>{
    if(!form.name.trim()){toast.error("Session name required");return}
    setSaving(true)
    try{
      const payload={
        name:            form.name.trim(),
        symbol:          form.symbol || "XAUUSD",
        timeframe:       form.timeframe || "H1",
        description:     form.description || "",
        date_from:       form.date_from || null,
        date_to:         form.date_to   || null,
        initial_balance: parseFloat(form.initial_balance) || 10000,
        playbook_id:     form.playbook_id || null,
        notes:           form.notes || "",
        status:          "active",
        trades:          editSession?.trades || [],
      }
      if(isEdit){await BacktestSession.update(editSession.id,payload);toast.success("Session updated!")}
      else{await BacktestSession.create(payload);toast.success("Session created!")}
      onSaved();onClose()
    }catch(e){toast.error("Failed: "+e.message)}
    setSaving(false)
  }
  if(!open)return null
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 max-h-[90vh] overflow-y-auto" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
        <div className="flex items-center justify-between p-6 pb-4" style={{borderBottom:"1px solid var(--border)"}}>
          <h2 className="font-bold" style={{color:"var(--text-primary)"}}>{isEdit?"Edit Session":"New Session"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:opacity-70" style={{color:"var(--text-secondary)"}}><X size={16}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>Session Name *</label>
            <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. XAUUSD London Breakout Q2"
              className="w-full h-10 rounded-xl px-3 text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>Symbol</label>
              <select value={form.symbol} onChange={e=>set("symbol",e.target.value)} className="w-full h-10 rounded-xl px-3 text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}>
                {(availSymbols.length>0
                  ? [...new Map(availSymbols.map(s=>[s.symbol, s])).values()]
                  : SYMBOLS.map(s=>({symbol:s}))
                ).map(s=>(
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol}{s.candle_count>0 ? ` (${s.candle_count.toLocaleString()} candles)` : s.candle_count===0?'' : ' ✓'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>Timeframe</label>
              <select value={form.timeframe} onChange={e=>set("timeframe",e.target.value)} className="w-full h-10 rounded-xl px-3 text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}>
                {TFS.map(tf=><option key={tf}>{tf}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>Start Date</label>
              <input type="date" value={form.date_from} onChange={e=>set("date_from",e.target.value)} className="w-full h-10 rounded-xl px-3 text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}/>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>End Date</label>
              <input type="date" value={form.date_to} onChange={e=>set("date_to",e.target.value)} className="w-full h-10 rounded-xl px-3 text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>Starting Capital ($)</label>
              <input type="number" value={form.initial_balance} onChange={e=>set("initial_balance",e.target.value)} className="w-full h-10 rounded-xl px-3 text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)",fontFamily:"var(--font-mono)"}}/>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>Linked Playbook</label>
              <select value={form.playbook_id||""} onChange={e=>set("playbook_id",e.target.value)} className="w-full h-10 rounded-xl px-3 text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}>
                <option value="">No playbook</option>
                {playbooks.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{color:"var(--text-muted)"}}>Notes</label>
            <textarea rows={2} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="Strategy, market conditions, hypothesis…"
              className="w-full rounded-xl px-3 py-2 text-sm border resize-none" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-primary)"}}/>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-secondary)"}}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white"
            style={{background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))",opacity:saving?0.7:1}}>
            {saving?"Saving…":isEdit?"Update":"Create Session"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirm({label,onCancel,onConfirm}){
  const {t}=useLanguage()
  return(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
        <h3 className="font-bold mb-2" style={{color:"var(--text-primary)"}}>Delete Session?</h3>
        <p className="text-sm mb-5" style={{color:"var(--text-muted)"}}><strong style={{color:"var(--text-primary)"}}>{label}</strong> and all its trades will be permanently removed.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 h-9 rounded-xl text-sm border" style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-secondary)"}}>Cancel</button>
          <button onClick={onConfirm} className="flex-1 h-9 rounded-xl text-sm font-semibold text-white" style={{background:"var(--accent-danger)"}}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function SessionCard({session,onOpen,onEdit,onDelete}){
  const {t}=useLanguage()
  const trades=session.trades||[]
  const initialCap=parseFloat(session.initial_balance||session.initial_capital||10000)
  const stats=useMemo(()=>calcStats(trades,initialCap),[trades,initialCap])
  return(
    <div className="rounded-2xl cursor-pointer transition-all hover:scale-[1.01]"
      style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}
      onClick={()=>onOpen(session)}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{background:"rgba(108,99,255,0.12)",border:"1px solid rgba(108,99,255,0.2)"}}>
              <FlaskConical size={18} style={{color:"var(--accent)"}}/>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold truncate text-sm" style={{color:"var(--text-primary)"}}>{session.name}</h3>
              <p className="text-xs" style={{color:"var(--text-muted)"}}>{session.symbol} · {session.timeframe}{session.date_from?` · from ${session.date_from}`:""}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0" onClick={e=>e.stopPropagation()}>
            <button onClick={()=>onEdit(session)} className="p-2 rounded-xl hover:opacity-70" style={{color:"var(--accent)",background:"rgba(108,99,255,0.1)"}}><Pencil size={13}/></button>
            <button onClick={()=>onDelete(session)} className="p-2 rounded-xl hover:opacity-70" style={{color:"var(--accent-danger)",background:"rgba(255,71,87,0.1)"}}><Trash2 size={13}/></button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            {label:"P&L",v:`${stats.netPnl>=0?"+":""}$${stats.netPnl.toFixed(0)}`,color:stats.netPnl>=0?"var(--accent-success)":"var(--accent-danger)"},
            {label:"Win Rate",v:`${stats.winRate.toFixed(0)}%`,color:stats.winRate>=50?"var(--accent-success)":"var(--accent-danger)"},
            {label:"ROI",v:`${stats.roi.toFixed(1)}%`,color:stats.roi>=0?"var(--accent-success)":"var(--accent-danger)"},
            {label:"Trades",v:trades.length,color:"var(--accent)"},
          ].map(s=>(
            <div key={s.label} className="rounded-xl py-2 px-2 text-center" style={{background:"var(--bg-elevated)"}}>
              <p className="text-sm font-bold" style={{color:s.color,fontFamily:"var(--font-mono)"}}>{s.v}</p>
              <p className="text-xs mt-0.5" style={{color:"var(--text-muted)",fontSize:9}}>{s.label}</p>
            </div>
          ))}
        </div>
        {stats.curve.length>1&&(
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
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>
            ${initialCap.toLocaleString()} → ${(initialCap+stats.netPnl).toFixed(0)}
          </span>
          <div className="flex items-center gap-1 text-xs font-semibold" style={{color:"var(--accent)"}}>Start Replay <Play size={11}/></div>
        </div>
      </div>
    </div>
  )
}

export default function Backtesting(){
  const {t}=useLanguage()
  const [sessions,setSessions]=useState([])
  const [playbooks,setPlaybooks]=useState([])
  const [replaySession,setReplaySession]=useState(null)
  const [modalOpen,setModalOpen]=useState(false)
  const [editSession,setEditSession]=useState(null)
  const [deleteTarget,setDeleteTarget]=useState(null)
  const [playbookFilter,setPlaybookFilter]=useState("ALL")
  const load=async()=>{
    const[data,pbs]=await Promise.all([BacktestSession.list(),Playbook.list()])
    setSessions(data.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)))
    setPlaybooks((pbs||[]).filter(p=>p.status==="active"))
  }
  useEffect(()=>{load()},[])
  const handleDelete=async()=>{
    if(!deleteTarget)return
    await BacktestSession.delete(deleteTarget.id)
    toast.success("Session deleted");setDeleteTarget(null)
    if(replaySession?.id===deleteTarget.id)setReplaySession(null)
    load()
  }
  const filtered=playbookFilter==="ALL"?sessions:sessions.filter(s=>s.playbook_id===playbookFilter)
  const totalPnl=sessions.reduce((s,sess)=>s+(sess.trades||[]).reduce((a,t)=>a+(t.pnl||0),0),0)
  const totalTrades=sessions.reduce((s,sess)=>s+(sess.trades||[]).length,0)
  const bestSession=sessions.reduce((best,sess)=>{const p=(sess.trades||[]).reduce((s,t)=>s+(t.pnl||0),0);return p>(best?(best.trades||[]).reduce((s,t)=>s+(t.pnl||0),0):-Infinity)?sess:best},null)

  if(replaySession){
    const latest=sessions.find(s=>s.id===replaySession.id)||replaySession
    return(
      <div className="fixed inset-0 z-40" style={{background:"var(--bg-primary)"}}>
        <BacktestReplayWindow session={latest} onBack={()=>setReplaySession(null)} onUpdate={load}/>
      </div>
    )
  }

  return(
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-black" style={{color:"var(--text-primary)"}}>Backtesting</h1>
          <p className="text-xs mt-1" style={{color:"var(--text-muted)",fontFamily:"var(--font-mono)"}}>{sessions.length} session{sessions.length!==1?"s":""} · {totalTrades} trades</p>
        </div>
        <button onClick={()=>{setEditSession(null);setModalOpen(true)}}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white self-start"
          style={{background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))"}}>
          <Plus size={14}/> New Session
        </button>
      </div>
      {sessions.length>0&&(
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            {label:"Sessions",v:sessions.length,color:"var(--accent)",icon:FlaskConical},
            {label:"Combined P&L",v:`${totalPnl>=0?"+":""}$${totalPnl.toFixed(0)}`,color:totalPnl>=0?"var(--accent-success)":"var(--accent-danger)",icon:totalPnl>=0?TrendingUp:TrendingDown},
            {label:"Total Trades",v:totalTrades,color:"var(--text-primary)",icon:Activity},
            {label:"Best Session",v:bestSession?.name||"—",color:"#ffd700",icon:Trophy},
          ].map(s=>(
            <div key={s.label} className="rounded-2xl p-4 flex items-center gap-3" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:`${s.color}18`}}>
                <s.icon size={18} style={{color:s.color}}/>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm truncate" style={{color:s.color,fontFamily:"var(--font-mono)"}}>{s.v}</p>
                <p className="text-xs" style={{color:"var(--text-muted)"}}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {playbooks.length>0&&(
        <div className="flex flex-wrap gap-2 mb-5">
          {[{id:"ALL",name:"All Sessions"},...playbooks].map(pb=>(
            <button key={pb.id} onClick={()=>setPlaybookFilter(pb.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border"
              style={{background:playbookFilter===pb.id?"var(--accent)":"var(--bg-elevated)",borderColor:playbookFilter===pb.id?"var(--accent)":"var(--border)",color:playbookFilter===pb.id?"#fff":"var(--text-secondary)"}}>
              <BookOpen size={10}/> {pb.name}
            </button>
          ))}
        </div>
      )}
      {filtered.length===0?(
        <div className="rounded-2xl py-20 text-center" style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:"rgba(108,99,255,0.1)"}}>
            <FlaskConical size={26} style={{color:"var(--accent)"}}/>
          </div>
          <p className="font-bold text-base mb-2" style={{color:"var(--text-primary)"}}>
            {sessions.length===0?"No backtest sessions yet":"No sessions match this filter"}
          </p>
          <p className="text-sm mb-5 max-w-sm mx-auto" style={{color:"var(--text-muted)"}}>
            {sessions.length===0?"Create a session, pick a symbol + timeframe, then replay candles and place orders like you're trading live.":"Try a different playbook filter."}
          </p>
          {sessions.length===0&&(
            <button onClick={()=>{setEditSession(null);setModalOpen(true)}}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white mx-auto"
              style={{background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))"}}>
              <Plus size={14}/> Create First Session
            </button>
          )}
        </div>
      ):(
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(s=>(
            <SessionCard key={s.id} session={s}
              onOpen={sess=>{setReplaySession(sess);load()}}
              onEdit={s=>{setEditSession(s);setModalOpen(true)}}
              onDelete={setDeleteTarget}/>
          ))}
        </div>
      )}
      <SessionModal open={modalOpen} onClose={()=>{setModalOpen(false);setEditSession(null)}} onSaved={load} editSession={editSession}/>
      {deleteTarget&&<DeleteConfirm label={deleteTarget.name} onCancel={()=>setDeleteTarget(null)} onConfirm={handleDelete}/>}
    </div>
  )
}
