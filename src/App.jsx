import { QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom"
import { UserProvider, useUser } from "@/lib/UserContext"
import { queryClient } from "@/lib/queryClient"
import { Toaster } from "@/components/ui/toast"
import Layout from "@/Layout"
import Auth from "@/pages/Auth"
import Dashboard from "@/pages/Dashboard"
import Journal from "@/pages/Journal"
import Analytics from "@/pages/Analytics"
import Playbook from "@/pages/Playbook"
import Sylledge from "@/pages/Sylledge"
import Backtesting from "@/pages/Backtesting"
import BrokerSync from "@/pages/BrokerSync"
import Settings from "@/pages/Settings"

// ── Auth guard ────────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useUser()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background:"var(--bg-primary)" }}>
      <div className="text-center space-y-3">
        <div className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center"
          style={{ background:"linear-gradient(135deg,var(--accent),var(--accent-secondary))" }}>
          <span className="text-white font-bold">T</span>
        </div>
        <p className="text-sm animate-pulse" style={{ color:"var(--text-muted)" }}>Loading...</p>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/auth" replace />
  return children
}

function AppRoutes() {
  const { user } = useUser()
  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/Dashboard" replace/> : <Auth/>} />
      <Route path="/" element={<Navigate to="/Dashboard" replace />} />
      {[
        { path:"Dashboard",   El: Dashboard   },
        { path:"Journal",     El: Journal     },
        { path:"Analytics",   El: Analytics   },
        { path:"Playbook",    El: Playbook    },
        { path:"Sylledge",    El: Sylledge    },
        { path:"Backtesting", El: Backtesting },
        { path:"BrokerSync",  El: BrokerSync  },
        { path:"Settings",    El: Settings    },
      ].map(({ path, El }) => (
        <Route key={path} path={"/"+path}
          element={
            <ProtectedRoute>
              <Layout currentPageName={path}><El /></Layout>
            </ProtectedRoute>
          }
        />
      ))}
      <Route path="*" element={<Navigate to="/Dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <UserProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <AppRoutes />
          <Toaster />
        </Router>
      </QueryClientProvider>
    </UserProvider>
  )
}
