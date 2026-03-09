import { useState, useEffect } from "react"
import { BrokerConnection } from "@/api/supabaseStore"
import { useUser } from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/toast"
import {
  Bot, Key, Copy, CheckCircle, Download, RefreshCw,
  Shield, Plus, Trash2, X, Clock, Wifi, Activity,
  ChevronDown, ChevronUp, Globe, Zap
} from "lucide-react"

// ─── Token Generator ──────────────────────────────────────────────────────────
function TokenBox({ token, onGenerate, generating }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="space-y-2">
      {token ? (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl font-mono text-sm"
          style={{ background: "var(--bg-elevated)", border: "1px solid rgba(46,213,115,0.3)", color: "var(--accent-success)" }}>
          <span className="flex-1 truncate">{token}</span>
          <button onClick={copy} className="flex-shrink-0 hover:opacity-70 transition-opacity">
            {copied
              ? <CheckCircle size={15} style={{ color: "var(--accent-success)" }} />
              : <Copy size={15} />}
          </button>
        </div>
      ) : (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: "var(--bg-elevated)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
          No token yet — click below to generate one
        </div>
      )}
      <button onClick={onGenerate} disabled={generating}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all"
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--accent)", opacity: generating ? 0.6 : 1 }}>
        <Key size={13} />
        {generating ? "Generating…" : token ? "↺ Regenerate Token" : "Generate My Token"}
      </button>
    </div>
  )
}

// ─── Step Card ────────────────────────────────────────────────────────────────
function StepCard({ n, title, children, accent = "var(--accent)" }) {
  const [open, setOpen] = useState(n === 1)
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <button className="w-full flex items-center gap-3 px-5 py-4 text-left" onClick={() => setOpen(o => !o)}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white"
          style={{ background: accent }}>{n}</div>
        <span className="flex-1 font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{title}</span>
        {open ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-3 border-t" style={{ borderColor: "var(--border)" }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Copy Box ─────────────────────────────────────────────────────────────────
function CopyBox({ value, label }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl font-mono text-xs"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--accent)" }}>
      <span className="flex-1">{label || value}</span>
      <button onClick={copy} className="hover:opacity-70 flex-shrink-0">
        {copied ? <CheckCircle size={12} style={{ color: "var(--accent-success)" }} /> : <Copy size={12} />}
      </button>
    </div>
  )
}

