import { initializeApp, getApps } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)
if (!firebaseConfigured) console.error("[TradeSylla] Firebase config missing. Set VITE_FIREBASE_* in the environment.")

const safeConfig = {
  ...config,
  apiKey: config.apiKey || "firebase-config-required",
  authDomain: config.authDomain || "localhost",
  projectId: config.projectId || "demo-tradesylla",
  appId: config.appId || "firebase-config-required",
}
const app = getApps().length ? getApps()[0] : initializeApp(safeConfig)
export const firebaseAuth = getAuth(app)
export const firestore = getFirestore(app)
