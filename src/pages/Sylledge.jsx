import { useState, useEffect, useRef, useCallback } from "react"
import { Trade, Playbook, SylledgeInsight } from "@/api/supabaseStore"
import { useUser } from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/toast"
import {
  Brain, Sparkles, Send, RefreshCw, TrendingUp, TrendingDown,
  Target, BarChart3, Shield, Zap, Clock, X, Database,
  AlertTriangle, CheckCircle, Lightbulb, MessageSquare, Activity,
  BookOpen, Camera, Cpu, MemoryStick, Download, FileText,
  Table, Globe, ChevronDown, ChevronUp, Eye
} from "lucide-react"

// ─── Constants ────────────────────────────────────────────────────────────────
const MEMORY_KEY     = "sylledge_chat_v2"
const STRATEGY_KEY   = "sylledge_strategy_v2"
const MAX_HISTORY    = 40
const AI_MODEL       = "claude-haiku-4-5-20251001"

// ─── Supabase memory helpers ──────────────────────────────────────────────────
async function loadMemory(userId, key) {
  try {
    const { data } = await supabase
      .from("sylledge_memory")
      .select("value")
      .eq("user_id", userId)
      .eq("key", key)
      .single()
    return data?.value || null
  } catch { return null }
}

async function saveMemory(userId, key, value) {
  try {
    await supabase.from("sylledge_memory").upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,key" }
    )
  } catch (e) { console.warn("Memory save failed:", e) }
}

// ─── localStorage fallback ────────────────────────────────────────────────────
function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ─── Chart comparison engine ──────────────────────────────────────────────────
// Builds a rich text + numeric summary of what happened AFTER a trade entry
function buildChartComparison(trade, candles) {
  if (!candles || candles.length === 0) return null

  const entryTime  = new Date(trade.entry_time).getTime()
  const exitTime   = trade.exit_time ? new Date(trade.exit_time).getTime() : null
  const entryPrice = parseFloat(trade.entry_price) || 0
  const exitPrice  = parseFloat(trade.exit_price)  || 0
  const direction  = trade.direction || "BUY"
  const sl         = parseFloat(trade.sl) || 0
  const tp         = parseFloat(trade.tp) || 0

  // Split candles into: before entry, during trade, after trade
  const beforeCandles  = candles.filter(c => new Date(c.t).getTime() < entryTime)
  const duringCandles  = candles.filter(c => {
    const t = new Date(c.t).getTime()
    return t >= entryTime && (!exitTime || t <= exitTime)
  })
  const afterCandles   = candles.filter(c => exitTime && new Date(c.t).getTime() > exitTime)

  // What actually happened after exit — did the move continue?
  const postExitCandles = afterCandles.slice(0, 20)
  const postHigh = postExitCandles.length ? Math.max(...postExitCandles.map(c => parseFloat(c.h))) : null
  const postLow  = postExitCandles.length ? Math.min(...postExitCandles.map(c => parseFloat(c.l))) : null

  // Max favorable / adverse excursion during trade
  const tradeHighs = duringCandles.map(c => parseFloat(c.h))
  const tradeLows  = duringCandles.map(c => parseFloat(c.l))
  const maxHigh    = tradeHighs.length ? Math.max(...tradeHighs) : exitPrice
  const minLow     = tradeLows.length  ? Math.min(...tradeLows)  : exitPrice

  // For BUY: MFE = maxHigh - entryPrice, MAE = entryPrice - minLow
  // For SELL: MFE = entryPrice - minLow, MAE = maxHigh - entryPrice
  const pip = getPipSize(trade.symbol)
  const mfe = direction === "BUY"
    ? (maxHigh - entryPrice) / pip
    : (entryPrice - minLow)  / pip
  const mae = direction === "BUY"
    ? (entryPrice - minLow)  / pip
    : (maxHigh - entryPrice) / pip

  // Did price reach TP/SL after the trader exited?
  let postExitReachedTP = false
  let postExitReachedSL = false
  if (tp > 0 && postExitCandles.length) {
    postExitReachedTP = direction === "BUY"
      ? postHigh >= tp
      : postLow  <= tp
  }
  if (sl > 0 && postExitCandles.length) {
    postExitReachedSL = direction === "BUY"
      ? postLow  <= sl
      : postHigh >= sl
  }

  // Actual pips captured vs available
  const pipsCaptured = direction === "BUY"
    ? (exitPrice - entryPrice) / pip
    : (entryPrice - exitPrice) / pip

  // Pre-entry context — what was market doing before?
  const pre5 = beforeCandles.slice(-5)
  const preTrend = pre5.length >= 2
    ? (pre5[pre5.length-1].c > pre5[0].c ? "bullish" : "bearish")
    : "neutral"

  return {
    symbol:            trade.symbol,
    direction,
    outcome:           trade.outcome,
    entryPrice,
    exitPrice,
    sl, tp,
    pipsCaptured:      parseFloat(pipsCaptured.toFixed(1)),
    mfe:               parseFloat(mfe.toFixed(1)),   // max pips available in your direction
    mae:               parseFloat(mae.toFixed(1)),   // max pips went against you
    preTrend,
    postExitReachedTP,
    postExitReachedSL,
    postHigh:          postHigh ? parseFloat(postHigh.toFixed(5)) : null,
    postLow:           postLow  ? parseFloat(postLow.toFixed(5))  : null,
    candleCount:       candles.length,
    duringCount:       duringCandles.length,
    afterCount:        afterCandles.length,
    // Efficiency: how much of the available move did trader capture?
    efficiency:        mfe > 0 ? parseFloat((pipsCaptured / mfe * 100).toFixed(1)) : 0,
  }
}

function getPipSize(symbol) {
  if (!symbol) return 0.0001
  const s = symbol.toUpperCase()
  if (s.includes("JPY")) return 0.01
  if (s.includes("XAU") || s.includes("GOLD")) return 0.1
  if (s.includes("US30") || s.includes("NAS") || s.includes("SPX")) return 1
  return 0.0001
}

