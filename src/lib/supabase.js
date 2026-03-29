// src/lib/supabase.js
// persistSession: true  = session survives browser close / new deployments
// storage: localStorage = survives even if IndexedDB is wiped
// autoRefreshToken: true = silently refreshes JWT before expiry

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase env vars — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel")
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:   true,          // ← keeps session across deployments
    storage:          localStorage,  // ← survives hard refreshes
    autoRefreshToken: true,          // ← silently renews JWT
    detectSessionInUrl: true,        // ← handles magic link / OAuth redirects
    storageKey: "tradesylla_auth",   // ← stable key name (won't change per deployment)
  },
})
