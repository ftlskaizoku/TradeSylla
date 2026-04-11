import { useLanguage } from "@/lib/LanguageContext"
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/lib/UserContext';
import { toast } from '@/components/ui/toast';

// ── Tiny icon helper ──────────────────────────────────────────────────────────
const Icon = ({ d, size = 16, stroke = 'currentColor', sw = 1.8 }) => (
  <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={sw}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const D = {
  download:  'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',
  folder:    'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  chart:     'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  link:      'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  check:     'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  tick:      'M5 13l4 4L19 7',
  chevron:   'M19 9l-7 7-7-7',
  warn:      'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  plus:      'M12 4v16m8-8H4',
  key:       'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
  server:    'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
  lock:      'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  robot:     'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
};

// ── Shared micro-styles ───────────────────────────────────────────────────────
const S = {
  desc:    { color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.65, fontSize: '13px' },
  code:    { fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  subList: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' },
  subRow:  { display: 'flex', alignItems: 'center', gap: '10px' },
  num:     { minWidth: '22px', height: '22px', borderRadius: '50%', background: 'rgba(139,92,246,0.18)', color: '#a78bfa', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  warn:    { background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.22)', borderRadius: '8px', padding: '10px 12px', display: 'flex', gap: '8px', alignItems: 'flex-start' },
};

// ── EA install steps ──────────────────────────────────────────────────────────
const EA_STEPS = [
  {
    id: 1, badge: 'Start here',
    iconD: D.download,
    label: 'Download both EA files',
    Body: () => (
      <div>
        <p style={S.desc}>
          You need two Expert Advisor files. <b style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>TradeSylla_Sync</b> pushes your closed trades in real-time.{' '}
          <b style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>TradeSylla_MarketData</b> streams OHLCV candles for chart display (admin-only).
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <a href="/downloads/TradeSylla_Sync.mq5" download className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <Icon d={D.download} size={14} stroke="#fff" />
            TradeSylla_Sync.mq5
          </a>
          <a href="/downloads/TradeSylla_MarketData.mq5" download className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <Icon d={D.download} size={14} />
            TradeSylla_MarketData.mq5
          </a>
        </div>
      </div>
    ),
  },
  {
    id: 2, iconD: D.folder,
    label: 'Install in MetaTrader 5',
    Body: () => (
      <div>
        <p style={S.desc}>
          Place both <code style={S.code}>.mq5</code> files in your MT5 Experts folder, then restart the terminal.
        </p>
        <div style={S.subList}>
          {['Open MT5 → File → Open Data Folder', 'Navigate to MQL5 → Experts', 'Paste both .mq5 files here', 'Restart MetaTrader 5'].map((t, i) => (
            <div key={i} style={S.subRow}><span style={S.num}>{i+1}</span><span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{t}</span></div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 3, iconD: D.chart,
    label: 'Attach EAs to any chart',
    Body: () => (
      <div>
        <p style={S.desc}>
          Open any chart in MT5 — symbol and timeframe don't matter. Drag both EAs from the Navigator onto it. Each EA needs its own chart.
        </p>
        <div style={S.warn}>
          <Icon d={D.warn} size={13} stroke="rgba(234,179,8,0.9)" />
          <span style={{ fontSize: '12px', color: 'rgba(180,138,0,0.95)', lineHeight: 1.5 }}>
            Enable "Allow live trading" and "Allow DLL imports" in the EA settings when attaching.
          </span>
        </div>
      </div>
    ),
  },
  {
    id: 4, iconD: D.link,
    label: 'Whitelist TradeSylla URL in MT5',
    Body: ({ onCopy }) => (
      <div>
        <p style={S.desc}>
          MT5 blocks external HTTP by default. Add TradeSylla's endpoint to the allowed URL list.
        </p>
        <div style={{ ...S.subList, marginBottom: '12px' }}>
          {["Tools → Options → Expert Advisors", 'Tick "Allow WebRequest for listed URL"', 'Paste the URL below into the list', 'Click OK and restart MT5'].map((t, i) => (
            <div key={i} style={S.subRow}><span style={S.num}>{i+1}</span><span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{t}</span></div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '8px', padding: '10px 14px' }}>
          <code style={{ ...S.code, flex: 1, wordBreak: 'break-all', background: 'none', padding: 0 }}>
            https://tradesylla.vercel.app/api/ea-sync
          </code>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px', flexShrink: 0 }}
            onClick={() => { navigator.clipboard?.writeText('https://tradesylla.vercel.app/api/ea-sync'); onCopy?.(); }}>
            Copy
          </button>
        </div>
      </div>
    ),
  },
  {
    id: 5, iconD: D.key,
    label: 'Paste your EA token in the EA inputs',
    Body: ({ token }) => (
      <div>
        <p style={S.desc}>
          When attaching each EA, paste your personal token in the <b style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>Token</b> field in the EA parameters. This links the EA to your TradeSylla account.
        </p>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your EA token</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <code style={{ ...S.code, flex: 1, background: 'none', padding: 0, wordBreak: 'break-all' }}>
              {token || '— visible in Settings → API Keys —'}
            </code>
            {token && (
              <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px', flexShrink: 0 }}
                onClick={() => navigator.clipboard?.writeText(token)}>
                Copy
              </button>
            )}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 6, iconD: D.check,
    label: "You're live — trades sync automatically",
    Body: () => (
      <div>
        <p style={S.desc}>
          Once both EAs are running, every closed trade is pushed within seconds. No CSV exports, no manual imports.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[['Sync frequency','Real-time'],['Trade history','Full history'],['Market data','OHLCV candles'],['Manual input','None needed']].map(([l,v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>{l}</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

const MARKETS = [
  { emoji: '💱', label: 'Forex',   desc: 'Major, minor & exotic pairs' },
  { emoji: '📈', label: 'Futures', desc: 'Indices, commodities & rates' },
  { emoji: '🪙', label: 'Crypto',  desc: 'Spot & derivatives' },
  { emoji: '🏦', label: 'CFDs',    desc: 'Stocks, metals & energy' },
];


// ── Direct MT5 Connection Form ────────────────────────────────────────────────
function DirectMT5Form() {
  const { user } = useUser()
  const [form, setForm] = useState({
    broker_name: '', mt5_login: '', mt5_server: '', investor_password: '',
  })
  const [step,    setStep]    = useState('form')  // form | syncing | done | error
  const [message, setMessage] = useState('')
  const [imported,setImported]= useState(0)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const connect = async () => {
    if (!form.mt5_login || !form.mt5_server || !form.investor_password) {
      toast.error('Please fill in all required fields'); return
    }
    setStep('syncing'); setMessage('Connecting to MT5 broker...')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token || ''

      const res = await fetch('/api/mt5-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
        body: JSON.stringify({ ...form, user_id: user?.id })
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setStep('error'); setMessage(data.error || 'Connection failed'); return
      }

      setImported(data.imported || 0)
      setStep('done')
      setMessage(data.message || 'Sync complete')
    } catch (e) {
      setStep('error'); setMessage('Network error: ' + e.message)
    }
  }

  const reset = () => { setStep('form'); setMessage(''); setImported(0) }

  const inputStyle = {
    width: '100%', height: '40px', borderRadius: '10px', padding: '0 12px',
    fontSize: '13px', border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)',
    outline: 'none', fontFamily: 'var(--font-mono)',
  }
  const labelStyle = { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px', display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em' }

  if (step === 'syncing') return (
    <div style={{ border: '1px solid rgba(139,92,246,0.25)', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }}>
        <Icon d={D.server} size={20} stroke="#a78bfa"/>
      </div>
      <p style={{ fontWeight: 600, marginBottom: '6px' }}>Connecting to MT5...</p>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{message}</p>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (step === 'done') return (
    <div style={{ border: '1px solid rgba(46,213,115,0.25)', borderRadius: '12px', padding: '2rem', textAlign: 'center', background: 'rgba(46,213,115,0.03)' }}>
      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(46,213,115,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
        <Icon d={D.tick} size={20} stroke="#2ed573" sw={2.5}/>
      </div>
      <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '6px', color: 'var(--accent-success)' }}>{ t("bs_connected") }</p>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
        {imported > 0 ? `${imported} trades imported from ${form.broker_name || form.mt5_server}` : message}
      </p>
      <button className="btn btn-secondary" onClick={reset} style={{ fontSize: '12px' }}>{ t("bs_connect_another") }</button>
    </div>
  )

  if (step === 'error') return (
    <div style={{ border: '1px solid rgba(255,71,87,0.25)', borderRadius: '12px', padding: '2rem', textAlign: 'center', background: 'rgba(255,71,87,0.03)' }}>
      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,71,87,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
        <Icon d={D.warn} size={20} stroke="#ff4757"/>
      </div>
      <p style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '6px', color: 'var(--accent-danger)' }}>{ t("bs_failed") }</p>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: 380, margin: '0 auto 1.5rem' }}>{message}</p>
      <button className="btn btn-secondary" onClick={reset} style={{ fontSize: '12px' }}>{ t("bs_try_again") }</button>
    </div>
  )

  return (
    <div style={{ border: '1px solid rgba(139,92,246,0.2)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', background: 'rgba(139,92,246,0.06)', borderBottom: '1px solid rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon d={D.server} size={16} stroke="#a78bfa"/>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Direct MT5 Connection</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Read-only via investor password — no EA install required</div>
        </div>
      </div>
      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Info note */}
        <div style={S.warn}>
          <Icon d={D.warn} size={13} stroke="rgba(234,179,8,0.9)"/>
          <span style={{ fontSize: '12px', color: 'rgba(180,138,0,0.95)', lineHeight: 1.5 }}>
            Use your <strong>investor password</strong> (read-only). Never enter your master trading password.
            Your credentials are encrypted and stored securely.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Broker name</label>
            <input style={inputStyle} value={form.broker_name}
              onChange={e => set('broker_name', e.target.value)} placeholder={t("bs_broker_ph")}/>
          </div>
          <div>
            <label style={labelStyle}>MT5 Account Login *</label>
            <input style={inputStyle} value={form.mt5_login}
              onChange={e => set('mt5_login', e.target.value)} placeholder={t("bs_login_ph")} type="number"/>
          </div>
          <div>
            <label style={labelStyle}>Broker Server *</label>
            <input style={inputStyle} value={form.mt5_server}
              onChange={e => set('mt5_server', e.target.value)} placeholder={t("bs_server_ph")}/>
          </div>
          <div>
            <label style={labelStyle}>Investor Password *</label>
            <input style={inputStyle} value={form.investor_password}
              onChange={e => set('investor_password', e.target.value)}
              placeholder="••••••••" type="password" autoComplete="new-password"/>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[[D.lock,'Read-only access'],[D.check,'Auto-imports all closed trades'],[D.server,'Works with any MT5 broker']].map(([d,t]) => (
            <div key={t} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'11px', color:'var(--text-muted)', padding:'4px 10px', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'20px' }}>
              <Icon d={d} size={11} stroke="#a78bfa"/>{t}
            </div>
          ))}
        </div>

        <button className="btn btn-primary" onClick={connect}
          style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px' }}>
          <Icon d={D.link} size={14} stroke="#fff"/> Connect & Import Trades
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BrokerSync({ userToken = null }) {
  const { user }    = useUser();
  const [method,    setMethod]    = useState('ea');
  const [openStep,  setOpenStep]  = useState(1);
  const [guideOpen, setGuideOpen] = useState(true);
  const [accounts,  setAccounts]  = useState([]);
  const [connLoading, setConnLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('broker_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setAccounts(data || []); setConnLoading(false); });
  }, [user?.id]);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display, Syne, sans-serif)', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 6px' }}>
            <span className="gradient-text">{ t("bs_title") }</span>
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '0.875rem' }}>
            Connect your MT5 account and let trades flow in automatically.
          </p>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon d={D.plus} size={14} stroke="#fff" sw={2.5} />
          Add connection
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
        {[
          { label: 'Connected',     value: accounts.length },
          { label: 'Synced trades', value: '142' },
          { label: 'Last sync',     value: '2 min ago' },
          { label: 'Status',        value: 'Live', accent: true },
        ].map(({ label, value, accent }) => (
          <div key={label} className="stat-card">
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
            <div className={accent ? 'gradient-text' : ''} style={{ fontSize: '1.3rem', fontFamily: 'var(--font-display, Syne, sans-serif)', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Connected accounts */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: accounts.length ? '1rem' : 0 }}>
          <h2 style={{ fontFamily: 'var(--font-display, Syne, sans-serif)', fontSize: '1rem', fontWeight: 600, margin: 0 }}>{ t("bs_connected_accounts") }</h2>
          <span className="badge">{accounts.length} active</span>
        </div>

        {accounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '10px', marginTop: '1rem' }}>
            <Icon d={D.link} size={36} stroke="rgba(255,255,255,0.15)" sw={1.2} />
            <p style={{ color: 'var(--color-text-secondary)', margin: '1rem 0', fontSize: '0.875rem' }}>{ t("bs_no_accounts") }</p>
            <button className="btn btn-primary" onClick={() => setGuideOpen(true)}>{ t("bs_connect_first") }</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {accounts.map((acc) => (
              <div key={acc.id} className="card-hover" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon d={D.robot} size={18} stroke="rgba(139,92,246,0.9)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '2px' }}>{acc.broker} · {acc.type}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    Account <span className="mono">{acc.account}</span> · {acc.trades} trades · synced {acc.lastSync}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span className="badge">{acc.market}</span>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', padding: '2px 7px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px' }}>{acc.method}</span>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: acc.status === 'active' ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }}>{ t("bs_manage") }</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connection guide */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>

        {/* Guide header */}
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: guideOpen ? '1.5rem' : 0 }}
          onClick={() => setGuideOpen(v => !v)}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--font-display, Syne, sans-serif)', fontSize: '1rem', fontWeight: 600, margin: '0 0 3px' }}>{ t("bs_how_to") }</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', margin: 0 }}>Choose a connection method</p>
          </div>
          <div style={{ transform: guideOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.5 }}>
            <Icon d={D.chevron} size={16} sw={2} />
          </div>
        </div>

        {guideOpen && (
          <>
            {/* Method selector */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>

              {/* EA tab */}
              <button
                onClick={() => setMethod('ea')}
                style={{
                  flex: 1, minWidth: '200px', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                  border: method === 'ea' ? '1.5px solid rgba(139,92,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
                  background: method === 'ea' ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: method === 'ea' ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <Icon d={D.robot} size={15} stroke={method === 'ea' ? '#a78bfa' : 'var(--color-text-secondary)'} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: method === 'ea' ? '#a78bfa' : 'var(--color-text-primary)' }}>{ t("bs_ea_connection") }</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Expert Advisor · Real-time</div>
                  </div>
                  {method === 'ea' && <span className="badge" style={{ fontSize: '10px' }}>Active</span>}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Install two lightweight EAs in MT5. Trades and market data stream automatically in real-time.
                </p>
              </button>

              {/* Direct credentials tab */}
              <button
                onClick={() => setMethod('direct')}
                style={{
                  flex: 1, minWidth: '200px', padding: '14px 16px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left', position: 'relative',
                  border: method === 'direct' ? '1.5px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  background: method === 'direct' ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.02)',
                  transition: 'all 0.2s',
                }}
              >

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: method === 'direct' ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
                    <Icon d={D.server} size={15} stroke={method === 'direct' ? '#a78bfa' : 'var(--color-text-secondary)'} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: method === 'direct' ? '#a78bfa' : 'var(--color-text-primary)' }}>{ t("bs_direct") }</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>MT5 login · No EA needed</div>
                  </div>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Enter your MT5 server, login and investor password. TradeSylla connects directly — no EA install required.
                </p>
              </button>
            </div>

            {/* ── EA guide ── */}
            {method === 'ea' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {EA_STEPS.map((step, idx) => {
                  const isOpen = openStep === step.id;
                  const isDone = accounts.length > 0 && step.id < EA_STEPS.length;
                  return (
                    <div key={step.id} style={{
                      border: `1px solid ${isOpen ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: '10px', overflow: 'hidden', transition: 'border-color 0.2s',
                    }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => setOpenStep(isOpen ? null : step.id)}
                      >
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isDone ? 'rgba(34,197,94,0.12)' : isOpen ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                          color: isDone ? '#22c55e' : isOpen ? '#a78bfa' : 'var(--color-text-secondary)',
                          transition: 'all 0.2s',
                        }}>
                          {isDone
                            ? <Icon d={D.tick} size={15} stroke="currentColor" sw={2.5} />
                            : <Icon d={step.iconD} size={15} stroke="currentColor" sw={1.8} />
                          }
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1px' }}>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Step {idx + 1}</span>
                            {step.badge && <span className="badge" style={{ fontSize: '10px' }}>{step.badge}</span>}
                          </div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{step.label}</div>
                        </div>
                        <div style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.4 }}>
                          <Icon d={D.chevron} size={14} sw={2} />
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ paddingTop: '12px' }}>
                            <step.Body token={userToken} onCopy={() => {}} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Direct MT5 connection ── */}
            {method === 'direct' && <DirectMT5Form />}
          </>
        )}
      </div>

      {/* Supported markets */}
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display, Syne, sans-serif)', fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem' }}>
          Supported markets
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          {MARKETS.map(({ emoji, label, desc }) => (
            <div key={label} className="card-hover" style={{ padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: '22px', marginBottom: '8px' }}>{emoji}</div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '1rem', marginBottom: 0 }}>
          Any broker running MT5 is supported — the EA works with all instruments available on your account.
        </p>
      </div>

    </div>
  );
}
