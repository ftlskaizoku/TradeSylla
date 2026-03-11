// api/ea-sync.js — TradeSylla EA receiver
// The EA calls /api/ea-sync — this file MUST be named ea-sync.js
// Handles: heartbeat (saves account info), history sync, live trade sync

import { createClient } from "@supabase/supabase-js"

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-EA-Version",
  "Content-Type": "application/json",
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST")   return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS })

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  let body
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: CORS }) }

  const { token, type, trades, force } = body

  if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: CORS })

  // Resolve user from ea_token
  const { data: profile } = await supabase
    .from("profiles").select("id").eq("ea_token", token).single()
  if (!profile) return new Response(JSON.stringify({ error: "Invalid token — regenerate in Broker Sync → MT5 EA" }), { status: 401, headers: CORS })

  const userId = profile.id

  // ── HEARTBEAT — saves account details to broker_connections ──────────────
  if (type === "heartbeat") {
    const acct = body.account || {}
    const login = acct.login ? String(acct.login) : null
    if (login) {
      const { error: upsertErr } = await supabase.from("broker_connections").upsert({
        user_id:        userId,
        mt5_login:      login,
        account_number: login,
        account_name:   acct.name     || "",
        broker_name:    acct.broker   || "MT5",
        server:         acct.server   || "",
        type:           acct.is_demo  ? "demo" : "live",
        is_mt5_live:    true,
        status:         "connected",
        last_sync:      new Date().toISOString(),
        balance:        parseFloat(acct.balance)  || 0,
        equity:         parseFloat(acct.equity)   || 0,
        currency:       acct.currency || "USD",
        leverage:       parseInt(acct.leverage)   || 0,
        is_demo:        acct.is_demo === true || acct.is_demo === "true",
        ea_version:     body.ea_version || "3.x",
      }, { onConflict: "user_id,mt5_login" })
      if (upsertErr) console.error("broker_connections upsert:", upsertErr.message)
    }
    return new Response(JSON.stringify({ ok: true, type: "heartbeat" }), { status: 200, headers: CORS })
  }

  // ── TRADE / HISTORY SYNC ─────────────────────────────────────────────────
  if (!Array.isArray(trades) || trades.length === 0) {
    return new Response(JSON.stringify({ ok: true, imported: 0, message: "No trades" }), { status: 200, headers: CORS })
  }

  // Get account login for tagging trades
  const { data: conn } = await supabase
    .from("broker_connections")
    .select("mt5_login")
    .eq("user_id", userId)
    .eq("is_mt5_live", true)
    .order("last_sync", { ascending: false })
    .limit(1)
    .single()
  const accountLogin = conn?.mt5_login || null

  // Load existing tickets for dedup — skip if force=true
  let existingTickets = new Set()
  if (!force) {
    const { data: existing } = await supabase
      .from("trades").select("mt5_ticket")
      .eq("user_id", userId).not("mt5_ticket", "is", null)
    existingTickets = new Set((existing || []).map(t => String(t.mt5_ticket)))
  }

  let imported = 0, skipped = 0
  const errors   = []
  const symStats = {}

  for (const t of trades) {
    const sym    = (t.symbol || "UNKNOWN").toUpperCase()
    const ticket = t.mt5_ticket ? String(t.mt5_ticket) : null
    if (!symStats[sym]) symStats[sym] = { imported: 0, skipped: 0, errors: 0 }

    if (ticket && existingTickets.has(ticket) && !force) {
      skipped++; symStats[sym].skipped++; continue
    }

    const pnl = parseFloat(t.pnl) || 0
    const trade = {
      user_id:       userId,
      mt5_ticket:    ticket,
      account_login: accountLogin,
      symbol:        sym,
      direction:     (t.direction || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
      entry_price:   parseFloat(t.entry_price)  || 0,
      exit_price:    parseFloat(t.exit_price)   || 0,
      sl:            parseFloat(t.sl)           || 0,
      tp:            parseFloat(t.tp)           || 0,
      sl_pips:       parseFloat(t.sl_pips)      || 0,
      tp_pips:       parseFloat(t.tp_pips)      || 0,
      rr:            parseFloat(t.rr)           || 0,
      gross_pnl:     parseFloat(t.gross_pnl)    || pnl,
      commission:    parseFloat(t.commission)   || 0,
      swap:          parseFloat(t.swap)         || 0,
      pnl:           pnl,
      pips:          parseFloat(t.pips)         || 0,
      volume:        parseFloat(t.volume)       || 0,
      duration_min:  parseInt(t.duration_min)   || 0,
      entry_time:    t.entry_time || new Date().toISOString(),
      exit_time:     t.exit_time  || null,
      session:       t.session    || "UNKNOWN",
      timeframe:     t.timeframe  || null,
      outcome:       pnl > 0.001 ? "WIN" : pnl < -0.001 ? "LOSS" : "BREAKEVEN",
      notes:         t.notes ? `[MT5] ${t.notes}` : "[MT5] Auto-synced",
      quality:       5,
      screenshots:   [],
      chart_url:     "",
    }

    let insertErr
    if (force && ticket) {
      const { error } = await supabase.from("trades")
        .upsert(trade, { onConflict: "user_id,mt5_ticket" })
      insertErr = error
    } else {
      const { error } = await supabase.from("trades").insert([trade])
      insertErr = error
    }

    if (insertErr) {
      errors.push(`${sym} #${ticket}: ${insertErr.message}`)
      symStats[sym].errors++
    } else {
      imported++; symStats[sym].imported++
      if (ticket) existingTickets.add(ticket)

      // Save candles if present
      if (t.candles && Array.isArray(t.candles) && t.candles.length > 0) {
        const { data: newTrade } = await supabase
          .from("trades").select("id").eq("user_id", userId).eq("mt5_ticket", ticket).single()
        if (newTrade?.id) {
          await supabase.from("trade_charts").upsert({
            user_id:   userId,
            trade_id:  newTrade.id,
            symbol:    sym,
            timeframe: t.timeframe || "M15",
            candles:   t.candles,
          }, { onConflict: "trade_id" })
        }
      }
    }
  }

  // Update last_sync on broker_connection
  if (imported > 0 && accountLogin) {
    await supabase.from("broker_connections")
      .update({ last_sync: new Date().toISOString() })
      .eq("user_id", userId).eq("mt5_login", accountLogin)
  }

  return new Response(JSON.stringify({
    ok: true, imported, skipped,
    symbols: symStats,
    errors:  errors.length > 0 ? errors.slice(0, 10) : undefined,
    message: `${imported} imported · ${skipped} skipped`,
  }), { status: 200, headers: CORS })
}
