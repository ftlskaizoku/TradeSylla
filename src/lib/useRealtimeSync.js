// src/lib/useRealtimeSync.js
// Single hook that subscribes to ALL TradeSylla tables via Supabase Realtime.
// Import this once in App.jsx and it keeps every page in sync across devices.
//
// Usage in App.jsx:
//   import { useRealtimeSync } from "@/lib/useRealtimeSync"
//   function AppRoutes() {
//     useRealtimeSync()          // <-- add this one line
//     ...
//   }

import { useEffect, useRef, useCallback } from "react"
import { useQueryClient }                  from "@tanstack/react-query"
import { supabase }                        from "@/lib/supabase"
import { useUser }                         from "@/lib/UserContext"

// All tables that need cross-device sync
const TABLES = [
  "trades",
  "playbooks",
  "backtest_sessions",
  "broker_connections",
  "sylledge_insights",
  "sylledge_memory",
]

// React Query cache keys that map to each table
// When a realtime event fires we invalidate the right cache key
// so every component that reads that data refetches automatically
const TABLE_QUERY_KEYS = {
  trades:             ["trades"],
  playbooks:          ["playbooks"],
  backtest_sessions:  ["backtests"],
  broker_connections: ["broker_connections"],
  sylledge_insights:  ["insights"],
  sylledge_memory:    ["sylledge_memory"],
}

export function useRealtimeSync() {
  const { user }         = useUser()
  const queryClient      = useQueryClient()
  const channelRef       = useRef(null)
  const userIdRef        = useRef(null)

  const handleChange = useCallback((table, payload) => {
    const keys = TABLE_QUERY_KEYS[table]
    if (keys) {
      // Invalidate React Query cache — components will refetch
      queryClient.invalidateQueries({ queryKey: keys })
    }

    // Also dispatch a custom DOM event so pages that use
    // direct Supabase calls (not React Query) can listen
    window.dispatchEvent(
      new CustomEvent("tradesylla:sync", {
        detail: { table, eventType: payload.eventType, record: payload.new || payload.old }
      })
    )
  }, [queryClient])

  useEffect(() => {
    if (!user?.id) return

    // Avoid duplicate subscriptions if user ID hasn't changed
    if (userIdRef.current === user.id && channelRef.current) return
    userIdRef.current = user.id

    // Clean up any existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    // Create a single multiplexed channel for all tables
    const channel = supabase.channel(`tradesylla_realtime_${user.id}`)

    TABLES.forEach(table => {
      channel.on(
        "postgres_changes",
        {
          event:  "*",          // INSERT, UPDATE, DELETE
          schema: "public",
          table,
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          handleChange(table, payload)
        }
      )
    })

    // Also listen for broker_connections without user_id filter
    // (heartbeat upserts come from service role without user_id context)
    channel.on(
      "postgres_changes",
      {
        event:  "UPDATE",
        schema: "public",
        table:  "broker_connections",
      },
      (payload) => {
        if (payload.new?.user_id === user.id) {
          handleChange("broker_connections", payload)
        }
      }
    )

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[TradeSylla] Realtime sync active —", TABLES.length, "tables")
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[TradeSylla] Realtime channel error:", status)
        // Auto-reconnect after 5s
        setTimeout(() => {
          userIdRef.current = null  // force reconnect on next render
        }, 5000)
      }
    })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
        userIdRef.current  = null
      }
    }
  }, [user?.id, handleChange])
}

// ─── Page-level hook ──────────────────────────────────────────────────────────
// Use this in individual pages to reload data when a specific table changes.
// Example:
//   useTableSync("trades", loadTrades)
//   useTableSync("playbooks", loadPlaybooks)
export function useTableSync(table, callback) {
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.table === table) callback()
    }
    window.addEventListener("tradesylla:sync", handler)
    return () => window.removeEventListener("tradesylla:sync", handler)
  }, [table, callback])
}
