// MT5 sync endpoint backed by Firebase Admin and Firestore.
import { adminDb } from "./_firebase.js"

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
}


export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })
  if (req.method !== "POST")   return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS })

  let db
  try { db = adminDb() } catch (e) { return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS }) }

  let body
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: CORS }) }

  const { token, type, trades, force } = body

  if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 401, headers: CORS })

  let profile = null
  for (const field of ["ea_token", "user_token", "admin_token"]) {
    const snap = await db.collectionGroup("profiles").where(field, "==", token).limit(1).get()
    if (!snap.empty) { profile = snap.docs[0].data(); break }
  }
  if (!profile?.id) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: CORS })
  const userId = profile.id
  const userCollection = (name) => db.collection("users").doc(userId).collection(name)

  // ── HEARTBEAT ─────────────────────────────────────────────────────────────
  if (type === "heartbeat") {
    const { login, name, broker, server, balance, equity, currency, leverage, is_demo, ea_version } = body
    if (login) {
      await userCollection("broker_connections").doc(`${userId}_${String(login)}`).set({
        user_id:      userId,
        mt5_login:    String(login),
        account_name: name    || "",
        broker_name:  broker  || "MT5",
        server:       server  || "",
        balance:      parseFloat(balance)  || 0,
        equity:       parseFloat(equity)   || 0,
        currency:     currency || "USD",
        leverage:     parseInt(leverage)   || 0,
        is_demo:      is_demo === true || is_demo === "true",
        is_mt5_live:  true,
        status:       "connected",
        last_sync:    new Date().toISOString(),
        ea_version:   ea_version || "3.0",
      }, { merge: true })
    }
    return new Response(JSON.stringify({ ok: true, type: "heartbeat" }), { status: 200, headers: CORS })
  }

  // ── TRADE SYNC ────────────────────────────────────────────────────────────
  if (!Array.isArray(trades) || trades.length === 0) {
    return new Response(JSON.stringify({ ok: true, imported: 0, message: "No trades" }), { status: 200, headers: CORS })
  }

  const connectionSnap = await userCollection("broker_connections").where("is_mt5_live", "==", true).get()
  const connection = connectionSnap.docs.map(d => d.data()).sort((a,b) => String(b.last_sync || "").localeCompare(String(a.last_sync || "")))[0]
  const accountLogin = connection?.mt5_login || null

  let existingTickets = new Set()
  if (!force) {
    const existing = await userCollection("trades").where("mt5_ticket", "!=", null).get()
    existingTickets = new Set(existing.docs.map(d => d.data().mt5_ticket).filter(Boolean))
  }

  let imported = 0, skipped = 0, updated = 0
  const errors = []
  const symStats = {}

  for (const t of trades) {
    const sym = (t.symbol || "UNKNOWN").toUpperCase()
    if (!symStats[sym]) symStats[sym] = { sent: 0, imported: 0, skipped: 0, errors: 0 }
    symStats[sym].sent++

    const ticket = t.mt5_ticket ? String(t.mt5_ticket) : null

    if (ticket && existingTickets.has(ticket)) {
      if (!force) {
        const oldSnap = await userCollection("trades").where("mt5_ticket", "==", ticket).limit(1).get()
        const oldDoc = oldSnap.docs[0]
        const old = oldDoc?.data()
        if (old && (!old.sl || old.sl === 0) && parseFloat(t.sl) > 0) {
          await oldDoc.ref.update({
            sl:           parseFloat(t.sl)         || 0,
            tp:           parseFloat(t.tp)         || 0,
            sl_pips:      parseFloat(t.sl_pips)    || 0,
            tp_pips:      parseFloat(t.tp_pips)    || 0,
            rr:           parseFloat(t.rr)         || 0,
            duration_min: parseInt(t.duration_min) || 0,
            gross_pnl:    parseFloat(t.gross_pnl)  || 0,
            commission:   parseFloat(t.commission) || 0,
            swap:         parseFloat(t.swap)       || 0,
            account_login: accountLogin,
            exit_time:    t.exit_time || null,
          })
          updated++
        }
        skipped++; symStats[sym].skipped++
        continue
      }
    }

    const trade = {
      user_id:       userId,
      mt5_ticket:    ticket,
      account_login: accountLogin,
      symbol:        sym,
      direction:     t.direction ? t.direction.toUpperCase() : "BUY",
      entry_price:   parseFloat(t.entry_price)  || 0,
      exit_price:    parseFloat(t.exit_price)   || 0,
      sl:            parseFloat(t.sl)           || 0,
      tp:            parseFloat(t.tp)           || 0,
      sl_pips:       parseFloat(t.sl_pips)      || 0,
      tp_pips:       parseFloat(t.tp_pips)      || 0,
      rr:            parseFloat(t.rr)           || 0,
      gross_pnl:     parseFloat(t.gross_pnl)    || parseFloat(t.pnl) || 0,
      commission:    parseFloat(t.commission)   || 0,
      swap:          parseFloat(t.swap)         || 0,
      pnl:           parseFloat(t.pnl)          || 0,
      pips:          parseFloat(t.pips)         || 0,
      volume:        parseFloat(t.volume)       || 0,
      duration_min:  parseInt(t.duration_min)   || 0,
      entry_time:    t.entry_time || new Date().toISOString(),
      exit_time:     t.exit_time  || null,
      session:       t.session    || "UNKNOWN",
      timeframe:     t.timeframe  || null,
      outcome:       parseFloat(t.pnl) > 0.001 ? "WIN" : parseFloat(t.pnl) < -0.001 ? "LOSS" : "BREAKEVEN",
      notes:         t.notes ? `[MT5 EA] ${t.notes}` : "[MT5 EA] Auto-synced",
      quality:       5,
    }

    if (force && ticket) {
      await userCollection("trades").doc(`${userId}_${ticket}`).set({ ...trade, id: `${userId}_${ticket}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { merge: true })
      imported++; symStats[sym].imported++; if (ticket) existingTickets.add(ticket)
    } else {
      const ref = ticket ? userCollection("trades").doc(`${userId}_${ticket}`) : userCollection("trades").doc()
      await ref.set({ ...trade, id: ref.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      imported++; symStats[sym].imported++; if (ticket) existingTickets.add(ticket)
    }
  }

  return new Response(JSON.stringify({
    ok: true, imported, skipped, updated,
    symbols: symStats,
    errors:  errors.length > 0 ? errors.slice(0, 10) : undefined,
    message: `${imported} imported · ${skipped} skipped · ${updated} backfilled`,
  }), { status: 200, headers: CORS })
}
