import { QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom"
import { UserProvider } from "@/lib/UserContext"
import { queryClient } from "@/lib/queryClient"
import { Toaster } from "@/components/ui/toast"
import Layout from "@/Layout"
import Dashboard from "@/pages/Dashboard"
import Journal from "@/pages/Journal"
import Analytics from "@/pages/Analytics"
import Playbook from "@/pages/Playbook"
import Sylledge from "@/pages/Sylledge"
import Backtesting from "@/pages/Backtesting"
import BrokerSync from "@/pages/BrokerSync"
import Settings from "@/pages/Settings"

function App() {
  return (
    <UserProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/Dashboard" replace />} />
            <Route path="/Dashboard"  element={<Layout currentPageName="Dashboard"><Dashboard /></Layout>} />
            <Route path="/Journal"    element={<Layout currentPageName="Journal"><Journal /></Layout>} />
            <Route path="/Analytics"  element={<Layout currentPageName="Analytics"><Analytics /></Layout>} />
            <Route path="/Playbook"   element={<Layout currentPageName="Playbook"><Playbook /></Layout>} />
            <Route path="/Sylledge"   element={<Layout currentPageName="Sylledge"><Sylledge /></Layout>} />
            <Route path="/Backtesting" element={<Layout currentPageName="Backtesting"><Backtesting /></Layout>} />
            <Route path="/BrokerSync" element={<Layout currentPageName="BrokerSync"><BrokerSync /></Layout>} />
            <Route path="/Settings"   element={<Layout currentPageName="Settings"><Settings /></Layout>} />
            <Route path="*" element={<Navigate to="/Dashboard" replace />} />
          </Routes>
          <Toaster />
        </Router>
      </QueryClientProvider>
    </UserProvider>
  )
}

export default App
