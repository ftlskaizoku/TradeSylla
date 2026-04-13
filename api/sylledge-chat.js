// api/sylledge-chat.js — SYLLEDGE AI proxy
// Simple Node.js runtime, no Supabase auth (ANTHROPIC_API_KEY guard is enough)
// Model: claude-haiku-4-5-20251001 (fastest Claude — answers in ~1-2s)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return res.status(503).json({ error: "SYLLEDGE AI not configured — add ANTHROPIC_API_KEY in Vercel settings" })
  }

  const body   = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  const { system, messages, max_tokens = 6000 } = body

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
        model:      "claude-haiku-4-5-20251001",
        max_tokens,
        system:     system || "You are SYLLEDGE AI, an elite trading coach.",
        messages,
      }),
    })

    const data = await anthropicRes.json()

    if (!anthropicRes.ok) {
      console.error("Anthropic error:", data)
      return res.status(anthropicRes.status).json({
        error: data.error?.message || "AI request failed — check your API key"
      })
    }

    return res.status(200).json(data)

  } catch (err) {
    console.error("sylledge-chat error:", err)
    return res.status(500).json({ error: "Failed to reach AI: " + err.message })
  }
}
