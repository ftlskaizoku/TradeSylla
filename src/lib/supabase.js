import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
  },
})

// ── Auth helpers ──────────────────────────────────────────────────────────────
export const authHelpers = {
  signUp: (email, password, fullName) =>
    supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    }),

  signIn: (email, password, rememberMe = false) =>
    supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        // 30 days if remembered, browser session only if not
        expiresIn: rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8,
      }
    }),

  signInGoogle: () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/Dashboard` },
    }),

  signInMicrosoft: () =>
    supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { redirectTo: `${window.location.origin}/Dashboard` },
    }),

  signOut: () => supabase.auth.signOut(),

  resetPassword: (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    }),

  getSession: () => supabase.auth.getSession(),

  onAuthStateChange: (cb) => supabase.auth.onAuthStateChange(cb),
}
