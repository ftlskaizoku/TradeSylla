// src/lib/supabase.js  — CANONICAL VERSION
//
// FIX: Removed `storageKey: "tradesylla_auth"` override.
// Two different supabase.js files existed in the project:
//   - one with storageKey: "tradesylla_auth"
//   - one without (using Supabase's default key)
// When the sign-in stored the session under one key and another client
// read from a different key, the session wasn't found on page refresh
// → user was redirected to auth page.
//
// Now both use Supabase's default storage key so they always agree.

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[TradeSylla] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env")
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:     true,          // store session in localStorage
    autoRefreshToken:   true,          // silently refresh JWT before it expires
    detectSessionInUrl: true,          // handle OAuth redirects
    // ← No storageKey override: use Supabase default so all clients agree
  },
})

export const authHelpers = {
  signUp: (email, password, fullName) =>
    supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    }),

  // Note: expiresIn is NOT a valid Supabase signIn option (silently ignored).
  // Session duration is controlled in Supabase dashboard:
  //   Authentication → Settings → JWT Expiry (set to 604800 = 7 days)
  //   and Refresh Token Expiry (set to 5184000 = 60 days)
  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  signInGoogle: () =>
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/Dashboard` },
    }),

  signInMicrosoft: () =>
    supabase.auth.signInWithOAuth({
      provider: "azure",
      options: { redirectTo: `${window.location.origin}/Dashboard` },
    }),

  signOut: () => supabase.auth.signOut(),

  resetPassword: (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    }),

  getSession:          () => supabase.auth.getSession(),
  getUser:             () => supabase.auth.getUser(),
  onAuthStateChange:   (cb) => supabase.auth.onAuthStateChange(cb),
  updatePassword:      (pw) => supabase.auth.updateUser({ password: pw }),
}
