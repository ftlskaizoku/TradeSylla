// src/pages/Calculator.jsx — Position Sizing & Risk Calculator v1.0
// Three calculators in one: Position Size, Risk/Reward, Pip Value
// Works with live trade data for personalized suggestions

import { useLanguage } from "@/lib/LanguageContext"
import { useState, useMemo } from "react"
import { useUser } from "@/lib/UserContext"
import {
  Calculator as CalcIcon, Target, TrendingUp, TrendingDown,
  DollarSign, Percent, AlertTriangle, CheckCircle,
  BarChart2, Zap, Info
} from "lucide-react"

// ─── Pip values per instrument type ──────────────────────────────────────────
const PIP_INFO = {
  // Forex major/minor — standard lot = 100,000 units
  EURUSD: { pipSize:0.0001, lotUnits:100000, name:"EUR/USD" },
  GBPUSD: { pipSize:0.0001, lotUnits:100000, name:"GBP/USD" },
  AUDUSD: { pipSize:0.0001, lotUnits:100000, name:"AUD/USD" },
  NZDUSD: { pipSize:0.0001, lotUnits:100000, name:"NZD/USD" },
  USDCAD: { pipSize:0.0001, lotUnits:100000, name:"USD/CAD" },
  USDCHF: { pipSize:0.0001, lotUnits:100000, name:"USD/CHF" },
  USDMXN: { pipSize:0.0001, lotUnits:100000, name:"USD/MXN" },
  EURGBP: { pipSize:0.0001, lotUnits:100000, name:"EUR/GBP" },
  EURJPY: { pipSize:0.01,   lotUnits:100000, name:"EUR/JPY" },
  GBPJPY: { pipSize:0.01,   lotUnits:100000, name:"GBP/JPY" },
  USDJPY: { pipSize:0.01,   lotUnits:100000, name:"USD/JPY" },
  // Metals
  XAUUSD: { pipSize:0.01,   lotUnits:100,    name:"Gold (XAU/USD)", tickValue:1 },
  XAGUSD: { pipSize:0.001,  lotUnits:5000,   name:"Silver (XAG/USD)" },
  // Indices
  US30:   { pipSize:1,      lotUnits:1,      name:"US30 / DJIA",   tickValue:1 },
  US100:  { pipSize:0.25,   lotUnits:1,      name:"NAS100",        tickValue:0.25 },
  UK100:  { pipSize:0.5,    lotUnits:1,      name:"UK100 / FTSE",  tickValue:0.5 },
  GER30:  { pipSize:0.5,    lotUnits:1,      name:"GER30 / DAX",   tickValue:0.5 },
  GER40:  { pipSize:0.5,    lotUnits:1,      name:"GER40 / DAX",   tickValue:0.5 },
  DE30:   { pipSize:0.5,    lotUnits:1,      name:"DE30 / DAX",    tickValue:0.5 },
  SPX500: { pipSize:0.25,   lotUnits:1,      name:"S&P 500",       tickValue:0.25 },
  // Crypto
  BTCUSD: { pipSize:0.5,    lotUnits:1,      name:"BTC/USD" },
  ETHUSD: { pipSize:0.01,   lotUnits:1,      name:"ETH/USD" },
  // Oil
  USOIL:  { pipSize:0.01,   lotUnits:100,    name:"WTI Crude Oil", tickValue:1 },
  UKOIL:  { pipSize:0.01,   lotUnits:100,    name:"Brent Crude",   tickValue:1 },
}

const SYMBOLS = Object.keys(PIP_INFO)

function getPipValue(symbol, lotSize, currentPrice) {
  const info = PIP_INFO[symbol]
  if (!info) return 0
  // For forex: pip value = (pip size / price) * lot units * lot size
  // For USD-quoted pairs: pip value per lot = pip size * lot units
  if (info.tickValue) return info.tickValue * lotSize
  // Forex: USD-denominated pairs (e.g. EUR/USD)
  if (symbol.endsWith("USD")) return info.pipSize * info.lotUnits * lotSize
  // Cross pairs: approximate using current price
  if (currentPrice && currentPrice > 0) {
    return (info.pipSize / currentPrice) * info.lotUnits * lotSize
  }
  return info.pipSize * info.lotUnits * lotSize
}

