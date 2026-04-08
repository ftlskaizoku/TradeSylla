import { createContext, useState, useContext, useEffect } from 'react'
import { supabase, authHelpers } from '@/lib/supabase'
import { migrateLocalToSupabase } from '@/api/supabaseStore'

const UserContext = createContext()

export const UserProvider = ({ children }) => {
  const [user,    setUser]    = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) { buildProfileWithPlan(session.user).then(setUser) } else { setUser(null) }
      setLoading(false)
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

  function buildProfile(u) {
    const m = u.user_metadata || {}
    return {
      id:         u.id,
      email:      u.email,
      full_name:  m.full_name || m.name || u.email?.split('@')[0] || 'Trader',
      avatar_url: m.avatar_url || m.picture || null,
      currency:   m.currency || 'USD',
      bio:        m.bio || '',
      created_at: u.created_at,
      plan:       'free',
    }
  }

  const updateUser = async (data) => {
    if (!session) return
    await supabase.auth.updateUser({ data })
    setUser(u => ({ ...u, ...data }))
  }

  const signOut = () => authHelpers.signOut()

  // Plan helpers
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
