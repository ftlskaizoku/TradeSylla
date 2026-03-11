// ─── HelpOverlay — shared across Dashboard and Analytics ─────────────────────
// Drop-in: <HelpOverlay page="dashboard" /> or <HelpOverlay page="analytics" />
import { useState } from "react"
import { HelpCircle, X, ChevronRight } from "lucide-react"

const HELP_CONTENT = {
  dashboard: {
    title: "Dashboard Guide",
    sections: [
      {
        label: "Account HUD",
        color: "#6c63ff",
        tips: [
          "The account bar at the top lets you filter all stats by a specific MT5 account.",
          "Balance and equity update automatically from EA heartbeats.",
          "Switch between accounts to compare performance across different portfolios.",
        ]
      },
      {
        label: "Stats Cards",
        color: "#00d4aa",
        tips: [
          "Net P&L — total profit/loss across all trades in the selected period.",
          "Win Rate — percentage of trades that closed in profit.",
          "Profit Factor — avg win ÷ avg loss. Anything above 1.0 is profitable. Aim for 1.5+.",
          "Expectancy — expected profit per trade in dollars. Your true edge measure.",
          "Max Drawdown — largest peak-to-trough drop. Keep this under 10–15% of your account.",
        ]
      },
      {
        label: "Equity Curve",
        color: "#2ed573",
        tips: [
          "Shows the cumulative growth of your account over time.",
          "A smooth upward slope = consistent edge. Choppy = inconsistent execution.",
          "Large drops indicate over-leveraging or emotional trading.",
        ]
      },
      {
        label: "Recent Trades",
        color: "#ffa502",
        tips: [
          "Shows your last 10 trades with outcome and P&L.",
          "Click any trade row to expand and see the chart, SL/TP levels, and stats.",
          "Update the quality score (1–10) directly in the expanded view.",
        ]
      },
    ]
  },
  analytics: {
    title: "Analytics Guide",
    sections: [
      {
        label: "Period Filter",
        color: "#6c63ff",
        tips: [
          "Filter all charts and stats to a specific time window.",
          "Use 'This Month' to track your current month's progress.",
          "Compare 'Last Month' vs 'This Month' to see if you're improving.",
        ]
      },
      {
        label: "Breakdown Tab",
        color: "#00d4aa",
        tips: [
          "Switch between Daily, Weekly, Monthly, By Pair, By Session, Direction, and Timeframe views.",
          "Each view shows a bar chart + ranked table with P&L, win rate, and expectancy.",
          "Best/Worst badges show instantly where your edge is strongest and weakest.",
        ]
      },
      {
        label: "Performance Tab",
        color: "#2ed573",
        tips: [
          "By Session — shows which trading session (London, NY, Asian) is most profitable.",
          "By Pair — reveals which symbols generate the most consistent returns.",
          "Full symbol table — detailed stats per instrument including avg win/loss and expectancy.",
        ]
      },
      {
        label: "Patterns Tab",
        color: "#ffa502",
        tips: [
          "Win rate by day of week — find your best days to trade.",
          "BUY vs SELL breakdown — shows if you have a directional bias.",
          "Quality vs P&L scatter — confirms if your quality score actually predicts outcomes.",
          "Win/Loss streaks — important for setting daily stop-loss rules.",
        ]
      },
      {
        label: "Advanced Tab",
        color: "#ff6b35",
        tips: [
          "Drawdown chart — shows your worst equity dips over time.",
          "P&L histogram — shows your profit distribution (left skew = too many small wins, big losses).",
          "Monthly breakdown table — month-by-month performance with fees.",
          "Total Fees — sum of commissions and swaps. High fees eat your edge.",
        ]
      },
    ]
  }
}

export default function HelpOverlay({ page = "dashboard" }) {
  const [open, setOpen] = useState(false)
  const content = HELP_CONTENT[page] || HELP_CONTENT.dashboard

  return (
    <>
      {/* Trigger button — small, fixed position */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-40 w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
        style={{ background: open ? "var(--accent)" : "var(--bg-card)", border: "1px solid var(--border)", color: open ? "#fff" : "var(--text-secondary)" }}
        title="Help & feature guide"
      >
        {open ? <X size={16}/> : <HelpCircle size={16}/>}
      </button>

      {/* Panel — slides up from bottom-right */}
      {open && (
        <div
          className="fixed bottom-16 right-5 z-40 w-80 rounded-2xl shadow-2xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", maxHeight: "70vh" }}
        >
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "linear-gradient(135deg,rgba(108,99,255,0.08),rgba(0,212,170,0.04))" }}>
            <div className="flex items-center gap-2">
              <HelpCircle size={14} style={{ color: "var(--accent)" }}/>
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{content.title}</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:opacity-70" style={{ color: "var(--text-muted)" }}>
              <X size={13}/>
            </button>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 48px)" }}>
            {content.sections.map((sec, si) => (
              <HelpSection key={si} section={sec}/>
            ))}

            {/* Footer */}
            <div className="px-4 py-3 text-center" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                More help at <span style={{ color: "var(--accent)" }}>tradesylla.vercel.app</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function HelpSection({ section }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:opacity-80 transition-opacity text-left"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: section.color }}/>
          <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{section.label}</span>
        </div>
        <ChevronRight size={12} style={{ color: "var(--text-muted)", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}/>
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-2">
          {section.tips.map((tip, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: section.color }}>›</span>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{tip}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
