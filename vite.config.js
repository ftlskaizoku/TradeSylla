import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// All source files live at the project ROOT, not inside src/
// These aliases map every @/subpath import to the correct root-level file.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // ── api ───────────────────────────────────────────────────────
      { find: '@/api/supabaseStore',                replacement: path.resolve(__dirname, './supabaseStore.js') },
      { find: '@/api/base44Client',                 replacement: path.resolve(__dirname, './supabase.js') },

      // ── lib ───────────────────────────────────────────────────────
      { find: '@/lib/supabase',                     replacement: path.resolve(__dirname, './supabase.js') },
      { find: '@/lib/UserContext',                  replacement: path.resolve(__dirname, './UserContext.jsx') },
      { find: '@/lib/AuthContext',                  replacement: path.resolve(__dirname, './UserContext.jsx') },
      { find: '@/lib/queryClient',                  replacement: path.resolve(__dirname, './queryClient.js') },
      { find: '@/lib/query-client',                 replacement: path.resolve(__dirname, './query_clients.js') },
      { find: '@/lib/app-params',                   replacement: path.resolve(__dirname, './app-params.js') },

      // ── components/ui ─────────────────────────────────────────────
      { find: '@/components/ui/toast',              replacement: path.resolve(__dirname, './toast.jsx') },
      { find: '@/components/ui/button',             replacement: path.resolve(__dirname, './button.jsx') },
      { find: '@/components/ui/input',              replacement: path.resolve(__dirname, './input.jsx') },
      { find: '@/components/ui/label',              replacement: path.resolve(__dirname, './label.jsx') },
      { find: '@/components/ui/select',             replacement: path.resolve(__dirname, './select.jsx') },
      { find: '@/components/ui/textarea',           replacement: path.resolve(__dirname, './textarea.jsx') },
      { find: '@/components/ui/dialog',             replacement: path.resolve(__dirname, './dialog.jsx') },
      { find: '@/components/ui/badge',              replacement: path.resolve(__dirname, './badge.jsx') },
      { find: '@/components/ui/alert',              replacement: path.resolve(__dirname, './alert.jsx') },
      { find: '@/components/ui/alert-dialog',       replacement: path.resolve(__dirname, './alert-dialog.jsx') },
      { find: '@/components/ui/avatar',             replacement: path.resolve(__dirname, './avatar.jsx') },
      { find: '@/components/ui/accordion',          replacement: path.resolve(__dirname, './accordion.jsx') },
      { find: '@/components/UserNotRegisteredError',replacement: path.resolve(__dirname, './UserNotRegisteredError.jsx') },

      // ── pages ─────────────────────────────────────────────────────
      { find: '@/pages/Dashboard',                  replacement: path.resolve(__dirname, './Dashboard.jsx') },
      { find: '@/pages/Journal',                    replacement: path.resolve(__dirname, './Journal.jsx') },
      { find: '@/pages/Analytics',                  replacement: path.resolve(__dirname, './Analytics.jsx') },
      { find: '@/pages/Playbook',                   replacement: path.resolve(__dirname, './Playbook.jsx') },
      { find: '@/pages/Sylledge',                   replacement: path.resolve(__dirname, './Sylledge.jsx') },
      { find: '@/pages/Backtesting',                replacement: path.resolve(__dirname, './Backtesting.jsx') },
      { find: '@/pages/BrokerSync',                 replacement: path.resolve(__dirname, './BrokerSync.jsx') },
      { find: '@/pages/Settings',                   replacement: path.resolve(__dirname, './Settings.jsx') },
      { find: '@/pages/Admin',                      replacement: path.resolve(__dirname, './Admin.jsx') },
      { find: '@/pages/Pricing',                    replacement: path.resolve(__dirname, './Pricing.jsx') },
      { find: '@/pages/Auth',                       replacement: path.resolve(__dirname, './Auth.jsx') },

      // ── root files ────────────────────────────────────────────────
      { find: '@/App.jsx',                          replacement: path.resolve(__dirname, './App.jsx') },
      { find: '@/globals.css',                      replacement: path.resolve(__dirname, './globals.css') },
      { find: '@/Layout',                           replacement: path.resolve(__dirname, './Layout.jsx') },
      { find: '@/utils',                            replacement: path.resolve(__dirname, './utils.js') },

      // ── catch-all (must be LAST) ──────────────────────────────────
      { find: '@', replacement: path.resolve(__dirname, '.') },
    ],
  },
})
