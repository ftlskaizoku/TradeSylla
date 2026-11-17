// src/lib/useRealtimeSync.js
// Cross-device real-time sync via Firestore snapshots
// Subscribes to all tables and invalidates React Query cache on changes

import { useEffect, useRef, useCallback } from "react"
import { useQueryClient }                  from "@tanstack/react-query"
import { collection, onSnapshot }          from "firebase/firestore"
import { firestore }                       from "@/lib/firebase"
import { useUser }                         from "@/lib/UserContext"

const TABLES = [
  "trades",
  "playbooks",
  "backtest_sessions",
  "broker_connections",
  "sylledge_insights",
  "sylledge_memory",
  "sylledge_commands",
]

const TABLE_QUERY_KEYS = {
  trades:             ["trades"],
  playbooks:          ["playbooks"],
  backtest_sessions:  ["backtests"],
  broker_connections: ["broker_connections"],
  sylledge_insights:  ["insights"],
  sylledge_memory:    ["sylledge_memory"],
  sylledge_commands:  ["sylledge_commands"],
}

export function useRealtimeSync() {
  const { user }    = useUser()
  const queryClient = useQueryClient()
  const channelRef  = useRef(null)
  const userIdRef   = useRef(null)

  const handleChange = useCallback((table, payload) => {
    const keys = TABLE_QUERY_KEYS[table]
    if (keys) queryClient.invalidateQueries({ queryKey: keys })
    window.dispatchEvent(new CustomEvent("tradesylla:sync", {
      detail: { table, eventType: payload.eventType, record: payload.new || payload.old }
    }))
  }, [queryClient])

  useEffect(() => {
    if (!user?.id) return
    if (userIdRef.current === user.id && channelRef.current) return
    userIdRef.current = user.id

    if (channelRef.current) {
      channelRef.current.forEach(unsubscribe => unsubscribe())
      channelRef.current = null
    }

    channelRef.current = TABLES.map(table => onSnapshot(
      collection(firestore, "users", user.id, table),
      snapshot => snapshot.docChanges().forEach(change => handleChange(table, {
        eventType: change.type.toUpperCase(),
        new: change.type === "removed" ? null : { ...change.doc.data(), id: change.doc.id },
        old: change.type === "removed" ? { ...change.doc.data(), id: change.doc.id } : null,
      })),
      error => console.error(`[TradeSylla] Firestore sync failed for ${table}:`, error.message)
    ))
    return () => {
      if (channelRef.current) {
        channelRef.current.forEach(unsubscribe => unsubscribe())
        channelRef.current = null
        userIdRef.current  = null
      }
    }
  }, [user?.id, handleChange])
}

// Per-page hook: listen for sync events on a specific table
export function useTableSync(table, callback) {
  useEffect(() => {
    const handler = (e) => { if (e.detail?.table === table) callback() }
    window.addEventListener("tradesylla:sync", handler)
    return () => window.removeEventListener("tradesylla:sync", handler)
  }, [table, callback])
}
