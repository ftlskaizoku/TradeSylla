// Vercel Serverless Function — SYLLEDGE AI proxy
// Uses Anthropic Claude (claude-haiku — fast + cheap)
// To activate: add ANTHROPIC_API_KEY to Vercel Environment Variables

export const config = { runtime: "edge" }

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "AI not yet active — Anthropic payment pending." }), {
      status: 503, headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const { system, messages, max_tokens = 1200 } = await req.json()

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
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "AI request failed" }), {
        status: res.status, headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    })
  }
}
