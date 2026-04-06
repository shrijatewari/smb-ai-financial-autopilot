import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Folder with `vite.config.js` + `.env` – not `process.cwd()` (wrong when dev starts from monorepo root). */
const projectRoot = path.dirname(fileURLToPath(import.meta.url))

/**
 * Dev: browser calls same-origin `/api` (see `resolveApiBaseUrl` in api.js).
 * Proxy target comes from `financial-control-ui/.env` via loadEnv(projectRoot).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const rawBase = (env.VITE_API_URL || 'http://localhost:8000').trim()
  const proxyTarget = (rawBase || 'http://localhost:8000').replace(/\/$/, '')

  return {
    root: projectRoot,
    envDir: projectRoot,
    plugins: [react(), tailwindcss()],
    server: {
      /** Listen on all interfaces; avoids some macOS / Docker hostname quirks. */
      host: true,
      port: 5173,
      strictPort: false,
      /** Vite 8+ host validation – allow any dev hostname (e.g. .local, LAN IP) to avoid 403 on /. */
      allowedHosts: true,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          secure: proxyTarget.startsWith('https'),
        },
      },
    },
    preview: {
      host: true,
      port: 4173,
      strictPort: false,
      allowedHosts: true,
    },
  }
})
