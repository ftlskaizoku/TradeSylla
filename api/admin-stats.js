import { getAuth } from "firebase-admin/auth"
import { adminDb, firebaseAdmin } from "./_firebase.js"

const ADMIN_EMAILS = ["khalifadylla@gmail.com", "zoumxyz@gmail.com", "papeamdou48@gmail.com"]
const dateKey = d => d.toISOString().slice(0, 10)
const isRecent = (value, cutoff) => value && new Date(value).getTime() >= cutoff.getTime()

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  let db, identity
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "")
    if (!token) return res.status(401).json({ error: "Sign in required" })
    identity = await getAuth(firebaseAdmin()).verifyIdToken(token)
    if (!ADMIN_EMAILS.includes(identity.email)) return res.status(403).json({ error: "Admin access required" })
    db = adminDb()
  } catch { return res.status(401).json({ error: "Invalid session" }) }

  try {
    const now = new Date()
    const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 29); cutoff30.setHours(0,0,0,0)
    const cutoff7 = new Date(now); cutoff7.setDate(cutoff7.getDate() - 7)
    const cutoff24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const userDocs = []
    let pageToken
    do {
      const page = await getAuth(firebaseAdmin()).listUsers(1000, pageToken)
      userDocs.push(...page.users)
      pageToken = page.pageToken
    } while (pageToken)

    const loadCollection = async name => {
      const snap = await db.collectionGroup(name).get()
      return snap.docs.map(d => d.data())
    }
    const [tradesAll, playbooks, backtests, viewsAll] = await Promise.all([
      loadCollection("trades"), loadCollection("playbooks"), loadCollection("backtest_sessions"), loadCollection("page_views"),
    ])
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(cutoff30); d.setDate(d.getDate() + i)
      return dateKey(d)
    })
    const group = (items, field, label) => {
      const counts = new Map(days.map(day => [day, 0]))
      items.forEach(item => {
        const when = item[field]
        if (isRecent(when, cutoff30)) {
          const key = dateKey(new Date(when))
          if (counts.has(key)) counts.set(key, counts.get(key) + 1)
        }
      })
      return days.map(date => ({ date, [label]: counts.get(date) || 0 }))
    }
    const signups = userDocs.map(u => ({ created_at: u.metadata.creationTime }))
    const pages = new Map()
    viewsAll.filter(v => isRecent(v.created_at, cutoff30)).forEach(v => pages.set(v.page || "Unknown", (pages.get(v.page || "Unknown") || 0) + 1))
    const totalViews = viewsAll.length
    const stats = {
      total_users: userDocs.length,
      new_users_24h: userDocs.filter(u => new Date(u.metadata.creationTime) >= cutoff24).length,
      new_users_7d: userDocs.filter(u => new Date(u.metadata.creationTime) >= cutoff7).length,
      new_users_30d: userDocs.filter(u => new Date(u.metadata.creationTime) >= cutoff30).length,
      active_24h: userDocs.filter(u => u.metadata.lastSignInTime && new Date(u.metadata.lastSignInTime) >= cutoff24).length,
      active_7d: userDocs.filter(u => u.metadata.lastSignInTime && new Date(u.metadata.lastSignInTime) >= cutoff7).length,
      total_trades: tradesAll.length,
      new_trades_7d: tradesAll.filter(t => isRecent(t.created_at, cutoff7)).length,
      new_trades_24h: tradesAll.filter(t => isRecent(t.created_at, cutoff24)).length,
      total_playbooks: playbooks.length,
      total_backtests: backtests.length,
      total_views: totalViews,
      views_7d: viewsAll.filter(v => isRecent(v.created_at, cutoff7)).length,
      views_24h: viewsAll.filter(v => isRecent(v.created_at, cutoff24)).length,
    }
    return res.status(200).json({
      stats,
      signups: group(signups.map(u => ({ created_at: u.created_at })), "created_at", "signups"),
      views: group(viewsAll, "created_at", "views"),
      trades: group(tradesAll, "created_at", "trades"),
      pages: [...pages.entries()].map(([page, views]) => ({ page, views })).sort((a,b) => b.views-a.views).slice(0,10),
    })
  } catch (error) {
    console.error("Admin stats error", error)
    return res.status(500).json({ error: "Could not load admin stats" })
  }
}
