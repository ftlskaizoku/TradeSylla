import { useState, useEffect } from "react"
import { useUser } from "@/lib/UserContext"
import { Trade, Playbook, BacktestSession, BrokerConnection, SylledgeInsight } from "@/api/supabaseStore"
import { toast } from "@/components/ui/toast"
import {
  User, Key, Palette, Download, Upload, Trash2, Shield,
  ChevronRight, Database, Save, AlertTriangle, CheckCircle,
  Eye, EyeOff, Info, Moon, Sun, Zap, LogOut, Camera, Edit3,
  Bell, BellOff, BellRing, Megaphone, TrendingUp, TrendingDown, Trophy, Clock
} from "lucide-react"

// ─── Theme definitions ────────────────────────────────────────────────────────
const THEMES = [
  {
    id: "dark",
    name: "Dark",
    desc: "Classic dark trading interface",
    preview: ["#0a0b0f","#6c63ff","#2ed573"],
    vars: {
      "--bg-primary":"#0a0b0f","--bg-secondary":"#111218","--bg-card":"#16181f",
      "--bg-elevated":"#1c1e28","--accent":"#6c63ff","--accent-secondary":"#00d4aa",
      "--accent-danger":"#ff4757","--accent-warning":"#ffa502","--accent-success":"#2ed573",
      "--text-primary":"#f0f0f5","--text-secondary":"#8b8d9e","--text-muted":"#4a4c5e",
      "--border":"#1e2030","--border-light":"#252738",
    }
  },
  {
    id: "midnight",
    name: "Midnight",
    desc: "Pure black, maximum contrast",
    preview: ["#000000","#7c5cbf","#00ffaa"],
    vars: {
      "--bg-primary":"#000000","--bg-secondary":"#0a0a0a","--bg-card":"#0f0f0f",
      "--bg-elevated":"#141414","--accent":"#7c5cbf","--accent-secondary":"#00ffaa",
      "--accent-danger":"#ff3355","--accent-warning":"#ffaa00","--accent-success":"#00ff88",
      "--text-primary":"#ffffff","--text-secondary":"#999999","--text-muted":"#444444",
      "--border":"#1a1a1a","--border-light":"#222222",
    }
  },
  {
    id: "ocean",
    name: "Ocean",
    desc: "Deep blue — calm & focused",
    preview: ["#060d1a","#3b9eff","#00e5c8"],
    vars: {
      "--bg-primary":"#060d1a","--bg-secondary":"#0a1628","--bg-card":"#0d1e35",
      "--bg-elevated":"#122540","--accent":"#3b9eff","--accent-secondary":"#00e5c8",
      "--accent-danger":"#ff5577","--accent-warning":"#ffcc44","--accent-success":"#44ffaa",
      "--text-primary":"#e8f4ff","--text-secondary":"#7fa8cc","--text-muted":"#3a5570",
      "--border":"#142035","--border-light":"#1c2e48",
    }
  },
  {
    id: "forest",
    name: "Forest",
    desc: "Deep green — natural & sharp",
    preview: ["#060f0a","#2ddb76","#00d4aa"],
    vars: {
      "--bg-primary":"#060f0a","--bg-secondary":"#0a160d","--bg-card":"#0f1d12",
      "--bg-elevated":"#142518","--accent":"#2ddb76","--accent-secondary":"#00d4aa",
      "--accent-danger":"#ff4444","--accent-warning":"#ffbb33","--accent-success":"#44ff99",
      "--text-primary":"#e8fff2","--text-secondary":"#7fbf95","--text-muted":"#3a5540",
      "--border":"#142018","--border-light":"#1c2e22",
    }
  },
  {
    id: "ember",
    name: "Ember",
    desc: "Warm dark — intense & bold",
    preview: ["#0f0a06","#ff6b35","#ffcc00"],
    vars: {
      "--bg-primary":"#0f0a06","--bg-secondary":"#18100a","--bg-card":"#20160d",
      "--bg-elevated":"#281c12","--accent":"#ff6b35","--accent-secondary":"#ffcc00",
      "--accent-danger":"#ff2244","--accent-warning":"#ff9900","--accent-success":"#44dd88",
      "--text-primary":"#fff5ee","--text-secondary":"#bf9977","--text-muted":"#664433",
      "--border":"#2a1a0e","--border-light":"#38241a",
    }
  },
  {
    id: "light",
    name: "Light",
    desc: "Clean light mode",
    preview: ["#f8f9fc","#6c63ff","#2ed573"],
    vars: {
      "--bg-primary":"#f0f2f8","--bg-secondary":"#ffffff","--bg-card":"#ffffff",
      "--bg-elevated":"#f5f6fa","--accent":"#6c63ff","--accent-secondary":"#00b894",
      "--accent-danger":"#e84393","--accent-warning":"#f39c12","--accent-success":"#00b894",
      "--text-primary":"#1a1b2e","--text-secondary":"#5a5c6e","--text-muted":"#9a9cae",
      "--border":"#e2e4f0","--border-light":"#eceef8",
    }
  },
]

function applyTheme(theme) {
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  localStorage.setItem("ts_theme", theme.id)
}

