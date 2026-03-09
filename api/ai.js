// Vercel Serverless Function — AI proxy
// Currently using Groq (free). Switch to Anthropic: flip USE_ANTHROPIC to true
// and add ANTHROPIC_API_KEY to Vercel env vars.

export const config = { runtime: "edge" }

const USE_ANTHROPIC = false  // ← change to true once Anthropic key is added

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json()
    const { system, messages, max_tokens = 1024 } = body

    if (USE_ANTHROPIC) {
      // ── Anthropic (Claude) ────────────────────────────────────────────
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) return errorResponse("AI service not configured.", 503)

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model:      "claude-haiku-4-5-20251001",
          max_tokens,
          system,
          messages,
        }),
      })
      const data = await res.json()
      if (!res.ok) return errorResponse(data.error?.message || "AI request failed", res.status)

      // Return in Anthropic format (Sylledge already parses this)
      return okResponse(data)

    } else {
      // ── Groq (Llama — free) ───────────────────────────────────────────
      const apiKey = process.env.GROQ_API_KEY
      if (!apiKey) return errorResponse("AI service not configured.", 503)

      // Groq uses OpenAI-compatible format — merge system into messages
      const groqMessages = [
        { role: "system", content: system || "You are SYLLEDGE AI, an elite trading coach." },
        ...messages,
      ]

      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model:      "llama-3.3-70b-versatile",
          max_tokens,
          messages:   groqMessages,
        }),
      })
      const data = await res.json()
      if (!res.ok) return errorResponse(data.error?.message || "AI request failed", res.status)

      // Normalize to Anthropic format so Sylledge.jsx needs zero changes
      const text = data.choices?.[0]?.message?.content || "No response generated."
      return okResponse({
        content: [{ type: "text", text }]
      })
    }

  } catch (e) {
    console.error("AI proxy error:", e)
    return errorResponse("Internal server error", 500)
  }
}

function okResponse(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}

function errorResponse(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { "Content-Type": "application/json" },
  })
}