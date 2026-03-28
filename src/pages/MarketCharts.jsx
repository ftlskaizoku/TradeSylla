// src/pages/MarketCharts.jsx
// Admin-only TradingView-style chart viewer for data imported by TradeSylla_MarketData EA
// Non-admins: data used silently by SYLLEDGE + AI Backtesting only
// Admins: full chart browser with symbol/TF selector, OHLCV candles, volume

import { useState, useEffect, useRef } from "react"
import { useUser }  from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import { BarChart2, RefreshCw, TrendingUp, TrendingDown, Database, Search, ChevronDown } from "lucide-react"

const TIMEFRAMES = ["M1","M5","M15","H1","H4","D1"]

// ── Draw candle chart on canvas ────────────────────────────────────────────
function drawChart(canvas, candles, theme) {
  if(!canvas || !candles.length) return
  const ctx = canvas.getContext("2d")
  const W = canvas.width
  const H = canvas.height
  const PAD = { top:20, right:60, bottom:40, left:10 }
  const CW  = W - PAD.left - PAD.right
  const CH  = H - PAD.top  - PAD.bottom

  ctx.clearRect(0, 0, W, H)

  // Background
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, W, H)

  if(!candles.length) return

  // Price range
  const highs = candles.map(c => c.h)
  const lows  = candles.map(c => c.l)
  const maxP  = Math.max(...highs)
  const minP  = Math.min(...lows)
  const pRange= maxP - minP || 1

  // Volume range
  const maxV = Math.max(...candles.map(c=>c.v)) || 1

  const priceY  = p => PAD.top  + CH * (1 - (p - minP) / pRange) * 0.8
  const volumeH = v => CH * 0.15 * (v / maxV)

  const candleW = Math.max(1, Math.floor(CW / candles.length) - 1)
  const bodyW   = Math.max(1, candleW * 0.6)

  candles.forEach((c, i) => {
    const x = PAD.left + i * (CW / candles.length) + candleW/2
    const isUp = c.c >= c.o

    const color = isUp ? theme.green : theme.red

    // Wick
    ctx.strokeStyle = color
    ctx.lineWidth   = 1
    ctx.beginPath()
    ctx.moveTo(x, priceY(c.h))
    ctx.lineTo(x, priceY(c.l))
    ctx.stroke()

    // Body
    const y1 = priceY(Math.max(c.o, c.c))
    const y2 = priceY(Math.min(c.o, c.c))
    const bodyH = Math.max(1, y2 - y1)
    ctx.fillStyle = isUp ? theme.greenFill : theme.red
    ctx.fillRect(x - bodyW/2, y1, bodyW, bodyH)

    // Volume bar at bottom
    const vh = volumeH(c.v)
    ctx.fillStyle = isUp ? "rgba(46,213,115,0.3)" : "rgba(255,71,87,0.3)"
    ctx.fillRect(x - bodyW/2, H - PAD.bottom - vh, bodyW, vh)
  })

  // Price labels on right axis
  ctx.fillStyle    = theme.text
  ctx.font         = "11px monospace"
  ctx.textAlign    = "left"
  for(let i=0;i<=4;i++) {
    const p = minP + (pRange * i / 4)
    const y = priceY(p)
    ctx.fillStyle = theme.gridLine
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke()
    ctx.fillStyle = theme.text
    ctx.fillText(p.toFixed(p < 10 ? 5 : 2), W - PAD.right + 4, y + 4)
  }

  // Date labels on bottom
  ctx.textAlign = "center"
  const step = Math.ceil(candles.length / 6)
  for(let i=0; i<candles.length; i+=step) {
    const x   = PAD.left + i * (CW / candles.length) + candleW/2
    const date = new Date(candles[i].t)
    const lbl  = date.toLocaleDateString([], { month:"short", day:"numeric" })
    ctx.fillStyle = theme.text
    ctx.fillText(lbl, x, H - 8)
  }
}

// Admin email — must match UserContext and Layout
const ADMIN_EMAIL = "khalifadylla@gmail.com"

