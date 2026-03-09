import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // All files are at root level, not inside src/
      '@': path.resolve(__dirname, './src'),
    },
  },
})
