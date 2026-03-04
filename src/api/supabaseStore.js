/**
 * supabaseStore.js
 * Drop-in replacement for localStore.js — same API (list/get/create/update/delete)
 * but backed by Supabase. Falls back to localStorage if user is not authenticated.
 */
import { supabase } from '@/lib/supabase'

// ── localStorage fallback (same as original localStore) ───────────────────────
function getCollection(name) {
  try { return JSON.parse(localStorage.getItem('ts_' + name) || '[]') } catch { return [] }
}
function setCollection(name, data) {
  localStorage.setItem('ts_' + name, JSON.stringify(data))
}

function localEntity(name) {
  return {
    async list(filters) {
      let records = getCollection(name)
      if (filters) Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') records = records.filter(r => r[k] === v)
      })
      return records
    },
    async get(id)       { return getCollection(name).find(r => r.id === id) || null },
    async create(data)  {
      const records = getCollection(name)
      const rec = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      records.push(rec); setCollection(name, records); return rec
    },
    async update(id, data) {
      const records = getCollection(name)
      const idx = records.findIndex(r => r.id === id)
      if (idx === -1) throw new Error('Not found: ' + id)
      records[idx] = { ...records[idx], ...data, updated_at: new Date().toISOString() }
      setCollection(name, records); return records[idx]
    },
    async delete(id)    { setCollection(name, getCollection(name).filter(r => r.id !== id)); return { id } },
  }
}

// ── Supabase entity factory ───────────────────────────────────────────────────
function sbEntity(table) {
  return {
    async list(filters) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return localEntity(table).list(filters)
      let q = supabase.from(table).select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })
      if (filters) Object.entries(filters).forEach(([k, v]) => { if (v) q = q.eq(k, v) })
      const { data, error } = await q
      if (error) { console.error(table, error); return [] }
      return data || []
    },
    async get(id) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return localEntity(table).get(id)
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single()
      if (error) return null
      return data
    },
    async create(payload) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return localEntity(table).create(payload)
      // Remove undefined/null screenshots (base64) to avoid size issues — store separately if needed
      const clean = { ...payload }
      if (Array.isArray(clean.screenshots) && clean.screenshots.length > 0) {
        clean.screenshots = clean.screenshots.map(s => ({ id: s.id, name: s.name, url: s.url }))
      }
      const { data, error } = await supabase.from(table).insert([{ ...clean, user_id: session.user.id }]).select().single()
      if (error) { console.error('create', table, error); throw error }
      return data
    },
    async update(id, payload) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return localEntity(table).update(id, payload)
      const { data, error } = await supabase.from(table).update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) { console.error('update', table, error); throw error }
      return data
    },
    async delete(id) {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return localEntity(table).delete(id)
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) { console.error('delete', table, error); throw error }
      return { id }
    },
  }
}

// ── Exports — same names as localStore.js ────────────────────────────────────
export const Trade            = sbEntity('trades')
export const Playbook         = sbEntity('playbooks')
export const BacktestSession  = sbEntity('backtest_sessions')
export const BrokerConnection = sbEntity('broker_connections')
export const SylledgeInsight  = sbEntity('sylledge_insights')

// ── User profile ──────────────────────────────────────────────────────────────
export const localUser = {
  getOrCreate(defaults) {
    const stored = localStorage.getItem('ts_user_profile')
    if (stored) { try { return JSON.parse(stored) } catch {} }
    const profile = { ...defaults, id: crypto.randomUUID(), created_at: new Date().toISOString() }
    localStorage.setItem('ts_user_profile', JSON.stringify(profile))
    return profile
  },
  set(data) {
    const existing = this.getOrCreate({})
    const updated  = { ...existing, ...data, updated_at: new Date().toISOString() }
    localStorage.setItem('ts_user_profile', JSON.stringify(updated))
    return updated
  },
}

// ── Migrate localStorage → Supabase (called once after first login) ───────────
export async function migrateLocalToSupabase(userId) {
  const alreadyMigrated = localStorage.getItem('ts_migrated_' + userId)
  if (alreadyMigrated) return { migrated: 0 }

  let total = 0
  const tables = [
    { key: 'trades',             table: 'trades'             },
    { key: 'playbooks',          table: 'playbooks'          },
    { key: 'backtest_sessions',  table: 'backtest_sessions'  },
    { key: 'broker_connections', table: 'broker_connections' },
    { key: 'sylledge_insights',  table: 'sylledge_insights'  },
  ]

  for (const { key, table } of tables) {
    const local = getCollection(key)
    if (!local.length) continue
    for (const item of local) {
      const { id, ...rest } = item
      try {
        await supabase.from(table).insert([{ ...rest, user_id: userId }])
        total++
      } catch {}
    }
  }

  localStorage.setItem('ts_migrated_' + userId, '1')
  return { migrated: total }
}

// ── Real-time sync across devices ────────────────────────────────────────────
// Call this in any page to get live updates when data changes on another device
// Usage: const unsub = subscribeToTable('trades', () => reloadTrades())
export function subscribeToTable(table, onChange) {
  let userId = null
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    userId = session.user.id
    const channel = supabase
      .channel(`realtime_${table}_${userId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table,
        filter: `user_id=eq.${userId}`,
      }, () => onChange())
      .subscribe()
    // Store channel ref for cleanup
    supabase._tradesyllaChannels = supabase._tradesyllaChannels || {}
    supabase._tradesyllaChannels[table] = channel
  })
  // Return unsubscribe function
  return () => {
    const ch = supabase._tradesyllaChannels?.[table]
    if (ch) supabase.removeChannel(ch)
  }
}
