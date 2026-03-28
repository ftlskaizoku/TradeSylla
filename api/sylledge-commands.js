// api/sylledge-commands.js
// Three routes handled:
//   POST /api/sylledge-commands          → SYLLEDGE creates a command
//   GET  /api/sylledge-commands/pending  → EA polls for pending commands
//   POST /api/sylledge-commands/response → EA sends back data
//   POST /api/sylledge-commands/ack      → EA marks command done/error

import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()

  const path  = req.url || ""
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim()

  // ── EA token auth helper ──────────────────────────────────────────────────
  async function getProfile() {
    const { data } = await supabase
      .from("profiles")
      .select("id, is_admin")
      .eq("ea_token", token)
      .single()
    return data
  }

  // ── User JWT auth helper ──────────────────────────────────────────────────
  async function getUser() {
    const { data } = await supabase.auth.getUser(token)
    return data?.user
  }

  // ── POST /api/sylledge-commands — SYLLEDGE creates a command ─────────────
  if (req.method === "POST" && !path.includes("/response") && !path.includes("/ack") && !path.includes("/pending")) {
    const user = await getUser()
    if (!user) return res.status(401).json({ error: "Unauthorized" })

    const { type, symbol, timeframe, from, to, limit } = req.body
    if (!type) return res.status(400).json({ error: "type required" })

    const { data, error } = await supabase
      .from("sylledge_commands")
      .insert({
        user_id:   user.id,
        type,
        symbol:    symbol   || null,
        timeframe: timeframe|| null,
        from:      from     || null,
        to:        to       || null,
        limit:     limit    || 500,
        status:    "pending",
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ── GET /api/sylledge-commands/pending — EA polls ────────────────────────
  if (req.method === "GET" && path.includes("/pending")) {
    const profile = await getProfile()
    if (!profile) return res.status(401).json({ error: "Invalid token" })

    const { data, error } = await supabase
      .from("sylledge_commands")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10)

    if (error) return res.status(500).json({ error: error.message })

    // Mark as processing
    if (data && data.length > 0) {
      const ids = data.map(c => c.id)
      await supabase
        .from("sylledge_commands")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .in("id", ids)
    }

    return res.status(200).json(data || [])
  }

  // ── POST /api/sylledge-commands/response — EA sends data back ─────────────
  if (req.method === "POST" && path.includes("/response")) {
    const profile = await getProfile()
    if (!profile) return res.status(401).json({ error: "Invalid token" })

    const { command_id, ...responseData } = req.body
    if (!command_id) return res.status(400).json({ error: "command_id required" })

    const { error } = await supabase
      .from("sylledge_commands")
      .update({
        status:     "done",
        response:   responseData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", command_id)

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  // ── POST /api/sylledge-commands/ack — EA acks with status ─────────────────
  if (req.method === "POST" && path.includes("/ack")) {
    const profile = await getProfile()
    if (!profile) return res.status(401).json({ error: "Invalid token" })

    const { command_id, status } = req.body
    if (!command_id) return res.status(400).json({ error: "command_id required" })

    await supabase
      .from("sylledge_commands")
      .update({ status: status || "done", updated_at: new Date().toISOString() })
      .eq("id", command_id)

    return res.status(200).json({ success: true })
  }

  return res.status(404).json({ error: "Not found" })
}
