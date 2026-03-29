// src/components/ui/InstallPrompt.jsx
// Shows "Install TradeSylla" banner when browser fires beforeinstallprompt
// Drop this into App.jsx or Layout.jsx — it auto-hides after install

import { useState, useEffect } from "react"
import { Download, X, Smartphone } from "lucide-react"

export default function InstallPrompt() {
  const [prompt,    setPrompt]    = useState(null)
  const [visible,   setVisible]   = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }

    // Already installed?
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true)
      return
    }

    // Dismissed before?
    if (localStorage.getItem("ts_pwa_dismissed")) return

    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
      setVisible(true)
    }

    window.addEventListener("beforeinstallprompt", handler)
    window.addEventListener("appinstalled", () => {
      setInstalled(true)
      setVisible(false)
    })

    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === "accepted") setInstalled(true)
    setVisible(false)
    setPrompt(null)
  }

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem("ts_pwa_dismissed", "1")
  }

  if (!visible || installed) return null

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl shadow-2xl p-4 flex items-center gap-3"
      style={{
        background:  "var(--bg-card)",
        border:      "1px solid var(--accent)",
        boxShadow:   "0 0 40px rgba(108,99,255,0.25)",
      }}
    >
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
        <Smartphone size={18} className="text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Install TradeSylla
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Add to home screen for the full app experience
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
          style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}
        >
          <Download size={12} />
          Install
        </button>
        <button onClick={dismiss} className="p-1 rounded-lg hover:opacity-70"
          style={{ color: "var(--text-muted)" }}>
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
