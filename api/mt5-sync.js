// Vercel Edge Function — MT5 EA Trade Receiver
// Receives trades POSTed from the TradeSylla_Sync.mq5 Expert Advisor
// Authenticates via user token, saves trades to Supabase

import { createClient } from "@supabase/supabase-js"

export default async function handler(req) {
  // CORS — allow MT5 EA WebRequest
  const corsHeaders = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders })
  }

  const supabaseUrl     = process.env.VITE_SUPABASE_URL
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseService) {
    return new Response(JSON.stringify({ error: "Server not configured" }), { status: 503, headers: corsHeaders })
  }

  const supabase = createClient(supabaseUrl, supabaseService)

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders })
  }

  const { token, trades } = body

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: corsHeaders })
  }
  if (!Array.isArray(trades) || trades.length === 0) {
    return new Response(JSON.stringify({ ok: true, imported: 0, message: "No trades" }), { status: 200, headers: corsHeaders })
  }

  // ── Resolve user from token ──────────────────────────────────────────────
  // Token is stored in profiles.ea_token — created when user generates it in BrokerSync
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("ea_token", token)
    .single()

  if (profileErr || !profile) {
    return new Response(JSON.stringify({ error: "Invalid token. Generate a new one in TradeSylla → Broker Sync → MT5 EA." }), { status: 401, headers: corsHeaders })
  }

  const userId = profile.id

  // ── Fetch existing tickets to avoid duplicates ────────────────────────────
  const { data: existing } = await supabase
    .from("trades")
    .select("mt5_ticket")
    .eq("user_id", userId)
    .not("mt5_ticket", "is", null)

  const existingTickets = new Set((existing || []).map(t => t.mt5_ticket))

  // ── Insert new trades ──────────────────────────────────────────────────────
  let imported = 0
  let skipped  = 0
  const errors = []

  for (const t of trades) {
    // Skip duplicates
    if (t.mt5_ticket && existingTickets.has(String(t.mt5_ticket))) {
      skipped++
      continue
    }

    const trade = {
      user_id:     userId,
      mt5_ticket:  t.mt5_ticket   ? String(t.mt5_ticket)         : null,
      symbol:      t.symbol       ? t.symbol.toUpperCase()        : "UNKNOWN",
      direction:   t.direction    ? t.direction.toUpperCase()     : "BUY",
      entry_price: parseFloat(t.entry_price) || 0,
      exit_price:  parseFloat(t.exit_price)  || 0,
      pnl:         parseFloat(t.pnl)         || 0,
      pips:        parseFloat(t.pips)        || 0,
      volume:      parseFloat(t.volume)      || 0,
      entry_time:  t.entry_time || new Date().toISOString(),
      session:     t.session     || "UNKNOWN",
      timeframe:   t.timeframe   || null,
      outcome:     t.pnl > 0.001 ? "WIN" : t.pnl < -0.001 ? "LOSS" : "BREAKEVEN",
      notes:       t.notes       ? `[MT5 EA] ${t.notes}` : "[MT5 EA] Auto-synced",
      quality:     5,
    }

    const { error } = await supabase.from("trades").insert([trade])
    if (error) {
      errors.push(error.message)
    } else {
      imported++
      existingTickets.add(String(t.mt5_ticket))
    }
  }

  return new Response(JSON.stringify({
    ok:       true,
    imported,
    skipped,
    errors:   errors.length > 0 ? errors.slice(0, 3) : undefined,
    message:  `${imported} trade(s) imported, ${skipped} duplicate(s) skipped`,
  }), { status: 200, headers: corsHeaders })
}
