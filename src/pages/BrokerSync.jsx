import { useState, useEffect, useRef } from "react"
import { BrokerConnection, Trade } from "@/api/localStore"
import { toast } from "@/components/ui/toast"
import {
  Wifi, WifiOff, Plus, Trash2, X, RefreshCw,
  CheckCircle, AlertCircle, Clock, ChevronRight,
  Shield, Info, Terminal, Download, Activity,
  ChevronDown, Eye, EyeOff, Zap
} from "lucide-react"

const BRIDGE_URL = "http://localhost:5001"

// Safe fetch with timeout (AbortSignal.timeout not supported in all browsers)
function fetchWithTimeout(url, options = {}, ms = 5000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

// ── Known broker servers (user can add custom) ────────────────────────────────
const KNOWN_SERVERS = {
  "IC Markets":     ["ICMarkets-Live01","ICMarkets-Live02","ICMarkets-Demo01"],
  "Pepperstone":    ["Pepperstone-Demo","Pepperstone-Demo02","Pepperstone-Live","Pepperstone-Live01"],
  "FTMO":           ["FTMO-Server","FTMO-Server2","FTMO-Demo"],
  "Exness":         ["Exness-Trial","Exness-Real","Exness-Real2","Exness-Real3"],
  "XM":             ["XMGlobal-Demo","XMGlobal-Real","XMGlobal-Real2"],
  "FP Markets":     ["FPMarkets-Demo","FPMarkets-Live","FPMarkets-Live2"],
  "Axiory":         ["Axiory-Demo","Axiory-Real"],
  "Tickmill":       ["Tickmill-Demo","Tickmill-Live"],
  "Vantage":        ["Vantage-Demo Server","Vantage-Live Server"],
  "OANDA":          ["OANDA-fxTrade","OANDA-fxTradeUS","OANDA-fxPractice"],
  "MyFXBook":       ["Autotrade-Demo","Autotrade-Live"],
  "HFM":            ["HFMarketsGlobal-Demo","HFMarketsGlobal-Real"],
  "Forex.com":      ["FOREX.com-Demo01","FOREX.com-MT5Live01"],
  "Custom / Other": [],
}

// ─── MT5 Connect Panel ────────────────────────────────────────────────────────
function MT5ConnectPanel({ onConnected }) {
  const [broker,      setBroker]      = useState("IC Markets")
  const [serverMode,  setServerMode]  = useState("list")  // "list" | "manual"
  const [server,      setServer]      = useState("")
  const [customServer,setCustomServer]= useState("")
  const [accountType, setAccountType] = useState("live")
  const [login,       setLogin]       = useState("")
  const [password,    setPassword]    = useState("")
  const [showPass,    setShowPass]    = useState(false)
  const [connecting,  setConnecting]  = useState(false)
  const [bridgeStatus,setBridgeStatus]= useState(null) // null | "checking" | "ok" | "error"

  const servers = KNOWN_SERVERS[broker] || []

  useEffect(() => {
    setServer(servers[0] || "")
  }, [broker])

  // Check bridge status on mount
  useEffect(() => {
    checkBridge()
  }, [])

  const checkBridge = async () => {
    setBridgeStatus("checking")
    try {
      const res = await fetchWithTimeout(`${BRIDGE_URL}/api/status`, {}, 3000)
      const data = await res.json()
      setBridgeStatus(data.running ? "ok" : "error")
      if (data.connected && data.account) {
        onConnected(data.account, [])
      }
    } catch {
      setBridgeStatus("error")
    }
  }

  const connect = async () => {
    if (!login.trim() || !password.trim()) { toast.error("Login and password are required"); return }
    const serverVal = serverMode === "manual" ? customServer.trim() : server
    if (!serverVal) { toast.error("Server is required"); return }

    setConnecting(true)
    try {
      const res = await fetchWithTimeout(`${BRIDGE_URL}/api/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password, server: serverVal }),
      }, 15000)
      const data = await res.json()
      if (data.success) {
        toast.success(`Connected: ${data.account.name}`)
        // Fetch trades
        const tradesRes = await fetch(`${BRIDGE_URL}/api/trades`)
        const tradesData = await tradesRes.json()
        onConnected(data.account, tradesData.trades || [], { broker, server: serverVal, accountType, login })
      } else {
        toast.error(data.error || "Connection failed")
      }
    } catch (e) {
      if (e.name === "TimeoutError" || e.name === "AbortError") {
        toast.error("Timeout — is the MT5 bridge running?")
      } else {
        toast.error("Bridge not reachable. Is mt5_bridge.py running?")
      }
    }
    setConnecting(false)
  }

  return (
    <div className="space-y-4">
      {/* Bridge status banner */}
      <div className="rounded-xl p-3 flex items-center gap-3"
        style={{ background: bridgeStatus === "ok" ? "rgba(46,213,115,0.08)" : bridgeStatus === "error" ? "rgba(255,71,87,0.08)" : "rgba(108,99,255,0.08)",
          border: `1px solid ${bridgeStatus === "ok" ? "rgba(46,213,115,0.2)" : bridgeStatus === "error" ? "rgba(255,71,87,0.2)" : "rgba(108,99,255,0.2)"}` }}>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${bridgeStatus === "ok" ? "bg-green-400 animate-pulse" : bridgeStatus === "error" ? "bg-red-400" : "bg-yellow-400 animate-pulse"}`}/>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: bridgeStatus === "ok" ? "var(--accent-success)" : bridgeStatus === "error" ? "var(--accent-danger)" : "var(--accent)" }}>
            {bridgeStatus === "ok" ? "MT5 Bridge is running" : bridgeStatus === "error" ? "MT5 Bridge not detected" : "Checking bridge..."}
          </p>
          {bridgeStatus === "error" && (
            <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>
              Download mt5_bridge.py and run: <code className="font-mono" style={{ color:"var(--accent)" }}>python mt5_bridge.py</code>
            </p>
          )}
        </div>
        <button onClick={checkBridge} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--text-muted)" }}>
          <RefreshCw size={13}/>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Broker */}
        <div>
          <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-muted)" }}>Broker</label>
          <select value={broker} onChange={e=>setBroker(e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
            {Object.keys(KNOWN_SERVERS).map(b=><option key={b}>{b}</option>)}
          </select>
        </div>

        {/* Account type */}
        <div>
          <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-muted)" }}>Account Type</label>
          <div className="flex gap-2">
            {["live","demo"].map(t=>(
              <button key={t} onClick={()=>setAccountType(t)} className="flex-1 h-9 rounded-lg text-sm font-semibold border capitalize transition-all"
                style={{ background:accountType===t?(t==="live"?"rgba(46,213,115,0.2)":"rgba(108,99,255,0.2)"):"var(--bg-elevated)",
                  borderColor:accountType===t?(t==="live"?"var(--accent-success)":"var(--accent)"):"var(--border)",
                  color:accountType===t?(t==="live"?"var(--accent-success)":"var(--accent)"):"var(--text-secondary)" }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Server */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium" style={{ color:"var(--text-muted)" }}>Server</label>
          <button onClick={()=>setServerMode(m=>m==="list"?"manual":"list")} className="text-xs" style={{ color:"var(--accent)" }}>
            {serverMode==="list" ? "Enter manually" : "Pick from list"}
          </button>
        </div>
        {serverMode === "list" ? (
          servers.length > 0 ? (
            <select value={server} onChange={e=>setServer(e.target.value)} className="w-full h-9 rounded-lg px-3 text-sm border"
              style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
              {servers.map(s=><option key={s}>{s}</option>)}
            </select>
          ) : (
            <input value={customServer} onChange={e=>setCustomServer(e.target.value)} placeholder="Enter server name (e.g. ICMarkets-Live01)"
              className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          )
        ) : (
          <input value={customServer} onChange={e=>setCustomServer(e.target.value)} placeholder="e.g. BrokerName-Live01"
            className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
        )}
      </div>

      {/* Login + Password */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-muted)" }}>Login (Account #)</label>
          <input value={login} onChange={e=>setLogin(e.target.value)} placeholder="12345678" type="number"
            className="w-full h-9 rounded-lg px-3 text-sm border font-mono" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
        </div>
        <div>
          <label className="text-xs mb-1 block font-medium" style={{ color:"var(--text-muted)" }}>
            Investor Password
            <span className="ml-1 font-normal" style={{ color:"var(--accent-success)" }}>(read-only)</span>
          </label>
          <div className="relative">
            <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"
              className="w-full h-9 rounded-lg px-3 pr-9 text-sm border font-mono" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
            <button onClick={()=>setShowPass(s=>!s)} className="absolute right-2.5 top-2 hover:opacity-70" style={{ color:"var(--text-muted)" }}>
              {showPass?<EyeOff size={14}/>:<Eye size={14}/>}
            </button>
          </div>
        </div>
      </div>

      {/* Investor password note */}
      <div className="flex items-start gap-2 rounded-lg p-3" style={{ background:"rgba(46,213,115,0.06)", border:"1px solid rgba(46,213,115,0.15)" }}>
        <Shield size={13} style={{ color:"var(--accent-success)", flexShrink:0, marginTop:1 }}/>
        <p className="text-xs" style={{ color:"var(--text-secondary)" }}>
          Use your <strong style={{ color:"var(--accent-success)" }}>Investor (read-only) password</strong> for security. In MT5: Account → Change Password → Investor. TradeSylla can only read data, never trade.
        </p>
      </div>

      <button onClick={connect} disabled={connecting || bridgeStatus !== "ok"}
        className="w-full h-10 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all"
        style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity:(connecting||bridgeStatus!=="ok")?0.5:1 }}>
        {connecting ? <><RefreshCw size={14} className="animate-spin"/> Connecting...</> : <><Wifi size={14}/> Connect & Import Trades</>}
      </button>
    </div>
  )
}

// ─── Live Account Card ─────────────────────────────────────────────────────────
function LiveAccountCard({ account, tradeCount, lastSync, onSync, onDisconnect, syncing }) {
  return (
    <div className="rounded-2xl p-5" style={{ background:"var(--bg-card)", border:"2px solid rgba(46,213,115,0.3)" }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
            style={{ background:"linear-gradient(135deg,#1a73e8,#1557b0)" }}>MT5</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold" style={{ color:"var(--text-primary)" }}>{account.name}</h3>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                style={{ background:"rgba(46,213,115,0.12)", color:"var(--accent-success)" }}>
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
                Live
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                style={{ background:account.account_type==="live"?"rgba(46,213,115,0.1)":"rgba(108,99,255,0.1)",
                  color:account.account_type==="live"?"var(--accent-success)":"var(--accent)" }}>
                {account.account_type}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>
              {account.broker} · #{account.login} · {account.server}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={onSync} disabled={syncing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
            style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>
            <RefreshCw size={12} className={syncing?"animate-spin":""}/>
            {syncing ? "Syncing..." : "Sync"}
          </button>
          <button onClick={onDisconnect} className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--accent-danger)" }}>
            <WifiOff size={14}/>
          </button>
        </div>
      </div>

      {/* Account stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label:"Balance",  value:`${account.currency} ${account.balance?.toFixed(2)}` },
          { label:"Equity",   value:`${account.currency} ${account.equity?.toFixed(2)}` },
          { label:"Open P&L", value:`${account.profit >= 0 ? "+" : ""}${account.profit?.toFixed(2)}`,
            color: account.profit >= 0 ? "var(--accent-success)" : "var(--accent-danger)" },
          { label:"Leverage", value:`1:${account.leverage}` },
        ].map(s=>(
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background:"var(--bg-elevated)" }}>
            <p className="text-sm font-bold" style={{ color:s.color||"var(--text-primary)" }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs" style={{ color:"var(--text-muted)" }}>
        <span><Activity size={11} className="inline mr-1"/>{tradeCount} trades imported</span>
        {lastSync && <span><RefreshCw size={11} className="inline mr-1"/>Last sync: {new Date(lastSync).toLocaleTimeString()}</span>}
      </div>
    </div>
  )
}

// ─── Manual Broker Card ────────────────────────────────────────────────────────
function ManualCard({ conn, onDelete }) {
  const color = conn.broker_color || "var(--accent)"
  return (
    <div className="rounded-xl p-4 flex items-center gap-3" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
        style={{ background:color }}>
        {conn.broker_name?.slice(0,2).toUpperCase() || "??"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color:"var(--text-primary)" }}>{conn.account_name || conn.broker_name}</p>
        <p className="text-xs" style={{ color:"var(--text-muted)" }}>#{conn.account_number} · {conn.type} · Manual</p>
      </div>
      <button onClick={()=>onDelete(conn)} className="p-2 rounded-lg hover:opacity-70" style={{ color:"var(--accent-danger)" }}>
        <Trash2 size={13}/>
      </button>
    </div>
  )
}

// ─── Add Manual Modal ──────────────────────────────────────────────────────────
const MANUAL_BROKERS = [
  { id:"mt4", name:"MT4", color:"#1a73e8" },{ id:"ctrader", name:"cTrader", color:"#00aeef" },
  { id:"ftmo", name:"FTMO", color:"#6c63ff" },{ id:"mff", name:"My Forex Funds", color:"#00d4aa" },
  { id:"etoro", name:"eToro", color:"#00c176" },{ id:"ibkr", name:"IBKR", color:"#e31837" },
  { id:"custom", name:"Custom", color:"#8b8d9e" },
]

function AddManualModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ broker_id:"mt4", account_number:"", account_name:"", type:"demo", notes:"" })
  const [saving, setSaving] = useState(false)
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const broker = MANUAL_BROKERS.find(b=>b.id===form.broker_id)||MANUAL_BROKERS[0]

  const save = async () => {
    if (!form.account_number.trim()) { toast.error("Account number required"); return }
    setSaving(true)
    await BrokerConnection.create({ ...form, broker_name:broker.name, broker_color:broker.color, status:"connected", last_sync:new Date().toISOString() })
    toast.success("Account added!")
    setForm({ broker_id:"mt4", account_number:"", account_name:"", type:"demo", notes:"" })
    onSaved(); onClose()
    setSaving(false)
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative w-full max-w-sm rounded-2xl shadow-2xl z-10 p-6" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color:"var(--text-primary)" }}>Add Manual Account</h3>
          <button onClick={onClose} style={{ color:"var(--text-secondary)" }}><X size={16}/></button>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {MANUAL_BROKERS.map(b=>(
              <button key={b.id} onClick={()=>set("broker_id",b.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border"
                style={{ background:form.broker_id===b.id?`${b.color}20`:"var(--bg-elevated)",
                  borderColor:form.broker_id===b.id?b.color:"var(--border)",
                  color:form.broker_id===b.id?b.color:"var(--text-secondary)" }}>
                {b.name}
              </button>
            ))}
          </div>
          <input value={form.account_number} onChange={e=>set("account_number",e.target.value)} placeholder="Account number *"
            className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          <input value={form.account_name} onChange={e=>set("account_name",e.target.value)} placeholder="Nickname (e.g. Main Live)"
            className="w-full h-9 rounded-lg px-3 text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}/>
          <div className="flex gap-2">
            {["demo","live"].map(t=>(
              <button key={t} onClick={()=>set("type",t)} className="flex-1 h-9 rounded-lg text-xs font-semibold border capitalize"
                style={{ background:form.type===t?(t==="live"?"rgba(46,213,115,0.2)":"rgba(108,99,255,0.2)"):"var(--bg-elevated)",
                  borderColor:form.type===t?(t==="live"?"var(--accent-success)":"var(--accent)"):"var(--border)",
                  color:form.type===t?(t==="live"?"var(--accent-success)":"var(--accent)"):"var(--text-secondary)" }}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white"
            style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))", opacity:saving?0.7:1 }}>
            {saving?"Saving...":"Add"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main BrokerSync Page ──────────────────────────────────────────────────────
export default function BrokerSync() {
  const [tab,          setTab]          = useState("mt5")
  const [mt5Account,   setMt5Account]   = useState(null)
  const [mt5TradeCount,setMt5TradeCount]= useState(0)
  const [lastSync,     setLastSync]     = useState(null)
  const [syncing,      setSyncing]      = useState(false)
  const [manualConns,  setManualConns]  = useState([])
  const [manualModal,  setManualModal]  = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const syncIntervalRef = useRef(null)

  useEffect(() => {
    loadManual()
    // Check if already connected to bridge
    checkExistingConnection()
  }, [])

  const checkExistingConnection = async () => {
    try {
      const res  = await fetchWithTimeout(`${BRIDGE_URL}/api/status`, {}, 3000)
      const data = await res.json()
      if (data.connected && data.account) {
        setMt5Account(data.account)
        setMt5TradeCount(data.trade_count || 0)
        setLastSync(data.last_sync)
        startAutoSync()
      }
    } catch {}
  }

  const loadManual = async () => {
    const data = await BrokerConnection.list()
    setManualConns(data.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)))
  }

  const startAutoSync = () => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    syncIntervalRef.current = setInterval(doSync, 60000)
  }

  const handleMT5Connected = async (account, trades, meta) => {
    setMt5Account(account)
    setLastSync(new Date().toISOString())
    // Import new trades (skip if already imported by mt5_ticket)
    const existing = await Trade.list()
    const existingTickets = new Set(existing.map(t=>t.mt5_ticket).filter(Boolean))
    let imported = 0
    for (const t of trades) {
      if (t.mt5_ticket && existingTickets.has(t.mt5_ticket)) continue
      try { await Trade.create(t); imported++ } catch {}
    }
    setMt5TradeCount(trades.length)
    if (imported > 0) toast.success(`${imported} new trades imported from MT5!`)
    else toast.success("Connected! No new trades to import.")

    // Save connection record
    if (meta) {
      await BrokerConnection.create({
        broker_name: `MT5 - ${meta.broker || account.broker}`,
        broker_color: "#1a73e8",
        account_number: String(account.login),
        account_name: account.name,
        server: account.server,
        type: account.account_type,
        status: "connected",
        last_sync: new Date().toISOString(),
        is_mt5_live: true,
      })
      loadManual()
    }
    startAutoSync()
  }

  const doSync = async () => {
    setSyncing(true)
    try {
      const res  = await fetchWithTimeout(`${BRIDGE_URL}/api/sync`, {}, 10000)
      const data = await res.json()
      // Import any new trades
      const existing = await Trade.list()
      const existingTickets = new Set(existing.map(t=>t.mt5_ticket).filter(Boolean))
      let imported = 0
      for (const t of data.trades || []) {
        if (t.mt5_ticket && existingTickets.has(t.mt5_ticket)) continue
        try { await Trade.create(t); imported++ } catch {}
      }
      setMt5TradeCount(data.count || 0)
      setLastSync(data.last_sync || new Date().toISOString())
      if (imported > 0) toast.success(`${imported} new trade${imported>1?"s":""} synced from MT5`)
    } catch { toast.error("Sync failed — is the bridge running?") }
    setSyncing(false)
  }

  const disconnect = async () => {
    try { await fetch(`${BRIDGE_URL}/api/disconnect`) } catch {}
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    setMt5Account(null)
    setMt5TradeCount(0)
    setLastSync(null)
    toast.success("Disconnected from MT5")
  }

  const deleteManual = async () => {
    if (!deleteTarget) return
    await BrokerConnection.delete(deleteTarget.id)
    toast.success("Removed")
    setDeleteTarget(null)
    loadManual()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>Broker Sync</h1>
          <p className="text-sm mt-0.5" style={{ color:"var(--text-muted)" }}>
            Connect MT5 for automatic trade import, or add accounts manually
          </p>
        </div>
        <button onClick={()=>setManualModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border self-start"
          style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-primary)" }}>
          <Plus size={13}/> Add Manual Account
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 rounded-xl p-1" style={{ background:"var(--bg-elevated)", width:"fit-content" }}>
        {[
          { id:"mt5", label:"MT5 Auto-Sync", icon:Zap },
          { id:"manual", label:`Manual (${manualConns.length})`, icon:Shield },
          { id:"setup", label:"Setup Guide", icon:Terminal },
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background:tab===t.id?"var(--accent)":"transparent", color:tab===t.id?"#fff":"var(--text-secondary)" }}>
            <t.icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {/* MT5 Auto-Sync Tab */}
      {tab === "mt5" && (
        <div className="max-w-xl">
          {mt5Account ? (
            <LiveAccountCard
              account={mt5Account}
              tradeCount={mt5TradeCount}
              lastSync={lastSync}
              onSync={doSync}
              onDisconnect={disconnect}
              syncing={syncing}
            />
          ) : (
            <div className="rounded-2xl p-6" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
              <h2 className="font-bold text-base mb-1" style={{ color:"var(--text-primary)" }}>Connect MetaTrader 5</h2>
              <p className="text-xs mb-5" style={{ color:"var(--text-muted)" }}>
                Requires the MT5 Bridge running locally. All trades sync automatically every 60 seconds.
              </p>
              <MT5ConnectPanel onConnected={handleMT5Connected}/>
            </div>
          )}
        </div>
      )}

      {/* Manual Tab */}
      {tab === "manual" && (
        <div className="max-w-xl space-y-3">
          {manualConns.length === 0 ? (
            <div className="rounded-2xl py-14 text-center" style={{ background:"var(--bg-card)", border:"1px dashed var(--border)" }}>
              <p className="font-semibold mb-1" style={{ color:"var(--text-primary)" }}>No manual accounts</p>
              <p className="text-sm" style={{ color:"var(--text-muted)" }}>Add broker accounts for reference.</p>
              <button onClick={()=>setManualModal(true)} className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
                <Plus size={13}/> Add Account
              </button>
            </div>
          ) : manualConns.map(c=>(
            <ManualCard key={c.id} conn={c} onDelete={setDeleteTarget}/>
          ))}
        </div>
      )}

      {/* Setup Guide Tab */}
      {tab === "setup" && (
        <div className="max-w-xl space-y-4">
          <div className="rounded-2xl overflow-hidden" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)", background:"rgba(108,99,255,0.06)" }}>
              <h3 className="font-bold" style={{ color:"var(--text-primary)" }}>MT5 Auto-Sync Setup Guide</h3>
              <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>One-time setup · Windows only · 5 minutes</p>
            </div>
            <div className="p-5 space-y-4">
              {[
                { n:1, title:"Download Python", body:'Visit python.org and install Python 3.10+. Make sure to check "Add to PATH" during installation.' },
                { n:2, title:"Install MetaTrader5 package", body:"Open a terminal (Win+R → cmd) and run:", code:"pip install MetaTrader5" },
                { n:3, title:"Download the MT5 Bridge", body:"Download mt5_bridge.py from the files above and save it anywhere on your computer." },
                { n:4, title:"Run the bridge", body:"Double-click mt5_bridge.py or run in terminal:", code:"python mt5_bridge.py" },
                { n:5, title:"Connect in TradeSylla", body:'Go to the MT5 Auto-Sync tab, enter your broker, server, account number and Investor password, then click Connect.' },
              ].map(step=>(
                <div key={step.n} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background:"var(--accent)", color:"#fff" }}>{step.n}</div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{step.title}</p>
                    <p className="text-xs mt-0.5" style={{ color:"var(--text-secondary)" }}>{step.body}</p>
                    {step.code && (
                      <code className="block mt-1.5 px-3 py-1.5 rounded-lg text-xs font-mono"
                        style={{ background:"var(--bg-elevated)", color:"var(--accent)", border:"1px solid var(--border)" }}>
                        {step.code}
                      </code>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-4 flex items-start gap-3" style={{ background:"rgba(46,213,115,0.07)", border:"1px solid rgba(46,213,115,0.2)" }}>
            <Shield size={15} style={{ color:"var(--accent-success)", flexShrink:0, marginTop:1 }}/>
            <div>
              <p className="text-sm font-semibold" style={{ color:"var(--accent-success)" }}>Investor Password = Read-Only</p>
              <p className="text-xs mt-0.5" style={{ color:"var(--text-secondary)" }}>
                The Investor password in MT5 gives read-only access. It cannot place or modify trades. Your account is always safe.
                To find/set it: MT5 → Tools → Options → Server → Change Investor Password.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddManualModal open={manualModal} onClose={()=>setManualModal(false)} onSaved={loadManual}/>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={()=>setDeleteTarget(null)}/>
          <div className="relative rounded-2xl p-6 w-full max-w-sm z-10" style={{ background:"var(--bg-card)", border:"1px solid var(--border)" }}>
            <h3 className="font-bold mb-2" style={{ color:"var(--text-primary)" }}>Remove Account?</h3>
            <p className="text-sm mb-5" style={{ color:"var(--text-muted)" }}>Your trade data won't be affected.</p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 h-9 rounded-lg text-sm border" style={{ background:"var(--bg-elevated)", borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancel</button>
              <button onClick={deleteManual} className="flex-1 h-9 rounded-lg text-sm font-semibold text-white" style={{ background:"var(--accent-danger)" }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
