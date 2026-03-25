// src/components/ui/InfoTooltip.jsx
// Reusable hover tooltip with info icon — used on Dashboard stat cards and charts
import { useState } from "react"
import { HelpCircle } from "lucide-react"

export function InfoTooltip({ content, position = "top" }) {
  const [visible, setVisible] = useState(false)

  const posStyle = {
    top:    { bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    bottom: { top:    "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" },
    left:   { right:  "calc(100% + 8px)", top:  "50%", transform: "translateY(-50%)" },
    right:  { left:   "calc(100% + 8px)", top:  "50%", transform: "translateY(-50%)" },
  }

  return (
    <div className="relative inline-flex" style={{ lineHeight: 0 }}>
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="flex items-center justify-center rounded-full hover:opacity-80 transition-opacity"
        style={{ color: "var(--text-muted)", padding: 2 }}
        aria-label="More information">
        <HelpCircle size={13} />
      </button>

      {visible && (
        <div
          className="absolute z-50 w-52 rounded-xl px-3 py-2.5 text-xs shadow-2xl pointer-events-none"
          style={{
            ...posStyle[position],
            background:   "var(--bg-elevated)",
            border:       "1px solid var(--border)",
            color:        "var(--text-primary)",
            lineHeight:   1.5,
            whiteSpace:   "normal",
          }}>
          {content}
        </div>
      )}
    </div>
  )
}

// ─── Tooltip content definitions for every stat card and chart ────────────────
export const TOOLTIPS = {
  netPnl: "Net P&L is your total profit or loss across all trades, after commissions and swaps. Positive = you're up, negative = you're down.",
  winRate: "Win Rate = (winning trades ÷ total trades) × 100. A 50%+ win rate is profitable IF your avg win ≥ avg loss. Win rate alone doesn't tell the full story.",
  profitFactor: "Profit Factor = total gross profit ÷ total gross loss. PF > 1.0 means you're profitable. PF > 1.5 is considered a strong edge. PF < 1.0 means you lose more than you make.",
  expectancy: "Expectancy = average $ made (or lost) per trade. Formula: (Win Rate × Avg Win) − (Loss Rate × Avg Loss). Positive expectancy = your strategy has a statistical edge over many trades.",
  maxDrawdown: "Max Drawdown = the largest peak-to-trough drop in your account equity. Measures how bad things got at their worst. Lower is better. Risk of ruin rises sharply above 20% drawdown.",
  syllaScore: "SYLLA Score is a composite performance rating from 0–100 based on: win rate (50%), profit factor (30%), and sample size (20%). Higher = more consistent, edge-driven trading.",
  avgRR: "Average Risk:Reward = average winning trade size ÷ average losing trade size. A 1.5 RR means you win $1.50 for every $1.00 risked on winning trades.",
  totalFees: "Total fees = commissions + swap charges across all trades. High fees silently erode your edge. Track this to know your true cost of trading.",
  equityCurve: "The equity curve shows your cumulative P&L over time. A smooth upward slope = consistent edge. Sharp drops = over-leveraging or breaking your rules. Aim for a steady, gradual climb.",
  dailyPnl: "Net P&L per trading day. Green bars = profitable days, red = losing days. Look for patterns — are you losing on specific days? Mondays? After large wins?",
  syllaRadar: "The SYLLA Radar visualizes three dimensions of your performance: Win % (did you win more than you lost?), Profit Factor (did your wins outsize your losses?), and Win/Loss Ratio (how often do you win vs lose?).",
  grossPnl: "Gross P&L = raw profit from price movement only, before deducting commissions and swaps. The difference between Gross and Net P&L is your total trading cost.",
  withdrawals: "This toggle controls whether withdrawals are factored into your equity calculations. When ON, withdrawals are subtracted from running equity so your curve reflects actual account balance changes.",
  commissionToggle: "Toggle between Net P&L (after all fees) and Gross P&L (before fees). Net = what actually hit your account. Gross = what the trade made before your broker took their cut.",
}
