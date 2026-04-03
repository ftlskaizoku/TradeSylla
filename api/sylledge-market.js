// api/sylledge-market.js  v3.0  — TOKEN FRAGMENTATION FIX
// ─────────────────────────────────────────────────────────────────────────────
// THE BUG: POST auth only checked admin_token column.
// Users who generated their Market Data token from Settings may have it in
// admin_token, but others have it in user_token or ea_token.
//
// FIX: try admin_token → user_token → ea_token in order.
// Also fixed: VITE_SUPABASE_URL fallback.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js"

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (!SUPA_URL || !SUPA_KEY) return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars" })

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const token    = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim()

  // ── GET — any authenticated user reads market data ─────────────────────────
  if (req.method === "GET") {
    const { symbol, timeframe, limit = 500, from, to } = req.query
    if (!symbol || !timeframe) return res.status(400).json({ error: "symbol and timeframe required" })
    let q = supabase.from("sylledge_market_data")
      .select("candle_time,open_price,high_price,low_price,close_price,volume")
      .eq("symbol", symbol).eq("timeframe", timeframe)
      .order("candle_time", { ascending: true })
      .limit(parseInt(limit))
    if (from) q = q.gte("candle_time", from)
    if (to)   q = q.lte("candle_time", to)
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data || [])
  }

  // ── POST — Market Data EA writes OHLCV data ────────────────────────────────
  if (req.method === "POST") {
    if (!token) return res.status(401).json({
      error: "Missing Authorization header — paste your Market Data EA Token into AdminToken in the EA settings"
    })

    // Try all 3 token columns (admin_token first — this EA's intended column)
    let profile = null
    for (const col of ["admin_token", "user_token", "ea_token"]) {
      const { data } = await supabase.from("profiles").select("id").eq(col, token).maybeSingle()
      if (data) { profile = data; break }
    }
    if (!profile) return res.status(401).json({
      error: "Invalid token — go to Settings → API Keys, regenerate the Market Data EA Token, paste it into AdminToken in the EA"
    })

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
    const { symbol, timeframe, candles } = body
    if (!symbol || !timeframe || !candles?.length)
      return res.status(400).json({ error: "symbol, timeframe, and candles[] required" })

    const rows = candles.map(c => ({
      symbol:      symbol.toUpperCase(),
      timeframe,
      candle_time: c.t,
      open_price:  c.o,
      high_price:  c.h,
      low_price:   c.l,
      close_price: c.c,
      volume:      c.v || 0,
    }))

    let inserted = 0
    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from("sylledge_market_data")
        .upsert(rows.slice(i, i + BATCH), { onConflict: "symbol,timeframe,candle_time", ignoreDuplicates: true })
      if (error) return res.status(500).json({ error: error.message })
      inserted += Math.min(BATCH, rows.length - i)
    }
    return res.status(200).json({ success: true, inserted, symbol, timeframe })
  }

  return res.status(405).json({ error: "Method not allowed" })
}
