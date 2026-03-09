/**
 * /api/ea-sync.js  —  TradeSylla EA Sync Endpoint
 *
 * Receives POST requests from the MQL5 EA (TradeSylla_Sync.mq5).
 * Validates the user token, then upserts trades + candle data into Supabase.
 *
 * Body shape (sent by EA):
 *   { token, type: "trade"|"history"|"heartbeat", trades[], account? }
 *
 * Each trade in trades[]:
 *   { mt5_ticket, symbol, direction, entry_price, exit_price, pnl, pips,
 *     volume, outcome, session, timeframe, entry_time, exit_time,
 *     quality, notes, candles[] }
 */

import { createClient } from "@supabase/supabase-js"

// Use service-role key so we can look up users by token (bypasses RLS)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // ← add this to your .env / Vercel env vars
)

export default async function handler(req, res) {
  // CORS — EA sends from MT5 process, not a browser
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-EA-Version")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" })

  const { token, type, trades = [], account } = req.body || {}

  // ── 1. Validate token ─────────────────────────────────────────────
  if (!token || token.length < 10) {
    return res.status(401).json({ error: "Missing or invalid token" })
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, ea_token")
    .eq("ea_token", token)
    .single()

  if (profileErr || !profile) {
    return res.status(401).json({ error: "Token not recognized. Generate a new token in TradeSylla → Broker Sync." })
  }

  const user_id = profile.id

  // ── 2. Handle heartbeat ───────────────────────────────────────────
  if (type === "heartbeat") {
    if (account) {
      await supabase
        .from("broker_connections")
        .upsert({
          user_id,
          broker_name:    `MT5 - ${account.broker || "Unknown"}`,
          broker_color:   "#6c63ff",
          account_number: String(account.login || ""),
          account_name:   account.name  || "",
          server:         account.server || "",
          type:           account.is_demo ? "demo" : "live",
          status:         "connected",
          is_mt5_live:    true,
          last_sync:      new Date().toISOString(),
          balance:        account.balance || 0,
          equity:         account.equity  || 0,
          currency:       account.currency || "USD",
        }, { onConflict: "user_id, account_number" })
    }
    return res.status(200).json({ ok: true, type: "heartbeat" })
  }

  // ── 3. Handle trade / history ─────────────────────────────────────
  if (type !== "trade" && type !== "history") {
    return res.status(400).json({ error: "Unknown type: " + type })
  }

  if (!Array.isArray(trades) || trades.length === 0) {
    return res.status(200).json({ ok: true, imported: 0, skipped: 0 })
  }

  // Fetch already-imported tickets for this user (dedup)
  const { data: existingTrades } = await supabase
    .from("trades")
    .select("mt5_ticket")
    .eq("user_id", user_id)
    .not("mt5_ticket", "is", null)

  const existingTickets = new Set(
    (existingTrades || []).map(t => String(t.mt5_ticket))
  )

  let imported = 0
  let skipped  = 0

  for (const t of trades) {
    const ticket = String(t.mt5_ticket || "")

    // Skip duplicates
    if (ticket && existingTickets.has(ticket)) {
      skipped++
      continue
    }

    // ── 3a. Insert trade ───────────────────────────────────────────
    const tradeRow = {
      user_id,
      symbol:      (t.symbol      || "UNKNOWN").toUpperCase(),
      direction:   t.direction    === "SELL" ? "SELL" : "BUY",
      entry_price: parseFloat(t.entry_price) || 0,
      exit_price:  parseFloat(t.exit_price)  || 0,
      pnl:         parseFloat(t.pnl)         || 0,
      pips:        parseFloat(t.pips)        || 0,
      volume:      parseFloat(t.volume)      || 0,
      outcome:     ["WIN","LOSS","BREAKEVEN"].includes(t.outcome) ? t.outcome : "BREAKEVEN",
      session:     t.session   || "LONDON",
      timeframe:   t.timeframe || "H1",
      quality:     parseInt(t.quality) || 5,
      entry_time:  t.entry_time || new Date().toISOString(),
      notes:       t.notes     || "MT5 sync",
      mt5_ticket:  ticket || null,
      screenshots: [],
      chart_url:   "",
    }

    const { data: newTrade, error: tradeErr } = await supabase
      .from("trades")
      .insert(tradeRow)
      .select("id")
      .single()

    if (tradeErr) {
      console.error("Trade insert error:", tradeErr.message)
      continue
    }

    imported++
    if (ticket) existingTickets.add(ticket)

    // ── 3b. Store candle data ──────────────────────────────────────
    if (t.candles && Array.isArray(t.candles) && t.candles.length > 0) {
      await supabase
        .from("trade_charts")
        .insert({
          user_id,
          trade_id:  newTrade.id,
          symbol:    tradeRow.symbol,
          timeframe: tradeRow.timeframe,
          candles:   t.candles,
        })
    }
  }

  // ── 4. Update last_sync on broker_connection ───────────────────────
  await supabase
    .from("broker_connections")
    .update({ last_sync: new Date().toISOString(), status: "connected" })
    .eq("user_id", user_id)
    .eq("is_mt5_live", true)

  return res.status(200).json({
    ok: true,
    type,
    imported,
    skipped,
    message: `${imported} trades imported, ${skipped} already existed.`,
  })
}
