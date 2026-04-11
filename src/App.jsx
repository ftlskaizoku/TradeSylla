// src/App.jsx
import { QueryClientProvider }                           from "@tanstack/react-query"
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom"
import { UserProvider, useUser }                         from "@/lib/UserContext"
import { LanguageProvider }                              from "@/lib/LanguageContext"
import { queryClient }                                   from "@/lib/queryClient"
import { Toaster }                                       from "@/components/ui/toast"
import { useRealtimeSync }                               from "@/lib/useRealtimeSync"
import InstallPrompt                                     from "@/components/ui/InstallPrompt"
import Layout        from "@/Layout"
import Auth          from "@/pages/Auth"
import Dashboard     from "@/pages/Dashboard"
import Journal       from "@/pages/Journal"
import Analytics     from "@/pages/Analytics"
import Playbook      from "@/pages/Playbook"
import Sylledge      from "@/pages/Sylledge"
import Backtesting   from "@/pages/Backtesting"
import BrokerSync    from "@/pages/BrokerSync"
import Settings      from "@/pages/Settings"
import Admin         from "@/pages/Admin"
import Pricing       from "@/pages/Pricing"
import MarketCharts  from "@/pages/MarketCharts"
import Notebook      from "@/pages/Notebook"
import Reports       from "@/pages/Reports"
import Calculator    from "@/pages/Calculator"

function ProtectedRoute({ children }) {
  const { user, loading } = useUser()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:"var(--bg-primary)" }}>
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
          style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
          <span className="text-white font-bold">T</span>
        </div>
        <p className="text-sm animate-pulse" style={{ color:"var(--text-muted)" }}>Loading…</p>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/auth" replace />
  return children
}

function AppRoutes() {
  useRealtimeSync()

  const PAGES = [
    { path:"Dashboard",    El:Dashboard    },
    { path:"Journal",      El:Journal      },
    { path:"Analytics",    El:Analytics    },
    { path:"Playbook",     El:Playbook     },
    { path:"Sylledge",     El:Sylledge     },
    { path:"Backtesting",  El:Backtesting  },
    { path:"BrokerSync",   El:BrokerSync   },
    { path:"Settings",     El:Settings     },
    { path:"Admin",        El:Admin        },
    { path:"MarketCharts", El:MarketCharts },
    { path:"Notebook",     El:Notebook     },
    { path:"Reports",      El:Reports      },
    { path:"Calculator",   El:Calculator   },
  ]

  return (
    <Routes>
      <Route path="/auth"    element={<Auth />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/"        element={<Navigate to="/Dashboard" replace />} />
      {PAGES.map(({ path, El }) => (
        <Route key={path} path={"/"+path}
          element={<ProtectedRoute><Layout currentPageName={path}><El /></Layout></ProtectedRoute>}
        />
      ))}
      <Route path="*" element={<Navigate to="/Dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <UserProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <Router>
            <AppRoutes />
            <Toaster />
            <InstallPrompt />
          </Router>
        </QueryClientProvider>
      </LanguageProvider>
    </UserProvider>
  )
}
