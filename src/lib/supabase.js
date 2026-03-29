// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession:     true,
    storage:            localStorage,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
    storageKey:         "tradesylla_auth",
  },
})

export const authHelpers = {
  signUp: (email, password) =>
    supabase.auth.signUp({ email, password }),

  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  signOut: () =>
    supabase.auth.signOut(),

  getSession: () =>
    supabase.auth.getSession(),

  getUser: () =>
    supabase.auth.getUser(),

  onAuthStateChange: (callback) =>
    supabase.auth.onAuthStateChange(callback),

  resetPassword: (email) =>
    supabase.auth.resetPasswordForEmail(email),

  updatePassword: (newPassword) =>
    supabase.auth.updateUser({ password: newPassword }),
}