// ─── Risk score helper ────────────────────────────────────────────────────────
function getRiskScore(riskPct) {
  if (riskPct <= 0.5) return { label:"Conservative",  color:"#2ed573", icon:"🛡️" }
  if (riskPct <= 1.0) return { label:"Moderate",      color:"#00d4aa", icon:"⚖️" }
  if (riskPct <= 2.0) return { label:"Standard",      color:"#ffa502", icon:"📊" }
  if (riskPct <= 3.0) return { label:"Aggressive",    color:"#ff6b35", icon:"⚡" }
  return                     { label:"High Risk",     color:"#ff4757", icon:"⚠️" }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl p-5 ${className}`}
      style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      {children}
    </div>
  )
}

function Label({ children }) {
  return <p className="text-xs font-semibold mb-1.5" style={{ color:"var(--text-muted)" }}>{children}</p>
}

function Input({ value, onChange, type="number", placeholder, prefix, suffix, min, max, step = "any" }) {
  return (
    <div className="relative flex items-center">
      {prefix && (
        <span className="absolute left-3 text-sm font-bold" style={{ color:"var(--text-muted)" }}>{prefix}</span>
      )}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} min={min} max={max} step={step}
        className="w-full h-10 rounded-xl text-sm border outline-none transition-colors"
        style={{
          background:"var(--bg-elevated)", borderColor:"var(--border)",
          color:"var(--text-primary)", fontFamily:"var(--font-mono)",
          paddingLeft: prefix ? "28px" : "12px",
          paddingRight: suffix ? "36px" : "12px",
        }}
        onFocus={e => e.target.style.borderColor = "var(--accent)"}
        onBlur={e  => e.target.style.borderColor = "var(--border)"}
      />
      {suffix && (
        <span className="absolute right-3 text-xs" style={{ color:"var(--text-muted)" }}>{suffix}</span>
      )}
    </div>
  )
}

function ResultRow({ label, value, color, large, sub }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom:"1px solid var(--border)" }}>
      <span className="text-sm" style={{ color:"var(--text-secondary)" }}>{label}</span>
      <div className="text-right">
        <span className={`font-bold ${large ? "text-xl" : "text-sm"}`}
          style={{ color: color || "var(--text-primary)", fontFamily:"var(--font-mono)" }}>
          {value}
        </span>
        {sub && <p className="text-xs" style={{ color:"var(--text-muted)" }}>{sub}</p>}
      </div>
    </div>
  )
}

// ─── 1. Position Size Calculator ──────────────────────────────────────────────
function PositionSizeCalc() {
  const { t } = useLanguage()
  const [accountSize, setAccountSize] = useState("10000")
  const [riskPct,     setRiskPct]     = useState("1")
  const [symbol,      setSymbol]      = useState("XAUUSD")
  const [entryPrice,  setEntryPrice]  = useState("")
  const [slPrice,     setSlPrice]     = useState("")
  const [currentPrice,setCurrentPrice]= useState("")

  const calc = useMemo(() => {
    const acc  = parseFloat(accountSize) || 0
    const risk = parseFloat(riskPct)     || 0
    const ep   = parseFloat(entryPrice)  || 0
    const sl   = parseFloat(slPrice)     || 0
    const cp   = parseFloat(currentPrice)|| ep || 0

    if (!acc || !risk || !ep || !sl) return null

    const riskAmt    = acc * (risk / 100)
    const info       = PIP_INFO[symbol]
    const pipDiff    = Math.abs(ep - sl) / (info?.pipSize || 0.0001)
    if (pipDiff === 0) return null

    const pipValPerLot = getPipValue(symbol, 1, cp || ep)
    if (!pipValPerLot) return null

    const lotSize = riskAmt / (pipDiff * pipValPerLot)
    const pipVal  = pipValPerLot * lotSize
    const score   = getRiskScore(risk)

    return {
      riskAmt:   riskAmt.toFixed(2),
      lotSize:   lotSize.toFixed(2),
      pipDiff:   pipDiff.toFixed(1),
      pipVal:    pipVal.toFixed(2),
      score,
      units:     Math.round(lotSize * (info?.lotUnits || 100000)).toLocaleString(),
    }
  }, [accountSize, riskPct, symbol, entryPrice, slPrice, currentPrice])

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background:"rgba(108,99,255,0.15)" }}>
          <CalcIcon size={15} style={{ color:"var(--accent)" }}/>
        </div>
        <div>
          <h2 className="font-bold text-sm" style={{ color:"var(--text-primary)" }}>{ t("calc_title") }</h2>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>How many lots to risk a fixed % of your account</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <Label>Account Balance</Label>
          <Input value={accountSize} onChange={setAccountSize} prefix="$" placeholder="10000"/>
        </div>
        <div>
          <Label>Risk per Trade</Label>
          <Input value={riskPct} onChange={setRiskPct} suffix="%" placeholder="1" min="0.1" max="10" step="0.1"/>
        </div>
        <div>
          <Label>Symbol</Label>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            className="w-full h-10 rounded-xl px-3 text-sm border outline-none"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            {SYMBOLS.map(s => <option key={s} value={s}>{PIP_INFO[s].name}</option>)}
          </select>
        </div>
        <div>
          <Label>Entry Price</Label>
          <Input value={entryPrice} onChange={setEntryPrice} placeholder={t("calc_entry_ph")}/>
        </div>
        <div>
          <Label>Stop Loss Price</Label>
          <Input value={slPrice} onChange={setSlPrice} placeholder={t("calc_sl_ph")}/>
        </div>
        <div>
          <Label>Current/Market Price (optional)</Label>
          <Input value={currentPrice} onChange={setCurrentPrice} placeholder={t("calc_market_desc")}/>
        </div>
      </div>

      {calc ? (
        <div className="rounded-xl p-4" style={{ background:"var(--bg-elevated)" }}>
          <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom:"1px solid var(--border)" }}>
            <span style={{ fontSize:20 }}>{calc.score.icon}</span>
            <div>
              <span className="font-bold text-sm" style={{ color: calc.score.color }}>{calc.score.label} Risk</span>
              <span className="text-xs ml-2" style={{ color:"var(--text-muted)" }}>{riskPct}% of account</span>
            </div>
          </div>
          <ResultRow label={t("calc_lot_size")}      value={calc.lotSize + " lots"}  color="var(--accent)" large/>
          <ResultRow label={t("calc_risk_amount")}   value={`$${calc.riskAmt}`}      color="var(--accent-danger)"/>
          <ResultRow label={t("calc_stop_dist")} value={`${calc.pipDiff} pips`}  color="var(--text-primary)"/>
          <ResultRow label={t("calc_pip_value")}     value={`$${calc.pipVal}`}       color="var(--text-primary)"/>
          <ResultRow label={t("calc_units")}         value={calc.units}              color="var(--text-muted)"/>
        </div>
      ) : (
        <div className="rounded-xl p-4 text-center" style={{ background:"var(--bg-elevated)" }}>
          <p className="text-sm" style={{ color:"var(--text-muted)" }}>Fill in all fields to calculate</p>
        </div>
      )}
    </Card>
  )
}

// ─── 2. Risk/Reward Calculator ────────────────────────────────────────────────
function RRCalc() {
  const { t } = useLanguage()
  const [entry,  setEntry]  = useState("")
  const [sl,     setSl]     = useState("")
  const [tp,     setTp]     = useState("")
  const [winRate,setWinRate]= useState("50")
  const [riskAmt,setRiskAmt]= useState("100")

  const calc = useMemo(() => {
    const ep  = parseFloat(entry)   || 0
    const slP = parseFloat(sl)      || 0
    const tpP = parseFloat(tp)      || 0
    const wr  = parseFloat(winRate) / 100 || 0.5
    const risk= parseFloat(riskAmt) || 100

    if (!ep || !slP || !tpP) return null
    const riskDist   = Math.abs(ep - slP)
    const rewardDist = Math.abs(tpP - ep)
    if (!riskDist) return null

    const rr         = rewardDist / riskDist
    const reward     = risk * rr
    const expectancy = (wr * reward) - ((1-wr) * risk)
    const breakevenWR= 1 / (1 + rr)

    return {
      rr:           rr.toFixed(2),
      riskDist:     riskDist.toFixed(5),
      rewardDist:   rewardDist.toFixed(5),
      reward:       reward.toFixed(2),
      expectancy:   expectancy.toFixed(2),
      breakevenWR:  (breakevenWR * 100).toFixed(1),
      positive:     expectancy > 0,
    }
  }, [entry, sl, tp, winRate, riskAmt])

  const rrColor = calc
    ? parseFloat(calc.rr) >= 2 ? "var(--accent-success)"
      : parseFloat(calc.rr) >= 1 ? "var(--accent-warning)"
      : "var(--accent-danger)"
    : "var(--text-primary)"

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background:"rgba(46,213,115,0.15)" }}>
          <Target size={15} style={{ color:"var(--accent-success)" }}/>
        </div>
        <div>
          <h2 className="font-bold text-sm" style={{ color:"var(--text-primary)" }}>{ t("calc_rr_title") }</h2>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>Analyse a trade's R:R and expectancy before entering</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <Label>Entry Price</Label>
          <Input value={entry} onChange={setEntry} placeholder="2340.50"/>
        </div>
        <div>
          <Label>Stop Loss</Label>
          <Input value={sl} onChange={setSl} placeholder="2325.00"/>
        </div>
        <div>
          <Label>Take Profit</Label>
          <Input value={tp} onChange={setTp} placeholder="2375.00"/>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <Label>Your Win Rate</Label>
          <Input value={winRate} onChange={setWinRate} suffix="%" placeholder="50" min="1" max="99"/>
        </div>
        <div>
          <Label>Risk Amount</Label>
          <Input value={riskAmt} onChange={setRiskAmt} prefix="$" placeholder="100"/>
        </div>
      </div>

      {/* Visual R:R bar */}
      {calc && (
        <div className="mb-4">
          <div className="flex items-center gap-1 h-8 rounded-xl overflow-hidden">
            <div className="flex items-center justify-center text-xs font-bold text-white h-full"
              style={{ width:`${100 / (1 + parseFloat(calc.rr))}%`, background:"var(--accent-danger)", minWidth:30 }}>
              1R
            </div>
            <div className="flex items-center justify-center text-xs font-bold text-white h-full flex-1"
              style={{ background:"var(--accent-success)" }}>
              {calc.rr}R
            </div>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs" style={{ color:"var(--accent-danger)" }}>Risk: ${riskAmt}</span>
            <span className="text-xs" style={{ color:"var(--accent-success)" }}>Reward: ${calc.reward}</span>
          </div>
        </div>
      )}

      {calc ? (
        <div className="rounded-xl p-4" style={{ background:"var(--bg-elevated)" }}>
          <ResultRow label={t("calc_rr_ratio")}        value={`1 : ${calc.rr}`}       color={rrColor} large/>
          <ResultRow label={t("calc_reward")}           value={`$${calc.reward}`}      color="var(--accent-success)"/>
          <ResultRow label="Expectancy"       value={`$${calc.expectancy}`}  color={calc.positive ? "var(--accent-success)" : "var(--accent-danger)"}
            sub={calc.positive ? "Positive edge ✓" : "Negative edge ✗"}/>
          <ResultRow label={t("calc_breakeven_wr")} value={`${calc.breakevenWR}%`} color="var(--text-secondary)"/>
          <ResultRow label={t("calc_risk_dist")}    value={calc.riskDist}           color="var(--text-muted)"/>
          <ResultRow label={t("calc_reward_dist")}  value={calc.rewardDist}         color="var(--text-muted)"/>
        </div>
      ) : (
        <div className="rounded-xl p-4 text-center" style={{ background:"var(--bg-elevated)" }}>
          <p className="text-sm" style={{ color:"var(--text-muted)" }}>Fill in entry, SL, and TP to calculate</p>
        </div>
      )}
    </Card>
  )
}

// ─── 3. Pip Value Calculator ──────────────────────────────────────────────────
function PipValueCalc() {
  const { t } = useLanguage()
  const [symbol,   setSymbol]   = useState("EURUSD")
  const [lotSize,  setLotSize]  = useState("0.1")
  const [pips,     setPips]     = useState("20")
  const [price,    setPrice]    = useState("")

  const calc = useMemo(() => {
    const lot = parseFloat(lotSize) || 0
    const p   = parseFloat(pips)    || 0
    const cp  = parseFloat(price)   || 1
    if (!lot || !p) return null

    const pipVal  = getPipValue(symbol, lot, cp)
    const total   = pipVal * p
    const info    = PIP_INFO[symbol]

    return {
      pipVal:  pipVal.toFixed(2),
      total:   total.toFixed(2),
      pipSize: info?.pipSize,
      name:    info?.name,
    }
  }, [symbol, lotSize, pips, price])

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background:"rgba(255,165,2,0.15)" }}>
          <DollarSign size={15} style={{ color:"var(--accent-warning)" }}/>
        </div>
        <div>
          <h2 className="font-bold text-sm" style={{ color:"var(--text-primary)" }}>{ t("calc_pip_title") }</h2>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>How much is each pip worth in USD</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="col-span-2">
          <Label>Symbol</Label>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            className="w-full h-10 rounded-xl px-3 text-sm border outline-none"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            {SYMBOLS.map(s => <option key={s} value={s}>{PIP_INFO[s].name}</option>)}
          </select>
        </div>
        <div>
          <Label>Lot Size</Label>
          <Input value={lotSize} onChange={setLotSize} placeholder="0.1" min="0.01" step="0.01"/>
        </div>
        <div>
          <Label>Number of Pips</Label>
          <Input value={pips} onChange={setPips} placeholder="20"/>
        </div>
        <div className="col-span-2">
          <Label>Current Price (for cross pairs)</Label>
          <Input value={price} onChange={setPrice} placeholder={t("calc_cross_desc")}/>
        </div>
      </div>

      {calc ? (
        <div className="rounded-xl p-4" style={{ background:"var(--bg-elevated)" }}>
          <ResultRow label={t("calc_value_per_pip")}   value={`$${calc.pipVal}`}  color="var(--accent)" large/>
          <ResultRow label={`${pips} Pips Total`} value={`$${calc.total}`} color="var(--accent-success)"/>
          <ResultRow label={t("calc_pip_size")}        value={calc.pipSize}       color="var(--text-muted)"/>
          <ResultRow label={t("calc_instrument")}      value={calc.name}          color="var(--text-muted)"/>
        </div>
      ) : (
        <div className="rounded-xl p-4 text-center" style={{ background:"var(--bg-elevated)" }}>
          <p className="text-sm" style={{ color:"var(--text-muted)" }}>Fill in fields to calculate</p>
        </div>
      )}
    </Card>
  )
}

// ─── 4. Daily Risk Dashboard ──────────────────────────────────────────────────
function DailyRiskPanel({ accountSize, setAccountSize }) {
  const { t } = useLanguage()
  const [maxDailyRisk, setMaxDailyRisk] = useState("3")
  const [tradesPlanned,setTradesPlanned]= useState("3")
  const [riskPerTrade, setRiskPerTrade] = useState("1")

  const acc    = parseFloat(accountSize)   || 0
  const maxRisk= parseFloat(maxDailyRisk)  || 3
  const trades = parseInt(tradesPlanned)   || 3
  const rpt    = parseFloat(riskPerTrade)  || 1

  const maxRiskAmt   = acc * (maxRisk / 100)
  const riskPerTrAmt = acc * (rpt / 100)
  const totalPlanned = riskPerTrAmt * trades
  const safe         = totalPlanned <= maxRiskAmt
  const tradesAllowed= Math.floor(maxRiskAmt / riskPerTrAmt) || 0

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background:"rgba(255,71,87,0.12)" }}>
          <AlertTriangle size={15} style={{ color:"var(--accent-danger)" }}/>
        </div>
        <div>
          <h2 className="font-bold text-sm" style={{ color:"var(--text-primary)" }}>{ t("calc_risk_title") }</h2>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>Keep your daily drawdown under control</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="col-span-2">
          <Label>Account Balance</Label>
          <Input value={accountSize} onChange={setAccountSize} prefix="$" placeholder="10000"/>
        </div>
        <div>
          <Label>Max Daily Risk</Label>
          <Input value={maxDailyRisk} onChange={setMaxDailyRisk} suffix="%" placeholder="3" min="0.5" max="20" step="0.5"/>
        </div>
        <div>
          <Label>Risk per Trade</Label>
          <Input value={riskPerTrade} onChange={setRiskPerTrade} suffix="%" placeholder="1" min="0.1" max="10" step="0.1"/>
        </div>
        <div className="col-span-2">
          <Label>Trades Planned Today</Label>
          <div className="flex gap-2">
            {[1,2,3,4,5,6].map(n => (
              <button key={n} onClick={() => setTradesPlanned(String(n))}
                className="flex-1 h-10 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: parseInt(tradesPlanned)===n ? "var(--accent)" : "var(--bg-elevated)",
                  color:      parseInt(tradesPlanned)===n ? "#fff" : "var(--text-muted)",
                  border:     `1px solid ${parseInt(tradesPlanned)===n ? "var(--accent)" : "var(--border)"}`,
                }}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {acc > 0 && (
        <div className="rounded-xl p-4" style={{
          background: safe ? "rgba(46,213,115,0.06)" : "rgba(255,71,87,0.06)",
          border:     `1px solid ${safe ? "rgba(46,213,115,0.2)" : "rgba(255,71,87,0.2)"}`,
        }}>
          <div className="flex items-center gap-2 mb-3">
            {safe
              ? <CheckCircle size={16} style={{ color:"var(--accent-success)" }}/>
              : <AlertTriangle size={16} style={{ color:"var(--accent-danger)" }}/>}
            <span className="font-bold text-sm"
              style={{ color: safe ? "var(--accent-success)" : "var(--accent-danger)" }}>
              {safe ? "Within daily risk limit ✓" : "Exceeds daily risk limit ✗"}
            </span>
          </div>
          <ResultRow label={t("calc_max_daily")}      value={`$${maxRiskAmt.toFixed(2)}`}       color="var(--accent-danger)"/>
          <ResultRow label={t("calc_planned_risk")}  value={`$${totalPlanned.toFixed(2)}`}     color={safe ? "var(--accent-success)" : "var(--accent-danger)"}/>
          <ResultRow label={t("calc_risk_pct")}      value={`$${riskPerTrAmt.toFixed(2)}`}     color="var(--text-primary)"/>
          <ResultRow label={t("calc_max_trades")}  value={`${tradesAllowed} trades`}         color={trades <= tradesAllowed ? "var(--accent-success)" : "var(--accent-danger)"}/>
          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs mb-1" style={{ color:"var(--text-muted)" }}>
              <span>Risk used</span>
              <span>{Math.min(100,(totalPlanned/maxRiskAmt*100)).toFixed(0)}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background:"var(--bg-elevated)" }}>
              <div className="h-full rounded-full transition-all"
                style={{
                  width:`${Math.min(100,(totalPlanned/maxRiskAmt*100))}%`,
                  background: safe
                    ? "linear-gradient(90deg,var(--accent-success),#00d4aa)"
                    : "linear-gradient(90deg,var(--accent-warning),var(--accent-danger))",
                }}/>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Calculator() {
  const { t } = useLanguage()
  const [accountSize, setAccountSize] = useState("10000")

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)", fontFamily:"var(--font-display)" }}>
          Risk Calculator
        </h1>
        <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
          Position sizing, R:R analysis, pip values & daily risk management
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PositionSizeCalc/>
        <RRCalc/>
        <PipValueCalc/>
        <DailyRiskPanel accountSize={accountSize} setAccountSize={setAccountSize}/>
      </div>
    </div>
  )
}
