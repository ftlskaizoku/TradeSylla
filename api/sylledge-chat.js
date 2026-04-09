// api/sylledge-chat.js
// Server-side Claude proxy — users never need their own API key.
// SYLLEDGE calls this endpoint; this calls Anthropic using the server key.
// Auth: valid Supabase JWT required (user must be logged in).

import { createClient } from "@supabase/supabase-js"

const SUPA_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPA_URL, SUPA_KEY)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" })

  // ── 1. Verify user is logged in via Supabase JWT ───────────────────────
  const authHeader = req.headers.authorization || ""
  const jwt        = authHeader.replace("Bearer ", "").trim()

  if (!jwt) return res.status(401).json({ error: "Not authenticated" })

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !user) return res.status(401).json({ error: "Invalid session — please log in again" })

  // ── 2. Check server has the API key ────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return res.status(500).json({ error: "Server configuration error — contact admin" })
  }

  // ── 3. Forward request to Anthropic ───────────────────────────────────
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  const { model, max_tokens, system, messages } = body

  if (!messages?.length) return res.status(400).json({ error: "messages required" })

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      model      || "claude-sonnet-4-6",
        max_tokens: max_tokens || 2048,
        system,
        messages,
      }),
    })

    const data = await anthropicRes.json()

    if (!anthropicRes.ok) {
      console.error("Anthropic error:", anthropicRes.status, data)
      return res.status(anthropicRes.status).json({
        error: data.error?.message || `Anthropic returned ${anthropicRes.status}`
      })
    }

    return res.status(200).json(data)

  } catch (err) {
    return res.status(500).json({ error: "Failed to reach Anthropic: " + err.message })
  }
}
