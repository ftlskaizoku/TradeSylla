import { useState, useEffect, useRef } from "react"
import { Link, useLocation } from "react-router-dom"
import { createPageUrl } from "@/utils"
import {
  LayoutDashboard, BookOpen, BarChart3, Brain, FlaskConical,
  Settings, Menu, X, ChevronRight, TrendingUp, Shield, Wifi,
  CalendarDays, Zap, LayoutGrid, BarChart2, PenLine, FileBarChart2, Calculator
} from "lucide-react"
import { useUser } from "@/lib/UserContext"
import { useLanguage } from "@/lib/LanguageContext"
import { supabase } from "@/lib/supabase"
import InstallPrompt from "@/components/InstallPrompt"
import { Trade } from "@/api/supabaseStore"

const ADMIN_EMAILS = ["khalifadylla@gmail.com", "zoumxyz@gmail.com"]

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tradeCount,  setTradeCount]  = useState(null)
  const { user } = useUser()
  const { t } = useLanguage()
  const location = useLocation()
  const lastTracked = useRef("")

  // Load trade count for sidebar badge
  useEffect(() => {
    Trade.list().then(data => setTradeCount((data||[]).length)).catch(()=>{})
  }, [])

  // Track page views
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

  // Nav items with icon emoji and optional badge
  // Nav items — each has its own accent color for a professional look
  const navItems = [
    { label:t("nav_dashboard"),   Icon:LayoutDashboard, page:"Dashboard",             color:"#6c63ff" },
    { label:t("nav_journal"),     Icon:BookOpen,        page:"Journal",               color:"#ffa502", badge: tradeCount > 0 ? tradeCount.toLocaleString() : null },
    { label:t("nav_notebook"),    Icon:PenLine,         page:"Notebook",              color:"#00d4aa" },
    { label:t("nav_calendar"),    Icon:CalendarDays,    page:"Journal?view=calendar", color:"#00d4aa" },
    { label:t("nav_analytics"),   Icon:BarChart3,       page:"Analytics",             color:"#2ed573" },
    { label:t("nav_reports"),     Icon:FileBarChart2,   page:"Reports",               color:"#2ed573" },
    { label:t("nav_calculator"),  Icon:Calculator,      page:"Calculator",            color:"#6c63ff" },
    { label:t("nav_playbook"),    Icon:Shield,          page:"Playbook",              color:"#ff6b35" },
    { label:t("nav_sylledge"),    Icon:Brain,           page:"Sylledge",              color:"#a29bfe", badge:"New" },
    { label:t("nav_backtesting"), Icon:FlaskConical,    page:"Backtesting",           color:"#fd79a8" },
    { label:t("nav_brokersync"),  Icon:Wifi,            page:"BrokerSync",            color:"#74b9ff" },
    { label:t("nav_settings"),    Icon:Settings,        page:"Settings",              color:"#636e72" },
  ]

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email)

  return (
    <div className="flex h-screen overflow-hidden" style={{ background:"var(--bg-primary)" }}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside
        className={"fixed md:relative z-50 md:z-auto flex flex-col h-full transition-transform duration-300 ease-in-out " + (sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")}
        style={{ width:220, background:"var(--bg-secondary)", borderRight:"1px solid var(--border)", flexShrink:0 }}>

        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom:"1px solid var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)", boxShadow:"0 4px 12px rgba(108,99,255,0.3)" }}>
              <TrendingUp size={16} className="text-white"/>
            </div>
            <div>
              <span className="font-bold text-sm tracking-wide" style={{ color:"var(--text-primary)" }}>TRADE</span>
              <span className="font-bold text-sm tracking-wide gradient-text">SYLLA</span>
            </div>
          </div>
          <button onClick={closeSidebar} className="md:hidden p-1 rounded" style={{ color:"var(--text-secondary)" }}>
            <X size={18}/>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.page)
            return (
              <Link key={item.page} to={createPageUrl(item.page)} onClick={closeSidebar}
                className={"sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium " + (active ? "active" : "")}
                style={{ color: active ? item.color : "var(--text-secondary)", background: active ? `${item.color}15` : "transparent",
                  transition:"all 0.15s" }}>
                {/* Icon container with per-item color */}
                <div style={{
                  width:30, height:30, borderRadius:9, flexShrink:0,
                  background: active ? `${item.color}22` : "rgba(255,255,255,0.04)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  border: active ? `1px solid ${item.color}40` : "1px solid transparent",
                  transition:"all 0.15s",
                }}>
                  <item.Icon size={15} style={{ color: active ? item.color : "var(--text-muted)" }}/>
                </div>
                <span className="flex-1">{item.label}</span>
                {item.badge && item.badge !== "New" && (
                  <span className="nav-badge">{item.badge}</span>
                )}
                {item.badge === "New" && (
                  <span className="nav-badge success" style={{ background:`${item.color}25`, color:item.color, border:`1px solid ${item.color}40`, fontSize:9, padding:"1px 6px", borderRadius:20 }}>New</span>
                )}
                {active && <ChevronRight size={12} style={{ color:item.color, flexShrink:0 }}/>}
              </Link>
            )
          })}

          {/* Admin links */}
          {isAdmin && (
            <>
              <div style={{ height:1, background:"var(--border)", margin:"8px 4px" }}/>
              <Link to="/MarketCharts" onClick={closeSidebar}
                className={"sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium " + (isActive("MarketCharts") ? "active" : "")}
                style={{
                  color:      isActive("MarketCharts") ? "#00d4aa" : "var(--text-muted)",
                  background: isActive("MarketCharts") ? "rgba(0,212,170,0.1)" : "transparent",
                }}>
                <div style={{ width:30, height:30, borderRadius:9, background:isActive("MarketCharts")?"rgba(0,212,170,0.15)":"rgba(255,255,255,0.04)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:isActive("MarketCharts")?"1px solid rgba(0,212,170,0.3)":"1px solid transparent" }}>
                  <BarChart2 size={15} style={{ color:isActive("MarketCharts")?"#00d4aa":"var(--text-muted)" }}/>
                </div>
                <span className="flex-1">{t("nav_market_charts")}</span>
                {isActive("MarketCharts") && <ChevronRight size={12} style={{ color:"#00d4aa" }}/>}
              </Link>
              <Link to="/Admin" onClick={closeSidebar}
                className={"sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium " + (isActive("Admin") ? "active" : "")}
                style={{
                  color:      isActive("Admin") ? "#ffa502" : "var(--text-muted)",
                  background: isActive("Admin") ? "rgba(255,165,2,0.1)" : "transparent",
                }}>
                <div style={{ width:30, height:30, borderRadius:9, background:isActive("Admin")?"rgba(255,165,2,0.15)":"rgba(255,255,255,0.04)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, border:isActive("Admin")?"1px solid rgba(255,165,2,0.3)":"1px solid transparent" }}>
                  <Zap size={15} style={{ color:isActive("Admin")?"#ffa502":"var(--text-muted)" }}/>
                </div>
                <span className="flex-1">{t("nav_admin")}</span>
                {isActive("Admin") && <ChevronRight size={12} style={{ color:"#ffa502" }}/>}
              </Link>
            </>
          )}
        </nav>

        {/* Upgrade CTA */}
        <div className="px-3 pt-2 pb-1">
          <a href="/pricing"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold w-full transition-all hover:opacity-90"
            style={{
              background:"linear-gradient(135deg,rgba(108,99,255,0.15),rgba(0,212,170,0.15))",
              border:"1px solid rgba(108,99,255,0.25)", color:"var(--accent)",
              boxShadow:"0 2px 12px rgba(108,99,255,0.1)"
            }}>
            <Zap size={14}/> {t("nav_upgrade")}
          </a>
        </div>

        {/* User profile */}
        <div className="px-3 py-4" style={{ borderTop:"1px solid var(--border)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background:"var(--bg-elevated)" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background:"linear-gradient(135deg,#6c63ff,#00d4aa)", color:"#fff" }}>
              {user?.full_name?.[0] || "T"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color:"var(--text-primary)" }}>{user?.full_name || "Trader"}</p>
              <p className="text-xs truncate" style={{ color:"var(--text-muted)" }}>{user?.email || ""}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-4 px-4 md:px-6 py-3 flex-shrink-0"
          style={{ background:"var(--bg-secondary)", borderBottom:"1px solid var(--border)" }}>
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 rounded-lg"
            style={{ color:"var(--text-secondary)", background:"var(--bg-elevated)" }}>
            <Menu size={18}/>
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <span className="font-bold text-sm" style={{ color:"var(--text-primary)" }}>TRADE</span>
            <span className="font-bold text-sm gradient-text">SYLLA</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm" style={{ color:"var(--text-muted)" }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase" }}>TRADESYLLA</span>
            <ChevronRight size={12}/>
            <span style={{ color:"var(--text-primary)", fontWeight:600 }}>{currentPageName}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
              style={{ background:"rgba(46,213,115,0.1)", color:"var(--accent-success)", border:"1px solid rgba(46,213,115,0.2)" }}>
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"/>
              <span className="hidden sm:inline">{t("nav_live")}</span>
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
