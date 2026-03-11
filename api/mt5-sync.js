// Vercel Edge Function — MT5 EA Trade Receiver v3.0
// Handles: heartbeat (saves account), trade, history types

import { createClient } from "@supabase/supabase-js"

export default async function handler(req) {
  const cors = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  }

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: cors })

  const supabaseUrl     = process.env.VITE_SUPABASE_URL
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseService)
    return new Response(JSON.stringify({ error: "Server not configured" }), { status: 503, headers: cors })

  const supabase = createClient(supabaseUrl, supabaseService)

  let body
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors }) }

  const { token, type } = body
  if (!token)
    return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: cors })

  // Resolve user from token
  const { data: profile, error: profileErr } = await supabase
    .from("profiles").select("id").eq("ea_token", token).single()

  if (profileErr || !profile)
    return new Response(JSON.stringify({ error: "Invalid token. Generate a new one in TradeSylla → Broker Sync → MT5 EA." }), { status: 401, headers: cors })

  const userId = profile.id

  // ── HEARTBEAT — save/update account details ────────────────────────────────
  if (type === "heartbeat") {
    const acct = body.account || {}
    const login = String(acct.login || "")

    if (login) {
      // Upsert broker_connection by mt5_login + user_id
      const { data: existing } = await supabase
        .from("broker_connections")
        .select("id")
        .eq("user_id", userId)
        .eq("mt5_login", login)
        .single()

      const record = {
        user_id:        userId,
        mt5_login:      login,
        broker_name:    acct.broker  || "MT5",
        account_name:   acct.name    || login,
        account_number: login,
        server:         acct.server  || "",
        type:           acct.is_demo ? "demo" : "live",
        is_mt5_live:    true,
        is_demo:        acct.is_demo || false,
        balance:        parseFloat(acct.balance)  || 0,
        equity:         parseFloat(acct.equity)   || 0,
        currency:       acct.currency || "USD",
        leverage:       parseInt(acct.leverage)   || 0,
        status:         "connected",
        last_sync:      new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      }

      if (existing?.id) {
        await supabase.from("broker_connections").update(record).eq("id", existing.id)
      } else {
        await supabase.from("broker_connections").insert([{ ...record, created_at: new Date().toISOString() }])
      }
    }

    return new Response(JSON.stringify({ ok: true, message: "Heartbeat received" }), { status: 200, headers: cors })
  }

  // ── TRADES / HISTORY — insert trades ──────────────────────────────────────
  if (type === "trade" || type === "history") {
    const trades = body.trades || []
    if (!trades.length)
      return new Response(JSON.stringify({ ok: true, imported: 0, message: "No trades" }), { status: 200, headers: cors })

    // Get account login from first trade's token context (stored in heartbeat)
    // We'll attach account_login from the EA's heartbeat connection
    const { data: connection } = await supabase
      .from("broker_connections")
      .select("mt5_login, account_name, server, broker_name")
      .eq("user_id", userId)
      .eq("is_mt5_live", true)
      .order("last_sync", { ascending: false })
      .limit(1)
      .single()

    const accountLogin = connection?.mt5_login || null

    // Fetch existing tickets to avoid duplicates
    const { data: existing } = await supabase
      .from("trades").select("mt5_ticket").eq("user_id", userId).not("mt5_ticket", "is", null)

    const existingTickets = new Set((existing || []).map(t => t.mt5_ticket))

    let imported = 0, skipped = 0
    const errors = []

    for (const t of trades) {
      if (t.mt5_ticket && existingTickets.has(String(t.mt5_ticket))) {
        // Update existing trade with new fields (SL, TP, RR etc) if missing
        const { data: existingTrade } = await supabase
          .from("trades").select("id, sl, tp").eq("mt5_ticket", String(t.mt5_ticket)).eq("user_id", userId).single()

        if (existingTrade && (!existingTrade.sl || existingTrade.sl === 0) && parseFloat(t.sl) > 0) {
          await supabase.from("trades").update({
            sl:            parseFloat(t.sl)          || 0,
            tp:            parseFloat(t.tp)          || 0,
            sl_pips:       parseFloat(t.sl_pips)     || 0,
            tp_pips:       parseFloat(t.tp_pips)     || 0,
            rr:            parseFloat(t.rr)          || 0,
            duration_min:  parseInt(t.duration_min)  || 0,
            account_login: accountLogin,
          }).eq("id", existingTrade.id)
        }
        skipped++
        continue
      }

      const trade = {
        user_id:       userId,
        mt5_ticket:    t.mt5_ticket   ? String(t.mt5_ticket)     : null,
        account_login: accountLogin,
        symbol:        t.symbol       ? t.symbol.toUpperCase()   : "UNKNOWN",
        direction:     t.direction    ? t.direction.toUpperCase(): "BUY",
        entry_price:   parseFloat(t.entry_price)  || 0,
        exit_price:    parseFloat(t.exit_price)   || 0,
        sl:            parseFloat(t.sl)           || 0,
        tp:            parseFloat(t.tp)           || 0,
        sl_pips:       parseFloat(t.sl_pips)      || 0,
        tp_pips:       parseFloat(t.tp_pips)      || 0,
        rr:            parseFloat(t.rr)           || 0,
        pnl:           parseFloat(t.pnl)          || 0,
        pips:          parseFloat(t.pips)         || 0,
        volume:        parseFloat(t.volume)       || 0,
        duration_min:  parseInt(t.duration_min)   || 0,
        entry_time:    t.entry_time || new Date().toISOString(),
        exit_time:     t.exit_time  || null,
        session:       t.session    || "UNKNOWN",
        timeframe:     t.timeframe  || null,
        outcome:       t.pnl > 0.001 ? "WIN" : t.pnl < -0.001 ? "LOSS" : "BREAKEVEN",
        notes:         t.notes ? `[MT5 EA] ${t.notes}` : "[MT5 EA] Auto-synced",
        quality:       5,
      }

      const { error } = await supabase.from("trades").insert([trade])
      if (error) errors.push(error.message)
      else { imported++; existingTickets.add(String(t.mt5_ticket)) }
    }

    // Insert candles into trade_charts if provided
    if (imported > 0) {
      // (trade_charts stored separately — handled by candles field)
    }

    return new Response(JSON.stringify({
      ok: true, imported, skipped,
      errors: errors.length > 0 ? errors.slice(0,3) : undefined,
      message: `${imported} trade(s) imported, ${skipped} skipped`,
    }), { status: 200, headers: cors })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors })
}
