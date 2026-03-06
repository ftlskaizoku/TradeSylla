// Vercel Serverless Function — Stripe Checkout Session
// Creates a Stripe checkout session for Pro subscription

export const config = { runtime: "edge" }

const PLANS = {
  pro_monthly: { price: "price_pro_monthly", name: "Pro Monthly" },
  pro_yearly:  { price: "price_pro_yearly",  name: "Pro Yearly"  },
  elite_monthly:{ price: "price_elite_monthly", name: "Elite Monthly" },
  elite_yearly: { price: "price_elite_yearly",  name: "Elite Yearly"  },
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "Payments not configured." }), { status: 503 })
  }

  try {
    const { plan, userId, email, successUrl, cancelUrl } = await req.json()

    const planConfig = PLANS[plan]
    if (!planConfig) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), { status: 400 })
    }

    const session = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type":  "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode":                               "subscription",
        "customer_email":                     email,
        "line_items[0][price]":               planConfig.price,
        "line_items[0][quantity]":            "1",
        "success_url":                        successUrl || "https://tradesylla.vercel.app/Settings?upgraded=true",
        "cancel_url":                         cancelUrl  || "https://tradesylla.vercel.app/pricing",
        "metadata[user_id]":                  userId,
        "metadata[plan]":                     plan,
        "allow_promotion_codes":              "true",
        "billing_address_collection":         "auto",
        "subscription_data[trial_period_days]":"7",
      }).toString(),
    })

    const sessionData = await session.json()

    if (!session.ok) {
      return new Response(JSON.stringify({ error: sessionData.error?.message }), { status: 400 })
    }

    return new Response(JSON.stringify({ url: sessionData.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 })
  }
}
