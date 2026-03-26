// src/pages/Settings.jsx — API Keys section upgraded with EA token generation
// Only the APIKeysPage component is shown here — drop it into the existing Settings.jsx
// replacing the current APIKeysPage function

import { useState, useEffect } from "react"
import { useUser } from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/toast"
import {
  Key, Save, Eye, EyeOff, Info, CheckCircle,
  Copy, RefreshCw, Shield, Bot, AlertTriangle,
  User, Palette, Download, Upload, Trash2,
  ChevronRight, Database
} from "lucide-react"

// ─── Themes (keep existing) ────────────────────────────────────────────────────
const THEMES = [
  {
    id: "dark", name: "Dark", desc: "Classic dark trading interface",
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
    id: "midnight", name: "Midnight", desc: "Pure black, maximum contrast",
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
    id: "ocean", name: "Ocean", desc: "Deep blue — calm & focused",
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
    id: "forest", name: "Forest", desc: "Deep green — natural & sharp",
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
    id: "ember", name: "Ember", desc: "Warm dark — intense & bold",
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
    id: "light", name: "Light", desc: "Clean light mode",
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
  const customColors = JSON.parse(localStorage.getItem("ts_custom_colors") || "{}")
  applyTheme(theme, customColors)
  return id
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ background: value ? "var(--accent)" : "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: value ? "translateX(22px)" : "translateX(2px)" }} />
    </button>
  )
}

