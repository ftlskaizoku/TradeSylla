// api/ea-sync.js  v4.1
// FIX 1: quality score is NEVER overwritten by EA sync — user edits preserved
// FIX 2: entry_time and exit_time imported correctly from EA
// FIX 3: UPDATE vs INSERT logic — only quality=5 on first INSERT

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" })

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.authorization || ""
  const token      = authHeader.replace("Bearer ", "").trim()
  if (!token) return res.status(401).json({ error: "Missing token" })

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, ea_token")
    .eq("ea_token", token)
    .single()

  if (profileError || !profile)
    return res.status(401).json({ error: "Invalid token" })

  const userId = profile.id

  // ── Parse body ───────────────────────────────────────────────────────────────
  const body   = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  const trades = Array.isArray(body) ? body : body.trades || [body]

  const results = { inserted: 0, updated: 0, skipped: 0, errors: [] }

  for (const raw of trades) {
    try {
      // ── Determine outcome from total P&L ──────────────────────────────────
      const totalPnl = parseFloat(raw.total_pnl ?? raw.pnl ?? 0)
      let outcome = "BREAKEVEN"
      if (totalPnl >  0.01) outcome = "WIN"
      if (totalPnl < -0.01) outcome = "LOSS"

      const ticket        = String(raw.ticket || raw.mt5_ticket || "")
      const accountLogin  = String(raw.account_login || "")

      if (!ticket) { results.errors.push("Missing ticket"); continue }

      // ── Check if trade already exists ─────────────────────────────────────
      const { data: existing } = await supabase
        .from("trades")
        .select("id, quality")
        .eq("user_id",      userId)
        .eq("mt5_ticket",   ticket)
        .eq("account_login",accountLogin)
        .single()

      // ── Build trade payload — NO quality field (never overwrite) ──────────
      const tradePayload = {
        user_id:        userId,
        mt5_ticket:     ticket,
        account_login:  accountLogin,
        symbol:         raw.symbol       || "",
        direction:      raw.direction    || "BUY",
        entry_price:    parseFloat(raw.entry_price  || 0),
        exit_price:     parseFloat(raw.exit_price   || 0),
        lot_size:       parseFloat(raw.lot_size     || 0),
        pnl:            parseFloat(raw.pnl          || 0),
        swap:           parseFloat(raw.swap         || 0),
        commission:     parseFloat(raw.commission   || 0),
        total_pnl:      totalPnl,
        pips:           parseFloat(raw.pips         || 0),
        outcome,
        timeframe:      raw.timeframe   || null,
        session:        raw.session     || null,
        // ── Entry/exit times from EA (ISO 8601 strings) ────────────────────
        entry_time:     raw.entry_time  || null,
        exit_time:      raw.exit_time   || null,
        // ── Withdrawal flag ────────────────────────────────────────────────
        is_withdrawal:     raw.is_withdrawal     || false,
        withdrawal_amount: raw.withdrawal_amount || 0,
      }

      if (existing) {
        // UPDATE existing trade — NEVER touch quality column
        const { error: updateError } = await supabase
          .from("trades")
          .update(tradePayload)
          .eq("id", existing.id)

        if (updateError) {
          results.errors.push(`Update ${ticket}: ${updateError.message}`)
        } else {
          results.updated++
        }
      } else {
        // INSERT new trade — quality defaults to 5 only here
        const { error: insertError } = await supabase
          .from("trades")
          .insert({ ...tradePayload, quality: 5 })

        if (insertError) {
          if (insertError.code === "23505") {
            results.skipped++ // race condition duplicate — ignore
          } else {
            results.errors.push(`Insert ${ticket}: ${insertError.message}`)
          }
        } else {
          results.inserted++
        }
      }
    } catch (e) {
      results.errors.push(`Parse error: ${e.message}`)
    }
  }

  return res.status(200).json({
    success: true,
    ...results,
    total: trades.length,
  })
}