// ─── EA Setup Panel ───────────────────────────────────────────────────────────
function EASetupPanel() {
  const { user } = useUser()
  const [token,      setToken]      = useState("")
  const [generating, setGenerating] = useState(false)
  const [connection, setConnection] = useState(null) // live EA heartbeat data

  useEffect(() => {
    if (!user) return
    // Load token
    supabase.from("profiles").select("ea_token").eq("id", user.id).single()
      .then(({ data }) => { if (data?.ea_token) setToken(data.ea_token) })
    // Load live connection
    supabase.from("broker_connections")
      .select("*").eq("user_id", user.id).eq("is_mt5_live", true)
      .order("last_sync", { ascending: false }).limit(1).single()
      .then(({ data }) => { if (data) setConnection(data) })
  }, [user])

  const generateToken = async () => {
    if (!user) return
    setGenerating(true)
    try {
      const arr = new Uint8Array(24)
      crypto.getRandomValues(arr)
      const newToken = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("")
      // Upsert profile with new token
      const { error } = await supabase.from("profiles")
        .upsert({ id: user.id, ea_token: newToken }, { onConflict: "id" })
      if (error) throw error
      setToken(newToken)
      toast.success("Token generated! Paste it into the EA settings.")
    } catch (e) {
      toast.error("Failed: " + e.message)
    }
    setGenerating(false)
  }

  const isConnected = connection && connection.last_sync &&
    (Date.now() - new Date(connection.last_sync).getTime()) < 5 * 60 * 1000 // 5 min

  return (
    <div className="max-w-2xl space-y-4">

      {/* Status Banner */}
      {connection && (
        <div className="rounded-2xl p-4 flex items-center gap-4"
          style={{
            background: isConnected ? "rgba(46,213,115,0.07)" : "rgba(108,99,255,0.06)",
            border: `1px solid ${isConnected ? "rgba(46,213,115,0.25)" : "rgba(108,99,255,0.2)"}`
          }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#1a73e8,#1557b0)" }}>MT5</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{connection.account_name}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: isConnected ? "rgba(46,213,115,0.15)" : "rgba(108,99,255,0.15)", color: isConnected ? "var(--accent-success)" : "var(--accent)" }}>
                {isConnected ? "🟢 EA Active" : "🟡 EA Offline"}
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                style={{ background: connection.type === "live" ? "rgba(46,213,115,0.1)" : "rgba(108,99,255,0.1)", color: connection.type === "live" ? "var(--accent-success)" : "var(--accent)" }}>
                {connection.type}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {connection.broker_name} · #{connection.account_number} · {connection.server}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            {connection.balance !== undefined && (
              <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                {connection.currency} {parseFloat(connection.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            )}
            {connection.last_sync && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                <RefreshCw size={10} className="inline mr-1" />
                {new Date(connection.last_sync).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Header card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="px-5 py-4 flex items-center gap-3"
          style={{ borderBottom: "1px solid var(--border)", background: "linear-gradient(135deg,rgba(108,99,255,0.08),rgba(0,212,170,0.04))" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>MT5 Expert Advisor Sync</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Automatic real-time sync · full history · chart data · no Python required
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x" style={{ borderBottom: "1px solid var(--border)" }}>
          {[
            { icon: "⚡", label: "Sync speed", val: "Real-time" },
            { icon: "📊", label: "Chart data", val: "Included" },
            { icon: "🔒", label: "Security",   val: "Read-only" },
          ].map(s => (
            <div key={s.label} className="py-3 text-center">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{s.icon} {s.label}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>{s.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1 — Download EA */}
      <StepCard n={1} title="Download the Expert Advisor file">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          The EA is a small MQL5 program that runs silently inside MetaTrader 5. It syncs your closed trades, account stats, and chart data to TradeSylla automatically. It never places trades — it only reads data.
        </p>
        <a href="/ea/TradeSylla_Sync.mq5" download="TradeSylla_Sync.mq5"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
          <Download size={14} /> Download TradeSylla_Sync.mq5
        </a>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Compile it once in MetaEditor (free, comes with MT5): double-click the file → press F7.
        </p>
      </StepCard>

      {/* Step 2 — Install */}
      <StepCard n={2} title="Copy the EA into MetaTrader 5">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          In MT5, go to <strong style={{ color: "var(--text-primary)" }}>File → Open Data Folder</strong>, then navigate to:
        </p>
        <CopyBox value="MQL5/Experts/" />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Drop <code style={{ color: "var(--accent)" }}>TradeSylla_Sync.mq5</code> into that folder. Back in MT5, press <strong style={{ color: "var(--text-primary)" }}>F5</strong> or right-click Experts → Refresh.
        </p>
      </StepCard>

      {/* Step 3 — Generate token */}
      <StepCard n={3} title="Generate your personal sync token">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          This token is how TradeSylla knows which account to post trades to. Keep it private — anyone with your token could write to your journal.
        </p>
        <TokenBox token={token} onGenerate={generateToken} generating={generating} />
      </StepCard>

      {/* Step 4 — Allow WebRequest */}
      <StepCard n={4} title="Whitelist TradeSylla in MT5 settings">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          MT5 blocks all outgoing connections by default. You need to allow TradeSylla once:
        </p>
        <ol className="space-y-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
          <li>1. In MT5 → <strong style={{ color: "var(--text-primary)" }}>Tools → Options → Expert Advisors</strong></li>
          <li>2. Check <strong style={{ color: "var(--text-primary)" }}>Allow WebRequest for listed URL</strong></li>
          <li>3. Click <strong style={{ color: "var(--text-primary)" }}>+</strong> and add this URL:</li>
        </ol>
        <CopyBox value="https://tradesylla.vercel.app" />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>4. Click OK.</p>
      </StepCard>

      {/* Step 5 — Attach to chart */}
      <StepCard n={5} title="Attach the EA to any chart">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Open any chart in MT5 (e.g. EURUSD H1). In the Navigator panel, find <strong style={{ color: "var(--text-primary)" }}>TradeSylla_Sync</strong> under Expert Advisors. Drag it onto the chart.
        </p>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          In the EA inputs window, paste your <strong style={{ color: "var(--accent)" }}>User Token</strong> from Step 3 into the <code>UserToken</code> field. Set <code>SyncHistory = true</code> for the first run to import your full account history.
        </p>
        <div className="p-3 rounded-xl text-sm" style={{ background: "rgba(255,165,2,0.07)", border: "1px solid rgba(255,165,2,0.2)", color: "var(--accent-warning)" }}>
          ⚠ Make sure <strong>Auto Trading</strong> is enabled (green robot button at the top of MT5). The EA should show a 😊 face on the chart corner.
        </div>
      </StepCard>

      {/* What the EA syncs */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "rgba(0,212,170,0.05)", border: "1px solid rgba(0,212,170,0.15)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--accent-secondary)" }}>What gets synced automatically</p>
        <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          {[
            "✅ All closed trades (entry, exit, P&L, pips)",
            "✅ Chart candles for every trade (H1 by default)",
            "✅ Full account history on first run",
            "✅ Account balance & equity (every 30s)",
            "✅ Session, direction, volume, commissions",
            "✅ Real-time sync when new trades close",
          ].map(item => <p key={item}>{item}</p>)}
        </div>
      </div>
    </div>
  )
}

// ─── Coming Soon Card ─────────────────────────────────────────────────────────
function ComingSoonCard({ icon, title, description, eta }) {
  return (
    <div className="rounded-2xl p-6 flex items-start gap-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
        style={{ background: "var(--bg-elevated)" }}>{icon}</div>
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-1">
          <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold"
            style={{ background: "rgba(108,99,255,0.15)", color: "var(--accent)" }}>Coming Soon</span>
        </div>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{description}</p>
        {eta && <p className="text-xs mt-2" style={{ color: "var(--accent)" }}>🗓 {eta}</p>}
      </div>
    </div>
  )
}

// ─── Manual Account Modal ─────────────────────────────────────────────────────
function AddManualModal({ open, onClose, onSaved }) {
  const { user } = useUser()
  const [form,   setForm]   = useState({ broker_name: "", account_number: "", account_name: "", server: "", type: "live", notes: "" })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.broker_name.trim()) { toast.error("Broker name is required"); return }
    setSaving(true)
    try {
      await BrokerConnection.create({ ...form, user_id: user.id, status: "manual", is_mt5_live: false })
      toast.success("Account added!")
      onSaved()
      onClose()
    } catch (e) { toast.error(e.message) }
    setSaving(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl p-6 w-full max-w-md z-10 space-y-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Add Manual Account</h3>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}><X size={16} /></button>
        </div>
        {[
          { key: "broker_name",    label: "Broker Name",     placeholder: "IC Markets" },
          { key: "account_number", label: "Account Number",  placeholder: "12345678" },
          { key: "account_name",   label: "Account Name",    placeholder: "My Live Account" },
          { key: "server",         label: "Server",          placeholder: "ICMarkets-Live01" },
        ].map(f => (
          <div key={f.key}>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>{f.label}</label>
            <input value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
              className="w-full h-9 rounded-lg px-3 text-sm border"
              style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }} />
          </div>
        ))}
        <div>
          <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Account Type</label>
          <div className="flex gap-2">
            {["live", "demo"].map(t => (
              <button key={t} onClick={() => set("type", t)}
                className="flex-1 h-9 rounded-lg text-sm font-semibold border capitalize"
                style={{
                  background: form.type === t ? (t === "live" ? "rgba(46,213,115,0.2)" : "rgba(108,99,255,0.2)") : "var(--bg-elevated)",
                  borderColor: form.type === t ? (t === "live" ? "var(--accent-success)" : "var(--accent)") : "var(--border)",
                  color: form.type === t ? (t === "live" ? "var(--accent-success)" : "var(--accent)") : "var(--text-secondary)"
                }}>{t}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm border"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : "Add Account"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Manual Accounts List ─────────────────────────────────────────────────────
function ManualAccountsList({ onAdd }) {
  const { user }  = useUser()
  const [conns,   setConns]   = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    const data = await BrokerConnection.list()
    setConns((data || []).filter(c => !c.is_mt5_live))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const del = async (id) => {
    setDeleting(id)
    await BrokerConnection.delete(id)
    toast.success("Removed")
    load()
    setDeleting(null)
  }

  if (loading) return <p className="text-sm py-4" style={{ color: "var(--text-muted)" }}>Loading…</p>

  if (conns.length === 0) return (
    <div className="rounded-2xl py-14 text-center" style={{ background: "var(--bg-card)", border: "1px dashed var(--border)" }}>
      <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>No manual accounts</p>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>Add a broker for reference tracking.</p>
      <button onClick={onAdd}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
        <Plus size={13} /> Add Account
      </button>
    </div>
  )

  return (
    <div className="space-y-3">
      {conns.map(c => (
        <div key={c.id} className="rounded-xl p-4 flex items-center gap-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ background: c.broker_color || "var(--accent)" }}>
            {(c.broker_name || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{c.broker_name}</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              #{c.account_number} · {c.server} ·
              <span className="ml-1 capitalize px-1.5 py-0.5 rounded"
                style={{ background: c.type === "live" ? "rgba(46,213,115,0.1)" : "rgba(108,99,255,0.1)", color: c.type === "live" ? "var(--accent-success)" : "var(--accent)" }}>
                {c.type}
              </span>
            </p>
          </div>
          <button onClick={() => del(c.id)} disabled={deleting === c.id}
            className="p-2 rounded-lg hover:opacity-70 transition-opacity"
            style={{ color: "var(--accent-danger)" }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BrokerSync() {
  const [tab,         setTab]         = useState("ea")
  const [manualModal, setManualModal] = useState(false)

  const tabs = [
    { id: "ea",      label: "MT5 EA",        icon: Bot    },
    { id: "metaapi", label: "Meta API",       icon: Globe  },
    { id: "ctrader", label: "cTrader",        icon: Zap    },
    { id: "other",   label: "Other Brokers",  icon: Wifi   },
    { id: "manual",  label: "Manual",         icon: Shield },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Broker Sync</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Connect your trading platform to import trades and chart data automatically
          </p>
        </div>
        {tab === "manual" && (
          <button onClick={() => setManualModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border self-start"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }}>
            <Plus size={13} /> Add Account
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 rounded-xl p-1 overflow-x-auto" style={{ background: "var(--bg-elevated)", width: "fit-content" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={{
              background: tab === t.id ? "var(--accent)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--text-secondary)"
            }}>
            <t.icon size={13} />{t.label}
          </button>
        ))}
      </div>

      {/* MT5 EA — Primary */}
      {tab === "ea" && <EASetupPanel />}

      {/* Meta API — Coming Soon */}
      {tab === "metaapi" && (
        <div className="max-w-2xl space-y-4">
          <ComingSoonCard
            icon="☁️"
            title="Meta API Integration"
            description="Connect any MT4 or MT5 account via cloud — no local EA required. Works on any device, any OS. We're building the full integration including chart data, open positions, and real-time sync."
            eta="Q2 2026"
          />
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>What Meta API will enable</p>
            <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
              {["Cloud-based — no local install", "MT4 & MT5 support", "Full trade history import", "Real-time P&L tracking", "OHLCV chart data", "Works on mobile & VPS"].map(f => (
                <p key={f}>⏳ {f}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* cTrader — Coming Soon */}
      {tab === "ctrader" && (
        <div className="max-w-2xl space-y-4">
          <ComingSoonCard
            icon="🔵"
            title="cTrader Integration"
            description="Native cTrader Open API support for Pepperstone, IC Markets cTrader, and all FX brokers running cTrader. Will support full trade history, positions, and chart data."
            eta="Q3 2026"
          />
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Supported brokers (planned)</p>
            <div className="flex flex-wrap gap-2">
              {["Pepperstone", "IC Markets cTrader", "Fusion Markets", "Tickmill", "FP Markets", "Global Prime"].map(b => (
                <span key={b} className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Other — Coming Soon */}
      {tab === "other" && (
        <div className="max-w-2xl space-y-4">
          <ComingSoonCard
            icon="🌐"
            title="Additional Platforms"
            description="We're working on direct integrations with popular broker platforms and prop firm dashboards. No local software, no extra tools — just connect and sync."
            eta="2026"
          />
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: "TradingView",    icon: "📈", eta: "Q2 2026" },
              { name: "DXtrade",        icon: "🔷", eta: "Q3 2026" },
              { name: "Match-Trader",   icon: "🟠", eta: "Q3 2026" },
              { name: "TradeLocker",    icon: "🔐", eta: "Q4 2026" },
              { name: "FTMO Client",    icon: "🏆", eta: "Q4 2026" },
              { name: "My FXBOOK",      icon: "📒", eta: "2026"    },
            ].map(p => (
              <div key={p.name} className="rounded-xl p-4 flex items-center gap-3"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <span className="text-2xl">{p.icon}</span>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>⏳ {p.eta}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Accounts */}
      {tab === "manual" && (
        <div className="max-w-2xl">
          <ManualAccountsList onAdd={() => setManualModal(true)} />
        </div>
      )}

      <AddManualModal
        open={manualModal}
        onClose={() => setManualModal(false)}
        onSaved={() => {}}
      />
    </div>
  )
}