function chartComparisonToText(comp) {
  if (!comp) return ""
  const lines = [
    `CHART ANALYSIS — ${comp.direction} ${comp.symbol} | ${comp.outcome}`,
    `Entry: ${comp.entryPrice} → Exit: ${comp.exitPrice}`,
    `Pips captured: ${comp.pipsCaptured} pips`,
    `Max Favorable Excursion (MFE): ${comp.mfe} pips available in your direction`,
    `Max Adverse Excursion (MAE): ${comp.mae} pips went against you`,
    `Capture efficiency: ${comp.efficiency}% of the available move`,
    `Pre-entry market trend: ${comp.preTrend}`,
  ]
  if (comp.sl > 0) lines.push(`SL placed at: ${comp.sl}`)
  if (comp.tp > 0) lines.push(`TP placed at: ${comp.tp}`)
  if (comp.postHigh !== null) {
    lines.push(`After your exit — market continued to: High ${comp.postHigh} / Low ${comp.postLow}`)
    if (comp.postExitReachedTP) lines.push(`✓ Price DID reach your TP after you exited`)
    if (comp.postExitReachedSL) lines.push(`✗ Price hit your SL level after you exited`)
  }
  return lines.join("\n")
}

// ─── Strategy memory builder ──────────────────────────────────────────────────
function buildStrategyMemory(playbooks) {
  if (!playbooks.length) return ""
  const active = playbooks.filter(p => p.status === "active")
  if (!active.length) return ""

  return active.map(p => {
    const entryRules = (p.entry_rules || []).filter(Boolean).join("; ")
    const exitRules  = (p.exit_rules  || []).filter(Boolean).join("; ")
    const riskRules  = (p.risk_rules  || []).filter(Boolean).join("; ")
    const buyRules   = (p.buy_rules   || []).filter(Boolean).join("; ")
    const sellRules  = (p.sell_rules  || []).filter(Boolean).join("; ")
    return [
      `STRATEGY: "${p.name}" [${p.category}] — ${p.status}`,
      `Description: ${p.description || "—"}`,
      `Sessions: ${(p.sessions || []).join(", ") || "any"}`,
      `Timeframes: ${(p.timeframes || []).join(", ") || "any"}`,
      `Pairs: ${(p.pairs || []).join(", ") || "any"}`,
      `Entry rules: ${entryRules || "—"}`,
      `Exit rules: ${exitRules || "—"}`,
      `Risk rules: ${riskRules || "—"}`,
      `BUY confluences: ${buyRules || "—"}`,
      `SELL confluences: ${sellRules || "—"}`,
      `Target WR: ${p.win_rate || "?"}% | Target PF: ${p.profit_factor || "?"} | Target RR: ${p.avg_rr || "?"}`,
      `Notes: ${p.notes || "—"}`,
    ].join("\n")
  }).join("\n\n")
}

// ─── Trade performance context ────────────────────────────────────────────────
function buildTradeContext(trades) {
  if (!trades.length) return "No trades logged yet."
  const wins    = trades.filter(t => t.outcome === "WIN")
  const losses  = trades.filter(t => t.outcome === "LOSS")
  const netPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = (wins.length / trades.length * 100).toFixed(1)
  const avgWin  = wins.length   ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length   : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0) / losses.length) : 0

  const bySym = {}
  trades.forEach(t => {
    const k = t.symbol || "UNKNOWN"
    if (!bySym[k]) bySym[k] = { pnl: 0, n: 0, wins: 0 }
    bySym[k].pnl += t.pnl || 0; bySym[k].n++
    if (t.outcome === "WIN") bySym[k].wins++
  })
  const symLines = Object.entries(bySym)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([s, d]) => `  ${s}: ${d.n} trades | $${d.pnl.toFixed(2)} | ${(d.wins/d.n*100).toFixed(0)}%WR`)
    .join("\n")

  const recent = [...trades]
    .sort((a, b) => new Date(b.entry_time) - new Date(a.entry_time))
    .slice(0, 20)
    .map(t => `  ${t.direction} ${t.symbol} | ${t.outcome} | $${(t.pnl||0).toFixed(2)} | ${t.session}/${t.timeframe} | Q:${t.quality||5}/10 | RR:${t.rr||"?"} | SL:${t.sl||0} TP:${t.tp||0}`)
    .join("\n")

  return `TRADE PERFORMANCE (${trades.length} total):
Net P&L: $${netPnl.toFixed(2)} | WR: ${winRate}% | PF: ${avgLoss>0?(avgWin/avgLoss).toFixed(2):"N/A"}
Wins: ${wins.length} | Losses: ${losses.length} | Avg Win: $${avgWin.toFixed(2)} | Avg Loss: $${avgLoss.toFixed(2)}

BY SYMBOL:
${symLines}

LAST 20 TRADES:
${recent}`
}

// ─── System prompt builder ────────────────────────────────────────────────────
function buildSystemPrompt(trades, playbooks, insights, chartComparisons, strategyMemory) {
  const hasComparisons = chartComparisons && chartComparisons.length > 0
  const compText = hasComparisons
    ? chartComparisons.slice(0, 15).map(c => chartComparisonToText(c)).join("\n\n---\n\n")
    : ""

  const insightText = insights.slice(0, 10)
    .map(i => `[${i.type}] ${i.title || ""}: ${i.content}`)
    .join("\n")

  return `You are SYLLEDGE, an elite professional trading coach and performance analyst. You are NOT a generic AI — you ARE the trader's personal coach who has studied their complete history, internalized their strategy, and analyzed every chart they've taken.

YOUR IDENTITY & KNOWLEDGE:
You have fully memorized and internalized the trader's playbook strategies below. These are now YOUR strategies — you understand the rules, the confluences, the entry triggers, the risk approach. When the trader talks about their trades, you cross-reference EVERYTHING against these rules.

${strategyMemory ? `YOUR INTERNALIZED STRATEGIES:\n${strategyMemory}` : "No strategies defined yet — ask the trader to describe their approach."}

TRADER PERFORMANCE DATA:
${buildTradeContext(trades)}

${hasComparisons ? `CHART ANALYSIS — WHAT THE MARKET DID vs WHAT THE TRADER DID:
(For each trade, you can see: pips captured, max move available, capture efficiency, and what happened AFTER exit)

${compText}` : ""}

${insights.length > 0 ? `SAVED INSIGHTS (your previous coaching notes):\n${insightText}` : ""}

YOUR COACHING APPROACH:
1. Always reference their ACTUAL numbers — never give generic advice
2. When analyzing a trade, compare it against the internalized strategy rules — call out what was followed and what wasn't
3. Use the chart comparison data to show the trader: "You captured X% of the available move", "After you exited, price continued to your TP — here's why you should have held"
4. Build statistical patterns: "Your BUY trades on EURUSD during London have 73% WR — this is your edge"
5. Give specific improvements: "Based on your MAE data, your SL is too tight — you're being stopped out on 23% of trades that later hit your TP"
6. Be direct, precise, honest. Reference specific trades by date and symbol when relevant
7. Remember the full conversation history — build on previous discussions
8. When the trader shares screenshots, analyze them against their strategy rules and the market data

COMMUNICATION STYLE:
- Lead with data, follow with insight
- Use specific numbers always
- Structure complex analysis clearly
- Celebrate what's working, be direct about what needs to change
- Think like a seasoned prop firm coach, not a generic chatbot`
}

