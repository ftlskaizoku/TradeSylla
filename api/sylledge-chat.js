// api/sylledge-chat.js — SYLLEDGE AI proxy with streaming + claude-sonnet-4-6
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const config = { runtime: "edge" }

export default async function handler(req) {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    })
  }

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "").trim()
  if (!jwt) return new Response(JSON.stringify({ error: "Not authenticated" }), {
    status: 401, headers: { "Content-Type": "application/json" }
  })

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)
  if (authError || !user) return new Response(JSON.stringify({ error: "Invalid session" }), {
    status: 401, headers: { "Content-Type": "application/json" }
  })

  // ── 2. API key ───────────────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) return new Response(JSON.stringify({ error: "AI not configured" }), {
    status: 500, headers: { "Content-Type": "application/json" }
  })

  // ── 3. Parse body ────────────────────────────────────────────────────────
  const body = await req.json()
  const { system, messages, max_tokens = 2048, stream = true } = body
  if (!messages?.length) return new Response(JSON.stringify({ error: "messages required" }), {
    status: 400, headers: { "Content-Type": "application/json" }
  })

  // ── 4. Call Anthropic with streaming ─────────────────────────────────────
  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",  // Fast + smart — upgraded
      max_tokens,
      system,
      messages,
      stream: true,
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.json()
    return new Response(JSON.stringify({ error: err.error?.message || "Anthropic error" }), {
      status: anthropicRes.status, headers: { "Content-Type": "application/json" }
    })
  }

  // ── 5. Stream the response back ───────────────────────────────────────────
  // Transform Anthropic's SSE stream → readable text stream for the client
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  const readable = new ReadableStream({
    async start(controller) {
      const reader = anthropicRes.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"))
            controller.close()
            break
          }
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split("\n")
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6).trim()
            if (data === "[DONE]") continue
            try {
              const evt = JSON.parse(data)
              // Extract text delta from content_block_delta events
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                const text = evt.delta.text
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
              }
            } catch {}
          }
        }
      } catch (e) {
        controller.error(e)
      }
    }
  })

  return new Response(readable, {
    headers: {
      "Content-Type":                "text/event-stream",
      "Cache-Control":               "no-cache",
      "Connection":                  "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
