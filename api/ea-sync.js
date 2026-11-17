// api/ea-sync.js  — DEFINITIVE v6.0
// ─────────────────────────────────────────────────────────────────────────────
// Fixes all stacked problems that were causing 0 inserts:
//
//  1. Token lookup checks user_token → ea_token → admin_token (covers all users)
//  2. Batch dedup: fetches existing tickets in Firestore batches
//  3. Payload only includes columns guaranteed to exist after migration
//  4. Rich per-trade error logging for the MT5 response
//  5. Heartbeat updates broker_connections without needing trades
// ─────────────────────────────────────────────────────────────────────────────

import { adminDb } from "./_firebase.js"


export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" })

  let db
  try { db = adminDb() } catch (e) { return res.status(500).json({ error: e.message }) }

  // ── 1. Auth — EA sends token as: Authorization: Bearer <token> ────────────
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim()
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header. Paste your Sync EA Token into UserToken in the EA inputs." })
  }

  // Try all 3 columns — handles every token generation history
  let profile = null
  for (const col of ["user_token", "ea_token", "admin_token"]) {
    const matches = await db.collectionGroup("profiles").where(col, "==", token).limit(1).get()
    if (!matches.empty) { profile = matches.docs[0].data(); break }
  }
  if (!profile) {
    return res.status(401).json({ error: "Invalid token. Go to Settings → API Keys, regenerate Sync EA Token, update UserToken in the EA." })
  }
  const userId = profile.id
  const userCollection = (name) => db.collection("users").doc(userId).collection(name)

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body }
  catch { return res.status(400).json({ error: "Invalid JSON body" }) }

  // ── 3. Heartbeat (no trades, just account ping) ────────────────────────────
  // The EA sends a heartbeat every SyncInterval seconds with account info
  const trades = Array.isArray(body) ? body : (body.trades || (body.ticket || body.mt5_ticket ? [body] : []))

  if (trades.length === 0) {
    const login = String(body.account_login || body.login || "")
    if (login) {
      const connection = {
        user_id:      userId,
        mt5_login:    login,
        account_name: body.account_name || body.name  || "",
        broker_name:  body.broker       || "MT5",
        server:       body.server       || "",
        balance:      parseFloat(body.balance)  || 0,
        equity:       parseFloat(body.equity)   || 0,
        currency:     body.currency     || "USD",
        leverage:     parseInt(body.leverage)   || 0,
        is_demo:      body.is_demo === true || body.is_demo === "true",
        is_mt5_live:  true,
        status:       "connected",
        last_sync:    new Date().toISOString(),
      }
      await userCollection("broker_connections").doc(`${userId}_${login}`).set(connection, { merge: true })
    }
    return res.status(200).json({ success: true, message: "heartbeat ok", inserted: 0, updated: 0, skipped: 0 })
  }

  // ── 4. Batch dedup — ONE query to get all existing tickets ─────────────────
  const allTickets = trades.map(t => String(t.ticket || t.mt5_ticket || "")).filter(Boolean)

  const existingDocs = []
  for (let i = 0; i < allTickets.length; i += 30) {
    const chunk = allTickets.slice(i, i + 30)
    if (chunk.length) {
      const snapshot = await userCollection("trades").where("mt5_ticket", "in", chunk).get()
      existingDocs.push(...snapshot.docs)
    }
  }

  // Map: "ticket:account_login" → existing row id
  const existingMap = new Map()
  existingDocs.forEach(doc => {
    const r = doc.data()
    existingMap.set(`${r.mt5_ticket}:${r.account_login || ""}`, doc.id)
  })

  // ── 5. Insert / update each trade ─────────────────────────────────────────
  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] }

  for (const raw of trades) {
    try {
      const ticket = String(raw.ticket || raw.mt5_ticket || "")
      const login  = String(raw.account_login || "")
      if (!ticket) { results.errors.push("Trade missing ticket/mt5_ticket field"); continue }

      // Calculate fields
      const pnl      = parseFloat(raw.pnl)        || 0
      const swap     = parseFloat(raw.swap)        || 0
      const comm     = parseFloat(raw.commission)  || 0
      const totalPnl = parseFloat(raw.total_pnl)  !== undefined ? parseFloat(raw.total_pnl) : (pnl + swap + comm)
      const outcome  = totalPnl > 0.005 ? "WIN" : totalPnl < -0.005 ? "LOSS" : "BREAKEVEN"

      // ── Core payload — ONLY columns that exist in the base schema + migration ──
      // Never add a field here unless you've confirmed the column exists via SQL
      const payload = {
        user_id:          userId,
        mt5_ticket:       ticket,
        account_login:    login,
        symbol:           (raw.symbol    || "UNKNOWN").toString().toUpperCase(),
        direction:        (raw.direction || "BUY").toString().toUpperCase(),
        entry_price:      parseFloat(raw.entry_price)  || 0,
        exit_price:       parseFloat(raw.exit_price)   || 0,
        pnl,
        pips:             parseFloat(raw.pips)          || 0,
        outcome,
        session:          raw.session   || null,
        timeframe:        raw.timeframe || null,
        entry_time:       raw.entry_time || null,
        exit_time:        raw.exit_time  || null,
        notes:            "[MT5 EA] Auto-synced",
        // Columns added by definitive_migration.sql
        lot_size:         parseFloat(raw.lot_size)      || 0,
        swap,
        commission:       comm,
        total_pnl:        totalPnl,
        gross_pnl:        pnl,
        sl:               parseFloat(raw.sl)            || 0,
        tp:               parseFloat(raw.tp)            || 0,
        rr:               parseFloat(raw.rr)            || 0,
        duration_min:     parseInt(raw.duration_min)    || 0,
        is_withdrawal:    raw.is_withdrawal     === true || raw.is_withdrawal === "true",
        withdrawal_amount:parseFloat(raw.withdrawal_amount) || 0,
      }

      const mapKey    = `${ticket}:${login}`
      const existingId = existingMap.get(mapKey)

      if (existingId) {
        // UPDATE existing trade
        await userCollection("trades").doc(existingId).set({ ...payload, updated_at: new Date().toISOString() }, { merge: true })
        results.updated++
      } else {
        // INSERT new trade
        const ref = userCollection("trades").doc(`${userId}_${ticket}`)
        await ref.set({ ...payload, id: ref.id, quality: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        results.inserted++
        existingMap.set(mapKey, ref.id)
      }
    } catch (e) {
      results.errors.push(`Exception on trade: ${e.message}`)
    }
  }

  const message = `${results.inserted} inserted · ${results.updated} updated · ${results.skipped} skipped`
  console.log(`ea-sync [${userId.slice(0,8)}]: ${message}`, results.errors.length ? `Errors: ${results.errors.slice(0,3).join(" | ")}` : "")

  return res.status(200).json({
    success: true,
    ...results,
    total:   trades.length,
    message,
  })
}
