// api/ea-sync.js  v5.0  — TOKEN FRAGMENTATION FIX
// ─────────────────────────────────────────────────────────────────────────────
// THE BUG: token lookup was only checking user_token column.
// Users who generated their token from the old BrokerSync page have it stored
// in ea_token — causing 401 auth failures even with a valid token.
//
// FIX: try all three columns in order:
//   1. user_token  → Settings → API Keys → Sync EA Token (primary)
//   2. ea_token    → old BrokerSync page (legacy users)
//   3. admin_token → never intended here, but prevents total lockout
//
// Also fixed: reads token from Authorization header (where the EA sends it),
// NOT from body.token (which is what mt5-sync.js incorrectly expected).
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js"

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" })
  if (!SUPA_URL || !SUPA_KEY)  return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars" })

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  // EA sends: Authorization: Bearer <token>
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim()
  if (!token) return res.status(401).json({
    error: "Missing Authorization header — paste your Sync EA Token into the UserToken field in EA inputs"
  })

  // Try all 3 token columns
  let profile = null
  for (const col of ["user_token", "ea_token", "admin_token"]) {
    const { data } = await supabase.from("profiles").select("id").eq(col, token).maybeSingle()
    if (data) { profile = data; break }
  }
  if (!profile) return res.status(401).json({
    error: "Invalid token — go to Settings → API Keys, regenerate the Sync EA Token, paste the new value into UserToken in the EA"
  })

  const userId = profile.id
  let body
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body }
  catch { return res.status(400).json({ error: "Invalid JSON body" }) }

  // ── Heartbeat (no trade data) ──────────────────────────────────────────────
  const trades = Array.isArray(body) ? body : (body.trades || (body.ticket || body.mt5_ticket ? [body] : []))
  if (!trades.length) {
    if (body.account_login || body.login) {
      await supabase.from("broker_connections").upsert({
        user_id: userId,
        mt5_login: String(body.account_login || body.login),
        account_name: body.account_name || body.name || "",
        broker_name: body.broker || "MT5",
        server: body.server || "",
        balance: parseFloat(body.balance) || 0,
        equity: parseFloat(body.equity) || 0,
        currency: body.currency || "USD",
        leverage: parseInt(body.leverage) || 0,
        is_demo: body.is_demo === true || body.is_demo === "true",
        is_mt5_live: true, status: "connected",
        last_sync: new Date().toISOString(),
      }, { onConflict: "user_id,mt5_login" })
    }
    return res.status(200).json({ success: true, message: "heartbeat ok", inserted: 0, updated: 0, skipped: 0 })
  }

  // ── Batch dedup ────────────────────────────────────────────────────────────
  const allTickets = trades.map(t => String(t.ticket || t.mt5_ticket || "")).filter(Boolean)
  const { data: existing } = await supabase.from("trades").select("id,mt5_ticket,account_login")
    .eq("user_id", userId).in("mt5_ticket", allTickets)
  const existingMap = new Map()
  ;(existing || []).forEach(r => existingMap.set(`${r.mt5_ticket}:${r.account_login || ""}`, r.id))

  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] }

  for (const raw of trades) {
    try {
      const ticket = String(raw.ticket || raw.mt5_ticket || "")
      const login  = String(raw.account_login || "")
      if (!ticket) { results.errors.push("Missing ticket"); continue }

      const pnl      = parseFloat(raw.pnl) || 0
      const swap     = parseFloat(raw.swap || 0)
      const comm     = parseFloat(raw.commission || 0)
      const totalPnl = parseFloat(raw.total_pnl ?? (pnl + swap + comm))
      const outcome  = totalPnl > 0.005 ? "WIN" : totalPnl < -0.005 ? "LOSS" : "BREAKEVEN"

      const payload = {
        user_id: userId, mt5_ticket: ticket, account_login: login,
        symbol:      (raw.symbol || "UNKNOWN").toUpperCase(),
        direction:   (raw.direction || "BUY").toUpperCase(),
        entry_price: parseFloat(raw.entry_price) || 0,
        exit_price:  parseFloat(raw.exit_price)  || 0,
        lot_size:    parseFloat(raw.lot_size)     || 0,
        pnl, swap, commission: comm, total_pnl: totalPnl,
        pips:        parseFloat(raw.pips)         || 0,
        sl:          parseFloat(raw.sl)            || 0,
        tp:          parseFloat(raw.tp)            || 0,
        rr:          parseFloat(raw.rr)            || 0,
        duration_min:parseInt(raw.duration_min)   || 0,
        outcome, session: raw.session || null, timeframe: raw.timeframe || null,
        entry_time: raw.entry_time || null, exit_time: raw.exit_time || null,
        notes: raw.notes ? `[MT5 EA] ${raw.notes}` : "[MT5 EA] Auto-synced",
      }

      const mapKey    = `${ticket}:${login}`
      const existingId = existingMap.get(mapKey)
      if (existingId) {
        const { error } = await supabase.from("trades").update(payload).eq("id", existingId)
        if (error) results.errors.push(`Update ${ticket}: ${error.message}`)
        else results.updated++
      } else {
        const { error } = await supabase.from("trades").insert({ ...payload, quality: 5 })
        if (error) { if (error.code === "23505") results.skipped++; else results.errors.push(`Insert ${ticket}: ${error.message}`) }
        else { results.inserted++; existingMap.set(mapKey, ticket) }
      }
    } catch (e) { results.errors.push(`Error: ${e.message}`) }
  }

  return res.status(200).json({
    success: true, ...results, total: trades.length,
    message: `${results.inserted} inserted · ${results.updated} updated · ${results.skipped} skipped`
  })
}
