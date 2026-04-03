// src/pages/BrokerSync.jsx  — Visual Upgrade v2 + Token Column Fix
// Token is now saved to BOTH user_token AND ea_token so it works with all
// versions of ea-sync.js regardless of which column they check.
import { useState, useEffect } from "react"
import { useUser } from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import { Trade, BrokerConnection } from "@/api/supabaseStore"
import { toast } from "@/components/ui/toast"
import {
  Wifi, WifiOff, Download, Copy, CheckCircle, RefreshCw,
  Key, ChevronDown, ChevronUp, AlertTriangle, Zap, Activity,
  TrendingUp, BarChart2, Shield, Terminal
} from "lucide-react"

// ─── Connection Status Card ───────────────────────────────────────────────────
function ConnectionCard({ conn }) {
  const isLive  = conn.type==="live"||!conn.is_demo
  const balance = parseFloat(conn.balance||0)
  const equity  = parseFloat(conn.equity||0)
  const diff    = equity - balance
  const lastSync= conn.last_sync ? new Date(conn.last_sync) : null
  const minsAgo = lastSync ? Math.floor((Date.now()-lastSync.getTime())/60000) : null

  return (
    <div className="card">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background:isLive?"rgba(46,213,115,0.12)":"rgba(255,165,2,0.12)", border:`1px solid ${isLive?"rgba(46,213,115,0.25)":"rgba(255,165,2,0.25)"}` }}>
              <Wifi size={18} style={{ color:isLive?"var(--accent-success)":"var(--accent-warning)" }}/>
            </div>
            <div>
              <p className="font-bold" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>
                {conn.broker_name||"MT5"} #{conn.mt5_login}
              </p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>{conn.server||"No server"}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="badge" style={{ background:isLive?"rgba(46,213,115,0.12)":"rgba(255,165,2,0.12)", color:isLive?"var(--accent-success)":"var(--accent-warning)", border:`1px solid ${isLive?"rgba(46,213,115,0.25)":"rgba(255,165,2,0.25)"}` }}>
              {isLive?"● Live":"○ Demo"}
            </span>
            {minsAgo!==null && (
              <span className="mono" style={{ fontSize:9, color:"var(--text-muted)" }}>
                {minsAgo<1?"Just now":minsAgo<60?`${minsAgo}m ago`:`${Math.floor(minsAgo/60)}h ago`}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label:"Balance",  v:`${conn.currency||"$"}${balance.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`, color:"var(--text-primary)" },
            { label:"Equity",   v:`${conn.currency||"$"}${equity.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`, color:diff>=0?"var(--accent-success)":"var(--accent-danger)" },
            { label:"Float",    v:`${diff>=0?"+":""}${conn.currency||"$"}${Math.abs(diff).toFixed(2)}`, color:diff>=0?"var(--accent-success)":"var(--accent-danger)" },
          ].map(s=>(
            <div key={s.label} className="rounded-xl py-2 px-2 text-center" style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
              <p className="text-sm font-bold mono" style={{ color:s.color }}>{s.v}</p>
              <p className="stat-card-label" style={{ fontSize:9 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── EA Setup Panel ───────────────────────────────────────────────────────────
function EASetupPanel() {
  const { user } = useUser()
  const [token,      setToken]      = useState("")
  const [generating, setGenerating] = useState(false)
  const [copied,     setCopied]     = useState("")
  const [step,       setStep]       = useState(1)

  useEffect(() => {
    if(!user) return
    // Load token — check user_token first (canonical), fallback to ea_token
    supabase.from("profiles").select("user_token, ea_token").eq("id",user.id).single()
      .then(({ data }) => {
        if(data?.user_token) setToken(data.user_token)
        else if(data?.ea_token) setToken(data.ea_token)
      })
  }, [user])

  const generateToken = async () => {
    setGenerating(true)
    try {
      const arr = new Uint8Array(24)
      crypto.getRandomValues(arr)
      const newToken = Array.from(arr).map(b=>b.toString(16).padStart(2,"0")).join("")
      // Save to BOTH columns so ea-sync.js works regardless of which it checks
      const { error } = await supabase.from("profiles")
        .update({ user_token: newToken, ea_token: newToken })
        .eq("id", user.id)
      if(error) throw error
      setToken(newToken)
      toast.success("Token generated and saved!")
    } catch(e) { toast.error("Failed to generate token: "+e.message) }
    setGenerating(false)
  }

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(()=>{ setCopied(key); setTimeout(()=>setCopied(""),2000) })
  }

  const STEPS = [
    {
      n:1, title:"Download the EA",
      content:(
        <div className="space-y-3">
          <p className="text-sm" style={{ color:"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
            TradeSylla_Sync.mq5 runs silently inside MT5 and automatically sends your closed trades to your journal.
          </p>
          <a href="/ea/TradeSylla_Sync.mq5" download
            className="btn btn-primary inline-flex">
            <Download size={13}/> Download TradeSylla_Sync.mq5
          </a>
          <p className="text-xs" style={{ color:"var(--text-muted)" }}>
            Compile it once in MetaEditor (free, bundled with MT5). Takes ~10 seconds.
          </p>
        </div>
      )
    },
    {
      n:2, title:"Install in MT5",
      content:(
        <div className="space-y-3">
          <p className="text-sm" style={{ color:"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
            In MT5: <strong style={{ color:"var(--text-primary)" }}>File → Open Data Folder</strong>, then navigate to <code className="mono px-1 rounded" style={{ background:"var(--bg-elevated)", fontSize:11, color:"var(--accent)" }}>MQL5/Experts/</code> and drop the file there. Press F5 in Navigator to refresh.
          </p>
        </div>
      )
    },
    {
      n:3, title:"Generate your Sync Token",
      content:(
        <div className="space-y-3">
          <p className="text-sm" style={{ color:"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
            This token identifies your account. Paste it into the <strong style={{ color:"var(--accent)" }}>UserToken</strong> field in the EA settings. Keep it private.
          </p>
          {token ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ background:"var(--bg-elevated)", border:"1px solid rgba(46,213,115,0.3)" }}>
                <span className="flex-1 truncate mono text-xs" style={{ color:"var(--accent-success)" }}>{token}</span>
                <button onClick={()=>copy(token,"token")} className="hover:opacity-70 flex-shrink-0" style={{ color:"var(--accent-success)" }}>
                  {copied==="token"?<CheckCircle size={13}/>:<Copy size={13}/>}
                </button>
              </div>
              <button onClick={generateToken} disabled={generating}
                className="btn btn-secondary text-xs h-8">
                <RefreshCw size={11}/>{generating?"Generating…":"↺ Regenerate"}
              </button>
            </div>
          ) : (
            <button onClick={generateToken} disabled={generating} className="btn btn-primary gap-2">
              <Key size={13}/>{generating?"Generating…":"Generate Token"}
            </button>
          )}
        </div>
      )
    },
    {
      n:4, title:"Attach EA to a chart",
      content:(
        <div className="space-y-3">
          <p className="text-sm" style={{ color:"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
            Open any chart in MT5 (e.g. EURUSD H1). In Navigator → Expert Advisors, double-click <strong style={{ color:"var(--text-primary)" }}>TradeSylla_Sync</strong>. Paste your token into the <strong style={{ color:"var(--accent)" }}>UserToken</strong> input. Click OK.
          </p>
          <div className="p-3 rounded-xl text-sm" style={{ background:"rgba(255,165,2,0.08)", border:"1px solid rgba(255,165,2,0.2)", color:"var(--accent-warning)" }}>
            ⚠ Make sure <strong>Auto Trading</strong> is enabled (green button at top) and the EA shows a smiley face on the chart.
          </div>
        </div>
      )
    },
    {
      n:5, title:"Whitelist TradeSylla in MT5",
      content:(
        <div className="space-y-3">
          <p className="text-sm" style={{ color:"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
            MT5 blocks external URLs by default. You need to whitelist TradeSylla once:
          </p>
          <ol className="space-y-1 text-sm" style={{ color:"var(--text-secondary)" }}>
            <li>1. <strong style={{ color:"var(--text-primary)" }}>Tools → Options → Expert Advisors</strong></li>
            <li>2. Check <strong style={{ color:"var(--text-primary)" }}>Allow WebRequest for listed URL</strong></li>
            <li>3. Click <strong style={{ color:"var(--text-primary)" }}>+</strong> and add the URL below</li>
          </ol>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background:"var(--bg-elevated)", border:"1px solid var(--border)" }}>
            <span className="flex-1 mono text-xs" style={{ color:"var(--accent)" }}>https://tradesylla.vercel.app</span>
            <button onClick={()=>copy("https://tradesylla.vercel.app","url")} className="hover:opacity-70" style={{ color:"var(--text-muted)" }}>
              {copied==="url"?<CheckCircle size={13} style={{ color:"var(--accent-success)" }}/>:<Copy size={13}/>}
            </button>
          </div>
        </div>
      )
    },
  ]

  return (
    <div className="space-y-3">
      {STEPS.map(s => {
        const isActive = step===s.n
        const isDone   = step>s.n
        return (
          <div key={s.n} className="card overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4"
              onClick={()=>setStep(isActive?0:s.n)}>
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background:isDone?"var(--accent-success)":isActive?"var(--accent)":"var(--bg-elevated)", color:isDone||isActive?"#fff":"var(--text-muted)", fontFamily:"var(--font-mono)" }}>
                  {isDone?"✓":s.n}
                </div>
                <span className="font-semibold text-sm" style={{ fontFamily:"var(--font-display)", color:isActive?"var(--text-primary)":"var(--text-secondary)" }}>
                  {s.title}
                </span>
              </div>
              {isActive?<ChevronUp size={14} style={{ color:"var(--text-muted)" }}/>:<ChevronDown size={14} style={{ color:"var(--text-muted)" }}/>}
            </button>
            {isActive && (
              <div className="px-5 pb-5" style={{ borderTop:"1px solid var(--border)" }}>
                <div className="pt-4">{s.content}</div>
                {s.n < STEPS.length && (
                  <button onClick={()=>setStep(s.n+1)} className="mt-4 btn btn-secondary text-xs h-8">
                    Next step →
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Troubleshooting Panel ────────────────────────────────────────────────────
function TroubleshootPanel() {
  const issues = [
    { title:"EA connects but sends no data", desc:"Go to Settings → API Keys, click Regenerate on the Sync EA Token, paste the new token into UserToken in the EA settings, then remove and re-attach the EA.", color:"var(--accent-warning)" },
    { title:"401 Invalid token error in MT5 log", desc:"Token mismatch. Regenerate in Settings → API Keys and re-paste. Make sure you're pasting the full token with no spaces.", color:"var(--accent-danger)" },
    { title:"4060 URL not whitelisted", desc:"Tools → Options → Expert Advisors → Allow WebRequest → add https://tradesylla.vercel.app", color:"var(--accent-warning)" },
    { title:"EA attached but shows X on chart", desc:"Auto Trading is disabled. Click the green Auto Trading button at the top of MT5.", color:"var(--accent-warning)" },
    { title:"Trades sent but not appearing in Journal", desc:"Set ForceResync=true in EA inputs, remove and re-attach the EA, then set ForceResync back to false.", color:"var(--accent)" },
  ]
  return (
    <div className="space-y-3">
      {issues.map(issue=>(
        <div key={issue.title} className="card p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color:issue.color }}/>
            <div>
              <p className="text-sm font-bold mb-1" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>{issue.title}</p>
              <p className="text-xs leading-relaxed" style={{ color:"var(--text-secondary)" }}>{issue.desc}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main BrokerSync Page ─────────────────────────────────────────────────────
export default function BrokerSync() {
  const { user } = useUser()
  const [connections, setConnections] = useState([])
  const [tab, setTab] = useState("setup")

  useEffect(()=>{
    BrokerConnection.list().then(d=>setConnections((d||[]).filter(c=>c.is_mt5_live)))
  },[])

  const liveCount = connections.length
  const totalBalance = connections.reduce((s,c)=>s+(parseFloat(c.balance)||0),0)
  const totalEquity  = connections.reduce((s,c)=>s+(parseFloat(c.equity)||0),0)

  const TABS = [
    { id:"setup",     label:"EA Setup",        icon:Terminal },
    { id:"accounts",  label:`Accounts${liveCount>0?` (${liveCount})`:""}`, icon:Wifi },
    { id:"troubleshoot",label:"Troubleshoot",   icon:AlertTriangle },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="gradient-text font-black" style={{ fontFamily:"var(--font-display)", fontSize:28 }}>Broker Sync</h1>
          <p className="mono text-xs mt-1" style={{ color:"var(--text-muted)" }}>
            Connect MT5 via Expert Advisor · {liveCount} account{liveCount!==1?"s":""} connected
          </p>
        </div>
        {liveCount>0 && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
            style={{ background:"rgba(46,213,115,0.08)", border:"1px solid rgba(46,213,115,0.2)" }}>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
            <span className="text-xs font-semibold mono" style={{ color:"var(--accent-success)" }}>
              {liveCount} account{liveCount!==1?"s":""} syncing live
            </span>
          </div>
        )}
      </div>

      {/* Summary stat cards */}
      {liveCount>0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {[
            { label:"Connected Accounts", v:liveCount,                         color:"var(--accent)",            icon:Wifi },
            { label:"Total Balance",      v:`$${totalBalance.toFixed(2)}`,     color:"var(--text-primary)",      icon:BarChart2 },
            { label:"Total Equity",       v:`$${totalEquity.toFixed(2)}`,      color:totalEquity>=totalBalance?"var(--accent-success)":"var(--accent-danger)", icon:TrendingUp },
          ].map(s=>(
            <div key={s.label} className="stat-card flex items-center gap-3 flex-none px-4 py-3">
              <div className="stat-card-icon" style={{ background:`${s.color}18` }}>
                <s.icon size={15} style={{ color:s.color }}/>
              </div>
              <div>
                <p className="stat-card-value mono" style={{ color:s.color, fontSize:18 }}>{s.v}</p>
                <p className="stat-card-label">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background:"var(--bg-elevated)" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background:tab===t.id?"var(--accent)":"transparent", color:tab===t.id?"#fff":"var(--text-secondary)", fontFamily:"var(--font-display)" }}>
            <t.icon size={13}/>{t.label}
          </button>
        ))}
      </div>

      {tab==="setup"       && <EASetupPanel/>}
      {tab==="accounts"    && (
        <div>
          {liveCount===0 ? (
            <div className="card py-16 text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background:"rgba(46,213,115,0.1)" }}>
                <WifiOff size={22} style={{ color:"var(--accent-success)" }}/>
              </div>
              <p className="font-bold mb-1" style={{ fontFamily:"var(--font-display)", color:"var(--text-primary)" }}>No accounts connected yet</p>
              <p className="text-sm mb-4" style={{ color:"var(--text-muted)" }}>Complete the EA Setup and attach the EA to a chart in MT5. Your account info will appear here.</p>
              <button onClick={()=>setTab("setup")} className="btn btn-primary">Go to EA Setup</button>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map(c=><ConnectionCard key={c.id} conn={c}/>)}
            </div>
          )}
        </div>
      )}
      {tab==="troubleshoot" && <TroubleshootPanel/>}
    </div>
  )
}