// ═══════════════════════════════════════════════════════════════════
// API KEYS PAGE — with EA Token generation added
// ═══════════════════════════════════════════════════════════════════
export function APIKeysPage() {
  const { user } = useUser()

  // ── Anthropic API key ─────────────────────────────────────────────────────
  const [apiKey,   setApiKey]   = useState("")
  const [showKey,  setShowKey]  = useState(false)
  const [keySaved, setKeySaved] = useState(false)

  // ── EA Token ──────────────────────────────────────────────────────────────
  const [eaToken,      setEaToken]      = useState("")
  const [loadingToken, setLoadingToken] = useState(true)
  const [generating,   setGenerating]   = useState(false)
  const [copied,       setCopied]       = useState("")
  const [showToken,    setShowToken]    = useState(false)

  // ── Load existing data ────────────────────────────────────────────────────
  useEffect(() => {
    // Load Anthropic key from localStorage
    const k = localStorage.getItem("ts_anthropic_key") || ""
    setApiKey(k)
    if (k) setKeySaved(true)

    // Load EA token from Supabase profiles
    if (user?.id) {
      supabase.from("profiles")
        .select("ea_token")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.ea_token) setEaToken(data.ea_token)
          setLoadingToken(false)
        })
        .catch(() => setLoadingToken(false))
    } else {
      setLoadingToken(false)
    }
  }, [user?.id])

  // ── Save Anthropic key ────────────────────────────────────────────────────
  const saveAnthropicKey = () => {
    const trimmed = apiKey.trim()
    if (trimmed && !trimmed.startsWith("sk-ant-")) {
      toast.error("Invalid key — must start with sk-ant-")
      return
    }
    if (trimmed) {
      localStorage.setItem("ts_anthropic_key", trimmed)
      setKeySaved(true)
      toast.success("API key saved! SYLLEDGE AI is ready.")
    } else {
      localStorage.removeItem("ts_anthropic_key")
      setKeySaved(false)
      toast.success("API key removed")
    }
  }

  // ── Generate EA Token ─────────────────────────────────────────────────────
  const generateToken = async () => {
    if (!user?.id) { toast.error("You must be logged in"); return }
    setGenerating(true)
    try {
      // Generate a cryptographically random token
      const array    = new Uint8Array(28)
      crypto.getRandomValues(array)
      const newToken = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("")

      const { error } = await supabase
        .from("profiles")
        .update({ ea_token: newToken })
        .eq("id", user.id)

      if (error) throw error

      setEaToken(newToken)
      setShowToken(true)
      toast.success("New EA token generated!")
    } catch (e) {
      toast.error("Failed to generate token: " + e.message)
    }
    setGenerating(false)
  }

  // ── Copy to clipboard ─────────────────────────────────────────────────────
  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(""), 2500)
    })
  }

  return (
    <div className="space-y-6 max-w-xl">

      {/* ── ANTHROPIC API KEY ───────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
              <span className="text-white font-bold text-sm">AI</span>
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Anthropic API — SYLLEDGE AI
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Powers your personal trading coach
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-start gap-2 rounded-xl p-3"
            style={{ background: "rgba(0,212,170,0.08)", border: "1px solid rgba(0,212,170,0.2)" }}>
            <Info size={14} style={{ color: "var(--accent-secondary)", flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Get a free API key at{" "}
              <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer"
                className="underline font-semibold" style={{ color: "var(--accent)" }}>
                console.anthropic.com
              </a>
              . Your key is stored <strong style={{ color: "var(--text-primary)" }}>only in your browser</strong>,
              never transmitted to any server.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setKeySaved(false) }}
                placeholder="sk-ant-api03-..."
                className="w-full h-10 rounded-xl px-3 pr-10 text-sm border font-mono"
                style={{
                  background:   "var(--bg-elevated)",
                  borderColor:  keySaved ? "var(--accent-success)" : "var(--border)",
                  color:        "var(--text-primary)",
                }}
              />
              <button onClick={() => setShowKey(s => !s)}
                className="absolute right-3 top-2.5 hover:opacity-70"
                style={{ color: "var(--text-muted)" }}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button onClick={saveAnthropicKey}
              className="px-4 h-10 rounded-xl text-sm font-semibold flex items-center gap-1.5"
              style={{
                background:  keySaved ? "rgba(46,213,115,0.15)" : "linear-gradient(135deg,#6c63ff,#5a52d5)",
                color:       keySaved ? "var(--accent-success)" : "#fff",
                border:      keySaved ? "1px solid var(--accent-success)" : "none",
              }}>
              {keySaved
                ? <><CheckCircle size={13} /> Saved</>
                : <><Save size={13} /> Save</>}
            </button>
          </div>

          {keySaved && (
            <div className="flex items-center gap-2 p-3 rounded-xl"
              style={{ background: "rgba(46,213,115,0.08)", border: "1px solid rgba(46,213,115,0.2)" }}>
              <CheckCircle size={14} style={{ color: "var(--accent-success)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--accent-success)" }}>
                SYLLEDGE AI is active and ready
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── EA TOKEN ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#1a73e8,#1557b0)" }}>
              <Bot size={17} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                MT5 EA Token
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Used by both the Sync EA and the SYLLEDGE Market Data EA
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Info box */}
          <div className="flex items-start gap-2 rounded-xl p-3"
            style={{ background: "rgba(108,99,255,0.08)", border: "1px solid rgba(108,99,255,0.2)" }}>
            <Shield size={14} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              This token authenticates your MT5 EAs with TradeSylla. Paste it into the{" "}
              <strong style={{ color: "var(--text-primary)" }}>UserToken</strong> field of{" "}
              <strong style={{ color: "var(--text-primary)" }}>TradeSylla_Sync.ex5</strong> and the{" "}
              <strong style={{ color: "var(--text-primary)" }}>AdminToken</strong> field of{" "}
              <strong style={{ color: "var(--text-primary)" }}>TradeSylla_MarketData.ex5</strong>.{" "}
              Keep it private — anyone with this token can write to your journal.
            </p>
          </div>

          {loadingToken ? (
            <div className="flex items-center gap-2 py-2" style={{ color: "var(--text-muted)" }}>
              <RefreshCw size={13} className="animate-spin" />
              <span className="text-sm">Loading token…</span>
            </div>
          ) : eaToken ? (
            <div className="space-y-3">
              {/* Token display */}
              <div className="rounded-xl overflow-hidden"
                style={{ border: "1px solid rgba(46,213,115,0.3)", background: "var(--bg-elevated)" }}>
                <div className="flex items-center justify-between px-3 py-2"
                  style={{ borderBottom: "1px solid var(--border)", background: "rgba(46,213,115,0.06)" }}>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <span className="text-xs font-semibold" style={{ color: "var(--accent-success)" }}>
                      Token active
                    </span>
                  </div>
                  <button onClick={() => setShowToken(s => !s)}
                    className="text-xs hover:opacity-70 flex items-center gap-1"
                    style={{ color: "var(--text-muted)" }}>
                    {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
                    {showToken ? "Hide" : "Reveal"}
                  </button>
                </div>
                <div className="flex items-center gap-2 px-3 py-3">
                  <code className="flex-1 text-xs font-mono truncate"
                    style={{ color: showToken ? "var(--accent-success)" : "var(--text-muted)" }}>
                    {showToken ? eaToken : eaToken.slice(0, 8) + "••••••••••••••••••••••••••••••••••••••••••••••••"}
                  </code>
                  <button
                    onClick={() => copy(eaToken, "token")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all"
                    style={{
                      background:  copied === "token" ? "rgba(46,213,115,0.15)" : "var(--bg-card)",
                      color:       copied === "token" ? "var(--accent-success)" : "var(--text-primary)",
                      border:      `1px solid ${copied === "token" ? "var(--accent-success)" : "var(--border)"}`,
                    }}>
                    {copied === "token"
                      ? <><CheckCircle size={12} /> Copied!</>
                      : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
              </div>

              {/* Usage instructions */}
              <div className="rounded-xl p-3 space-y-2"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  WHERE TO PASTE THIS TOKEN
                </p>
                {[
                  { ea: "TradeSylla_Sync.ex5",       field: "UserToken",  desc: "Trade journal sync" },
                  { ea: "TradeSylla_MarketData.ex5",  field: "AdminToken", desc: "SYLLEDGE market data feed" },
                ].map(item => (
                  <div key={item.ea} className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {item.ea}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        Field: <code style={{ color: "var(--accent)" }}>{item.field}</code> — {item.desc}
                      </p>
                    </div>
                    <button
                      onClick={() => copy(eaToken, item.ea)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0"
                      style={{
                        background: copied === item.ea ? "rgba(46,213,115,0.15)" : "var(--bg-card)",
                        color:      copied === item.ea ? "var(--accent-success)" : "var(--text-secondary)",
                        border:     `1px solid ${copied === item.ea ? "var(--accent-success)" : "var(--border)"}`,
                      }}>
                      {copied === item.ea ? <CheckCircle size={11} /> : <Copy size={11} />}
                      {copied === item.ea ? "Copied" : "Copy"}
                    </button>
                  </div>
                ))}
              </div>

              {/* Regenerate */}
              <div className="flex items-center gap-2">
                <button onClick={generateToken} disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border"
                  style={{
                    background:   "var(--bg-elevated)",
                    borderColor:  "var(--border)",
                    color:        "var(--text-secondary)",
                    opacity:      generating ? 0.6 : 1,
                  }}>
                  <RefreshCw size={12} className={generating ? "animate-spin" : ""} />
                  {generating ? "Generating…" : "Regenerate token"}
                </button>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Regenerating will disconnect all EAs until you paste the new token.
                </p>
              </div>

              {/* Warning if regenerate */}
              <div className="flex items-start gap-2 rounded-xl p-3"
                style={{ background: "rgba(255,165,2,0.06)", border: "1px solid rgba(255,165,2,0.2)" }}>
                <AlertTriangle size={13} style={{ color: "var(--accent-warning)", flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  After pasting the token in MT5, whitelist{" "}
                  <code style={{ color: "var(--accent)" }}>https://tradesylla.vercel.app</code>{" "}
                  in MT5 → Tools → Options → Expert Advisors → Allow WebRequest.
                </p>
              </div>
            </div>
          ) : (
            /* No token yet */
            <div className="space-y-3">
              <div className="rounded-xl p-4 text-center"
                style={{ background: "var(--bg-elevated)", border: "1px dashed var(--border)" }}>
                <Key size={24} className="mx-auto mb-2" style={{ color: "var(--text-muted)" }} />
                <p className="text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  No EA token yet
                </p>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Generate a token to connect your MT5 Expert Advisors
                </p>
                <button onClick={generateToken} disabled={generating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg,var(--accent),var(--accent-secondary))",
                    opacity:    generating ? 0.7 : 1,
                  }}>
                  <Key size={14} />
                  {generating ? "Generating…" : "Generate My Token"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── ABOUT ────────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <h3 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>About TradeSylla</h3>
        <div className="flex items-center gap-4 mb-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <span className="text-white font-bold text-lg">T</span>
          </div>
          <div>
            <p className="font-bold" style={{ color: "var(--text-primary)" }}>TradeSylla v1.0.0</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Cloud-synced · Multi-device · Supabase backend
            </p>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Built with React + Vite + Recharts + Tailwind CSS + Radix UI + Supabase
        </p>
      </div>
    </div>
  )
}

// Export so Settings.jsx can use it — replace the existing APIKeysPage with this one
export default APIKeysPage
