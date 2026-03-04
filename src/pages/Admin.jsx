import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useUser } from '@/lib/UserContext'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'
import {
  Users, TrendingUp, BarChart3, Eye, Activity,
  RefreshCw, Shield, ArrowUpRight, Globe, BookOpen,
  Zap, Clock, UserCheck
} from 'lucide-react'

// ── Admin email — only this account can access the admin page ─────────────────
const ADMIN_EMAIL = 'flamingoxv7@gmail.com' // ← your email here

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, trend }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18` }}>
          <Icon size={18} style={{ color }} />
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ background: trend >= 0 ? 'rgba(46,213,115,0.1)' : 'rgba(255,71,87,0.1)',
              color: trend >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
            <ArrowUpRight size={11} style={{ transform: trend < 0 ? 'rotate(90deg)' : 'none' }}/>
            {Math.abs(trend)}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</p>
      <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  )
}

// ── Main Admin Dashboard ──────────────────────────────────────────────────────
export default function Admin() {
  const { user, loading } = useUser()
  const navigate = useNavigate()
  const [stats,       setStats]       = useState(null)
  const [signupsData, setSignupsData] = useState([])
  const [viewsData,   setViewsData]   = useState([])
  const [tradesData,  setTradesData]  = useState([])
  const [topPages,    setTopPages]    = useState([])
  const [fetching,    setFetching]    = useState(true)
  const [lastRefresh, setLastRefresh] = useState(null)

  // Guard — redirect if not admin
  useEffect(() => {
    if (!loading && (!user || user.email !== ADMIN_EMAIL)) {
      navigate('/Dashboard')
    }
  }, [user, loading])

  useEffect(() => {
    if (user?.email === ADMIN_EMAIL) fetchAll()
  }, [user])

  const fetchAll = async () => {
    setFetching(true)
    try {
      const [
        { data: statsData },
        { data: signups },
        { data: views },
        { data: trades },
        { data: pages },
      ] = await Promise.all([
        supabase.rpc('get_admin_stats'),
        supabase.rpc('get_signups_per_day'),
        supabase.rpc('get_views_per_day'),
        supabase.rpc('get_trades_per_day'),
        supabase.rpc('get_top_pages'),
      ])
      setStats(statsData)
      setSignupsData(signups || [])
      setViewsData(views || [])
      setTradesData(trades || [])
      setTopPages(pages || [])
      setLastRefresh(new Date())
    } catch (e) {
      console.error('Admin fetch error:', e)
    }
    setFetching(false)
  }

  if (loading || !user) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 rounded-full border-2" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}/>
    </div>
  )

  if (user.email !== ADMIN_EMAIL) return null

  const s = stats || {}

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,var(--accent),var(--accent-secondary))' }}>
              <Shield size={14} className="text-white"/>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Admin Dashboard</h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {lastRefresh ? `Last updated ${lastRefresh.toLocaleTimeString()}` : 'Loading...'}
          </p>
        </div>
        <button onClick={fetchAll} disabled={fetching}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <RefreshCw size={14} className={fetching ? 'animate-spin' : ''}/>
          {fetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}     label="Total Users"       value={s.total_users    ?? '—'} sub={`+${s.new_users_7d ?? 0} this week`}   color="#6c63ff" trend={s.new_users_24h}/>
        <StatCard icon={UserCheck} label="Active Today"      value={s.active_24h     ?? '—'} sub={`${s.active_7d ?? 0} active this week`} color="#00d4aa" trend={undefined}/>
        <StatCard icon={TrendingUp}label="Total Trades"      value={s.total_trades   ?? '—'} sub={`+${s.new_trades_7d ?? 0} this week`}   color="#2ed573" trend={s.new_trades_24h}/>
        <StatCard icon={Eye}       label="Page Views (7d)"   value={s.views_7d       ?? '—'} sub={`${s.total_views ?? 0} all time`}       color="#ffa502" trend={s.views_24h}/>
        <StatCard icon={BookOpen}  label="Playbooks Created" value={s.total_playbooks ?? '—'} sub="All users"            color="#ff6b35" trend={undefined}/>
        <StatCard icon={BarChart3} label="Backtest Sessions" value={s.total_backtests ?? '—'} sub="All users"            color="#7c5cbf" trend={undefined}/>
        <StatCard icon={Globe}     label="New Users (30d)"   value={s.new_users_30d  ?? '—'} sub="Monthly growth"       color="#3b9eff" trend={undefined}/>
        <StatCard icon={Activity}  label="Views Today"       value={s.views_24h      ?? '—'} sub={`${s.views_7d ?? 0} this week`}        color="#ff4757" trend={undefined}/>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Signups per day */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} style={{ color: 'var(--accent)' }}/>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>New Signups — Last 30 Days</h3>
          </div>
          {signupsData.length === 0 ? (
            <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              {fetching ? 'Loading...' : 'No data yet'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={signupsData} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Bar dataKey="signups" name="Signups" radius={[6,6,0,0]}>
                  {signupsData.map((_, i) => <Cell key={i} fill="var(--accent)"/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Page views per day */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Eye size={16} style={{ color: 'var(--accent-warning)' }}/>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Page Views — Last 30 Days</h3>
          </div>
          {viewsData.length === 0 ? (
            <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              {fetching ? 'Loading...' : 'No visits tracked yet'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={viewsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Line dataKey="views" name="Views" stroke="var(--accent-warning)" strokeWidth={2} dot={false}/>
                <Line dataKey="unique_users" name="Unique users" stroke="var(--accent-secondary)" strokeWidth={2} dot={false} strokeDasharray="4 2"/>
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Trades per day */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} style={{ color: 'var(--accent-success)' }}/>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Trades Logged — Last 30 Days</h3>
          </div>
          {tradesData.length === 0 ? (
            <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              {fetching ? 'Loading...' : 'No trades logged yet'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tradesData} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Bar dataKey="trades" name="Trades" radius={[6,6,0,0]}>
                  {tradesData.map((_, i) => <Cell key={i} fill="var(--accent-success)"/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top pages */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={16} style={{ color: 'var(--accent-secondary)' }}/>
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Most Visited Pages (30d)</h3>
          </div>
          {topPages.length === 0 ? (
            <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              {fetching ? 'Loading...' : 'No page views tracked yet'}
            </div>
          ) : (
            <div className="space-y-2.5">
              {topPages.slice(0,8).map((p, i) => {
                const max = topPages[0]?.views || 1
                const pct = Math.round((p.views / max) * 100)
                return (
                  <div key={p.page} className="flex items-center gap-3">
                    <span className="text-xs w-4 text-right flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.page}</span>
                        <span className="text-xs ml-2 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{p.views}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: pct + '%', background: 'linear-gradient(90deg,var(--accent),var(--accent-secondary))' }}/>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Live users indicator */}
      <div className="rounded-2xl p-5 flex items-center gap-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(46,213,115,0.1)' }}>
          <Activity size={22} style={{ color: 'var(--accent-success)' }}/>
        </div>
        <div>
          <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
            {s.active_24h ?? 0} active users in the last 24h
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Out of {s.total_users ?? 0} total registered users · {s.active_7d ?? 0} active this week
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
          <span className="text-xs font-medium" style={{ color: 'var(--accent-success)' }}>Live</span>
        </div>
      </div>
    </div>
  )
}