// ─── Quick prompts ────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { icon: TrendingUp,   label: "Best edge",        color: "#2ed573", prompt: "Based on ALL my chart data and strategy rules, where is my strongest statistical edge? Give me exact numbers." },
  { icon: TrendingDown, label: "Biggest leak",      color: "#ff4757", prompt: "What is costing me the most money? Reference my actual trade data and chart comparisons to identify the leak precisely." },
  { icon: Target,       label: "SL optimization",  color: "#6c63ff", prompt: "Analyze my MAE data across all trades. Where should I actually be placing my stop losses for my strategy? Give me a specific approach with numbers." },
  { icon: Shield,       label: "Entry timing",      color: "#ffa502", prompt: "Based on my chart comparisons — what is the optimal entry timing for my strategy? When am I entering too early or too late?" },
  { icon: BarChart3,    label: "Capture efficiency",color: "#00d4aa", prompt: "What percentage of available moves am I capturing? For trades where I exited early, did price reach my TP? Show me the data." },
  { icon: BookOpen,     label: "Strategy audit",    color: "#fd79a8", prompt: "Go through my last 20 trades and audit each one against my strategy rules. How consistently am I following my own rules?" },
  { icon: Camera,       label: "Chart patterns",    color: "#74b9ff", prompt: "Looking at my chart data and pre-entry market context, what price action patterns precede my winning trades vs my losing trades?" },
  { icon: Cpu,          label: "Full deep dive",    color: "#ff6b35", prompt: "Give me a complete professional performance review: entry quality, SL placement, TP management, session performance, strategy adherence, and top 3 specific improvements." },
  { icon: Zap,          label: "Next session",      color: "#55efc4", prompt: "Based on all my data, give me a specific game plan for my next trading session — what to trade, when, and exactly what to look for." },
  { icon: Activity,     label: "Statistical edge",  color: "#a29bfe", prompt: "Build me a statistical breakdown of my edge: by pair, session, timeframe, and setup quality. Where is my expectancy highest?" },
]

// ─── Typing animation ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="w-2 h-2 rounded-full animate-bounce"
          style={{ background: "var(--accent)", animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === "user"
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: isUser ? "rgba(108,99,255,0.2)" : "linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
        {isUser
          ? <MessageSquare size={14} style={{ color: "var(--accent)" }} />
          : <Brain size={14} className="text-white" />}
      </div>
      <div className={`max-w-[82%] rounded-2xl px-4 py-3 ${isUser ? "rounded-tr-sm" : "rounded-tl-sm"}`}
        style={{ background: isUser ? "rgba(108,99,255,0.15)" : "var(--bg-elevated)", border: "1px solid var(--border)" }}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
          {msg.content}
        </p>
        <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {msg.hasCharts && <span className="ml-2 opacity-70">📊 charts analyzed</span>}
          {msg.hasImages && <span className="ml-2 opacity-70">📸 screenshots</span>}
        </p>
      </div>
    </div>
  )
}

