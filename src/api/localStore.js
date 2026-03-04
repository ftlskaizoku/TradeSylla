/**
 * localStore.js — replaces base44 SDK with pure localStorage CRUD
 * Each entity gets its own namespace key prefixed with "ts_"
 */

function getCollection(name) {
  try { return JSON.parse(localStorage.getItem('ts_' + name) || '[]') }
  catch { return [] }
}
function setCollection(name, data) {
  localStorage.setItem('ts_' + name, JSON.stringify(data))
}

function createEntity(name) {
  return {
    async list(filters) {
      let records = getCollection(name)
      if (filters) {
        Object.entries(filters).forEach(([k, v]) => {
          if (v !== undefined && v !== null && v !== '') {
            records = records.filter(r => r[k] === v)
          }
        })
      }
      return records
    },
    async get(id) {
      return getCollection(name).find(r => r.id === id) || null
    },
    async create(data) {
      const records = getCollection(name)
      const rec = {
        ...data,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      records.push(rec)
      setCollection(name, records)
      return rec
    },
    async update(id, data) {
      const records = getCollection(name)
      const idx = records.findIndex(r => r.id === id)
      if (idx === -1) throw new Error('Record not found: ' + id)
      records[idx] = { ...records[idx], ...data, updated_at: new Date().toISOString() }
      setCollection(name, records)
      return records[idx]
    },
    async delete(id) {
      const records = getCollection(name).filter(r => r.id !== id)
      setCollection(name, records)
      return { id }
    },
  }
}

// Entity instances
export const Trade            = createEntity('trades')
export const Playbook         = createEntity('playbooks')
export const BacktestSession  = createEntity('backtest_sessions')
export const BrokerConnection = createEntity('broker_connections')
export const SylledgeInsight  = createEntity('sylledge_insights')

// User profile (no real auth — local only)
const USER_KEY = 'ts_user'
export const localUser = {
  get() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null') }
    catch { return null }
  },
  set(data) {
    const existing = this.get() || {}
    const updated = { ...existing, ...data, updated_at: new Date().toISOString() }
    if (!updated.id) updated.id = crypto.randomUUID()
    localStorage.setItem(USER_KEY, JSON.stringify(updated))
    return updated
  },
  getOrCreate(defaults) {
    const existing = this.get()
    if (existing) return existing
    return this.set({ full_name: 'Trader', email: '', ...(defaults || {}) })
  },
}
