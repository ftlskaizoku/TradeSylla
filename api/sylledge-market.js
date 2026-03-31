// api/sylledge-market.js  v2.1
// FIX: VITE_SUPABASE_URL fallback for Vercel serverless functions

import { createClient } from "@supabase/supabase-js"

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()

  if (!SUPA_URL || !SUPA_KEY) {
    return res.status(500).json({ error: "Server config error — Supabase env vars missing" })
  }

  const supabase = createClient(SUPA_URL, SUPA_KEY)
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim()

  // ── GET — any authenticated user ─────────────────────────────────────────
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

  // ── POST — admin_token required ───────────────────────────────────────────
  if (req.method === "POST") {
    if (!token) return res.status(401).json({ error: "Missing token" })

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, is_admin")
      .eq("admin_token", token)
      .single()

    if (!profile) return res.status(401).json({ error: "Invalid admin token — regenerate in Settings → API Keys" })

    let body
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
    } catch {
      return res.status(400).json({ error: "Invalid JSON" })
    }

    const { symbol, timeframe, candles } = body

    if (!symbol || !timeframe || !candles?.length)
      return res.status(400).json({ error: "symbol, timeframe, candles required" })

    const rows = candles.map(c => ({
      symbol,
      timeframe,
      candle_time: c.t,
      open_price:  c.o,
      high_price:  c.h,
      low_price:   c.l,
      close_price: c.c,
      volume:      c.v || 0,
    }))

    const BATCH = 500
    let inserted = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase.from("sylledge_market_data")
        .upsert(rows.slice(i, i + BATCH), { onConflict: "symbol,timeframe,candle_time", ignoreDuplicates: true })
      if (error) return res.status(500).json({ error: error.message })
      inserted += Math.min(BATCH, rows.length - i)
    }

    return res.status(200).json({ success: true, inserted })
  }

  return res.status(405).json({ error: "Method not allowed" })
}