function loadSavedTheme() {
  const id = localStorage.getItem("ts_theme") || "dark"
  const theme = THEMES.find(t => t.id === id) || THEMES[0]
  applyTheme(theme)
  return id
}

// ─── Sidebar nav items ────────────────────────────────────────────────────────
const PAGES = [
  { id:"account",    label:"Account",      icon:User,     color:"#6c63ff" },
  { id:"appearance", label:"Appearance",   icon:Palette,  color:"#00d4aa" },
  { id:"data",       label:"Data & Import",icon:Database, color:"#ffa502" },
  { id:"apikeys",    label:"API Keys",     icon:Key,      color:"#ff6b35" },
  { id:"notifications", label:"Notifications", icon:Bell,   color:"#ff6b35" },
]

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ background: value ? "var(--accent)" : "var(--bg-elevated)", border:"1px solid var(--border)" }}>
      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: value ? "translateX(22px)" : "translateX(2px)" }}/>
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════
// ACCOUNT PAGE
// ═══════════════════════════════════════════════════════════════════
function AccountPage({ user, updateUser, stats }) {
  const [name,    setName]    = useState(user?.full_name || "")
  const [email,   setEmail]   = useState(user?.email || "")
  const [bio,     setBio]     = useState(user?.bio || "")
  const [currency,setCurrency]= useState(user?.currency || "USD")
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    setName(user?.full_name || "")
    setEmail(user?.email || "")
    setBio(user?.bio || "")
    setCurrency(user?.currency || "USD")
  }, [user])

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return }
    setSaving(true)
    updateUser({ full_name: name.trim(), email: email.trim(), bio: bio.trim(), currency })
    await new Promise(r => setTimeout(r, 300))
    setSaving(false)
    toast.success("Account saved!")
  }

  const initials = (name || "T").split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2)

  return (
    <div className="space-y-6 max-w-xl">
      {/* Avatar + name hero */}
      <div className="rounded-2xl p-6 flex items-center gap-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
            style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
            {initials}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold" style={{ color:"var(--text-primary)" }}>{name || "Trader"}</h2>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>{email || "No email set"}</p>
          <div className="flex gap-3 mt-3">
            {[
              { label:"Trades",    value:stats.trades },
              { label:"Strategies",value:stats.playbooks },
              { label:"Backtests", value:stats.backtests },
            ].map(s=>(
              <div key={s.label} className="text-center">
                <p className="text-base font-bold" style={{ color:"var(--accent)" }}>{s.value}</p>
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Profile form */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold" style={{ color:"var(--text-primary)" }}>Profile Information</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-muted)" }}>Display Name</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"
                className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            </div>
            <div>
              <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-muted)" }}>Currency</label>
              <select value={currency} onChange={e=>setCurrency(e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
                {["USD","EUR","GBP","CHF","JPY","AUD","CAD","ZAR"].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-muted)" }}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          <div>
            <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-muted)" }}>Bio / Trading style</label>
            <textarea rows={2} value={bio} onChange={e=>setBio(e.target.value)} placeholder="e.g. London session scalper, ICT concepts, 3-5 trades/day"
              className="w-full rounded-lg px-3 py-2 text-sm border resize-none" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          </div>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity:saving?0.7:1 }}>
            <Save size={13}/> {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {/* Stats overview */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold" style={{ color:"var(--text-primary)" }}>Account Overview</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
          {[
            { label:"Total Trades",    value:stats.trades,    color:"var(--accent)" },
            { label:"Strategies",      value:stats.playbooks, color:"var(--accent-secondary)" },
            { label:"Backtest Sessions",value:stats.backtests,color:"var(--accent-warning)" },
            { label:"Broker Accounts", value:stats.brokers,   color:"#ff6b35" },
          ].map((s,i)=>(
            <div key={s.label} className="p-5 text-center" style={{ borderRight: i<3?"1px solid var(--border)":"none" }}>
              <p className="text-2xl font-bold" style={{ color:s.color }}>{s.value}</p>
              <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// APPEARANCE PAGE
// ═══════════════════════════════════════════════════════════════════
function AppearancePage() {
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem("ts_theme") || "dark")
  const [prefsLoaded, setPrefsLoaded]  = useState(false)
  const [defaultTF,   setDefaultTF]    = useState("H1")
  const [defaultSession, setDefaultSession] = useState("LONDON")
  const [showPnlHeader,  setShowPnlHeader]  = useState(true)
  const [compactMode,    setCompactMode]    = useState(false)

  useEffect(()=>{
    const p = JSON.parse(localStorage.getItem("ts_prefs") || "{}")
    if (p.defaultTF)        setDefaultTF(p.defaultTF)
    if (p.defaultSession)   setDefaultSession(p.defaultSession)
    if (p.showPnlHeader !== undefined) setShowPnlHeader(p.showPnlHeader)
    if (p.compactMode   !== undefined) setCompactMode(p.compactMode)
    setPrefsLoaded(true)
  }, [])

  const selectTheme = (theme) => {
    setActiveTheme(theme.id)
    applyTheme(theme)
    toast.success(`${theme.name} theme applied!`)
  }

  const savePrefs = () => {
    localStorage.setItem("ts_prefs", JSON.stringify({ defaultTF, defaultSession, showPnlHeader, compactMode }))
    toast.success("Preferences saved!")
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Theme selector */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold" style={{ color:"var(--text-primary)" }}>Theme</h3>
          <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>Persists across sessions automatically</p>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map(theme => {
            const isActive = activeTheme === theme.id
            return (
              <button key={theme.id} onClick={() => selectTheme(theme)}
                className="relative rounded-xl p-4 text-left transition-all border-2"
                style={{ background:"var(--bg-elevated)", borderColor: isActive ? "var(--accent)" : "var(--border)" }}>
                {/* Color preview swatches */}
                <div className="flex gap-1 mb-3">
                  {theme.preview.map((c,i)=>(
                    <div key={i} className="w-6 h-6 rounded-md" style={{ background:c }}/>
                  ))}
                  {/* Large bg swatch */}
                  <div className="flex-1 h-6 rounded-md ml-1" style={{ background:theme.preview[0] }}/>
                </div>
                <p className="text-sm font-bold" style={{ color:"var(--text-primary)" }}>{theme.name}</p>
                <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>{theme.desc}</p>
                {isActive && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background:"var(--accent)" }}>
                    <CheckCircle size={12} className="text-white"/>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Display preferences */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold" style={{ color:"var(--text-primary)" }}>Display Preferences</h3>
        </div>
        <div className="p-5 space-y-0 divide-y" style={{ borderColor:"var(--border)" }}>
          {[
            { label:"Show P&L in header",    sub:"Display net P&L in the top bar",   val:showPnlHeader, set:setShowPnlHeader },
            { label:"Compact mode",          sub:"Reduce spacing for more data density", val:compactMode, set:setCompactMode },
          ].map(row=>(
            <div key={row.label} className="flex items-center justify-between py-4">
              <div>
                <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>{row.label}</p>
                <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>{row.sub}</p>
              </div>
              <Toggle value={row.val} onChange={row.set}/>
            </div>
          ))}
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>Default Timeframe</p>
              <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>Pre-selected when logging trades</p>
            </div>
            <select value={defaultTF} onChange={e=>setDefaultTF(e.target.value)} className="h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {["M1","M5","M15","M30","H1","H4","D1"].map(t=><option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between py-4">
            <div>
              <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>Default Session</p>
              <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>Pre-selected when logging trades</p>
            </div>
            <select value={defaultSession} onChange={e=>setDefaultSession(e.target.value)} className="h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {["LONDON","NEW_YORK","ASIAN","SYDNEY"].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 pb-5">
          <button onClick={savePrefs} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
            <Save size={13}/> Save Preferences
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// DATA & IMPORT PAGE
// ═══════════════════════════════════════════════════════════════════

// Smart CSV field mapper — recognizes common broker column names
const FIELD_MAP = {
  // Symbol / pair
  symbol:    ["symbol","pair","instrument","asset","market","ticker","currency pair","item"],
  // Direction
  direction: ["direction","type","side","action","trade type","order type","buy/sell","b/s"],
  // Entry
  entry_price:["entry price","entry","open price","open","price open","entryprice","entry_price","open rate"],
  // Exit
  exit_price: ["exit price","exit","close price","close","price close","exitprice","exit_price","close rate","closing price"],
  // P&L
  pnl:        ["pnl","p&l","profit","profit/loss","net profit","net p&l","gain/loss","profit loss","realized pl","realized p&l","net","result"],
  // Pips
  pips:       ["pips","points","pip","ticks","tick"],
  // Volume/lots
  volume:     ["volume","lots","size","quantity","lot size","units","position size"],
  // Date/time
  entry_time: ["open time","open date","date","time","entry time","entry date","trade date","datetime","opened","open date/time","date/time"],
  // Session
  session:    ["session","market session","trading session"],
  // Timeframe
  timeframe:  ["timeframe","time frame","tf","period","chart period"],
  // Outcome
  outcome:    ["outcome","result","win/loss","trade result","status","win loss"],
  // Notes
  notes:      ["notes","comment","comments","remark","remarks","description","note","memo"],
  // Quality
  quality:    ["quality","rating","score","grade","setup quality","trade quality"],
}

function normalizeHeader(h) { return h.toLowerCase().trim().replace(/[_\-\.]/g," ") }

function mapCSVRow(headers, row) {
  const mapped = {}
  const usedCols = new Set()

  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    for (let hi = 0; hi < headers.length; hi++) {
      const norm = normalizeHeader(headers[hi])
      if (aliases.some(a => norm === a || norm.includes(a))) {
        mapped[field] = row[hi]?.trim() || ""
        usedCols.add(hi)
        break
      }
    }
  }

  // Normalize direction
  if (mapped.direction) {
    const d = mapped.direction.toUpperCase()
    if (d.includes("BUY") || d === "B" || d === "LONG" || d === "0") mapped.direction = "BUY"
    else if (d.includes("SELL") || d === "S" || d === "SHORT" || d === "1") mapped.direction = "SELL"
    else mapped.direction = "BUY"
  }

  // Normalize outcome
  if (mapped.outcome) {
    const o = mapped.outcome.toUpperCase()
    if (o.includes("WIN") || o.includes("PROFIT") || o === "W" || o === "1") mapped.outcome = "WIN"
    else if (o.includes("LOSS") || o.includes("LOSE") || o === "L" || o === "0" || o === "-1") mapped.outcome = "LOSS"
    else if (o.includes("BREAK") || o.includes("BE") || o === "0.00" || o === "0") {
      const pnl = parseFloat(mapped.pnl || "0")
      mapped.outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN"
    }
    else {
      // Infer from P&L
      const pnl = parseFloat(mapped.pnl || "0")
      mapped.outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN"
    }
  } else if (mapped.pnl !== undefined) {
    const pnl = parseFloat(mapped.pnl || "0")
    mapped.outcome = pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "BREAKEVEN"
  }

  // Normalize P&L (remove currency symbols)
  if (mapped.pnl) {
    mapped.pnl = parseFloat(mapped.pnl.replace(/[^0-9.\-]/g, "")) || 0
  }
  if (mapped.pips)        mapped.pips = parseFloat(mapped.pips) || 0
  if (mapped.entry_price) mapped.entry_price = parseFloat(mapped.entry_price) || 0
  if (mapped.exit_price)  mapped.exit_price  = parseFloat(mapped.exit_price)  || 0
  if (mapped.quality)     mapped.quality = parseInt(mapped.quality) || 5

  return mapped
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { trades: [], skipped: 0, mapped: [] }

  // Detect delimiter
  const firstLine = lines[0]
  const delim = firstLine.includes("\t") ? "\t" : firstLine.includes(";") ? ";" : ","

  const parseRow = (line) => {
    const result = []
    let inQuote = false, cur = ""
    for (let c of line) {
      if (c === '"') { inQuote = !inQuote }
      else if (c === delim && !inQuote) { result.push(cur); cur = "" }
      else { cur += c }
    }
    result.push(cur)
    return result
  }

  const headers = parseRow(lines[0])
  const trades  = []
  let skipped   = 0
  const mappedFields = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const row = parseRow(lines[i])
    const mapped = mapCSVRow(headers, row)
    // Must have at least symbol or pnl to be a valid trade row
    if (!mapped.symbol && mapped.pnl === undefined) { skipped++; continue }
    if (!mapped.symbol) mapped.symbol = "UNKNOWN"
    if (!mapped.direction) mapped.direction = "BUY"
    if (!mapped.outcome) mapped.outcome = mapped.pnl >= 0 ? "WIN" : "LOSS"
    trades.push(mapped)
  }

  // Report which fields were recognized
  if (trades.length > 0) {
    Object.keys(trades[0]).forEach(k => mappedFields.push(k))
  }

  return { trades, skipped, headers, mappedFields }
}

function DataPage({ stats, onStatsRefresh }) {
  const [csvFile,      setCsvFile]      = useState(null)
  const [csvPreview,   setCsvPreview]   = useState(null)
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [clearTarget,  setClearTarget]  = useState(null)
  const [clearing,     setClearing]     = useState(false)

  const CLEAR_OPTIONS = [
    { key:"ts_trades",             label:"All Trades",              color:"var(--accent-danger)" },
    { key:"ts_playbooks",          label:"All Playbook Strategies",  color:"var(--accent-danger)" },
    { key:"ts_backtest_sessions",  label:"All Backtest Sessions",    color:"var(--accent-danger)" },
    { key:"ts_sylledge_insights",  label:"All AI Insights",          color:"var(--accent-warning)" },
    { key:"__all__",               label:"Everything — Full Reset",  color:"var(--accent-danger)" },
  ]

  const handleCSVSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parseCSV(ev.target.result)
      setCsvPreview(result)
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const importCSV = async () => {
    if (!csvPreview || !csvPreview.trades.length) return
    setImporting(true)
    let imported = 0
    for (const t of csvPreview.trades) {
      try { await Trade.create(t); imported++ } catch {}
    }
    setImporting(false)
    setCsvFile(null)
    setCsvPreview(null)
    setImportResult({ imported, skipped: csvPreview.skipped })
    onStatsRefresh()
    toast.success(`Imported ${imported} trades!`)
  }

  const exportData = () => {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith("ts_"))
    const data = {}
    allKeys.forEach(k => {
      try { data[k] = JSON.parse(localStorage.getItem(k)) }
      catch { data[k] = localStorage.getItem(k) }
    })
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url
    a.download = `tradesylla-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Backup exported!")
  }

  const importJSON = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        Object.entries(data).forEach(([k, v]) => {
          if (k.startsWith("ts_")) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v))
        })
        onStatsRefresh()
        toast.success("Backup imported! Refresh the page to see all changes.")
      } catch { toast.error("Invalid backup file") }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  const doClear = async () => {
    if (!clearTarget) return
    setClearing(true)
    await new Promise(r => setTimeout(r, 400))
    if (clearTarget === "__all__") {
      Object.keys(localStorage).filter(k => k.startsWith("ts_") && k !== "ts_anthropic_key" && k !== "ts_theme" && k !== "ts_prefs").forEach(k => localStorage.removeItem(k))
    } else {
      localStorage.removeItem(clearTarget)
    }
    setClearTarget(null)
    setClearing(false)
    onStatsRefresh()
    toast.success("Cleared!")
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* CSV Import */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold" style={{ color:"var(--text-primary)" }}>CSV Import</h3>
          <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>
            Smart importer — automatically recognizes MT4, MT5, cTrader, TradingView and custom CSV formats
          </p>
        </div>
        <div className="p-5">
          {/* Supported formats */}
          <div className="flex flex-wrap gap-2 mb-4">
            {["MT4 History","MT5 History","cTrader","TradingView","Generic CSV"].map(f=>(
              <span key={f} className="px-2.5 py-1 rounded-lg text-xs font-medium"
                style={{ background:"rgba(108,99,255,0.1)", color:"var(--accent)", border:"1px solid rgba(108,99,255,0.2)" }}>
                {f}
              </span>
            ))}
          </div>

          {!csvFile ? (
            <label className="flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer hover:opacity-80 transition-opacity"
              style={{ borderColor:"var(--border)", background:"var(--bg-elevated)" }}>
              <Upload size={28} style={{ color:"var(--accent)" }}/>
              <div className="text-center">
                <p className="font-medium text-sm" style={{ color:"var(--text-primary)" }}>Drop CSV file or click to browse</p>
                <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>Supports .csv and .txt trade history exports</p>
              </div>
              <input type="file" accept=".csv,.txt" onChange={handleCSVSelect} className="hidden"/>
            </label>
          ) : csvPreview && (
            <div className="space-y-3">
              {/* Preview */}
              <div className="rounded-xl p-4" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={15} style={{ color:"var(--accent-success)" }}/>
                    <p className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{csvFile.name}</p>
                  </div>
                  <button onClick={()=>{setCsvFile(null);setCsvPreview(null)}} className="text-xs px-2 py-1 rounded"
                    style={{ color:"var(--text-muted)", background:"var(--bg-card)" }}>✕ Clear</button>
                </div>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span style={{ color:"var(--accent-success)" }}>✓ {csvPreview.trades.length} trades ready</span>
                  {csvPreview.skipped>0 && <span style={{ color:"var(--accent-warning)" }}>⚠ {csvPreview.skipped} rows skipped</span>}
                </div>
                {/* Mapped fields */}
                {csvPreview.mappedFields?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs mb-2" style={{ color:"var(--text-muted)" }}>Recognized fields:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {csvPreview.mappedFields.map(f=>(
                        <span key={f} className="px-2 py-0.5 rounded text-xs" style={{ background:"rgba(46,213,115,0.12)", color:"var(--accent-success)" }}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Sample rows */}
                {csvPreview.trades.slice(0,3).map((t,i)=>(
                  <div key={i} className="mt-2 p-2 rounded-lg text-xs flex gap-3 flex-wrap" style={{ background:"var(--bg-card)", color:"var(--text-secondary)" }}>
                    <span className="font-semibold" style={{ color:"var(--text-primary)" }}>{t.symbol||"?"}</span>
                    <span style={{ color:t.direction==="BUY"?"var(--accent-success)":"var(--accent-danger)" }}>{t.direction}</span>
                    {t.pnl!==undefined && <span style={{ color:t.pnl>=0?"var(--accent-success)":"var(--accent-danger)" }}>{t.pnl>=0?"+":""}{t.pnl}</span>}
                    <span style={{ color:t.outcome==="WIN"?"var(--accent-success)":t.outcome==="LOSS"?"var(--accent-danger)":"var(--accent)" }}>{t.outcome}</span>
                  </div>
                ))}
              </div>
              <button onClick={importCSV} disabled={importing} className="w-full h-10 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
                style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity:importing?0.7:1 }}>
                <Upload size={14}/> {importing ? "Importing..." : `Import ${csvPreview.trades.length} Trades`}
              </button>
            </div>
          )}

          {importResult && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl" style={{ background:"rgba(46,213,115,0.1)", border:"1px solid rgba(46,213,115,0.2)" }}>
              <CheckCircle size={15} style={{ color:"var(--accent-success)" }}/>
              <p className="text-sm" style={{ color:"var(--accent-success)" }}>
                Successfully imported <strong>{importResult.imported}</strong> trades
                {importResult.skipped>0 && ` · ${importResult.skipped} rows skipped (unrecognized)`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Storage stats */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold" style={{ color:"var(--text-primary)" }}>Storage</h3>
        </div>
        <div className="grid grid-cols-5 divide-x" style={{ borderColor:"var(--border)" }}>
          {[
            { label:"Trades",     value:stats.trades },
            { label:"Strategies", value:stats.playbooks },
            { label:"Backtests",  value:stats.backtests },
            { label:"Brokers",    value:stats.brokers },
            { label:"Insights",   value:stats.insights },
          ].map(s=>(
            <div key={s.label} className="p-4 text-center">
              <p className="text-xl font-bold" style={{ color:"var(--accent)" }}>{s.value}</p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>
        <div className="p-5 flex flex-wrap gap-3" style={{ borderTop:"1px solid var(--border)" }}>
          <button onClick={exportData} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            <Download size={13}/> Export Backup
          </button>
          <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border cursor-pointer"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            <Upload size={13}/> Import Backup
            <input type="file" accept=".json" onChange={importJSON} className="hidden"/>
          </label>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid rgba(255,71,87,0.3)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold" style={{ color:"var(--accent-danger)" }}>Danger Zone</h3>
        </div>
        <div className="p-5 space-y-2">
          {CLEAR_OPTIONS.map(opt=>(
            <button key={opt.key} onClick={()=>setClearTarget(opt.key)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left hover:opacity-80 transition-opacity"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)" }}>
              <div className="flex items-center gap-2">
                <Trash2 size={13} style={{ color:opt.color }}/>
                <span className="text-sm" style={{ color:opt.color }}>{opt.label}</span>
              </div>
              <ChevronRight size={13} style={{ color:"var(--text-muted)" }}/>
            </button>
          ))}
        </div>
      </div>

      {/* Clear confirm */}
      {clearTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=>!clearing&&setClearTarget(null)}/>
          <div className="relative rounded-2xl p-6 w-full max-w-sm z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background:"rgba(255,71,87,0.15)" }}>
                <AlertTriangle size={20} style={{ color:"var(--accent-danger)" }}/>
              </div>
              <h3 className="font-bold" style={{ color:"var(--text-primary)" }}>Are you sure?</h3>
            </div>
            <p className="text-sm font-bold mb-4" style={{ color:"var(--accent-danger)" }}>
              {CLEAR_OPTIONS.find(o=>o.key===clearTarget)?.label}
            </p>
            <p className="text-xs mb-5" style={{ color:"var(--text-muted)" }}>This cannot be undone. Export a backup first.</p>
            <div className="flex gap-3">
              <button onClick={()=>setClearTarget(null)} disabled={clearing} className="flex-1 h-9 rounded-lg text-sm border"
                style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
              <button onClick={doClear} disabled={clearing} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
                style={{ background:"var(--accent-danger)", opacity:clearing?0.7:1 }}>
                {clearing ? "Clearing..." : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// API KEYS PAGE
// ═══════════════════════════════════════════════════════════════════
function APIKeysPage() {
  const [apiKey,   setApiKey]   = useState("")
  const [showKey,  setShowKey]  = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  useEffect(()=>{
    const k = localStorage.getItem("ts_anthropic_key") || ""
    setApiKey(k)
    if (k) setKeySaved(true)
  }, [])

  const saveKey = () => {
    const trimmed = apiKey.trim()
    if (trimmed && !trimmed.startsWith("sk-ant-")) { toast.error("Invalid key — must start with sk-ant-"); return }
    if (trimmed) { localStorage.setItem("ts_anthropic_key", trimmed); setKeySaved(true); toast.success("API key saved! SYLLEDGE AI is ready.") }
    else { localStorage.removeItem("ts_anthropic_key"); setKeySaved(false); toast.success("API key removed") }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
              <span className="text-white font-bold text-sm">AI</span>
            </div>
            <div>
              <h3 className="font-semibold" style={{ color:"var(--text-primary)" }}>Anthropic API — SYLLEDGE AI</h3>
              <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>Powers your personal trading coach</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 rounded-xl p-3" style={{ background:"rgba(0,212,170,0.08)", border:"1px solid rgba(0,212,170,0.2)" }}>
            <Info size={14} style={{ color:"var(--accent-secondary)", flexShrink:0, marginTop:2 }}/>
            <p className="text-xs" style={{ color:"var(--text-secondary)" }}>
              Get a free API key at{" "}
              <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold" style={{ color:"var(--accent)" }}>console.anthropic.com</a>
              . Your key is stored <strong>only in your browser</strong>, never transmitted to any server.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input type={showKey?"text":"password"} value={apiKey} onChange={e=>{setApiKey(e.target.value);setKeySaved(false)}}
                placeholder="sk-ant-api03-..." className="w-full h-10 rounded-xl px-3 pr-10 text-sm border font-mono"
                style={{ background:"var(--bg-elevated)", borderColor:keySaved?"var(--accent-success)":"var(--border)", color:"var(--text-primary)" }}/>
              <button onClick={()=>setShowKey(s=>!s)} className="absolute right-3 top-2.5 hover:opacity-70"
                style={{ color:"var(--text-muted)" }}>
                {showKey?<EyeOff size={16}/>:<Eye size={16}/>}
              </button>
            </div>
            <button onClick={saveKey} className="px-4 h-10 rounded-xl text-sm font-semibold flex items-center gap-1.5"
              style={{ background:keySaved?"rgba(46,213,115,0.15)":"linear-gradient(135deg,#6c63ff,#5a52d5)",
                color:keySaved?"var(--accent-success)":"#fff",
                border:keySaved?"1px solid var(--accent-success)":"none" }}>
              {keySaved?<><CheckCircle size={13}/> Saved</>:<><Save size={13}/> Save</>}
            </button>
          </div>
          {keySaved && (
            <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background:"rgba(46,213,115,0.08)", border:"1px solid rgba(46,213,115,0.2)" }}>
              <CheckCircle size={14} style={{ color:"var(--accent-success)" }}/>
              <p className="text-sm font-medium" style={{ color:"var(--accent-success)" }}>SYLLEDGE AI is active and ready</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <h3 className="font-semibold mb-3" style={{ color:"var(--text-primary)" }}>About TradeSylla</h3>
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <div>
            <p className="font-bold" style={{ color:"var(--text-primary)" }}>TradeSylla v1.0.0</p>
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>All data stored locally — no account, no cloud, no tracking</p>
          </div>
        </div>
        <p className="text-xs" style={{ color:"var(--text-muted)" }}>
          Built with React + Vite + Recharts + Tailwind CSS + Radix UI
        </p>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════
// NOTIFICATION CENTER PAGE
// ═══════════════════════════════════════════════════════════════════

// Notification store helpers
const NOTIF_KEY = "ts_notifications"
const NOTIF_PREFS_KEY = "ts_notif_prefs"

function getNotifications() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]") } catch { return [] }
}
function saveNotifications(arr) { localStorage.setItem(NOTIF_KEY, JSON.stringify(arr)) }
function getNotifPrefs() {
  try { return JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || "{}") } catch { return {} }
}

const DEFAULT_NOTIF_PREFS = {
  trade_logged:    true,
  milestone_wins:  true,
  daily_summary:   true,
  loss_streak:     true,
  playbook_linked: false,
  import_done:     true,
  sync_done:       true,
}

const NOTIF_TYPES = {
  trade_win:     { icon: TrendingUp,   color: "var(--accent-success)", bg: "rgba(46,213,115,0.08)"  },
  trade_loss:    { icon: TrendingDown, color: "var(--accent-danger)",  bg: "rgba(255,71,87,0.08)"   },
  milestone:     { icon: Trophy,       color: "#ffd700",               bg: "rgba(255,215,0,0.08)"   },
  import:        { icon: Upload,       color: "var(--accent)",         bg: "rgba(108,99,255,0.08)"  },
  streak_loss:   { icon: BellRing,     color: "var(--accent-warning)", bg: "rgba(255,165,2,0.08)"   },
  sync:          { icon: Zap,          color: "var(--accent-secondary)",bg:"rgba(0,212,170,0.08)"   },
  system:        { icon: Megaphone,    color: "var(--text-secondary)", bg: "var(--bg-elevated)"     },
}

// Call this from anywhere in the app to push a notification
export function pushNotification({ type = "system", title, body }) {
  const notifs = getNotifications()
  notifs.unshift({
    id:    crypto.randomUUID(),
    type,
    title,
    body,
    read:  false,
    time:  new Date().toISOString(),
  })
  // Keep max 100
  if (notifs.length > 100) notifs.pop()
  saveNotifications(notifs)
  // Fire toast too
  toast(title, { type: type.includes("loss") ? "error" : type === "milestone" ? "success" : "default" })
}

export function getUnreadCount() {
  return getNotifications().filter(n => !n.read).length
}

function NotificationsPage() {
  const [notifs, setNotifs]   = useState([])
  const [prefs,  setPrefs]    = useState(DEFAULT_NOTIF_PREFS)
  const [filter, setFilter]   = useState("all") // all | unread

  useEffect(() => {
    setNotifs(getNotifications())
    setPrefs({ ...DEFAULT_NOTIF_PREFS, ...getNotifPrefs() })
  }, [])

  const markAllRead = () => {
    const updated = notifs.map(n => ({ ...n, read: true }))
    saveNotifications(updated)
    setNotifs(updated)
    toast.success("All notifications marked as read")
  }

  const markRead = (id) => {
    const updated = notifs.map(n => n.id === id ? { ...n, read: true } : n)
    saveNotifications(updated)
    setNotifs(updated)
  }

  const clearAll = () => {
    saveNotifications([])
    setNotifs([])
    toast.success("Notifications cleared")
  }

  const savePref = (key, val) => {
    const updated = { ...prefs, [key]: val }
    setPrefs(updated)
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(updated))
    toast.success("Preference saved")
  }

  const displayed = filter === "unread" ? notifs.filter(n => !n.read) : notifs
  const unread    = notifs.filter(n => !n.read).length

  const fmtTime = (iso) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = Math.floor((now - d) / 1000)
    if (diff < 60)   return "just now"
    if (diff < 3600) return Math.floor(diff/60) + "m ago"
    if (diff < 86400)return Math.floor(diff/3600) + "h ago"
    return d.toLocaleDateString()
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center relative" style={{ background:"rgba(255,107,53,0.15)" }}>
            <Bell size={17} style={{ color:"#ff6b35" }}/>
            {unread > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background:"var(--accent-danger)", fontSize:9 }}>{unread}</div>
            )}
          </div>
          <div>
            <h2 className="font-bold" style={{ color:"var(--text-primary)" }}>Notifications</h2>
            <p className="text-xs" style={{ color:"var(--text-muted)" }}>{unread} unread · {notifs.length} total</p>
          </div>
        </div>
        <div className="flex gap-2">
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs px-3 py-1.5 rounded-lg border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>
              Mark all read
            </button>
          )}
          {notifs.length > 0 && (
            <button onClick={clearAll} className="text-xs px-3 py-1.5 rounded-lg border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--accent-danger)" }}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background:"var(--bg-elevated)" }}>
        {[{id:"all",label:"All"},{id:"unread",label:`Unread${unread>0?" ("+unread+")":""}`}].map(f=>(
          <button key={f.id} onClick={()=>setFilter(f.id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{ background:filter===f.id?"var(--accent)":"transparent", color:filter===f.id?"#fff":"var(--text-secondary)" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        {displayed.length === 0 ? (
          <div className="py-14 text-center">
            <BellOff size={26} className="mx-auto mb-3" style={{ color:"var(--text-muted)" }}/>
            <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </p>
            <p className="text-xs mt-1" style={{ color:"var(--text-muted)" }}>Notifications appear here when you log trades, hit milestones, and more.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor:"var(--border)" }}>
            {displayed.map(n => {
              const cfg = NOTIF_TYPES[n.type] || NOTIF_TYPES.system
              const Icon = cfg.icon
              return (
                <div key={n.id} onClick={()=>markRead(n.id)}
                  className="flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:opacity-90"
                  style={{ background: n.read ? "transparent" : cfg.bg }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: n.read ? "var(--bg-elevated)" : cfg.bg, border:`1px solid ${cfg.color}30` }}>
                    <Icon size={15} style={{ color: cfg.color }}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{n.title}</p>
                      {!n.read && <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:"var(--accent)" }}/>}
                    </div>
                    {n.body && <p className="text-xs mt-0.5 leading-relaxed" style={{ color:"var(--text-secondary)" }}>{n.body}</p>}
                    <p className="text-xs mt-1 flex items-center gap-1" style={{ color:"var(--text-muted)" }}>
                      <Clock size={10}/>{fmtTime(n.time)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Notification preferences */}
      <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="font-semibold" style={{ color:"var(--text-primary)" }}>Notification Preferences</h3>
          <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>Choose what triggers a notification</p>
        </div>
        <div className="divide-y" style={{ borderColor:"var(--border)" }}>
          {[
            { key:"trade_logged",    label:"Trade logged",          sub:"Every time you log a new trade" },
            { key:"milestone_wins",  label:"Milestone reached",     sub:"e.g. 10 wins, 50 trades, new win streak" },
            { key:"daily_summary",   label:"Daily summary",         sub:"End-of-day recap of your P&L and stats" },
            { key:"loss_streak",     label:"Loss streak alert",     sub:"Notify after 3+ consecutive losses" },
            { key:"playbook_linked", label:"Strategy linked",       sub:"When a trade is linked to a Playbook strategy" },
            { key:"import_done",     label:"CSV import completed",  sub:"After a successful trade import" },
            { key:"sync_done",       label:"MT5 sync completed",    sub:"After a successful MT5 auto-sync" },
          ].map(row => (
            <div key={row.key} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>{row.label}</p>
                <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>{row.sub}</p>
              </div>
              <Toggle value={prefs[row.key] ?? true} onChange={v => savePref(row.key, v)}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// MAIN SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════
export default function Settings() {
  const { user, updateUser } = useUser()
  const [activePage, setActivePage] = useState(() => localStorage.getItem("ts_settings_page") || "account")
  const [stats, setStats] = useState({ trades:0, playbooks:0, backtests:0, brokers:0, insights:0 })

  useEffect(()=>{
    // Load and apply saved theme on mount
    loadSavedTheme()
    loadStats()
  }, [])

  const loadStats = async () => {
    const [trades, playbooks, backtests, brokers, insights] = await Promise.all([
      Trade.list(), Playbook.list(), BacktestSession.list(), BrokerConnection.list(), SylledgeInsight.list()
    ])
    setStats({ trades:trades.length, playbooks:playbooks.length, backtests:backtests.length, brokers:brokers.length, insights:insights.length })
  }

  const handlePageChange = (id) => {
    setActivePage(id)
    localStorage.setItem("ts_settings_page", id)
  }

  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-6">
      {/* Mobile: horizontal scrollable tabs */}
      <div className="md:hidden w-full overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max px-1">
          {PAGES.map(p => {
            const active = activePage === p.id
            return (
              <button key={p.id} onClick={() => handlePageChange(p.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium flex-shrink-0 transition-all"
                style={{ background: active ? `${p.color}20` : "var(--bg-elevated)",
                  color: active ? p.color : "var(--text-secondary)",
                  border: `1px solid ${active ? p.color + "40" : "var(--border)"}` }}>
                <p.icon size={14}/>
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Desktop: vertical sidebar */}
      <div className="hidden md:block w-48 flex-shrink-0">
        <div className="sticky top-0">
          <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-3" style={{ color:"var(--text-muted)" }}>Settings</p>
          <nav className="space-y-1">
            {PAGES.map(p => {
              const active = activePage === p.id
              return (
                <button key={p.id} onClick={() => handlePageChange(p.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all"
                  style={{ background: active ? `${p.color}15` : "transparent",
                    color: active ? p.color : "var(--text-secondary)",
                    border: active ? `1px solid ${p.color}30` : "1px solid transparent" }}>
                  <p.icon size={16}/>
                  {p.label}
                  {active && <ChevronRight size={12} className="ml-auto"/>}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Content — full width on mobile */}
      <div className="flex-1 min-w-0">
        {activePage === "account"       && <AccountPage    user={user} updateUser={updateUser} stats={stats}/>}
        {activePage === "appearance"    && <AppearancePage/>}
        {activePage === "data"          && <DataPage stats={stats} onStatsRefresh={loadStats}/>}
        {activePage === "apikeys"       && <APIKeysPage/>}
        {activePage === "notifications" && <NotificationsPage/>}
      </div>
    </div>
  )
}
