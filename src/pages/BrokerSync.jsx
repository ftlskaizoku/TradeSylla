import { useState } from 'react';

const connectedAccounts = [
  {
    id: 1,
    broker: 'Exness',
    account: '12345678',
    type: 'MT5',
    market: 'Forex',
    status: 'active',
    lastSync: '2 min ago',
    trades: 142,
  },
];

const STEPS = [
  {
    id: 1,
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
    label: 'Download the EA',
    content: (
      <div>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
          Download the two TradeSylla Expert Advisor files. You need both — one syncs your trades, the other fetches market data.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            TradeSylla_Sync.mq5
          </button>
          <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            TradeSylla_MarketData.mq5
          </button>
        </div>
      </div>
    ),
  },
  {
    id: 2,
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
    label: 'Install in MT5',
    content: (
      <div>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
          In MetaTrader 5, open the data folder and place both <code className="mono" style={{ fontSize: '0.8rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(139,92,246,0.12)', color: 'var(--color-accent, #8b5cf6)' }}>.mq5</code> files inside the <code className="mono" style={{ fontSize: '0.8rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(139,92,246,0.12)', color: 'var(--color-accent, #8b5cf6)' }}>MQL5/Experts/</code> folder.
        </p>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {['Open MT5 → File → Open Data Folder', 'Navigate to MQL5 → Experts', 'Paste both .mq5 files here', 'Restart MetaTrader 5'].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ minWidth: '22px', height: '22px', borderRadius: '50%', background: 'rgba(139,92,246,0.2)', color: 'var(--color-accent, #8b5cf6)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 3,
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    label: 'Attach EA to a chart',
    content: (
      <div>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
          Open any chart in MT5 (the symbol and timeframe don't matter). Drag <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>TradeSylla_Sync</strong> from the Navigator panel onto the chart. Repeat for <strong style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>TradeSylla_MarketData</strong>.
        </p>
        <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" style={{ marginTop: '2px', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span style={{ fontSize: '12px', color: 'rgba(234,179,8,0.9)', lineHeight: 1.5 }}>Make sure "Allow live trading" is checked in the EA settings when attaching.</span>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
    label: 'Whitelist TradeSylla URL',
    content: (
      <div>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
          MT5 requires you to explicitly allow external connections. Add the TradeSylla endpoint to your allowed URLs list.
        </p>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
          {['Go to Tools → Options → Expert Advisors', 'Check "Allow WebRequest for listed URL"', 'Add the URL below to the list', 'Click OK and restart'].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ minWidth: '22px', height: '22px', borderRadius: '50%', background: 'rgba(139,92,246,0.2)', color: 'var(--color-accent, #8b5cf6)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '10px 14px' }}>
          <code className="mono" style={{ fontSize: '12px', color: 'var(--color-accent, #8b5cf6)', flex: 1, wordBreak: 'break-all' }}>https://tradesylla.vercel.app/api/ea-sync</code>
          <button
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: '11px', flexShrink: 0 }}
            onClick={() => navigator.clipboard?.writeText('https://tradesylla.vercel.app/api/ea-sync')}
          >
            Copy
          </button>
        </div>
      </div>
    ),
  },
  {
    id: 5,
    icon: (
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: 'You\'re live — trades sync automatically',
    content: (
      <div>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
          Once the EA is running, every closed trade is pushed to TradeSylla within seconds. No manual imports, no CSV files.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {[
            { label: 'Sync frequency', value: 'Real-time' },
            { label: 'Trade data', value: 'Full history' },
            { label: 'Market data', value: 'OHLCV candles' },
            { label: 'Manual input needed', value: 'None' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

const MARKET_TYPES = [
  { icon: '💱', label: 'Forex', desc: 'All major, minor & exotic pairs' },
  { icon: '📈', label: 'Futures', desc: 'Indices, commodities & rates' },
  { icon: '🪙', label: 'Crypto', desc: 'Spot & derivatives markets' },
  { icon: '🏦', label: 'CFDs', desc: 'Stocks, metals & energy' },
];

export default function BrokerSync() {
  const [openStep, setOpenStep] = useState(null);
  const [showSetup, setShowSetup] = useState(connectedAccounts.length === 0);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display, Syne, sans-serif)', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 6px' }}>
            <span className="gradient-text">BrokerSync</span>
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Connect your MT5 account and let trades flow in automatically.
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => setShowSetup(true)}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add connection
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
        {[
          { label: 'Connected accounts', value: connectedAccounts.length },
          { label: 'Synced trades', value: '142' },
          { label: 'Last sync', value: '2 min ago' },
          { label: 'Sync status', value: 'Live', accent: true },
        ].map(({ label, value, accent }) => (
          <div key={label} className="stat-card">
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</div>
            <div className={accent ? 'gradient-text' : ''} style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display, Syne, sans-serif)', fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Connected accounts */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display, Syne, sans-serif)', fontSize: '1rem', fontWeight: 600, margin: 0 }}>Connected accounts</h2>
          <span className="badge">{connectedAccounts.length} active</span>
        </div>

        {connectedAccounts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: '10px' }}>
            <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" style={{ margin: '0 auto 1rem', display: 'block' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 1rem', fontSize: '0.875rem' }}>No accounts connected yet</p>
            <button className="btn btn-primary" onClick={() => setShowSetup(true)}>Connect your first account</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {connectedAccounts.map((acc) => (
              <div key={acc.id} className="card-hover" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="rgba(139,92,246,0.9)" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '2px' }}>{acc.broker} · {acc.type}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    Account <span className="mono">{acc.account}</span> · {acc.trades} trades · Last sync: {acc.lastSync}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span className="badge">{acc.market}</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: acc.status === 'active' ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }}>Manage</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EA Setup Accordion */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: showSetup ? '1.25rem' : 0 }}
          onClick={() => setShowSetup(v => !v)}
        >
          <div>
            <h2 style={{ fontFamily: 'var(--font-display, Syne, sans-serif)', fontSize: '1rem', fontWeight: 600, margin: '0 0 3px' }}>How to connect MT5</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', margin: 0 }}>Step-by-step EA installation guide</p>
          </div>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ transform: showSetup ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', opacity: 0.5, flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {showSetup && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {STEPS.map((step, idx) => {
              const isOpen = openStep === step.id;
              const isDone = connectedAccounts.length > 0 && step.id < 5;
              return (
                <div
                  key={step.id}
                  style={{
                    border: `1px solid ${isOpen ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setOpenStep(isOpen ? null : step.id)}
                  >
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDone ? 'rgba(34,197,94,0.12)' : isOpen ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)',
                      color: isDone ? '#22c55e' : isOpen ? 'rgba(139,92,246,0.9)' : 'var(--color-text-secondary)',
                      transition: 'background 0.2s, color 0.2s',
                    }}>
                      {isDone ? (
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : step.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Step {idx + 1}</span>
                        {idx === 0 && <span className="badge" style={{ fontSize: '10px' }}>Start here</span>}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{step.label}</div>
                    </div>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.4, flexShrink: 0 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {isOpen && (
                    <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ paddingTop: '12px' }}>{step.content}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Supported market types */}
      <div className="card">
        <h2 style={{ fontFamily: 'var(--font-display, Syne, sans-serif)', fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem' }}>
          Supported markets
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
          {MARKET_TYPES.map(({ icon, label, desc }) => (
            <div key={label} className="card-hover" style={{ padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: '22px', marginBottom: '8px' }}>{icon}</div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '1rem', marginBottom: 0 }}>
          Any broker running MT5 is supported. The EA works with all instruments available on your account.
        </p>
      </div>

    </div>
  );
}
