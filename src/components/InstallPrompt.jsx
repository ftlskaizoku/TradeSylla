import { useState, useEffect } from "react"
import { X, Download, Smartphone } from "lucide-react"

// ─── PWA Install Prompt ───────────────────────────────────────────────────────
// Shows a smart install banner:
//  - Chrome/Edge/Android: uses beforeinstallprompt event
//  - iOS Safari: shows manual "Add to Home Screen" instructions
//  - Already installed: never shown

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show,           setShow]           = useState(false)
  const [isIOS,          setIsIOS]          = useState(false)
  const [isInstalled,    setIsInstalled]    = useState(false)

  useEffect(() => {
    // Already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
      setIsInstalled(true); return
    }
    // Dismissed before
    if (localStorage.getItem("ts_pwa_dismissed")) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
    setIsIOS(ios)

    if (ios) {
      // On iOS Safari show after 3s
      const t = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(t)
    }

    // Chrome/Edge/Android — listen for native prompt
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setTimeout(() => setShow(true), 2000)
    }
    window.addEventListener("beforeinstallprompt", handler)
    return () => window.removeEventListener("beforeinstallprompt", handler)
  }, [])

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") localStorage.setItem("ts_pwa_dismissed", "1")
      setShow(false)
    }
  }

  const dismiss = () => {
    localStorage.setItem("ts_pwa_dismissed", "1")
    setShow(false)
  }

  if (!show || isInstalled) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-80 z-50 animate-fade-in">
      <div className="rounded-2xl shadow-2xl p-4" style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
      }}>
        <button onClick={dismiss} className="absolute top-3 right-3 p-1 rounded-lg hover:opacity-70"
          style={{ color: "var(--text-muted)" }}>
          <X size={14}/>
        </button>

        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#6c63ff,#00d4aa)" }}>
            <Smartphone size={18} className="text-white"/>
          </div>
          <div className="flex-1 pr-4">
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              Install TradeSylla
            </p>
            {isIOS ? (
              <>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Tap <strong style={{ color:"var(--accent)" }}>Share</strong> then{" "}
                  <strong style={{ color:"var(--accent)" }}>Add to Home Screen</strong> for the full app experience.
                </p>
                <div className="flex items-center gap-2 mt-2.5 text-xs" style={{ color:"var(--text-muted)" }}>
                  <span>📤 Share → 📱 Add to Home Screen</span>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Get instant access, offline support and a native app experience.
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={install}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
                    <Download size={11}/> Install App
                  </button>
                  <button onClick={dismiss} className="px-3 py-1.5 rounded-lg text-xs border"
                    style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    Not now
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
