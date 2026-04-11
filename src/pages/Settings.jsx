// src/pages/Settings.jsx  — Fix: TokenCard moved outside APIKeysPage
//
// BUG: TokenCard was defined as a function inside APIKeysPage.
// React treats a function defined inside another component as a NEW component
// type on every render — causing unmount/remount on each state change.
// This reset scroll position and killed the clipboard copy mid-flight.
//
// FIX: TokenCard is now a top-level component, defined outside everything.

import { useState, useEffect } from "react"
import { useUser } from "@/lib/UserContext"
import { useLanguage, LANGUAGES } from "@/lib/LanguageContext"
import { supabase } from "@/lib/supabase"
import { Trade, Playbook, BacktestSession, BrokerConnection, SylledgeInsight } from "@/api/supabaseStore"
import { toast } from "@/components/ui/toast"
import { Link } from "react-router-dom"
import { createPageUrl } from "@/utils"
import {
  User, Palette, Database, Key, Bell, Save, Download, Upload,
  Eye, EyeOff, Copy, CheckCircle, RefreshCw, Trash2, Globe,
  Crown, LogOut, ChevronRight, Zap
} from "lucide-react"

// ─── Themes ───────────────────────────────────────────────────────────────────
const THEMES = [
  {
    id:"dark", label:"Deep Space", emoji:"🌌",
    vars:{ "--bg-primary":"#070714","--bg-secondary":"#0a0a1a","--bg-card":"#0d0d1f","--bg-elevated":"#111128",
      "--accent":"#6c63ff","--accent-rgb":"108,99,255","--accent-secondary":"#00d4aa",
      "--accent-danger":"#ff4757","--accent-warning":"#ffa502","--accent-success":"#2ed573",
      "--text-primary":"#f0f0f8","--text-secondary":"#8b8d9e","--text-muted":"#4a4c5e",
      "--border":"#1a1a30","--border-light":"#222240" }
  },
  {
    id:"void", label:"Void", emoji:"⬛",
    vars:{ "--bg-primary":"#000000","--bg-secondary":"#0a0a0a","--bg-card":"#111111","--bg-elevated":"#161616",
      "--accent":"#8b5cf6","--accent-rgb":"139,92,246","--accent-secondary":"#06d6a0",
      "--accent-danger":"#f43f5e","--accent-warning":"#f59e0b","--accent-success":"#06d6a0",
      "--text-primary":"#ede9fe","--text-secondary":"#7c7a9e","--text-muted":"#3d3b5e",
      "--border":"#1e1e3a","--border-light":"#262650" }
  },
  {
    id:"midnight", label:"Midnight Blue", emoji:"🌊",
    vars:{ "--bg-primary":"#040c18","--bg-secondary":"#071222","--bg-card":"#091829","--bg-elevated":"#0d2035",
      "--accent":"#38bdf8","--accent-rgb":"56,189,248","--accent-secondary":"#34d399",
      "--accent-danger":"#f87171","--accent-warning":"#fbbf24","--accent-success":"#34d399",
      "--text-primary":"#e0f2fe","--text-secondary":"#7cb9d4","--text-muted":"#3a6077",
      "--border":"#0f2d42","--border-light":"#163550" }
  },
  {
    id:"forest", label:"Emerald Dark", emoji:"🌿",
    vars:{ "--bg-primary":"#030d09","--bg-secondary":"#071410","--bg-card":"#0b1a12","--bg-elevated":"#0f2018",
      "--accent":"#10b981","--accent-rgb":"16,185,129","--accent-secondary":"#a78bfa",
      "--accent-danger":"#ef4444","--accent-warning":"#f59e0b","--accent-success":"#10b981",
      "--text-primary":"#d1fae5","--text-secondary":"#6b9e82","--text-muted":"#2e5c42",
      "--border":"#0f2d1c","--border-light":"#164027" }
  },
  {
    id:"light", label:"Clean Light", emoji:"☀️",
    vars:{ "--bg-primary":"#f8f9fc","--bg-secondary":"#ffffff","--bg-card":"#ffffff","--bg-elevated":"#f1f3f9",
      "--accent":"#6c63ff","--accent-rgb":"108,99,255","--accent-secondary":"#00b894",
      "--accent-danger":"#e84393","--accent-warning":"#f39c12","--accent-success":"#00b894",
      "--text-primary":"#1a1b2e","--text-secondary":"#5a5c6e","--text-muted":"#9a9cae",
      "--border":"#e2e4f0","--border-light":"#eceef8" }
  },
]

