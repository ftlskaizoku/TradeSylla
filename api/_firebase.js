import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

let app
export function firebaseAdmin() {
  if (app) return app
  if (getApps().length) { app = getApps()[0]; return app }
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!projectId || !clientEmail || !privateKey) throw new Error("Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY")
  app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId })
  return app
}

export async function verifyFirebaseRequest(req) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return null
  try { return await getAuth(firebaseAdmin()).verifyIdToken(token) } catch { return null }
}

export function adminDb() { return getFirestore(firebaseAdmin()) }
