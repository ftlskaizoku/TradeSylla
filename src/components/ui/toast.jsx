import { useState, useEffect } from "react"
import { CheckCircle, AlertCircle, Info } from "lucide-react"

const listeners = []
let toastId = 0
let state = []

export function toast(msg, opts) {
  const id = ++toastId
  const t = { id, msg, type: (opts && opts.type) || "default", dur: (opts && opts.dur) || 3000 }
  state = [...state, t]
  listeners.forEach(l => l([...state]))
  setTimeout(() => {
    state = state.filter(x => x.id !== id)
    listeners.forEach(l => l([...state]))
  }, t.dur)
  return id
}
toast.success = (m, o) => toast(m, { ...o, type: "success" })
toast.error   = (m, o) => toast(m, { ...o, type: "error" })

export function Toaster() {
  const [toasts, setToasts] = useState([])
  useEffect(() => {
    listeners.push(setToasts)
    return () => { const i = listeners.indexOf(setToasts); if (i > -1) listeners.splice(i, 1) }
  }, [])
  const colors = {
    success: { bg: "rgba(46,213,115,0.1)", border: "rgba(46,213,115,0.3)", color: "var(--accent-success)" },
    error:   { bg: "rgba(255,71,87,0.1)",  border: "rgba(255,71,87,0.3)",  color: "var(--accent-danger)" },
    default: { bg: "var(--bg-elevated)",   border: "var(--border)",         color: "var(--text-primary)" },
  }
  const icons = { success: CheckCircle, error: AlertCircle, default: Info }
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm">
      {toasts.map(t => {
        const c = colors[t.type] || colors.default
        const Icon = icons[t.type] || icons.default
        return (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl pointer-events-auto" style={{ background: c.bg, border: "1px solid " + c.border }}>
            <Icon size={16} style={{ color: c.color, flexShrink: 0 }} />
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>{t.msg}</p>
          </div>
        )
      })}
    </div>
  )
}
