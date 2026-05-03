import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Bind explicitly to IPv4 localhost — avoids flaky `host: true` / interface scans on some systems.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    open: 'http://127.0.0.1:5173/',
  },
})