function applyTheme(theme, customColors) {
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))
  if (customColors) {
    Object.entries(customColors).forEach(([k, v]) => { if (v) root.style.setProperty(k, v) })
    localStorage.setItem("ts_custom_colors", JSON.stringify(customColors))
  }
  localStorage.setItem("ts_theme", theme.id)
}

export function loadSavedTheme() {
  const id = localStorage.getItem("ts_theme") || "dark"
  const theme = THEMES.find(t => t.id === id) || THEMES[0]
  const custom = JSON.parse(localStorage.getItem("ts_custom_colors") || "{}")
  applyTheme(theme, custom)
  return id
}

const PAGES = [
  { id:"account",      label:"Account",       icon:User,     color:"#6c63ff" },
  { id:"appearance",   label:"Appearance",    icon:Palette,  color:"#00d4aa" },
  { id:"language",     label:"Language",      icon:Globe,    color:"#6c63ff" },
  { id:"data",         label:"Data & Import", icon:Database, color:"#ffa502" },
  { id:"apikeys",      label:"API Keys",      icon:Key,      color:"#ff6b35" },
  { id:"notifications",label:"Notifications", icon:Bell,     color:"#a29bfe" },
]

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ background: value ? "var(--accent)" : "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: value ? "translateX(20px)" : "translateX(2px)" }}/>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN CARD — TOP-LEVEL COMPONENT (not inside APIKeysPage)
//
// CRITICAL: This must stay outside APIKeysPage. If defined inside, React
// creates a new component type on every render → unmount/remount loop →
// page scrolls to top and clipboard copy fails.
// ─────────────────────────────────────────────────────────────────────────────
function TokenCard({ title, subtitle, token, show, setShow, onGenerate, genKey, genning, field, eaFile, color, info }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (e) => {
    // Prevent any parent scroll or navigation
    e.preventDefault()
    e.stopPropagation()
    if (!token) return
    navigator.clipboard.writeText(token)
      .then(() => {
        setCopied(true)
        toast.success("Token copied!")
        setTimeout(() => setCopied(false), 2500)
      })
      .catch(() => {
        // Fallback for browsers that block clipboard without HTTPS focus
        const el = document.createElement("textarea")
        el.value = token
        el.style.position = "fixed"
        el.style.opacity  = "0"
        document.body.appendChild(el)
        el.focus()
        el.select()
        document.execCommand("copy")
        document.body.removeChild(el)
        setCopied(true)
        toast.success("Token copied!")
        setTimeout(() => setCopied(false), 2500)
      })
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${color || "var(--accent)"}20` }}>
            <Key size={14} style={{ color: color || "var(--accent)" }}/>
          </div>
          <div>
            <p className="font-bold text-sm" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{title}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-3">
        <p className="text-xs leading-relaxed" style={{ fontFamily: "var(--font-display)", color: "var(--text-secondary)" }}>{info}</p>

        {token ? (
          <div className="space-y-2">
            {/* Token display row */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "var(--bg-elevated)", border: `1px solid ${color || "var(--accent)"}30` }}>
              <span className="flex-1 truncate mono text-xs select-all"
                style={{ color: color || "var(--accent)" }}>
                {show ? token : "●".repeat(20) + token.slice(-6)}
              </span>
              {/* Show/hide button */}
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="hover:opacity-70 flex-shrink-0 p-1"
                style={{ color: "var(--text-muted)" }}>
                {show ? <EyeOff size={13}/> : <Eye size={13}/>}
              </button>
              {/* Copy button — isolated with stopPropagation */}
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 hover:opacity-80 flex-shrink-0 px-2 py-1 rounded-lg font-semibold text-xs"
                style={{ background: copied ? "rgba(46,213,115,0.12)" : `${color || "var(--accent)"}15`, color: copied ? "var(--accent-success)" : color || "var(--accent)", fontFamily: "var(--font-display)" }}>
                {copied ? <><CheckCircle size={12}/> Copied!</> : <><Copy size={12}/> Copy</>}
              </button>
            </div>
            {/* EA usage hint */}
            <p className="mono text-xs" style={{ color: "var(--text-muted)" }}>
              Paste into <strong style={{ color: "var(--text-secondary)" }}>{field}</strong> field of <strong style={{ color: "var(--text-secondary)" }}>{eaFile}</strong>
            </p>
            {/* Regen button */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                After regenerating, update the token in your EA inputs and re-attach it.
              </p>
              <button
                type="button"
                onClick={onGenerate}
                disabled={genning}
                className="btn btn-secondary text-xs h-7 gap-1 ml-3 flex-shrink-0">
                <RefreshCw size={10}/>{genning ? "Generating…" : "Regen"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={onGenerate} disabled={genning} className="btn btn-primary gap-2">
            <Key size={13}/>{genning ? "Generating…" : "Generate Token"}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Account Page ─────────────────────────────────────────────────────────────
function AccountPage({ user, updateUser, signOut, stats }) {
  const { t } = useLanguage()
  const [name,     setName]     = useState(user?.full_name || "")
  const [email,    setEmail]    = useState(user?.email || "")
  const [bio,      setBio]      = useState(user?.bio || "")
  const [currency, setCurrency] = useState(user?.currency || "USD")
  const [saving,   setSaving]   = useState(false)

  const save = async () => {
    setSaving(true)
    try { await updateUser({ full_name: name, email, bio, currency }); toast.success("Profile saved!") }
    catch { toast.error("Failed to save") }
    setSaving(false)
  }

  const initials = (name || "T").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black text-white flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#6c63ff,#00d4aa)", fontFamily: "var(--font-display)" }}>
            {initials}
          </div>
          <div>
            <p className="text-lg font-black" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{name || "Trader"}</p>
            <p className="text-xs mono" style={{ color: "var(--text-muted)" }}>{email}</p>
            <span className="badge mt-1" style={{ background: "rgba(108,99,255,0.12)", color: "var(--accent)" }}>{ t("settings_free_plan") }</span>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { label: "Trades",    v: stats.trades },
            { label: "Strategies",v: stats.playbooks },
            { label: "Backtests", v: stats.backtests },
            { label: "Brokers",   v: stats.brokers },
            { label: "Insights",  v: stats.insights },
          ].map(s => (
            <div key={s.label} className="rounded-xl py-3 px-2 text-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <p className="text-lg font-black mono" style={{ color: "var(--accent)" }}>{s.v}</p>
              <p className="stat-card-label" style={{ fontSize: 9 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{ t("settings_profile") }</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="stat-card-label block mb-1">{ t("settings_display_name") }</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t("settings_name_ph")}
                className="w-full h-10 rounded-xl px-3 text-sm border"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-display)" }}/>
            </div>
            <div>
              <label className="stat-card-label block mb-1">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full h-10 rounded-xl px-3 text-sm border"
                style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                {["USD","EUR","GBP","CHF","JPY","AUD","CAD","ZAR"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="stat-card-label block mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full h-10 rounded-xl px-3 text-sm border"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-display)" }}/>
          </div>
          <div>
            <label className="stat-card-label block mb-1">Trading Style / Bio</label>
            <textarea rows={2} value={bio} onChange={e => setBio(e.target.value)}
              placeholder="e.g. London session scalper, ICT concepts, 3–5 trades/day"
              className="w-full rounded-xl px-3 py-2 text-sm border resize-none"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)", fontFamily: "var(--font-display)" }}/>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={save} disabled={saving} className="btn btn-primary gap-2" style={{ opacity: saving ? 0.7 : 1 }}>
              <Save size={13}/>{saving ? "Saving…" : "Save Profile"}
            </button>
            <button type="button" onClick={signOut}
              className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl hover:opacity-70"
              style={{ color: "var(--accent-danger)", fontFamily: "var(--font-display)" }}>
              <LogOut size={12}/> Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="card p-5" style={{ background: "linear-gradient(135deg,rgba(108,99,255,0.08),rgba(0,212,170,0.08))", border: "1px solid rgba(108,99,255,0.25)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown size={16} style={{ color: "var(--accent)" }}/>
              <p className="font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{ t("settings_upgrade") }</p>
            </div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Unlimited trades, SYLLEDGE AI unlimited, advanced analytics</p>
          </div>
          <a href="/pricing" className="btn btn-primary flex-shrink-0">Upgrade →</a>
        </div>
      </div>
    </div>
  )
}

// ─── Appearance Page ──────────────────────────────────────────────────────────
function AppearancePage() {
  const { t } = useLanguage()
  const [activeTheme,  setActiveTheme]  = useState(() => localStorage.getItem("ts_theme") || "dark")
  const [customColors, setCustomColors] = useState(() => JSON.parse(localStorage.getItem("ts_custom_colors") || "{}"))

  const applyAndSave = (theme, colors = customColors) => {
    setActiveTheme(theme.id)
    applyTheme(theme, colors)
    toast.success(`Theme "${theme.label}" applied!`)
  }

  const updateColor = (key, val) => {
    const next = { ...customColors, [key]: val }
    setCustomColors(next)
    applyTheme(THEMES.find(t => t.id === activeTheme) || THEMES[0], next)
  }

  const COLOR_PICKERS = [
    { key: "--accent",           label: "Primary Accent" },
    { key: "--accent-secondary", label: "Secondary Accent" },
    { key: "--accent-success",   label: "Success / Win" },
    { key: "--accent-danger",    label: "Danger / Loss" },
  ]

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{ t("settings_theme") }</h3>
        </div>
        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map(t => (
            <button type="button" key={t.id} onClick={() => applyAndSave(t)}
              className="rounded-xl p-3 text-left transition-all"
              style={{
                background: activeTheme === t.id ? "rgba(108,99,255,0.15)" : "var(--bg-elevated)",
                border: `1px solid ${activeTheme === t.id ? "var(--accent)" : "var(--border)"}`,
              }}>
              <div className="text-xl mb-1">{t.emoji}</div>
              <p className="text-xs font-bold" style={{ fontFamily: "var(--font-display)", color: activeTheme === t.id ? "var(--accent)" : "var(--text-primary)" }}>{t.label}</p>
              {activeTheme === t.id && <div className="w-1.5 h-1.5 rounded-full mt-1" style={{ background: "var(--accent)" }}/>}
            </button>
          ))}
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{ t("settings_custom_colors") }</h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Override individual colors on top of any theme.</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          {COLOR_PICKERS.map(c => (
            <div key={c.key} className="flex items-center gap-3">
              <input type="color"
                value={customColors[c.key] || getComputedStyle(document.documentElement).getPropertyValue(c.key).trim() || "#6c63ff"}
                onChange={e => updateColor(c.key, e.target.value)}
                className="w-8 h-8 rounded-lg border cursor-pointer"
                style={{ borderColor: "var(--border)", padding: 2 }}/>
              <label className="stat-card-label">{c.label}</label>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Data Page ────────────────────────────────────────────────────────────────
function DataPage({ stats }) {
  const { t } = useLanguage()
  const [clearTarget, setClearTarget] = useState(null)
  const [clearing,    setClearing]    = useState(false)

  const CLEAR_OPTIONS = [
    { key: "trades",    label: "All Trades" },
    { key: "playbooks", label: "All Playbook Strategies" },
    { key: "backtests", label: "All Backtest Sessions" },
    { key: "insights",  label: "All SYLLEDGE Insights" },
  ]

  const exportData = async () => {
    try {
      const [trades, playbooks, backtests, insights] = await Promise.all([
        Trade.list(), Playbook.list(), BacktestSession.list(), SylledgeInsight.list()
      ])
      const blob = new Blob([JSON.stringify({ trades, playbooks, backtests, insights, exportDate: new Date().toISOString() }, null, 2)], { type: "application/json" })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href = url; a.download = `tradesylla-backup-${new Date().toISOString().slice(0,10)}.json`; a.click()
      URL.revokeObjectURL(url)
      toast.success("Backup exported!")
    } catch { toast.error("Export failed") }
  }

  const importJSON = async e => {
    const file = e.target.files?.[0]; if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (data.trades)    for (const t of data.trades)    await Trade.create(t)
      if (data.playbooks) for (const p of data.playbooks) await Playbook.create(p)
      toast.success("Backup imported!")
    } catch { toast.error("Import failed — invalid backup file") }
    e.target.value = ""
  }

  const doClear = async () => {
    if (!clearTarget) return
    setClearing(true)
    try {
      const entity = { trades: Trade, playbooks: Playbook, backtests: BacktestSession, insights: SylledgeInsight }[clearTarget]
      const items  = await entity.list()
      for (const item of items) await entity.delete(item.id)
      toast.success("Data cleared!")
      setClearTarget(null)
    } catch { toast.error("Clear failed") }
    setClearing(false)
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{ t("settings_data_summary") }</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5">
            {[
              { label: "Trades",    v: stats.trades },
              { label: "Strategies",v: stats.playbooks },
              { label: "Backtests", v: stats.backtests },
              { label: "Brokers",   v: stats.brokers },
              { label: "Insights",  v: stats.insights },
            ].map(s => (
              <div key={s.label} className="rounded-xl py-3 text-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <p className="text-lg font-black mono" style={{ color: "var(--accent)" }}>{s.v}</p>
                <p className="stat-card-label" style={{ fontSize: 9 }}>{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={exportData} className="btn btn-secondary gap-2"><Download size={13}/> Export Backup</button>
            <label className="btn btn-secondary gap-2 cursor-pointer">
              <Upload size={13}/> Import Backup
              <input type="file" accept=".json" onChange={importJSON} className="hidden"/>
            </label>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden" style={{ border: "1px solid rgba(255,71,87,0.25)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,71,87,0.15)" }}>
          <h3 className="font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--accent-danger)" }}>{ t("settings_danger") }</h3>
        </div>
        <div className="p-5 space-y-2">
          {CLEAR_OPTIONS.map(opt => (
            <button type="button" key={opt.key} onClick={() => setClearTarget(opt.key)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all hover:opacity-80"
              style={{ background: "rgba(255,71,87,0.05)", borderColor: "rgba(255,71,87,0.15)", color: "var(--accent-danger)" }}>
              <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)" }}>Clear {opt.label}</span>
              <Trash2 size={14}/>
            </button>
          ))}
        </div>
      </div>

      {clearTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setClearTarget(null)}/>
          <div className="relative card p-6 w-full max-w-sm z-10">
            <h3 className="font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "var(--accent-danger)" }}>{ t("settings_sure") }</h3>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              This permanently deletes <strong style={{ color: "var(--text-primary)" }}>{CLEAR_OPTIONS.find(o => o.key === clearTarget)?.label}</strong>. Export a backup first.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setClearTarget(null)} disabled={clearing} className="btn btn-secondary flex-1">Cancel</button>
              <button type="button" onClick={doClear} disabled={clearing} className="btn flex-1 text-white" style={{ background: "var(--accent-danger)", opacity: clearing ? 0.7 : 1 }}>
                {clearing ? "Clearing…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── API Keys Page ────────────────────────────────────────────────────────────
// NOTE: TokenCard is defined at the TOP LEVEL of this file (above),
// NOT inside this function. That's the fix for the scroll/copy bug.
function APIKeysPage({ user }) {
  const { t } = useLanguage()
  const [apiKey,       setApiKey]       = useState("")
  const [showKey,      setShowKey]      = useState(false)
  const [keySaved,     setKeySaved]     = useState(false)
  const [userToken,    setUserToken]    = useState("")
  const [adminToken,   setAdminToken]   = useState("")
  const [loadingTokens,setLoadingTokens]= useState(true)
  const [genning,      setGenning]      = useState("") // "user" | "admin" | ""
  const [showUT,       setShowUT]       = useState(false)
  const [showAT,       setShowAT]       = useState(false)

  useEffect(() => {
    const k = localStorage.getItem("ts_anthropic_key") || ""
    setApiKey(k); if (k) setKeySaved(true)
    if (user?.id) {
      supabase.from("profiles").select("user_token,admin_token,ea_token").eq("id", user.id).single()
        .then(({ data }) => {
          // user_token is canonical; ea_token is the legacy column
          if (data?.user_token)  setUserToken(data.user_token)
          else if (data?.ea_token) setUserToken(data.ea_token)
          if (data?.admin_token) setAdminToken(data.admin_token)
          setLoadingTokens(false)
        })
        .catch(() => setLoadingTokens(false))
    } else { setLoadingTokens(false) }
  }, [user?.id])

  const saveAnthropicKey = () => {
    const t = apiKey.trim()
    if (t && !t.startsWith("sk-ant-")) { toast.error("Invalid key — must start with sk-ant-"); return }
    if (t) { localStorage.setItem("ts_anthropic_key", t); setKeySaved(true); toast.success("API key saved!") }
  }

  const genToken = async (type) => {
    if (!user?.id) return
    setGenning(type)
    try {
      const arr = new Uint8Array(24); crypto.getRandomValues(arr)
      const tok = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("")
      // user token: write to BOTH user_token and ea_token so all API versions find it
      const col = type === "user" ? { user_token: tok, ea_token: tok } : { admin_token: tok }
      const { error } = await supabase.from("profiles").update(col).eq("id", user.id)
      if (error) throw error
      if (type === "user")  setUserToken(tok)
      else                  setAdminToken(tok)
      toast.success("Token generated! Update it in your EA inputs, then re-attach the EA.")
    } catch (e) { toast.error("Failed: " + e.message) }
    setGenning("")
  }

  if (loadingTokens) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="card p-5">
            <div className="h-6 rounded-xl animate-pulse mb-3 w-1/2" style={{ background: "var(--bg-elevated)" }}/>
            <div className="h-10 rounded-xl animate-pulse" style={{ background: "var(--bg-elevated)" }}/>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Anthropic API Key ─────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(162,155,254,0.15)" }}>
              <Zap size={14} style={{ color: "#a29bfe" }}/>
            </div>
            <div>
              <p className="font-bold text-sm" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>SYLLEDGE AI (Anthropic API Key)</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Powers SYLLEDGE AI chat — stored locally in your browser only</p>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={t("settings_key_ph")}
              className="flex-1 h-10 rounded-xl px-3 text-sm border mono"
              style={{ background: "var(--bg-elevated)", borderColor: keySaved ? "rgba(46,213,115,0.4)" : "var(--border)", color: "var(--text-primary)" }}/>
            <button type="button" onClick={() => setShowKey(!showKey)}
              className="p-2.5 rounded-xl"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              {showKey ? <EyeOff size={14}/> : <Eye size={14}/>}
            </button>
            <button type="button" onClick={saveAnthropicKey} className="btn btn-primary gap-1.5">
              {keySaved ? <><CheckCircle size={13}/> Saved</> : <><Save size={13}/> Save</>}
            </button>
          </div>
          {keySaved && (
            <div className="flex items-center gap-2 p-3 rounded-xl"
              style={{ background: "rgba(46,213,115,0.08)", border: "1px solid rgba(46,213,115,0.2)" }}>
              <CheckCircle size={13} style={{ color: "var(--accent-success)" }}/>
              <p className="text-xs font-medium" style={{ color: "var(--accent-success)" }}>SYLLEDGE AI is active and ready</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Sync EA Token ─────────────────────────────────────────────────── */}
      {/* TokenCard is a TOP-LEVEL component — safe to render here */}
      <TokenCard
        title={t("settings_user_token")}
        subtitle="Trade journal sync — imports your closed positions"
        token={userToken}
        show={showUT}
        setShow={setShowUT}
        onGenerate={() => genToken("user")}
        genKey="user"
        genning={genning === "user"}
        field="UserToken"
        eaFile="TradeSylla_Sync.mq5"
        color="#1a73e8"
        info="Paste into the UserToken input of TradeSylla_Sync.mq5. This lets the EA write your closed trades to your journal. Only regenerate here — never from BrokerSync."
      />

      {/* ── Market Data EA Token ───────────────────────────────────────────── */}
      <TokenCard
        title={t("settings_admin_token")}
        subtitle="OHLCV feed — powers SYLLEDGE AI market analysis"
        token={adminToken}
        show={showAT}
        setShow={setShowAT}
        onGenerate={() => genToken("admin")}
        genKey="admin"
        genning={genning === "admin"}
        field="AdminToken"
        eaFile="TradeSylla_MarketData.mq5"
        color="#00897b"
        info="Paste into the AdminToken input of TradeSylla_MarketData.mq5. The EA uses it to upload historical and live OHLCV data for SYLLEDGE AI."
      />
    </div>
  )
}

// ─── Notifications Page ───────────────────────────────────────────────────────
function NotificationsPage() {
  const { t } = useLanguage()
  const PREFS = [
    { key: "notif_daily_summary",  label: "Daily P&L Summary",        desc: "Morning recap of yesterday's performance" },
    { key: "notif_win_streak",     label: "Win Streak Alerts",         desc: "Alert when you hit a 3+ win streak" },
    { key: "notif_loss_streak",    label: "Loss Streak Alerts",        desc: "Alert when you hit a 3+ loss streak" },
    { key: "notif_drawdown",       label: "Drawdown Warning",          desc: "Notify when max daily drawdown is reached" },
    { key: "notif_sync_success",   label: "EA Sync Confirmation",      desc: "Confirm when trades are received from MT5" },
    { key: "notif_weekly_report",  label: "Weekly Performance Report", desc: "Sent every Monday morning" },
  ]
  const savePref = (key, val) => { localStorage.setItem(key, JSON.stringify(val)); toast.success("Preference saved") }

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{ t("settings_notif_prefs") }</h3>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Coming soon — notifications will be delivered via email.</p>
      </div>
      <div className="p-5 space-y-3">
        {PREFS.map(row => (
          <div key={row.key} className="flex items-center justify-between gap-4 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}>{row.label}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{row.desc}</p>
            </div>
            <Toggle value={JSON.parse(localStorage.getItem(row.key) || "true")} onChange={v => savePref(row.key, v)}/>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
// ─── Language Page ────────────────────────────────────────────────────────────
function LanguagePage({ lang, setLang, tl, langSaved, setLangSaved }) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background:"rgba(108,99,255,0.12)" }}>
            <Globe size={16} style={{ color:"var(--accent)" }}/>
          </div>
          <div>
            <h2 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>
              {tl("settings_lang_title")}
            </h2>
            <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>
              {tl("settings_lang_desc")}
            </p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {LANGUAGES.map(l => (
            <button key={l.code}
              onClick={() => {
                setLang(l.code)
                setLangSaved(true)
                setTimeout(() => setLangSaved(false), 2500)
              }}
              className="flex flex-col items-center gap-2.5 p-5 rounded-2xl transition-all hover:opacity-90"
              style={{
                background: lang === l.code ? "rgba(108,99,255,0.12)" : "var(--bg-elevated)",
                border:     `2px solid ${lang === l.code ? "var(--accent)" : "var(--border)"}`,
              }}>
              <span style={{ fontSize: 36 }}>{l.flag}</span>
              <span className="font-semibold text-sm" style={{ color: lang === l.code ? "var(--accent)" : "var(--text-primary)" }}>
                {l.label}
              </span>
              {l.dir === "rtl" && (
                <span className="text-xs" style={{ color:"var(--text-muted)" }}>RTL</span>
              )}
              {lang === l.code && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background:"var(--accent)", color:"#fff" }}>
                  ✓ Active
                </span>
              )}
            </button>
          ))}
        </div>

        {langSaved && (
          <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-xl"
            style={{ background:"rgba(46,213,115,0.1)", border:"1px solid rgba(46,213,115,0.2)" }}>
            <CheckCircle size={14} style={{ color:"var(--accent-success)" }}/>
            <span className="text-sm font-medium" style={{ color:"var(--accent-success)" }}>
              {tl("settings_lang_saved")} — {LANGUAGES.find(l=>l.code===lang)?.label}
            </span>
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color:"var(--text-primary)" }}>
          Preview
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            ["nav_dashboard","nav_journal","nav_analytics"],
            ["save","cancel","filter"],
            ["win","loss","breakeven"],
          ].flat().map(key => (
            <div key={key} className="px-3 py-2 rounded-xl flex items-center justify-between"
              style={{ background:"var(--bg-elevated)" }}>
              <span className="text-xs" style={{ color:"var(--text-muted)" }}>{key}</span>
              <span className="text-xs font-semibold" style={{ color:"var(--text-primary)" }}>{tl(key)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Settings() {
  const { t } = useLanguage()
  const { user, updateUser, signOut } = useUser()
  const { lang, setLang, t: tl } = useLanguage()
  const [activePage, setActivePage]  = useState(() => localStorage.getItem("ts_settings_page") || "account")
  const [stats, setStats]            = useState({ trades: 0, playbooks: 0, backtests: 0, brokers: 0, insights: 0 })
  const [langSaved, setLangSaved]    = useState(false)

  useEffect(() => {
    loadSavedTheme()
    Promise.all([
      Trade.list(), Playbook.list(), BacktestSession.list(), BrokerConnection.list(), SylledgeInsight.list()
    ]).then(([t, p, b, br, i]) => setStats({
      trades: t.length, playbooks: p.length, backtests: b.length, brokers: br.length, insights: i.length
    }))
  }, [])

  const changePage = id => {
    setActivePage(id)
    localStorage.setItem("ts_settings_page", id)
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="gradient-text font-black" style={{ fontFamily: "var(--font-display)", fontSize: 28 }}>Settings</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Mobile: horizontal tabs */}
        <div className="md:hidden overflow-x-auto pb-1">
          <div className="flex gap-2 min-w-max">
            {PAGES.map(p => {
              const active = activePage === p.id
              return (
                <button type="button" key={p.id} onClick={() => changePage(p.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold flex-shrink-0 transition-all"
                  style={{ background: active ? `${p.color}18` : "var(--bg-elevated)", color: active ? p.color : "var(--text-secondary)", border: `1px solid ${active ? p.color + "40" : "var(--border)"}`, fontFamily: "var(--font-display)" }}>
                  <p.icon size={13}/>{p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Desktop: vertical sidebar */}
        <div className="hidden md:block w-44 flex-shrink-0">
          <div className="card p-2 sticky top-4">
            <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-3 pt-1"
              style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", fontSize: 9 }}>Settings</p>
            <nav className="space-y-0.5">
              {PAGES.map(p => {
                const active = activePage === p.id
                return (
                  <button type="button" key={p.id} onClick={() => changePage(p.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-all"
                    style={{ background: active ? `${p.color}12` : "transparent", color: active ? p.color : "var(--text-secondary)", border: `1px solid ${active ? p.color + "25" : "transparent"}`, fontFamily: "var(--font-display)" }}>
                    <p.icon size={14}/>
                    {p.label}
                    {active && <ChevronRight size={11} className="ml-auto"/>}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activePage === "account"       && <AccountPage user={user} updateUser={updateUser} signOut={signOut} stats={stats}/>}
          {activePage === "appearance"    && <AppearancePage/>}
          {activePage === "language"      && <LanguagePage lang={lang} setLang={setLang} tl={tl} langSaved={langSaved} setLangSaved={setLangSaved}/>}
          {activePage === "data"          && <DataPage stats={stats}/>}
          {activePage === "apikeys"       && <APIKeysPage user={user}/>}
          {activePage === "notifications" && <NotificationsPage/>}
        </div>
      </div>
    </div>
  )
}
