// api/ea-sync.js  v4.3
// FIX: use VITE_SUPABASE_URL as fallback (Vercel needs explicit non-VITE vars)
// Auth: uses user_token column (separate from admin_token)

import { createClient } from "@supabase/supabase-js"

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" })

  if (!SUPA_URL || !SUPA_KEY) {
    console.error("Missing env vars: SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return res.status(500).json({ error: "Server configuration error — Supabase env vars missing" })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)

  const token = (req.headers.authorization || "").replace("Bearer ", "").trim()
  if (!token) return res.status(401).json({ error: "Missing token" })

  // Auth via user_token column
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_token", token)
    .single()

  if (profileErr || !profile) {
    return res.status(401).json({ error: "Invalid token — regenerate in Settings → API Keys" })
  }

  const userId = profile.id
  let body
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" })
  }

  const trades = Array.isArray(body) ? body : body.trades || [body]
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] }

  for (const raw of trades) {
    try {
      const totalPnl = parseFloat(raw.total_pnl ?? raw.pnl ?? 0)
      let outcome = "BREAKEVEN"
      if (totalPnl >  0.01) outcome = "WIN"
      if (totalPnl < -0.01) outcome = "LOSS"

      const ticket       = String(raw.ticket || raw.mt5_ticket || "")
      const accountLogin = String(raw.account_login || "")
      if (!ticket) { results.errors.push("Missing ticket"); continue }

      const { data: existing } = await supabase
        .from("trades").select("id")
        .eq("user_id",      userId)
        .eq("mt5_ticket",   ticket)
        .eq("account_login",accountLogin)
        .single()

      const payload = {
        user_id:       userId,
        mt5_ticket:    ticket,
        account_login: accountLogin,
        symbol:        raw.symbol       || "",
        direction:     raw.direction    || "BUY",
        entry_price:   parseFloat(raw.entry_price  || 0),
        exit_price:    parseFloat(raw.exit_price   || 0),
        lot_size:      parseFloat(raw.lot_size     || 0),
        pnl:           parseFloat(raw.pnl          || 0),
        swap:          parseFloat(raw.swap         || 0),
        commission:    parseFloat(raw.commission   || 0),
        total_pnl:     totalPnl,
        pips:          parseFloat(raw.pips         || 0),
        outcome,
        timeframe:     raw.timeframe   || null,
        session:       raw.session     || null,
        entry_time:    raw.entry_time  || null,
        exit_time:     raw.exit_time   || null,
        is_withdrawal:     raw.is_withdrawal     || false,
        withdrawal_amount: raw.withdrawal_amount || 0,
      }

      if (existing) {
        const { error } = await supabase.from("trades").update(payload).eq("id", existing.id)
        if (error) results.errors.push(`Update ${ticket}: ${error.message}`)
        else results.updated++
      } else {
        const { error } = await supabase.from("trades").insert({ ...payload, quality: 5 })
        if (error) {
          if (error.code === "23505") results.skipped++
          else results.errors.push(`Insert ${ticket}: ${error.message}`)
        } else results.inserted++
      }
    } catch (e) { results.errors.push(`Error: ${e.message}`) }
  }

  return res.status(200).json({ success: true, ...results, total: trades.length })
}
