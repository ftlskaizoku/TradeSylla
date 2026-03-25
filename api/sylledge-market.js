// api/sylledge-market.js
// SYLLEDGE Market Data receiver — admin-only endpoint
// Stores candle data from all broker pairs for SYLLEDGE AI analysis

import { createClient } from "@supabase/supabase-js"

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-EA-Version",
  "Content-Type": "application/json",
}

const ADMIN_EMAIL = "khalifadylla@gmail.com"

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // ── GET: Fetch market data for SYLLEDGE (any authenticated user) ──────────
  if (req.method === "GET") {
    const url    = new URL(req.url)
    const symbol = url.searchParams.get("symbol")
    const tf     = url.searchParams.get("tf") || "H4"
    const limit  = Math.min(parseInt(url.searchParams.get("limit") || "200"), 1000)

    if (!symbol)
      return new Response(JSON.stringify({ error: "symbol required" }), { status: 400, headers: CORS })

    const { data, error } = await supabase
      .from("sylledge_market_data")
      .select("candles, updated_at")
      .eq("symbol", symbol.toUpperCase())
      .eq("timeframe", tf.toUpperCase())
      .single()

    if (error || !data)
      return new Response(JSON.stringify({ symbol, tf, candles: [], available: false }), { status: 200, headers: CORS })

    const candles = Array.isArray(data.candles) ? data.candles.slice(-limit) : []
    return new Response(JSON.stringify({
      symbol, tf, candles,
      count:      candles.length,
      updated_at: data.updated_at,
      available:  true,
    }), { status: 200, headers: CORS })
  }

  // ── POST: Receive data from Market Data EA (admin-only) ───────────────────
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS })

  let body
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: CORS }) }

  const { admin_token, type, data, ea_version } = body

  if (!admin_token)
    return new Response(JSON.stringify({ error: "Missing admin_token" }), { status: 401, headers: CORS })

  // Verify admin token — must match the admin profile's ea_token
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, ea_token")
    .eq("ea_token", admin_token)
    .single()

  if (!profile)
    return new Response(JSON.stringify({ error: "Invalid admin token" }), { status: 401, headers: CORS })

  // Verify this user is actually the admin
  const { data: authUser } = await supabase.auth.admin.getUserById(profile.id)
  if (!authUser?.user || authUser.user.email !== ADMIN_EMAIL)
    return new Response(JSON.stringify({ error: "Unauthorized — admin only" }), { status: 403, headers: CORS })

  if (type !== "market_data" || !Array.isArray(data))
    return new Response(JSON.stringify({ error: "Invalid payload type" }), { status: 400, headers: CORS })

  // ── Process each symbol in the batch ────────────────────────────────────
  let stored = 0
  let skipped = 0
  const errors = []

  for (const entry of data) {
    const symbol = (entry.symbol || "").toUpperCase()
    if (!symbol || !entry.timeframes) { skipped++; continue }

    for (const [tf, candles] of Object.entries(entry.timeframes)) {
      if (!Array.isArray(candles) || candles.length === 0) continue

      const { error } = await supabase
        .from("sylledge_market_data")
        .upsert(
          {
            symbol,
            timeframe:  tf.toUpperCase(),
            candles,
            bid:        entry.bid    || null,
            ask:        entry.ask    || null,
            spread:     entry.spread || null,
            ea_version: ea_version   || "1.0",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "symbol,timeframe" }
        )

      if (error) {
        errors.push(`${symbol}/${tf}: ${error.message}`)
      } else {
        stored++
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok:      true,
      stored,
      skipped,
      errors:  errors.slice(0, 10),
      message: `${stored} symbol/timeframe pairs stored`,
    }),
    { status: 200, headers: CORS }
  )
}
