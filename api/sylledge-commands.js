// Vercel endpoints for creating and polling SYLLEDGE market data commands.
import { getAuth } from "firebase-admin/auth"
import { adminDb, firebaseAdmin } from "./_firebase.js"

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()
  let db
  try { db = adminDb() } catch (e) { return res.status(500).json({ error: e.message }) }

  const path = req.url || ""
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim()
  const getProfile = async () => {
    if (!token) return null
    const snap = await db.collectionGroup("profiles").where("ea_token", "==", token).limit(1).get()
    return snap.empty ? null : snap.docs[0].data()
  }
  const getUser = async () => {
    if (!token) return null
    try { return await getAuth(firebaseAdmin()).verifyIdToken(token) } catch { return null }
  }

  // Authenticated TradeSylla client creates an EA command.
  if (req.method === "POST" && !/\/(response|ack|pending)(\?|$)/.test(path)) {
    const user = await getUser()
    if (!user) return res.status(401).json({ error: "Unauthorized" })
    const { type, symbol, timeframe, from, to, limit } = req.body || {}
    if (!type) return res.status(400).json({ error: "type required" })
    const ref = db.collection("users").doc(user.uid).collection("sylledge_commands").doc()
    const command = { id: ref.id, user_id: user.uid, type, symbol: symbol || null, timeframe: timeframe || null, from: from || null, to: to || null, limit: limit || 500, status: "pending", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    await ref.set(command)
    return res.status(200).json(command)
  }

  if (req.method === "GET" && path.includes("/pending")) {
    const profile = await getProfile()
    if (!profile?.id) return res.status(401).json({ error: "Invalid token" })
    const snap = await db.collection("users").doc(profile.id).collection("sylledge_commands").where("status", "==", "pending").orderBy("created_at", "asc").limit(10).get()
    const commands = snap.docs.map(d => ({ ...d.data(), id: d.id }))
    await Promise.all(snap.docs.map(d => d.ref.update({ status: "processing", updated_at: new Date().toISOString() })))
    return res.status(200).json(commands)
  }

  if (req.method === "POST" && (path.includes("/response") || path.includes("/ack"))) {
    const profile = await getProfile()
    if (!profile?.id) return res.status(401).json({ error: "Invalid token" })
    const { command_id, status, ...responseData } = req.body || {}
    if (!command_id) return res.status(400).json({ error: "command_id required" })
    const ref = db.collection("users").doc(profile.id).collection("sylledge_commands").doc(command_id)
    const snap = await ref.get()
    if (!snap.exists) return res.status(404).json({ error: "Command not found" })
    const update = { status: path.includes("/response") ? "done" : (status || "done"), updated_at: new Date().toISOString() }
    if (path.includes("/response")) update.response = responseData
    await ref.update(update)
    return res.status(200).json({ success: true })
  }
  return res.status(404).json({ error: "Not found" })
}
