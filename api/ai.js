// Vercel Serverless Function — AI proxy
// The Anthropic API key lives ONLY here as a Vercel env var.
// The client sends messages, this function adds the key and forwards to Anthropic.

export const config = { runtime: "edge" }

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "AI service not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const body = await req.json()
    const { system, messages, max_tokens = 1000 } = body

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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

    const data = await response.json()

    if (!response.ok) {
      console.error("Anthropic error:", data)
      return new Response(JSON.stringify({ error: data.error?.message || "AI request failed" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (e) {
    console.error("AI proxy error:", e)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
