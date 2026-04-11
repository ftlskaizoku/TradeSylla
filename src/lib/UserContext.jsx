import { createContext, useState, useContext, useEffect } from 'react'
import { supabase, authHelpers } from '@/lib/supabase'
import { migrateLocalToSupabase } from '@/api/supabaseStore'

const UserContext = createContext()

export const UserProvider = ({ children }) => {
  const [user,    setUser]    = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // FIX: setLoading(false) must fire AFTER buildProfileWithPlan resolves,
    // not before. Previously the race was:
    //   1. getSession() resolves  → setLoading(false) immediately
    //   2. buildProfileWithPlan() still pending (async DB call)
    //   3. ProtectedRoute sees loading=false + user=null → redirect to /auth
    //   4. Profile resolves too late — user already kicked out
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) {
        const profile = await buildProfileWithPlan(session.user)
        setUser(profile)
      } else {
        setUser(null)
      }
      setLoading(false) // ← only after user is fully resolved
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      if (session) {
        buildProfileWithPlan(session.user).then(setUser)
        if (event === 'SIGNED_IN') {
          try {
            migrateLocalToSupabase(session.user.id)
              .then(({ migrated }) => {
                if (migrated > 0) console.log(`Migrated ${migrated} records to Supabase`)
              })
              .catch(() => {})
          } catch {}
        }
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function buildProfileWithPlan(u) {
    const m = u.user_metadata || {}
    const base = {
      id:         u.id,
      email:      u.email,
      full_name:  m.full_name || m.name || u.email?.split('@')[0] || 'Trader',
      avatar_url: m.avatar_url || m.picture || null,
      currency:   m.currency || 'USD',
      bio:        m.bio || '',
      created_at: u.created_at,
      plan:       'free',
    }
    try {
      const { data } = await supabase.from('profiles').select('plan').eq('id', u.id).single()
      if (data?.plan) base.plan = data.plan
    } catch {}
    return base
  }

  const updateUser = async (data) => {
    if (!session) return
    await supabase.auth.updateUser({ data })
    setUser(u => ({ ...u, ...data }))
  }

  const signOut = () => authHelpers.signOut()

  const ADMIN_EMAILS = ["khalifadylla@gmail.com", "zoumxyz@gmail.com"]
  const isAdmin = ADMIN_EMAILS.includes(user?.email)
  const isPro   = isAdmin || user?.plan === "pro" || user?.plan === "elite"
  const isElite = isAdmin || user?.plan === "elite"

  return (
    <UserContext.Provider value={{ user, session, loading, updateUser, signOut, isAdmin, isPro, isElite }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used inside UserProvider')
  return ctx
}
