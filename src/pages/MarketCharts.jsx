// src/pages/MarketCharts.jsx  v2.0
// Full TradingView-style chart — Lightweight Charts engine + drawing overlay
// requires: npm install lightweight-charts

import { useState, useEffect, useRef, useCallback } from "react"
import { createChart, CrosshairMode, CandlestickSeries, HistogramSeries } from "lightweight-charts"
import { useUser }  from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import {
  BarChart2, RefreshCw, Database, ChevronDown,
  MousePointer, Minus, Square, Trash2, RotateCcw,
  TrendingUp, ZoomIn, Maximize2
} from "lucide-react"

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMEFRAMES = ["M1","M5","M15","H1","H4","D1"]

const FIB_LEVELS  = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]
const FIB_COLORS  = ["#ff4757","#ff6348","#ffa502","#ffffff","#2ed573","#1e90ff","#ff4757"]

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS = [
  {
    id: "cursor", label: "Cursor / Pan", shortcut: "V",
    icon: () => <MousePointer size={15}/>,
  },
  {
    id: "hline", label: "Horizontal Line", shortcut: "H",
    icon: () => <Minus size={15}/>,
  },
  {
    id: "vline", label: "Vertical Line", shortcut: "X",
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <line x1="7.5" y1="1" x2="7.5" y2="14" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2,1.5"/>
      </svg>
    ),
  },
  {
    id: "trendline", label: "Trend Line", shortcut: "T",
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <line x1="1" y1="13" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="1.5" cy="12.5" r="1.5" fill="currentColor"/>
        <circle cx="13.5" cy="2.5" r="1.5" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: "ray", label: "Ray (Extended Line)", shortcut: "R",
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <line x1="1" y1="13" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="1.5" cy="12.5" r="1.5" fill="currentColor"/>
        <line x1="10" y1="5" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2,1"/>
      </svg>
    ),
  },
  {
    id: "rect", label: "Rectangle", shortcut: "B",
    icon: () => <Square size={14}/>,
  },
  {
    id: "fib", label: "Fibonacci Retracement", shortcut: "F",
    icon: () => (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <line x1="1" y1="2"  x2="14" y2="2"  stroke="#ff4757" strokeWidth="1"/>
        <line x1="1" y1="5"  x2="14" y2="5"  stroke="#ffa502" strokeWidth="1"/>
        <line x1="1" y1="7.5" x2="14" y2="7.5" stroke="currentColor" strokeWidth="1"/>
        <line x1="1" y1="10" x2="14" y2="10" stroke="#2ed573" strokeWidth="1"/>
        <line x1="1" y1="13" x2="14" y2="13" stroke="#1e90ff" strokeWidth="1"/>
      </svg>
    ),
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPrice(p) {
  if (p === null || p === undefined) return "—"
  return p < 10 ? p.toFixed(5) : p.toFixed(2)
}

function fmtChange(c) {
  const sign = c >= 0 ? "+" : ""
  return `${sign}${c.toFixed(2)}%`
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarketCharts() {
  const { user, isAdmin } = useUser()

  // Data state
  const [symbols,  setSymbols]  = useState([])
  const [selSym,   setSelSym]   = useState("")
  const [selTF,    setSelTF]    = useState("H1")
  const [loading,  setLoading]  = useState(false)
  const [stats,    setStats]    = useState(null)
  const [ohlcv,    setOhlcv]    = useState(null)   // live crosshair values
  const [symOpen,  setSymOpen]  = useState(false)
  const [search,   setSearch]   = useState("")
  const [barCount, setBarCount] = useState(0)

  // Drawing state
  const [activeTool,    setActiveTool]    = useState("cursor")
  const [drawings,      setDrawings]      = useState([])
  const [pendingDraw,   setPendingDraw]   = useState(null)

  // Refs
  const containerRef     = useRef(null)
  const chartRef         = useRef(null)
  const candleSeriesRef  = useRef(null)
  const volumeSeriesRef  = useRef(null)
  const overlayRef       = useRef(null)
  const candlesRef       = useRef([])       // raw data for coord lookup
  const drawingsRef      = useRef([])
  const pendingRef       = useRef(null)
  const activeToolRef    = useRef("cursor")
  const roRef            = useRef(null)

  // Keep refs synced
  useEffect(() => { drawingsRef.current  = drawings },   [drawings])
  useEffect(() => { pendingRef.current   = pendingDraw }, [pendingDraw])
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return
    const handler = e => {
      if (e.target.tagName === "INPUT") return
      const map = { v:"cursor", h:"hline", x:"vline", t:"trendline", r:"ray", b:"rect", f:"fib" }
      const tool = map[e.key.toLowerCase()]
      if (tool) { setActiveTool(tool); e.preventDefault() }
      if (e.key === "Escape") { setPendingDraw(null); setActiveTool("cursor") }
      if ((e.key === "Delete" || e.key === "Backspace") && drawings.length) {
        setDrawings(prev => prev.slice(0, -1))
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isAdmin, drawings])

  // ── Init Lightweight Charts ─────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !isAdmin) return

    // Clean up previous instance
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null }

    const container = containerRef.current
    const chart = createChart(container, {
      width:  container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor: "#6b7280",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(108,99,255,0.5)",
          labelBackgroundColor: "#6c63ff",
          width: 1,
          style: 2,
        },
        horzLine: {
          color: "rgba(108,99,255,0.5)",
          labelBackgroundColor: "#6c63ff",
          width: 1,
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.06)",
        scaleMargins: { top: 0.08, bottom: 0.22 },
        textColor: "#6b7280",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          const d = new Date(time * 1000)
          return d.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale:  { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         "#2ed573",
      downColor:       "#ff4757",
      borderUpColor:   "#2ed573",
      borderDownColor: "#ff4757",
      wickUpColor:     "#2ed573",
      wickDownColor:   "#ff4757",
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:    { type: "volume" },
      priceScaleId:   "",
      scaleMargins:   { top: 0.82, bottom: 0 },
    })

    chartRef.current        = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    // Crosshair → live OHLCV
    chart.subscribeCrosshairMove(param => {
      if (!param.time || !candleSeriesRef.current) { setOhlcv(null); return }
      const d = param.seriesData?.get(candleSeriesRef.current)
      if (d) setOhlcv({ time: param.time, o: d.open, h: d.high, l: d.low, c: d.close })
    })

    // Redraw drawings on any chart change
    const redraw = () => redrawOverlay()
    chart.timeScale().subscribeVisibleTimeRangeChange(redraw)
    chart.subscribeCrosshairMove(redraw)

    // Resize
    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return
      const { clientWidth: w, clientHeight: h } = containerRef.current
      chartRef.current.applyOptions({ width: w, height: h })
      syncOverlay()
      redrawOverlay()
    })
    ro.observe(container)
    roRef.current = ro

    syncOverlay()

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
    }
  }, [isAdmin]) // eslint-disable-line

  // ── Load symbols ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return
    supabase.from("sylledge_market_data").select("symbol").limit(2000).then(({ data }) => {
      if (!data) return
      const unique = [...new Set(data.map(r => r.symbol))].sort()
      setSymbols(unique)
      if (unique.length) setSelSym(prev => prev || unique[0])
    })
  }, [isAdmin])

  // ── Load candles ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selSym && isAdmin && candleSeriesRef.current) loadCandles()
  }, [selSym, selTF]) // eslint-disable-line

  async function loadCandles() {
    if (!selSym || !candleSeriesRef.current) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from("sylledge_market_data")
        .select("open_price,high_price,low_price,close_price,volume,candle_time")
        .eq("symbol", selSym)
        .eq("timeframe", selTF)
        .order("candle_time", { ascending: true })
        .limit(1500)

      if (!data?.length) {
        candleSeriesRef.current.setData([])
        volumeSeriesRef.current?.setData([])
        candlesRef.current = []
        setStats(null)
        setLoading(false)
        return
      }

      const candles = data.map(r => ({
        time:  Math.floor(new Date(r.candle_time).getTime() / 1000),
        open:  r.open_price,
        high:  r.high_price,
        low:   r.low_price,
        close: r.close_price,
      }))
      const volumes = data.map(r => ({
        time:  Math.floor(new Date(r.candle_time).getTime() / 1000),
        value: r.volume || 0,
        color: r.close_price >= r.open_price ? "rgba(46,213,115,0.25)" : "rgba(255,71,87,0.25)",
      }))

      candleSeriesRef.current.setData(candles)
      volumeSeriesRef.current?.setData(volumes)
      chartRef.current?.timeScale().fitContent()
      candlesRef.current = candles
      setBarCount(candles.length)

      const last  = data[data.length - 1]
      const first = data[0]
      setStats({
        last:   last.close_price,
        open:   last.open_price,
        high:   Math.max(...data.map(d => d.high_price)),
        low:    Math.min(...data.map(d => d.low_price)),
        change: (last.close_price - first.close_price) / first.close_price * 100,
      })
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  // ── Overlay helpers ─────────────────────────────────────────────────────────
  function syncOverlay() {
    if (!overlayRef.current || !containerRef.current) return
    const { clientWidth: w, clientHeight: h } = containerRef.current
    const dpr = window.devicePixelRatio || 1
    overlayRef.current.width  = w * dpr
    overlayRef.current.height = h * dpr
    overlayRef.current.style.width  = w + "px"
    overlayRef.current.style.height = h + "px"
  }

  const redrawOverlay = useCallback(() => {
    if (!overlayRef.current || !chartRef.current || !candleSeriesRef.current) return
    const canvas = overlayRef.current
    const dpr    = window.devicePixelRatio || 1
    const ctx    = canvas.getContext("2d")
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.scale(dpr, dpr)

    const W = canvas.width / dpr
    const H = canvas.height / dpr

    const tToX = t  => chartRef.current.timeScale().timeToCoordinate(t)
    const pToY = p  => candleSeriesRef.current.priceToCoordinate(p)

    const allDrawings = [...drawingsRef.current, ...(pendingRef.current ? [pendingRef.current] : [])]

    for (const d of allDrawings) {
      const alpha = d.pending ? 0.55 : 1
      ctx.globalAlpha = alpha

      if (d.type === "hline") {
        const y = pToY(d.price)
        if (y == null) continue
        ctx.strokeStyle = "#6c63ff"
        ctx.lineWidth   = 1.5
        ctx.setLineDash([5, 3])
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
        ctx.setLineDash([])
        // Label
        ctx.fillStyle = "#6c63ff"
        ctx.font = "bold 10px monospace"
        ctx.textAlign = "right"
        ctx.fillText(fmtPrice(d.price), W - 6, y - 4)
      }

      else if (d.type === "vline") {
        const x = tToX(d.time)
        if (x == null) continue
        ctx.strokeStyle = "#ffa502"
        ctx.lineWidth   = 1.5
        ctx.setLineDash([5, 3])
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
        ctx.setLineDash([])
      }

      else if (d.type === "trendline" || d.type === "ray") {
        if (!d.p1) continue
        const ax = tToX(d.p1.time), ay = pToY(d.p1.price)
        if (ax == null) continue
        // Dot at P1
        ctx.fillStyle = "#2ed573"
        ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill()

        if (!d.p2) continue
        const bx = tToX(d.p2.time), by = pToY(d.p2.price)
        if (bx == null) continue

        // For ray: extend line to edge of chart
        let x1 = ax, y1 = ay, x2 = bx, y2 = by
        if (d.type === "ray") {
          const dx = bx - ax, dy = by - ay
          const t  = Math.max((W - ax) / (dx || 1), (0 - ax) / (dx || 1))
          x2 = ax + dx * t; y2 = ay + dy * t
        }

        ctx.strokeStyle = "#2ed573"
        ctx.lineWidth   = 1.5
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()

        ctx.fillStyle = "#2ed573"
        ctx.beginPath(); ctx.arc(bx, by, 4, 0, Math.PI * 2); ctx.fill()
      }

      else if (d.type === "rect") {
        if (!d.p1) continue
        const ax = tToX(d.p1.time), ay = pToY(d.p1.price)
        if (ax == null) continue
        if (!d.p2) { ctx.fillStyle="#1e90ff"; ctx.beginPath(); ctx.arc(ax,ay,4,0,Math.PI*2); ctx.fill(); continue }
        const bx = tToX(d.p2.time), by = pToY(d.p2.price)
        if (bx == null) continue
        const rx = Math.min(ax, bx), ry = Math.min(ay, by)
        const rw = Math.abs(bx - ax),  rh = Math.abs(by - ay)
        ctx.fillStyle   = "rgba(30,144,255,0.06)"
        ctx.strokeStyle = "#1e90ff"
        ctx.lineWidth   = 1.5
        ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 2)
        ctx.fill(); ctx.stroke()
      }

      else if (d.type === "fib") {
        if (!d.p1 || !d.p2) continue
        const ax = tToX(d.p1.time), bx = tToX(d.p2.time)
        if (ax == null || bx == null) continue
        const x1 = Math.min(ax, bx), x2 = Math.max(ax, bx)
        const pHigh = Math.max(d.p1.price, d.p2.price)
        const pLow  = Math.min(d.p1.price, d.p2.price)
        const pRange = pHigh - pLow

        FIB_LEVELS.forEach((level, i) => {
          const price = pLow + pRange * (1 - level)
          const y = pToY(price)
          if (y == null) return
          ctx.strokeStyle = FIB_COLORS[i]
          ctx.lineWidth   = 1
          ctx.setLineDash([4, 2])
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStyle = FIB_COLORS[i]
          ctx.font = "10px monospace"
          ctx.textAlign = "left"
          ctx.fillText(`${(level * 100).toFixed(1)}%  ${fmtPrice(price)}`, x2 + 4, y + 3)
        })
      }
    }

    ctx.restore()
  }, [])

  // Redraw when drawings or pending changes
  useEffect(() => { redrawOverlay() }, [drawings, pendingDraw, redrawOverlay])

  // ── Mouse event helpers ─────────────────────────────────────────────────────
  function getCoords(e) {
    if (!overlayRef.current || !chartRef.current || !candleSeriesRef.current) return null
    const rect  = overlayRef.current.getBoundingClientRect()
    const x     = e.clientX - rect.left
    const y     = e.clientY - rect.top
    const price = candleSeriesRef.current.coordinateToPrice(y)
    const log   = chartRef.current.timeScale().coordinateToLogical(x)
    if (price == null || log == null) return null
    const idx  = Math.max(0, Math.min(Math.round(log), candlesRef.current.length - 1))
    const time = candlesRef.current[idx]?.time
    return { x, y, time, price }
  }

  function handleMouseDown(e) {
    const tool = activeToolRef.current
    if (tool === "cursor") return
    const coords = getCoords(e)
    if (!coords) return

    if (tool === "hline") {
      setDrawings(prev => [...prev, { id: Date.now(), type: "hline", price: coords.price }])
    } else if (tool === "vline") {
      setDrawings(prev => [...prev, { id: Date.now(), type: "vline", time: coords.time }])
    } else {
      // Two-point tools
      if (!pendingRef.current) {
        setPendingDraw({ id: Date.now(), type: tool, pending: true, p1: { time: coords.time, price: coords.price } })
      } else {
        const finalized = { ...pendingRef.current, pending: false, p2: { time: coords.time, price: coords.price } }
        setDrawings(prev => [...prev, finalized])
        setPendingDraw(null)
      }
    }
  }

  function handleMouseMove(e) {
    if (!pendingRef.current) return
    const coords = getCoords(e)
    if (!coords) return
    setPendingDraw(prev => prev ? { ...prev, p2: { time: coords.time, price: coords.price } } : prev)
  }

  function handleMouseLeave() {
    // don't cancel pending — user might click back in
  }

  // ── Cursor style for active tool ────────────────────────────────────────────
  const overlayCursor = activeTool === "cursor" ? "default" :
    (activeTool === "hline" || activeTool === "vline") ? "crosshair" : "crosshair"

  const overlayPointerEvents = activeTool === "cursor" ? "none" : "all"

  // ── Non-admin gate ──────────────────────────────────────────────────────────
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background:"rgba(108,99,255,0.1)" }}>
        <Database size={26} style={{ color:"var(--accent)" }}/>
      </div>
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color:"var(--text-primary)" }}>Market Data</h2>
        <p className="text-sm max-w-sm" style={{ color:"var(--text-muted)" }}>
          Chart visualization is admin-only. SYLLEDGE AI and AI Backtesting use this data automatically.
        </p>
      </div>
    </div>
  )

  // ── Filtered symbols ────────────────────────────────────────────────────────
  const filteredSyms = symbols.filter(s => s.toLowerCase().includes(search.toLowerCase()))

  // ── OHLCV display (crosshair or stats fallback) ─────────────────────────────
  const display = ohlcv
    ? { o: ohlcv.o, h: ohlcv.h, l: ohlcv.l, c: ohlcv.c }
    : stats
    ? { o: stats.open, h: stats.high, l: stats.low, c: stats.last }
    : null

  return (
    <div className="flex flex-col gap-0 h-[calc(100vh-80px)]" style={{ minHeight: 0 }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 flex-shrink-0 flex-wrap"
        style={{ background:"var(--bg-card)", borderBottom:"1px solid var(--border)" }}>

        {/* Symbol dropdown */}
        <div className="relative">
          <button
            onClick={() => setSymOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold"
            style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", color:"var(--text-primary)", minWidth:130 }}>
            <BarChart2 size={13} style={{ color:"var(--accent)" }}/>
            {selSym || "Select"}
            <ChevronDown size={12} style={{ color:"var(--text-muted)", marginLeft:"auto" }}/>
          </button>
          {symOpen && (
            <div className="absolute top-full left-0 mt-1 rounded-xl shadow-2xl z-50 overflow-hidden"
              style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)", width:200 }}>
              <div className="p-2">
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background:"var(--bg-card)", border:"1px solid var(--border)", color:"var(--text-primary)" }}/>
              </div>
              <div className="max-h-56 overflow-y-auto pb-1">
                {filteredSyms.map(s => (
                  <button key={s} onClick={() => { setSelSym(s); setSymOpen(false); setSearch("") }}
                    className="w-full text-left px-3 py-1.5 text-xs font-semibold hover:opacity-80"
                    style={{ background: s === selSym ? "rgba(108,99,255,0.15)" : "transparent",
                      color: s === selSym ? "var(--accent)" : "var(--text-secondary)" }}>
                    {s}
                  </button>
                ))}
                {!filteredSyms.length && (
                  <p className="px-3 py-3 text-xs" style={{ color:"var(--text-muted)" }}>
                    No symbols yet — run MarketData EA first.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background:"var(--bg-elevated)" }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf} onClick={() => setSelTF(tf)}
              className="px-2.5 py-1 rounded-md text-xs font-bold transition-all"
              style={{ background: selTF === tf ? "var(--accent)" : "transparent",
                color: selTF === tf ? "#fff" : "var(--text-muted)" }}>
              {tf}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background:"var(--border)" }}/>

        {/* OHLCV info */}
        {display && (
          <div className="flex items-center gap-3 text-xs font-mono">
            {[["O", display.o, "var(--text-secondary)"],
              ["H", display.h, "var(--accent-success)"],
              ["L", display.l, "var(--accent-danger)"],
              ["C", display.c, "var(--text-primary)"]
            ].map(([lbl, val, col]) => (
              <span key={lbl} style={{ color:"var(--text-muted)" }}>
                {lbl} <span style={{ color: col, fontWeight:700 }}>{fmtPrice(val)}</span>
              </span>
            ))}
            {stats && (
              <span style={{ color: stats.change >= 0 ? "var(--accent-success)" : "var(--accent-danger)", fontWeight:700 }}>
                {fmtChange(stats.change)}
              </span>
            )}
          </div>
        )}

        {/* Right side controls */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color:"var(--text-muted)" }}>
            {barCount > 0 ? `${barCount} bars` : ""}
          </span>
          <button onClick={() => { chartRef.current?.timeScale().fitContent() }}
            title="Fit content"
            className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
            style={{ color:"var(--text-muted)", background:"var(--bg-elevated)" }}>
            <Maximize2 size={13}/>
          </button>
          <button onClick={loadCandles} disabled={loading}
            className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"
            style={{ color:"var(--text-muted)", background:"var(--bg-elevated)" }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""}/>
          </button>
        </div>
      </div>

      {/* ── Chart + toolbar row ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left toolbar */}
        <div className="flex flex-col items-center gap-1 py-2 px-1.5 flex-shrink-0"
          style={{ background:"var(--bg-card)", borderRight:"1px solid var(--border)", width:40 }}>
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              title={`${tool.label} (${tool.shortcut})`}
              onClick={() => { setActiveTool(tool.id); if (tool.id === "cursor") setPendingDraw(null) }}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:opacity-90"
              style={{
                background: activeTool === tool.id ? "rgba(108,99,255,0.25)" : "transparent",
                color:      activeTool === tool.id ? "var(--accent)" : "var(--text-muted)",
                border:     activeTool === tool.id ? "1px solid rgba(108,99,255,0.4)" : "1px solid transparent",
              }}>
              <tool.icon/>
            </button>
          ))}

          <div className="flex-1"/>

          {/* Undo */}
          <button
            title="Undo last (Backspace)"
            onClick={() => setDrawings(prev => prev.slice(0, -1))}
            disabled={!drawings.length}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:opacity-80 disabled:opacity-20"
            style={{ color:"var(--text-muted)" }}>
            <RotateCcw size={13}/>
          </button>

          {/* Clear all */}
          <button
            title="Clear all drawings"
            onClick={() => { setDrawings([]); setPendingDraw(null) }}
            disabled={!drawings.length}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:opacity-80 disabled:opacity-20"
            style={{ color:"var(--text-muted)" }}>
            <Trash2 size={13}/>
          </button>
        </div>

        {/* Chart area */}
        <div className="flex-1 relative min-w-0 min-h-0" ref={containerRef}
          style={{ background:"#080910" }}>

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-20"
              style={{ background:"rgba(8,9,16,0.75)" }}>
              <RefreshCw size={22} className="animate-spin" style={{ color:"var(--accent)" }}/>
            </div>
          )}

          {/* Empty state */}
          {!loading && !selSym && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
              <BarChart2 size={36} style={{ color:"var(--text-muted)" }}/>
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>Select a symbol to begin</p>
            </div>
          )}

          {!loading && selSym && barCount === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3">
              <Database size={36} style={{ color:"var(--text-muted)" }}/>
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>No {selTF} data for {selSym}</p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Run the MarketData EA to import this timeframe.</p>
            </div>
          )}

          {/* Drawing overlay canvas — sits above LWC, pointer-events controlled by tool */}
          <canvas
            ref={overlayRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="absolute inset-0 z-10"
            style={{
              cursor: overlayCursor,
              pointerEvents: overlayPointerEvents,
            }}
          />

          {/* Tool hint */}
          {activeTool !== "cursor" && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full text-xs pointer-events-none"
              style={{ background:"rgba(108,99,255,0.2)", border:"1px solid rgba(108,99,255,0.3)", color:"var(--accent)" }}>
              {pendingDraw
                ? "Click to set second point · Esc to cancel"
                : `${TOOLS.find(t => t.id === activeTool)?.label} — click to place`}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