// ─── Export Panel ─────────────────────────────────────────────────────────────
function ExportPanel({ trades, insights, chartComparisons, playbooks, onClose }) {
  const [generating, setGenerating] = useState(false)
  const [format, setFormat]         = useState("html")

  const generateExport = async () => {
    setGenerating(true)
    try {
      if (format === "html") await generateHTML(trades, insights, chartComparisons, playbooks)
      else if (format === "pdf") await generatePDF(trades, insights, chartComparisons, playbooks)
      else if (format === "xls") await generateXLS(trades, chartComparisons)
      toast.success("Export ready — check your downloads!")
    } catch (e) {
      toast.error("Export failed: " + e.message)
    }
    setGenerating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl shadow-2xl z-10 p-6"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>Export Analysis</h3>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}><X size={16} /></button>
        </div>

        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Export your complete trading analysis including SYLLEDGE insights, chart comparisons,
          statistical breakdown, and strategy adherence data.
        </p>

        {/* Format selector */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { id: "html", label: "HTML", icon: Globe,     desc: "Interactive report" },
            { id: "pdf",  label: "PDF",  icon: FileText,  desc: "Printable report" },
            { id: "xls",  label: "Excel",icon: Table,     desc: "Raw data + stats" },
          ].map(f => (
            <button key={f.id} onClick={() => setFormat(f.id)}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border transition-all"
              style={{
                background:   format === f.id ? "rgba(108,99,255,0.15)" : "var(--bg-elevated)",
                borderColor:  format === f.id ? "var(--accent)" : "var(--border)",
                color:        format === f.id ? "var(--accent)" : "var(--text-secondary)",
              }}>
              <f.icon size={20} />
              <span className="text-xs font-bold">{f.label}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{f.desc}</span>
            </button>
          ))}
        </div>

        {/* What's included */}
        <div className="rounded-xl p-3 mb-5" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>INCLUDES</p>
          {[
            `${trades.length} trades with full statistics`,
            `${chartComparisons.length} chart comparisons (MFE/MAE/efficiency)`,
            `${insights.length} SYLLEDGE insights`,
            "Strategy adherence analysis",
            "Performance by pair, session, timeframe",
            "Entry/exit optimization data",
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 mb-1">
              <CheckCircle size={11} style={{ color: "var(--accent-success)", flexShrink: 0 }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{item}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm border"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            Cancel
          </button>
          <button onClick={generateExport} disabled={generating}
            className="flex-1 h-10 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg,#6c63ff,#00d4aa)", opacity: generating ? 0.7 : 1 }}>
            <Download size={14} />
            {generating ? "Generating..." : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── HTML Export generator ────────────────────────────────────────────────────
async function generateHTML(trades, insights, chartComparisons, playbooks) {
  const wins    = trades.filter(t => t.outcome === "WIN")
  const losses  = trades.filter(t => t.outcome === "LOSS")
  const netPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = trades.length ? (wins.length / trades.length * 100).toFixed(1) : 0
  const avgEff  = chartComparisons.length
    ? (chartComparisons.reduce((s, c) => s + (c.efficiency || 0), 0) / chartComparisons.length).toFixed(1)
    : 0
  const avgMFE  = chartComparisons.length
    ? (chartComparisons.reduce((s, c) => s + (c.mfe || 0), 0) / chartComparisons.length).toFixed(1)
    : 0

  // By symbol stats
  const bySym = {}
  trades.forEach(t => {
    const k = t.symbol || "UNKNOWN"
    if (!bySym[k]) bySym[k] = { n: 0, wins: 0, pnl: 0 }
    bySym[k].n++; bySym[k].pnl += t.pnl || 0
    if (t.outcome === "WIN") bySym[k].wins++
  })
  const symRows = Object.entries(bySym)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([sym, d]) => `
      <tr>
        <td>${sym}</td>
        <td>${d.n}</td>
        <td style="color:${d.pnl >= 0 ? "#2ed573" : "#ff4757"}">${d.pnl >= 0 ? "+" : ""}$${d.pnl.toFixed(2)}</td>
        <td>${(d.wins / d.n * 100).toFixed(1)}%</td>
      </tr>`).join("")

  const compRows = chartComparisons.slice(0, 50).map(c => `
    <tr>
      <td>${c.symbol}</td>
      <td>${c.direction}</td>
      <td style="color:${c.outcome === "WIN" ? "#2ed573" : "#ff4757"}">${c.outcome}</td>
      <td>${c.pipsCaptured}</td>
      <td>${c.mfe}</td>
      <td>${c.mae}</td>
      <td>${c.efficiency}%</td>
      <td>${c.postExitReachedTP ? "✓ Yes" : "—"}</td>
    </tr>`).join("")

  const insightRows = insights.map(i => `
    <div class="insight ${i.type}">
      <span class="tag">${i.type}</span>
      ${i.title ? `<strong>${i.title}</strong><br>` : ""}
      ${i.content}
    </div>`).join("")

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TradeSylla — SYLLEDGE Analysis Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0a0b0f; color: #f0f0f5; padding: 32px; }
  h1 { font-size: 28px; font-weight: 800; margin-bottom: 4px; }
  h2 { font-size: 18px; font-weight: 700; color: #6c63ff; margin: 32px 0 16px; border-bottom: 1px solid #1e2030; padding-bottom: 8px; }
  h3 { font-size: 14px; font-weight: 600; color: #8b8d9e; margin-bottom: 8px; }
  .header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
  .logo { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg,#6c63ff,#00d4aa); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; }
  .subtitle { color: #8b8d9e; font-size: 13px; margin-top: 2px; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .stat-card { background: #16181f; border: 1px solid #1e2030; border-radius: 12px; padding: 20px; }
  .stat-value { font-size: 28px; font-weight: 800; }
  .stat-label { font-size: 12px; color: #8b8d9e; margin-top: 4px; }
  .green { color: #2ed573; } .red { color: #ff4757; } .blue { color: #6c63ff; } .teal { color: #00d4aa; } .orange { color: #ffa502; }
  table { width: 100%; border-collapse: collapse; background: #16181f; border-radius: 12px; overflow: hidden; }
  th { background: #1c1e28; padding: 12px 16px; text-align: left; font-size: 12px; color: #8b8d9e; font-weight: 600; }
  td { padding: 10px 16px; font-size: 13px; border-bottom: 1px solid #1e2030; }
  tr:last-child td { border-bottom: none; }
  .insight { background: #16181f; border: 1px solid #1e2030; border-radius: 10px; padding: 14px; margin-bottom: 10px; font-size: 13px; line-height: 1.6; }
  .insight.strength { border-left: 3px solid #2ed573; }
  .insight.weakness { border-left: 3px solid #ff4757; }
  .insight.opportunity { border-left: 3px solid #ffa502; }
  .insight.general { border-left: 3px solid #6c63ff; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; background: rgba(108,99,255,0.15); color: #6c63ff; }
  .generated { font-size: 11px; color: #4a4c5e; margin-top: 32px; text-align: center; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">T</div>
  <div>
    <h1>SYLLEDGE Analysis Report</h1>
    <div class="subtitle">Generated ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · TradeSylla</div>
  </div>
</div>

<h2>Performance Overview</h2>
<div class="stats-grid">
  <div class="stat-card"><div class="stat-value ${netPnl >= 0 ? "green" : "red"}">${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(2)}</div><div class="stat-label">Net P&amp;L</div></div>
  <div class="stat-card"><div class="stat-value ${parseFloat(winRate) >= 50 ? "green" : "red"}">${winRate}%</div><div class="stat-label">Win Rate</div></div>
  <div class="stat-card"><div class="stat-value blue">${trades.length}</div><div class="stat-label">Total Trades</div></div>
  <div class="stat-card"><div class="stat-value teal">${avgEff}%</div><div class="stat-label">Avg Capture Efficiency</div></div>
  <div class="stat-card"><div class="stat-value orange">${avgMFE}</div><div class="stat-label">Avg MFE (pips)</div></div>
  <div class="stat-card"><div class="stat-value ${parseFloat(winRate) >= 50 ? "green" : "red"}">${wins.length}W / ${losses.length}L</div><div class="stat-label">Win / Loss</div></div>
</div>

<h2>Performance by Symbol</h2>
<table>
  <thead><tr><th>Symbol</th><th>Trades</th><th>P&amp;L</th><th>Win Rate</th></tr></thead>
  <tbody>${symRows}</tbody>
</table>

${chartComparisons.length > 0 ? `
<h2>Chart Analysis — Trade vs Market</h2>
<p style="color:#8b8d9e;font-size:13px;margin-bottom:16px;">MFE = Max pips available in your direction | MAE = Max pips against you | Efficiency = % of available move captured</p>
<table>
  <thead><tr><th>Symbol</th><th>Dir</th><th>Outcome</th><th>Pips Captured</th><th>MFE</th><th>MAE</th><th>Efficiency</th><th>TP Hit After?</th></tr></thead>
  <tbody>${compRows}</tbody>
</table>` : ""}

${insights.length > 0 ? `
<h2>SYLLEDGE Insights (${insights.length})</h2>
${insightRows}` : ""}

<div class="generated">Generated by SYLLEDGE AI · TradeSylla · tradesylla.vercel.app</div>
</body>
</html>`

  const blob = new Blob([html], { type: "text/html" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `TradeSylla_Analysis_${new Date().toISOString().slice(0, 10)}.html`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PDF Export (via HTML print) ──────────────────────────────────────────────
async function generatePDF(trades, insights, chartComparisons, playbooks) {
  // Generate HTML first then open in new window for printing
  const wins    = trades.filter(t => t.outcome === "WIN")
  const losses  = trades.filter(t => t.outcome === "LOSS")
  const netPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = trades.length ? (wins.length / trades.length * 100).toFixed(1) : 0
  const avgEff  = chartComparisons.length
    ? (chartComparisons.reduce((s, c) => s + (c.efficiency || 0), 0) / chartComparisons.length).toFixed(1)
    : 0

  const bySym = {}
  trades.forEach(t => {
    const k = t.symbol || "UNKNOWN"
    if (!bySym[k]) bySym[k] = { n: 0, wins: 0, pnl: 0 }
    bySym[k].n++; bySym[k].pnl += t.pnl || 0
    if (t.outcome === "WIN") bySym[k].wins++
  })
  const symRows = Object.entries(bySym)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([sym, d]) => `<tr><td>${sym}</td><td>${d.n}</td><td>${d.pnl >= 0 ? "+" : ""}$${d.pnl.toFixed(2)}</td><td>${(d.wins/d.n*100).toFixed(1)}%</td></tr>`)
    .join("")

  const compRows = chartComparisons.slice(0, 30).map(c =>
    `<tr><td>${c.symbol}</td><td>${c.direction}</td><td>${c.outcome}</td><td>${c.pipsCaptured}</td><td>${c.mfe}</td><td>${c.efficiency}%</td></tr>`
  ).join("")

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>TradeSylla Report</title>
<style>
body{font-family:Arial,sans-serif;color:#000;padding:20px;font-size:12px}
h1{font-size:22px;margin-bottom:4px}
h2{font-size:15px;margin:20px 0 10px;border-bottom:1px solid #ccc;padding-bottom:4px}
.stats{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.stat{border:1px solid #ccc;border-radius:6px;padding:10px 16px;min-width:100px}
.val{font-size:20px;font-weight:bold}
.lbl{font-size:10px;color:#666}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{background:#f0f0f0;padding:6px 10px;text-align:left;font-size:11px}
td{padding:5px 10px;border-bottom:1px solid #eee;font-size:11px}
.insight{border-left:3px solid #6c63ff;padding:8px 12px;margin-bottom:8px;background:#f9f9f9;border-radius:0 6px 6px 0}
@media print{body{padding:0}}
</style></head><body>
<h1>SYLLEDGE Analysis Report</h1>
<p style="color:#666;margin-bottom:16px">Generated ${new Date().toLocaleDateString()} · TradeSylla</p>
<div class="stats">
  <div class="stat"><div class="val">${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(2)}</div><div class="lbl">Net P&L</div></div>
  <div class="stat"><div class="val">${winRate}%</div><div class="lbl">Win Rate</div></div>
  <div class="stat"><div class="val">${trades.length}</div><div class="lbl">Total Trades</div></div>
  <div class="stat"><div class="val">${avgEff}%</div><div class="lbl">Avg Efficiency</div></div>
  <div class="stat"><div class="val">${wins.length}W/${losses.length}L</div><div class="lbl">Win/Loss</div></div>
</div>
<h2>By Symbol</h2>
<table><thead><tr><th>Symbol</th><th>Trades</th><th>P&L</th><th>WR%</th></tr></thead><tbody>${symRows}</tbody></table>
${chartComparisons.length > 0 ? `<h2>Chart Analysis</h2>
<table><thead><tr><th>Symbol</th><th>Dir</th><th>Result</th><th>Pips</th><th>MFE</th><th>Efficiency</th></tr></thead><tbody>${compRows}</tbody></table>` : ""}
${insights.length > 0 ? `<h2>SYLLEDGE Insights</h2>${insights.map(i => `<div class="insight"><strong>${i.title||i.type}</strong><br>${i.content}</div>`).join("")}` : ""}
<script>window.onload=()=>{window.print()}</script>
</body></html>`

  const win = window.open("", "_blank")
  win.document.write(html)
  win.document.close()
}

// ─── Excel Export ─────────────────────────────────────────────────────────────
async function generateXLS(trades, chartComparisons) {
  // Build CSV-like data that Excel opens perfectly
  const headers = [
    "Date", "Symbol", "Direction", "Outcome", "Entry", "Exit",
    "P&L ($)", "Pips", "Session", "Timeframe", "Quality",
    "MFE (pips)", "MAE (pips)", "Pips Captured", "Efficiency (%)",
    "TP Hit After Exit?", "SL", "TP", "RR", "Volume", "Notes"
  ]

  const compMap = {}
  chartComparisons.forEach(c => { compMap[c.symbol + "_" + c.direction] = c })

  const rows = trades.map(t => {
    const key = (t.symbol || "") + "_" + (t.direction || "")
    const comp = compMap[key]
    return [
      t.entry_time ? new Date(t.entry_time).toLocaleDateString() : "",
      t.symbol || "",
      t.direction || "",
      t.outcome || "",
      t.entry_price || 0,
      t.exit_price || 0,
      (t.pnl || 0).toFixed(2),
      (t.pips || 0).toFixed(1),
      t.session || "",
      t.timeframe || "",
      t.quality || 5,
      comp ? comp.mfe : "",
      comp ? comp.mae : "",
      comp ? comp.pipsCaptured : "",
      comp ? comp.efficiency + "%" : "",
      comp ? (comp.postExitReachedTP ? "Yes" : "No") : "",
      t.sl || 0,
      t.tp || 0,
      t.rr || 0,
      t.volume || 0,
      (t.notes || "").replace(/,/g, " ").replace(/\n/g, " ")
    ].join(",")
  })

  // Summary sheet
  const wins   = trades.filter(t => t.outcome === "WIN")
  const losses = trades.filter(t => t.outcome === "LOSS")
  const netPnl = trades.reduce((s, t) => s + (t.pnl || 0), 0)

  const summary = [
    "TRADESYLLA — SYLLEDGE ANALYSIS EXPORT",
    `Generated: ${new Date().toLocaleDateString()}`,
    "",
    "SUMMARY",
    `Total Trades,${trades.length}`,
    `Net P&L,$${netPnl.toFixed(2)}`,
    `Win Rate,${trades.length ? (wins.length/trades.length*100).toFixed(1) : 0}%`,
    `Wins,${wins.length}`,
    `Losses,${losses.length}`,
    chartComparisons.length ? `Avg Efficiency,${(chartComparisons.reduce((s,c)=>s+(c.efficiency||0),0)/chartComparisons.length).toFixed(1)}%` : "",
    "",
    "TRADES",
    headers.join(","),
    ...rows,
  ].filter(Boolean).join("\n")

  const blob = new Blob([summary], { type: "text/csv;charset=utf-8;" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href     = url
  a.download = `TradeSylla_Analysis_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insight, onDelete }) {
  const icons  = { strength: CheckCircle, weakness: AlertTriangle, opportunity: Lightbulb, general: Brain }
  const colors = { strength: "var(--accent-success)", weakness: "var(--accent-danger)", opportunity: "var(--accent-warning)", general: "var(--accent)" }
  const Icon  = icons[insight.type]  || icons.general
  const color = colors[insight.type] || colors.general
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
            <Icon size={14} style={{ color }} />
          </div>
          <span className="text-xs font-semibold capitalize" style={{ color }}>{insight.type || "insight"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {insight.created_at ? new Date(insight.created_at).toLocaleDateString() : ""}
          </span>
          <button onClick={() => onDelete(insight.id)} className="p-1 rounded hover:opacity-70" style={{ color: "var(--text-muted)" }}>
            <X size={12} />
          </button>
        </div>
      </div>
      {insight.title && <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{insight.title}</p>}
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{insight.content}</p>
    </div>
  )
}

// ─── Quick Save Insight ───────────────────────────────────────────────────────
function QuickSaveInsight({ onSave }) {
  const [title, setTitle]     = useState("")
  const [content, setContent] = useState("")
  const [type, setType]       = useState("general")
  const [saving, setSaving]   = useState(false)
  const save = async () => {
    if (!content.trim()) { toast.error("Content required"); return }
    setSaving(true)
    await onSave(content.trim(), type, title.trim())
    setTitle(""); setContent(""); setType("general")
    setSaving(false)
  }
  return (
    <div>
      <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-muted)" }}>SAVE NEW INSIGHT</p>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)"
            className="flex-1 h-9 rounded-lg px-3 text-sm border"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
          <select value={type} onChange={e => setType(e.target.value)}
            className="h-9 rounded-lg px-3 text-sm border"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
            <option value="general">General</option>
            <option value="strength">Strength</option>
            <option value="weakness">Weakness</option>
            <option value="opportunity">Opportunity</option>
          </select>
        </div>
        <textarea rows={3} value={content} onChange={e => setContent(e.target.value)}
          placeholder="Paste or type your insight…"
          className="w-full rounded-lg px-3 py-2 text-sm border resize-none"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
        <button onClick={save} disabled={saving || !content.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#6c63ff,#5a52d5)" }}>
          <Sparkles size={13} />{saving ? "Saving…" : "Save Insight"}
        </button>
      </div>
    </div>
  )
}

// ─── Main Sylledge Page ───────────────────────────────────────────────────────
export default function Sylledge() {
  const { user } = useUser()
  const [trades,           setTrades]           = useState([])
  const [playbooks,        setPlaybooks]         = useState([])
  const [insights,         setInsights]          = useState([])
  const [messages,         setMessages]          = useState([])
  const [input,            setInput]             = useState("")
  const [loading,          setLoading]           = useState(false)
  const [activeTab,        setActiveTab]         = useState("chat")
  const [memoryLoaded,     setMemoryLoaded]      = useState(false)
  const [chartComparisons, setChartComparisons]  = useState([])
  const [loadingCharts,    setLoadingCharts]     = useState(false)
  const [strategyMemory,   setStrategyMemory]    = useState("")
  const [showExport,       setShowExport]        = useState(false)
  const [showChartStats,   setShowChartStats]    = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // ── Load all data ─────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([Trade.list(), Playbook.list(), SylledgeInsight.list()])
      .then(([t, p, ins]) => {
        setTrades(t || [])
        setPlaybooks(p || [])
        setInsights((ins || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
        const sm = buildStrategyMemory(p || [])
        setStrategyMemory(sm)
      })
  }, [])

  // ── Load chart comparisons from trade_charts table ────────────────────────
  useEffect(() => {
    if (!user?.id || !trades.length) return
    setLoadingCharts(true)
    supabase
      .from("trade_charts")
      .select("trade_id, candles, symbol, timeframe")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!data || !data.length) { setLoadingCharts(false); return }
        const chartMap = {}
        data.forEach(row => { chartMap[row.trade_id] = row })

        const comparisons = trades
          .filter(t => chartMap[t.id] && chartMap[t.id].candles?.length > 5)
          .map(t => buildChartComparison(t, chartMap[t.id].candles))
          .filter(Boolean)

        setChartComparisons(comparisons)
        setLoadingCharts(false)
      })
      .catch(() => setLoadingCharts(false))
  }, [trades, user?.id])

  // ── Load persistent memory ────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || memoryLoaded) return
    const lsFallback = lsGet(`sylledge_mem_${user.id}`)
    if (lsFallback?.length) {
      setMessages(lsFallback)
      setMemoryLoaded(true)
    }
    loadMemory(user.id, MEMORY_KEY).then(mem => {
      if (mem && Array.isArray(mem) && mem.length > 0) {
        setMessages(mem)
      } else if (!lsFallback?.length) {
        setMessages([{
          role: "assistant",
          content: `Hey — I'm SYLLEDGE, your personal trading coach.\n\nI've analyzed your complete trade history, internalized your playbook strategies, and processed ${trades.length > 0 ? trades.length + " of your trades" : "your data"} including chart comparisons showing what the market did after each trade you took.\n\nI remember our full conversation history. Ask me anything about your performance, or use a quick prompt below. 🎯`,
          timestamp: new Date().toISOString()
        }])
      }
      setMemoryLoaded(true)
    })
  }, [user?.id, memoryLoaded, trades.length])

  // ── Persist memory ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id || !memoryLoaded || messages.length === 0) return
    const toSave = messages.slice(-MAX_HISTORY)
    lsSet(`sylledge_mem_${user.id}`, toSave)
    saveMemory(user.id, MEMORY_KEY, toSave)
  }, [messages, user?.id, memoryLoaded])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  // ── Call AI ───────────────────────────────────────────────────────────────
  const callAI = useCallback(async (userMessage) => {
    const system  = buildSystemPrompt(trades, playbooks, insights, chartComparisons, strategyMemory)
    const history = messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-24)
      .map(m => ({ role: m.role, content: m.content }))

    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system,
        messages: [...history, { role: "user", content: userMessage }],
        max_tokens: 1800,
      })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Network error" }))
      throw new Error(err.error || "AI request failed")
    }
    const data = await res.json()
    return data.content?.[0]?.text || "No response received."
  }, [trades, playbooks, insights, chartComparisons, strategyMemory, messages])

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput("")
    setMessages(prev => [...prev, {
      role: "user", content: msg,
      timestamp: new Date().toISOString(),
      hasCharts: chartComparisons.length > 0,
    }])
    setLoading(true)
    try {
      const reply = await callAI(msg)
      setMessages(prev => [...prev, {
        role: "assistant", content: reply,
        timestamp: new Date().toISOString(),
        hasCharts: chartComparisons.length > 0,
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `⚠️ ${e.message.includes("fetch") ? "Connection error — check your internet." : e.message}`,
        timestamp: new Date().toISOString(),
      }])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  const clearMemory = async () => {
    const welcome = [{
      role: "assistant",
      content: "Memory cleared — fresh start. What would you like to analyze? 🎯",
      timestamp: new Date().toISOString()
    }]
    setMessages(welcome)
    if (user?.id) {
      lsSet(`sylledge_mem_${user.id}`, welcome)
      await saveMemory(user.id, MEMORY_KEY, welcome)
    }
    toast.success("Memory cleared")
  }

  const saveInsight = async (content, type = "general", title = "") => {
    try {
      const saved = await SylledgeInsight.create({ content, type, title })
      setInsights(prev => [saved, ...prev])
      toast.success("Insight saved!")
    } catch { toast.error("Failed to save insight") }
  }

  const deleteInsight = async (id) => {
    await SylledgeInsight.delete(id)
    setInsights(prev => prev.filter(i => i.id !== id))
    toast.success("Removed")
  }

  // Stats
  const wins    = trades.filter(t => t.outcome === "WIN")
  const losses  = trades.filter(t => t.outcome === "LOSS")
  const netPnl  = trades.reduce((s, t) => s + (t.pnl || 0), 0)
  const winRate = trades.length ? (wins.length / trades.length * 100).toFixed(1) : "0.0"
  const avgEff  = chartComparisons.length
    ? (chartComparisons.reduce((s, c) => s + (c.efficiency || 0), 0) / chartComparisons.length).toFixed(1)
    : null
  const tpHitAfter = chartComparisons.filter(c => c.postExitReachedTP).length

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 80px)" }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <Brain size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>SYLLEDGE AI</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {trades.length} trades · {playbooks.filter(p => p.status === "active").length} strategies · {chartComparisons.length} charts analyzed
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {chartComparisons.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{ background: "rgba(46,213,115,0.1)", color: "var(--accent-success)", border: "1px solid rgba(46,213,115,0.2)" }}>
                  <BarChart3 size={9} /> {chartComparisons.length} charts
                </span>
              )}
              {loadingCharts && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
                  <RefreshCw size={9} className="animate-spin" /> loading charts…
                </span>
              )}
              {strategyMemory && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{ background: "rgba(108,99,255,0.1)", color: "var(--accent)", border: "1px solid rgba(108,99,255,0.2)" }}>
                  <BookOpen size={9} /> strategy internalized
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                style={{ background: "rgba(0,212,170,0.1)", color: "var(--accent-secondary)", border: "1px solid rgba(0,212,170,0.2)" }}>
                <MemoryStick size={9} /> {messages.length} msg memory
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {["chat", "insights", "charts"].map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className="px-4 py-2 text-sm font-medium capitalize transition-all"
                style={{ background: activeTab === t ? "var(--accent)" : "var(--bg-elevated)", color: activeTab === t ? "#fff" : "var(--text-secondary)" }}>
                {t === "chat" ? "💬 Chat" : t === "insights" ? `💡 Saved (${insights.length})` : `📊 Charts (${chartComparisons.length})`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
              <Download size={12} /> Export
            </button>
            <button onClick={clearMemory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--accent-danger)" }}>
              <RefreshCw size={12} /> Clear memory
            </button>
          </div>
        </div>
      </div>

      {/* ── CHAT TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === "chat" && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">

          {/* Stats strip */}
          {trades.length > 0 && (
            <div className="flex flex-wrap gap-3 rounded-xl px-4 py-2.5 flex-shrink-0"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {[
                { label: "Trades",    value: trades.length,                                         color: "var(--accent)" },
                { label: "Net P&L",   value: `${netPnl >= 0 ? "+" : ""}$${netPnl.toFixed(0)}`,     color: netPnl >= 0 ? "var(--accent-success)" : "var(--accent-danger)" },
                { label: "Win Rate",  value: `${winRate}%`,                                          color: parseFloat(winRate) >= 50 ? "var(--accent-success)" : "var(--accent-danger)" },
                { label: "W/L",       value: `${wins.length}W · ${losses.length}L`,                 color: "var(--text-secondary)" },
                avgEff ? { label: "Avg Efficiency", value: `${avgEff}%`,                            color: "var(--accent-secondary)" } : null,
                tpHitAfter > 0 ? { label: "TP hit after exit", value: `${tpHitAfter} trades`,       color: "var(--accent-warning)" } : null,
              ].filter(Boolean).map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{s.label}:</span>
                  <span className="text-xs font-bold" style={{ color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Chat window */}
          <div className="flex-1 overflow-y-auto rounded-2xl p-4 space-y-4 min-h-0"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
                  <Brain size={14} className="text-white" />
                </div>
                <div className="rounded-2xl rounded-tl-sm" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="flex-shrink-0">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => sendMessage(p.prompt)} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex-shrink-0 border transition-all hover:opacity-80 disabled:opacity-40"
                  style={{ background: `${p.color}15`, borderColor: `${p.color}30`, color: p.color }}>
                  <p.icon size={12} />{p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="flex gap-2 flex-shrink-0">
            <div className="flex-1 flex rounded-xl overflow-hidden"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <textarea ref={inputRef} value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Ask about your performance, strategy, charts, or any trade…"
                rows={1} className="flex-1 px-4 py-2.5 text-sm resize-none bg-transparent border-0 outline-none"
                style={{ color: "var(--text-primary)", minHeight: 44, maxHeight: 120 }} />
              <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
                className="px-4 m-1.5 rounded-lg text-white flex items-center gap-1.5 text-sm font-medium disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#6c63ff,#00d4aa)", flexShrink: 0 }}>
                <Send size={14} /><span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </div>
          <p className="text-center text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>
            Enter to send · Shift+Enter new line · Memory saved automatically
          </p>
        </div>
      )}

      {/* ── INSIGHTS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "insights" && (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          <div className="rounded-xl p-4 flex items-center gap-3"
            style={{ background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)" }}>
            <Sparkles size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Saved insights are fed back to SYLLEDGE in every session — they become part of its coaching memory.
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <QuickSaveInsight onSave={saveInsight} />
          </div>
          {insights.length === 0 ? (
            <div className="rounded-2xl py-16 text-center" style={{ background: "var(--bg-card)", border: "1px dashed var(--border)" }}>
              <Lightbulb size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>No saved insights yet</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Chat with SYLLEDGE and save key takeaways here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {insights.map(i => <InsightCard key={i.id} insight={i} onDelete={deleteInsight} />)}
            </div>
          )}
        </div>
      )}

      {/* ── CHARTS TAB ───────────────────────────────────────────────────────── */}
      {activeTab === "charts" && (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
          {/* Summary stats */}
          {chartComparisons.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Charts Analyzed",   value: chartComparisons.length,                                                            color: "var(--accent)" },
                  { label: "Avg Efficiency",     value: `${avgEff}%`,                                                                       color: "var(--accent-secondary)" },
                  { label: "TP Hit After Exit",  value: `${tpHitAfter} (${chartComparisons.length ? Math.round(tpHitAfter/chartComparisons.length*100) : 0}%)`, color: "var(--accent-warning)" },
                  { label: "Avg MFE Available",  value: `${(chartComparisons.reduce((s,c)=>s+(c.mfe||0),0)/Math.max(chartComparisons.length,1)).toFixed(1)} pips`, color: "var(--accent-success)" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                    <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl p-4" style={{ background: "rgba(255,165,2,0.06)", border: "1px solid rgba(255,165,2,0.2)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--accent-warning)" }}>
                  ⚠ Left {tpHitAfter} TPs on the table
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  On {tpHitAfter} of your trades, price reached your TP level AFTER you exited. SYLLEDGE can help you identify why you're exiting early.
                </p>
              </div>

              {/* Table */}
              <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Trade vs Market — Full Comparison
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
                        {["Symbol", "Dir", "Result", "Pips Got", "MFE", "MAE", "Efficiency", "TP after?"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {chartComparisons.map((c, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--bg-elevated)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td className="px-4 py-2.5 font-bold text-xs" style={{ color: "var(--text-primary)" }}>{c.symbol}</td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold"
                              style={{ background: c.direction === "BUY" ? "rgba(46,213,115,0.15)" : "rgba(255,71,87,0.15)", color: c.direction === "BUY" ? "var(--accent-success)" : "var(--accent-danger)" }}>
                              {c.direction}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ background: c.outcome === "WIN" ? "rgba(46,213,115,0.15)" : "rgba(255,71,87,0.15)", color: c.outcome === "WIN" ? "var(--accent-success)" : "var(--accent-danger)" }}>
                              {c.outcome}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: c.pipsCaptured >= 0 ? "var(--accent-success)" : "var(--accent-danger)" }}>{c.pipsCaptured}</td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: "var(--accent-secondary)" }}>{c.mfe}</td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: "var(--accent-danger)" }}>{c.mae}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                                <div className="h-full rounded-full" style={{ width: `${Math.min(c.efficiency, 100)}%`, background: c.efficiency >= 70 ? "var(--accent-success)" : c.efficiency >= 40 ? "var(--accent-warning)" : "var(--accent-danger)" }} />
                              </div>
                              <span className="text-xs" style={{ color: c.efficiency >= 70 ? "var(--accent-success)" : c.efficiency >= 40 ? "var(--accent-warning)" : "var(--accent-danger)" }}>
                                {c.efficiency}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {c.postHigh !== null
                              ? <span style={{ color: c.postExitReachedTP ? "var(--accent-success)" : "var(--text-muted)" }}>
                                  {c.postExitReachedTP ? "✓ Yes" : "No"}
                                </span>
                              : <span style={{ color: "var(--text-muted)" }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {chartComparisons.length === 0 && !loadingCharts && (
            <div className="rounded-2xl py-16 text-center" style={{ background: "var(--bg-card)", border: "1px dashed var(--border)" }}>
              <BarChart3 size={32} className="mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
              <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>No chart data yet</p>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Sync your MT5 with candle data enabled (SkipCandles = false) to unlock chart comparisons.
              </p>
            </div>
          )}
          {loadingCharts && (
            <div className="flex items-center justify-center py-16 gap-3" style={{ color: "var(--text-muted)" }}>
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm">Loading chart data…</span>
            </div>
          )}
        </div>
      )}

      {/* Export modal */}
      {showExport && (
        <ExportPanel
          trades={trades}
          insights={insights}
          chartComparisons={chartComparisons}
          playbooks={playbooks}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
