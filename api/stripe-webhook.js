// Vercel Serverless Function — Stripe Webhook
// Listens for payment events and updates user plan in Supabase

import { createClient } from "@supabase/supabase-js"

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  const stripeSecret  = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseUrl   = process.env.VITE_SUPABASE_URL
  const supabaseKey   = process.env.SUPABASE_SERVICE_ROLE_KEY  // service role — full access

  if (!stripeSecret || !webhookSecret || !supabaseUrl || !supabaseKey) {
    return new Response("Missing env vars", { status: 503 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const body = await req.text()
    const sig  = req.headers.get("stripe-signature")

    // Verify Stripe signature (use crypto to avoid Stripe SDK dependency)
    // Simple event processing without signature verification for now
    const event = JSON.parse(body)

    if (event.type === "checkout.session.completed") {
      const session  = event.data.object
      const userId   = session.metadata?.user_id
      const plan     = session.metadata?.plan
      const subId    = session.subscription

      if (userId && plan) {
        const planTier = plan.startsWith("elite") ? "elite" : "pro"
        await supabase
          .from("profiles")
          .upsert({
            id:              userId,
            plan:            planTier,
            stripe_sub_id:   subId,
            plan_updated_at: new Date().toISOString(),
          })
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub    = event.data.object
      const subId  = sub.id
      // Find user by stripe_sub_id and downgrade
      await supabase
        .from("profiles")
        .update({ plan: "free", stripe_sub_id: null })
        .eq("stripe_sub_id", subId)
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch(e) {
    console.error("Webhook error:", e)
    return new Response("Webhook error", { status: 400 })
  }
}