export default function MarketCharts() {
  const { user } = useUser()

  // FIX: use email comparison instead of missing is_admin DB column
  const isAdmin   = user?.email === ADMIN_EMAIL
  const checking  = !user  // still loading if no user yet

  const [symbols,   setSymbols]   = useState([])
  const [selSym,    setSelSym]    = useState("")
  const [selTF,     setSelTF]     = useState("H1")
  const [candles,   setCandles]   = useState([])
  const [loading,   setLoading]   = useState(false)
  const [stats,     setStats]     = useState(null)
  const [search,    setSearch]    = useState("")
  const [symOpen,   setSymOpen]   = useState(false)

  const canvasRef = useRef(null)

  // Theme vars pulled from CSS
  const theme = {
    bg:        "#0a0b0f",
    green:     "#2ed573",
    greenFill: "#1a4d2e",
    red:       "#ff4757",
    text:      "#4a4c5e",
    gridLine:  "#1e2030",
  }

  useEffect(() => {
    if (isAdmin) loadSymbols()
  }, [isAdmin])

  async function loadSymbols() {
    const { data } = await supabase
      .from("sylledge_market_data")
      .select("symbol")
      .limit(1000)
    if(!data) return
    const unique = [...new Set(data.map(r=>r.symbol))].sort()
    setSymbols(unique)
    if(unique.length) setSelSym(unique[0])
  }

  useEffect(() => {
    if(selSym && isAdmin) loadCandles()
  }, [selSym, selTF])

  useEffect(() => {
    if(canvasRef.current && candles.length) {
      const canvas = canvasRef.current
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      canvas.getContext("2d").scale(window.devicePixelRatio, window.devicePixelRatio)
      canvas.style.width  = canvas.offsetWidth  + "px"
      canvas.style.height = "420px"
      drawChart(canvas, candles, theme)
    }
  }, [candles])

  async function loadCandles() {
    if(!selSym) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from("sylledge_market_data")
        .select("open_price, high_price, low_price, close_price, volume, candle_time")
        .eq("symbol", selSym)
        .eq("timeframe", selTF)
        .order("candle_time", { ascending: true })
        .limit(500)

      if(!data || !data.length) { setCandles([]); setLoading(false); return }

      const mapped = data.map(r=>({
        t: r.candle_time,
        o: r.open_price,
        h: r.high_price,
        l: r.low_price,
        c: r.close_price,
        v: r.volume || 0,
      }))
      setCandles(mapped)

      // Stats
      const last = mapped[mapped.length-1]
      const first= mapped[0]
      const chg  = ((last.c - first.c) / first.c * 100)
      setStats({
        symbol: selSym,
        tf:     selTF,
        last:   last.c,
        open:   last.o,
        high:   Math.max(...mapped.map(c=>c.h)),
        low:    Math.min(...mapped.map(c=>c.l)),
        change: chg,
        bars:   mapped.length,
      })
    } catch(e) {
      console.error(e)
    }
    setLoading(false)
  }

  const filteredSyms = symbols.filter(s => s.toLowerCase().includes(search.toLowerCase()))

  // ── Still loading user ────────────────────────────────────────────────────
  if(checking && !user) return (
    <div className="flex items-center justify-center h-64">
      <RefreshCw size={20} className="animate-spin" style={{color:"var(--text-muted)"}}/>
    </div>
  )

  // ── Not admin ──────────────────────────────────────────────────────────────
  if(!isAdmin) return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <Database size={40} className="mb-4" style={{color:"var(--text-muted)"}}/>
      <h2 className="text-lg font-bold mb-2" style={{color:"var(--text-primary)"}}>Market Data</h2>
      <p className="text-sm max-w-sm" style={{color:"var(--text-muted)"}}>
        Market chart visualization is available to admins only. Your SYLLEDGE AI and AI Backtesting automatically use this data for deeper analysis.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-120px)]">

      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{background:"linear-gradient(135deg,#1a73e8,#00d4aa)"}}>
            <BarChart2 size={18} className="text-white"/>
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{color:"var(--text-primary)"}}>Market Charts</h1>
            <p className="text-xs" style={{color:"var(--text-muted)"}}>
              Admin only · {symbols.length} symbols loaded from MT5
            </p>
          </div>
        </div>
        <button onClick={loadCandles} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border"
          style={{background:"var(--bg-elevated)",borderColor:"var(--border)",color:"var(--text-secondary)"}}>
          <RefreshCw size={13} className={loading?"animate-spin":""}/>
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-shrink-0 flex-wrap">
        {/* Symbol picker */}
        <div className="relative">
          <button onClick={()=>setSymOpen(o=>!o)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold"
            style={{background:"var(--bg-card)",borderColor:"var(--border)",color:"var(--text-primary)",minWidth:140}}>
            {selSym || "Select symbol"}
            <ChevronDown size={14} style={{color:"var(--text-muted)"}}/>
          </button>
          {symOpen && (
            <div className="absolute top-full left-0 mt-1 rounded-xl shadow-2xl z-50 overflow-hidden"
              style={{background:"var(--bg-elevated)",border:"1px solid var(--border)",width:220}}>
              <div className="p-2">
                <input value={search} onChange={e=>setSearch(e.target.value)}
                  placeholder="Search symbols…"
                  className="w-full px-3 py-1.5 rounded-lg text-xs bg-transparent border outline-none"
                  style={{borderColor:"var(--border)",color:"var(--text-primary)"}}/>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredSyms.map(s=>(
                  <button key={s} onClick={()=>{ setSelSym(s); setSymOpen(false); setSearch("") }}
                    className="w-full text-left px-4 py-2 text-sm hover:opacity-80"
                    style={{background:s===selSym?"rgba(108,99,255,0.15)":"transparent",color:s===selSym?"var(--accent)":"var(--text-secondary)"}}>
                    {s}
                  </button>
                ))}
                {!filteredSyms.length && (
                  <p className="px-4 py-3 text-xs" style={{color:"var(--text-muted)"}}>
                    No symbols loaded yet. Run the Market Data EA first.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1 p-1 rounded-xl" style={{background:"var(--bg-elevated)"}}>
          {TIMEFRAMES.map(tf=>(
            <button key={tf} onClick={()=>setSelTF(tf)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
              style={{background:selTF===tf?"var(--accent)":"transparent",color:selTF===tf?"#fff":"var(--text-muted)"}}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="flex gap-3 flex-wrap flex-shrink-0">
          {[
            { label:"Last",   value:stats.last.toFixed(stats.last<10?5:2),  color:"var(--text-primary)" },
            { label:"Open",   value:stats.open.toFixed(stats.last<10?5:2),  color:"var(--text-secondary)" },
            { label:"High",   value:stats.high.toFixed(stats.last<10?5:2),  color:"var(--accent-success)" },
            { label:"Low",    value:stats.low.toFixed(stats.last<10?5:2),   color:"var(--accent-danger)" },
            { label:"Change", value:(stats.change>=0?"+":"")+stats.change.toFixed(2)+"%", color:stats.change>=0?"var(--accent-success)":"var(--accent-danger)" },
            { label:"Bars",   value:stats.bars, color:"var(--text-muted)" },
          ].map(s=>(
            <div key={s.label} className="px-3 py-2 rounded-xl"
              style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
              <p className="text-xs" style={{color:"var(--text-muted)"}}>{s.label}</p>
              <p className="text-sm font-bold" style={{color:s.color}}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 rounded-2xl overflow-hidden relative"
        style={{background:"var(--bg-card)",border:"1px solid var(--border)"}}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10"
            style={{background:"rgba(10,11,15,0.7)"}}>
            <RefreshCw size={24} className="animate-spin" style={{color:"var(--accent)"}}/>
          </div>
        )}

        {!selSym && (
          <div className="flex flex-col items-center justify-center h-full">
            <BarChart2 size={40} className="mb-3" style={{color:"var(--text-muted)"}}/>
            <p style={{color:"var(--text-muted)"}}>Select a symbol to view the chart</p>
            {!symbols.length && (
              <p className="text-xs mt-2 max-w-xs text-center" style={{color:"var(--text-muted)"}}>
                No data yet. Run TradeSylla_MarketData.ex5 on your MT5 with FullHistorySync=true to populate.
              </p>
            )}
          </div>
        )}

        {selSym && !candles.length && !loading && (
          <div className="flex flex-col items-center justify-center h-full">
            <Database size={40} className="mb-3" style={{color:"var(--text-muted)"}}/>
            <p style={{color:"var(--text-muted)"}}>No {selTF} data for {selSym}</p>
            <p className="text-xs mt-1" style={{color:"var(--text-muted)"}}>Run the Market Data EA to import this timeframe.</p>
          </div>
        )}

        {candles.length > 0 && (
          <canvas
            ref={canvasRef}
            className="w-full"
            style={{height:420,display:"block"}}
          />
        )}
      </div>
    </div>
  )
}
