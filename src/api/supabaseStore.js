// src/api/supabaseStore.js
// FIX: Removed orphaned `if (error)` after the pagination while loop.
// `error` was declared with `const` inside the loop block — accessing it
// outside threw `ReferenceError: error is not defined` → caught by catch(e)
// → returned [] → every Trade.list() call returned empty array even though
// the trades were in the database.

import { supabase } from "@/lib/supabase"

// ── Image helpers (kept intact) ───────────────────────────────────────────────
const IMAGE_PREFIX = "data:image"

function stripAndCacheImages(payload) {
  if (!payload || typeof payload !== "object") return payload
  const out = { ...payload }
  for (const key of Object.keys(out)) {
    const val = out[key]
    if (typeof val === "string" && val.startsWith(IMAGE_PREFIX) && val.length > 5000) {
      const cacheKey = `ts_img_${key}_${Date.now()}`
      try { localStorage.setItem(cacheKey, val) } catch {}
      out[key] = `__cached__${cacheKey}`
    } else if (Array.isArray(val)) {
      out[key] = val.map(item => {
        if (item && typeof item === "object" && item.url?.startsWith(IMAGE_PREFIX) && item.url.length > 5000) {
          const cacheKey = `ts_img_${key}_${item.id || Date.now()}`
          try { localStorage.setItem(cacheKey, item.url) } catch {}
          return { ...item, url: `__cached__${cacheKey}` }
        }
        return item
      })
    }
  }
  return out
}

function rehydrateImages(record) {
  if (!record || typeof record !== "object") return record
  const out = { ...record }
  for (const key of Object.keys(out)) {
    const val = out[key]
    if (typeof val === "string" && val.startsWith("__cached__")) {
      const cacheKey = val.replace("__cached__", "")
      const cached = localStorage.getItem(cacheKey)
      out[key] = cached || ""
    } else if (Array.isArray(val)) {
      out[key] = val.map(item => {
        if (item && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("__cached__")) {
          const cacheKey = item.url.replace("__cached__", "")
          const cached = localStorage.getItem(cacheKey)
          return { ...item, url: cached || "" }
        }
        return item
      })
    }
  }
  return out
}

// ── Local storage fallback entity ─────────────────────────────────────────────
function getCollection(name) {
  try { return JSON.parse(localStorage.getItem("ts_" + name) || "[]") }
  catch { return [] }
}
function setCollection(name, data) {
  localStorage.setItem("ts_" + name, JSON.stringify(data))
}

function localEntity(name) {
  return {
    async list(filters) {
      let records = getCollection(name)
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== "") records = records.filter(r => r[k] === v)
        })
      }
      return records
    },
    async get(id) { return getCollection(name).find(r => r.id === id) || null },
    async create(data) {
      const records = getCollection(name)
      const rec = { ...data, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      records.push(rec)
      setCollection(name, records)
      return rec
    },
    async update(id, data) {
      const records = getCollection(name)
      const idx = records.findIndex(r => r.id === id)
      if (idx === -1) throw new Error("Record not found: " + id)
      records[idx] = { ...records[idx], ...data, updated_at: new Date().toISOString() }
      setCollection(name, records)
      return records[idx]
    },
    async delete(id) {
      setCollection(name, getCollection(name).filter(r => r.id !== id))
      return { id }
    },
  }
}

