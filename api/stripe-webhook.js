// Vercel Serverless Function — Stripe Webhook
// Listens for payment events and updates user plan in Firestore

import { adminDb } from "./_firebase.js"
import { createHmac, timingSafeEqual } from "node:crypto"

function validStripeSignature(body, header, secret) {
  if (!header || !secret) return false
  const parts = Object.fromEntries(header.split(",").map(part => {
    const [key, value] = part.split("=", 2)
    return [key, value]
  }))
  const timestamp = Number(parts.t)
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return false
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
  const received = Buffer.from(parts.v1, "hex")
  const expectedBuffer = Buffer.from(expected, "hex")
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer)
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    return new Response("Missing env vars", { status: 503 })
  }

  let db
  try { db = adminDb() } catch (e) { return new Response(e.message, { status: 503 }) }

  try {
    const body = await req.text()
    const sig  = req.headers.get("stripe-signature")
    if (!validStripeSignature(body, sig, webhookSecret)) return new Response("Invalid Stripe signature", { status: 400 })
    const event = JSON.parse(body)

    if (event.type === "checkout.session.completed") {
      const session  = event.data.object
      const userId   = session.metadata?.user_id
      const plan     = session.metadata?.plan
      const subId    = session.subscription

      if (userId && plan) {
        const planTier = plan.startsWith("elite") ? "elite" : "pro"
        await db.collection("users").doc(userId).collection("profiles").doc(userId).set({
            user_id:         userId,
            id:              userId,
            plan:            planTier,
            stripe_sub_id:   subId,
            plan_updated_at: new Date().toISOString(),
          }, { merge: true })
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub    = event.data.object
      const subId  = sub.id
      const matches = await db.collectionGroup("profiles").where("stripe_sub_id", "==", subId).get()
      await Promise.all(matches.docs.map(profile => profile.ref.update({ plan: "free", stripe_sub_id: null })))
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch(e) {
    console.error("Webhook error:", e)
    return new Response("Webhook error", { status: 400 })
  }
}
