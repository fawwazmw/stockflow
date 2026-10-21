import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The dev server proxies /api to the Go service, so the browser sees a single
// origin and no CORS configuration is needed. Override with VITE_API_PROXY.
const apiProxy = process.env.VITE_API_PROXY ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiProxy, changeOrigin: true },
      '/healthz': { target: apiProxy, changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