// ── Supabase entity factory ───────────────────────────────────────────────────
function sbEntity(table) {
  return {
    async list(filters) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return localEntity(table).list(filters)

        let q = supabase
          .from(table)
          .select("*")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })

        if (filters) {
          Object.entries(filters).forEach(([k, v]) => { if (v) q = q.eq(k, v) })
        }

        // ─── FIXED: paginate without the orphaned `if (error)` after the loop ─
        // Previous bug: `const { data: page, error }` was scoped to the loop block.
        // Accessing `error` after the loop threw ReferenceError → caught → return []
        let allData = []
        let from    = 0
        const PAGE  = 1000

        while (true) {
          const { data: page, error: pageError } = await q.range(from, from + PAGE - 1)
          if (pageError) {
            console.error(`[supabaseStore] ${table} list error:`, pageError.message)
            break
          }
          if (!page || page.length === 0) break
          allData = allData.concat(page)
          if (page.length < PAGE) break
          from += PAGE
        }
        // ─────────────────────────────────────────────────────────────────────
        // NO `if (error)` here — `error` is not in scope outside the loop

        return allData.map(rehydrateImages)
      } catch (e) {
        console.error(`[supabaseStore] ${table} list exception:`, e.message)
        return []
      }
    },

    async get(id) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return localEntity(table).get(id)
        const { data, error } = await supabase.from(table).select("*").eq("id", id).single()
        if (error) { console.error(`[supabaseStore] ${table} get:`, error.message); return null }
        return rehydrateImages(data)
      } catch (e) { console.error(`[supabaseStore] ${table} get exception:`, e.message); return null }
    },

    async create(payload) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return localEntity(table).create(payload)
        const clean = stripAndCacheImages(payload)
        const { data, error } = await supabase
          .from(table)
          .insert([{ ...clean, user_id: session.user.id }])
          .select()
          .single()
        if (error) { console.error(`[supabaseStore] ${table} create:`, error.message); throw error }
        return rehydrateImages(data)
      } catch (e) { console.error(`[supabaseStore] ${table} create exception:`, e.message); throw e }
    },

    async update(id, data) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return localEntity(table).update(id, data)
        const clean = stripAndCacheImages(data)
        const { data: updated, error } = await supabase
          .from(table)
          .update({ ...clean, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single()
        if (error) { console.error(`[supabaseStore] ${table} update:`, error.message); throw error }
        return rehydrateImages(updated)
      } catch (e) { console.error(`[supabaseStore] ${table} update exception:`, e.message); throw e }
    },

    async delete(id) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return localEntity(table).delete(id)
        const { error } = await supabase.from(table).delete().eq("id", id)
        if (error) { console.error(`[supabaseStore] ${table} delete:`, error.message); throw error }
        return { id }
      } catch (e) { console.error(`[supabaseStore] ${table} delete exception:`, e.message); throw e }
    },
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────
export const Trade            = sbEntity("trades")
export const Playbook         = sbEntity("playbooks")
export const BacktestSession  = sbEntity("backtest_sessions")
export const BrokerConnection = sbEntity("broker_connections")
export const SylledgeInsight  = sbEntity("sylledge_insights")

// ── Local user profile fallback ───────────────────────────────────────────────
export const localUser = {
  getOrCreate(defaults) {
    const stored = localStorage.getItem("ts_user_profile")
    if (stored) { try { return JSON.parse(stored) } catch {} }
    const profile = { ...defaults, id: crypto.randomUUID(), created_at: new Date().toISOString() }
    localStorage.setItem("ts_user_profile", JSON.stringify(profile))
    return profile
  },
  set(data) {
    const existing = this.getOrCreate({})
    const updated  = { ...existing, ...data, updated_at: new Date().toISOString() }
    localStorage.setItem("ts_user_profile", JSON.stringify(updated))
    return updated
  },
}

// ── Migrate localStorage → Supabase (one-time on first login) ─────────────────
export async function migrateLocalToSupabase(userId) {
  const alreadyMigrated = localStorage.getItem("ts_migrated_" + userId)
  if (alreadyMigrated) return { migrated: 0 }

  let total = 0
  const tables = [
    { key: "trades",             table: "trades"             },
    { key: "playbooks",          table: "playbooks"          },
    { key: "backtest_sessions",  table: "backtest_sessions"  },
    { key: "broker_connections", table: "broker_connections" },
    { key: "sylledge_insights",  table: "sylledge_insights"  },
  ]

  for (const { key, table } of tables) {
    const local = getCollection(key)
    if (!local.length) continue
    for (const item of local) {
      const { id, ...rest } = item
      try { await supabase.from(table).insert([{ ...rest, user_id: userId }]); total++ }
      catch {}
    }
  }

  localStorage.setItem("ts_migrated_" + userId, "1")
  return { migrated: total }
}

// ── Real-time subscription helper ─────────────────────────────────────────────
export function subscribeToTable(table, onChange) {
  let channel = null
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    channel = supabase
      .channel(`realtime_${table}_${session.user.id}`)
      .on("postgres_changes", {
        event:  "*",
        schema: "public",
        table,
        filter: `user_id=eq.${session.user.id}`,
      }, () => onChange())
      .subscribe()
  })
  return () => { if (channel) supabase.removeChannel(channel) }
}
