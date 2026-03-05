import { useState, useEffect, useRef } from "react"
import { Link, useLocation } from "react-router-dom"
import { createPageUrl } from "@/utils"
import {
  LayoutDashboard, BookOpen, BarChart3, Brain, FlaskConical,
  Settings, Menu, X, ChevronRight, TrendingUp, Shield, Wifi, CalendarDays, Zap
} from "lucide-react"
import { useUser } from "@/lib/UserContext"
import { supabase } from "@/lib/supabase"
import InstallPrompt from "@/components/InstallPrompt"

const navItems = [
  { label: "Dashboard",   icon: LayoutDashboard, page: "Dashboard" },
  { label: "Journal",     icon: BookOpen,        page: "Journal" },
  { label: "Calendar",    icon: CalendarDays,    page: "Journal?view=calendar" },
  { label: "Analytics",   icon: BarChart3,       page: "Analytics" },
  { label: "Playbook",    icon: Shield,          page: "Playbook" },
  { label: "SYLLEDGE AI", icon: Brain,           page: "Sylledge" },
  { label: "Backtesting", icon: FlaskConical,    page: "Backtesting" },
  { label: "Broker Sync", icon: Wifi,            page: "BrokerSync" },
  { label: "Settings",    icon: Settings,        page: "Settings" },
]

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useUser()
  const location = useLocation()
  const lastTracked = useRef("")

  // Track page views — wrapped in try/catch so failures never crash the app
  useEffect(() => {
    const page = location.pathname.replace("/", "") || "Dashboard"
    if (!user || lastTracked.current === page) return
    lastTracked.current = page
    try {
      supabase.from("page_views")
        .insert([{ user_id: user.id, page, referrer: document.referrer || null }])
        .then(() => {}).catch(() => {})
    } catch {}
  }, [location.pathname, user])
  const closeSidebar = () => setSidebarOpen(false)

  const isActive = (page) => {
    const [name, query] = page.split("?")
    if (query) return location.pathname === "/" + name && location.search.includes(query.split("=")[1])
    return location.pathname === "/" + name
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-primary)" }}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={closeSidebar} />
      )}

      <aside
        className={"fixed md:relative z-50 md:z-auto flex flex-col w-52 h-full transition-transform duration-300 ease-in-out " + (sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")}
        style={{ background: "var(--bg-secondary)", borderRight: "1px solid var(--border)", flexShrink: 0 }}
      >
        <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6c63ff, #00d4aa)" }}>
              <TrendingUp size={16} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-wide" style={{ color: "var(--text-primary)" }}>TRADE</span>
              <span className="font-bold text-sm tracking-wide gradient-text">SYLLA</span>
            </div>
          </div>
          <button onClick={closeSidebar} className="md:hidden p-1 rounded" style={{ color: "var(--text-secondary)" }}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.page)
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={closeSidebar}
                className={"sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium " + (active ? "active" : "")}
                style={{ color: active ? "var(--accent)" : "var(--text-secondary)", background: active ? "rgba(108,99,255,0.1)" : "transparent" }}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {active && <ChevronRight size={13} className="ml-auto" style={{ color: "var(--accent)" }} />}
              </Link>
            )
          })}
        </nav>

        {/* Upgrade CTA */}
        <div className="px-3 pt-2 pb-1">
          <a href="/pricing"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold w-full"
            style={{ background:"linear-gradient(135deg,rgba(108,99,255,0.15),rgba(0,212,170,0.15))", border:"1px solid rgba(108,99,255,0.25)", color:"var(--accent)" }}>
            <Zap size={14}/> Upgrade to Pro
          </a>
        </div>

        <div className="px-3 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: "linear-gradient(135deg, #6c63ff, #00d4aa)", color: "#fff" }}>
              {user?.full_name?.[0] || "T"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{user?.full_name || "Trader"}</p>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{user?.email || ""}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-4 px-4 md:px-6 py-3 flex-shrink-0" style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 rounded-lg" style={{ color: "var(--text-secondary)", background: "var(--bg-elevated)" }}>
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>TRADE</span>
            <span className="font-bold text-sm gradient-text">SYLLA</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <span>TRADESYLLA</span>
            <ChevronRight size={12} />
            <span style={{ color: "var(--text-primary)" }}>{currentPageName}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: "rgba(46,213,115,0.1)", color: "var(--accent-success)", border: "1px solid rgba(46,213,115,0.2)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="hidden sm:inline">Live</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 md:p-6 min-h-full">{children}</div>
        </main>
      </div>
      <InstallPrompt/>
    </div>
  )
}
