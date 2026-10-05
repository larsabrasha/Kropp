import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import { kroppApi } from './server/devPlugin'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    kroppApi(),
    VitePWA({
      // The .NET version registered /service-worker.js, and installed phones still check that
      // address for updates. Under any other name they would never leave the old version.
      filename: 'service-worker.js',
      // The new version takes over as soon as it is installed: the .NET version cannot show a
      // prompt, and everything is saved locally as it is typed, so a reload loses nothing.
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: {
        name: 'Kropp',
        short_name: 'Kropp',
        id: './',
        start_url: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2563eb',
        lang: 'sv',
        prefer_related_applications: false,
        icons: [
          { src: 'icon-512.png', type: 'image/png', sizes: '512x512' },
          { src: 'icon-192.png', type: 'image/png', sizes: '192x192' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // 302 illustrations × 3 frames: too many to fetch on install. A workout fetches the ones it
        // uses (illustrations.ts, prefetch), and they are kept in a cache of their own below.
        globIgnores: ['exercises/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
          {
            // Only files: /exercises/<id> is also a page of the app, which the fallback serves.
            urlPattern: ({ url, request }) =>
              request.mode !== 'navigate' && /^\/exercises\/.+\.svg$/.test(url.pathname),
            handler: 'CacheFirst',
            // The name the .NET version's worker used, so pictures already on a phone stay.
            options: { cacheName: 'exercise-illustrations' },
          },
        ],
        // The .NET version's caches (offline-cache-<hash>) hold its old files; nothing reads them now.
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      // No service worker in dev: it would cache away hot reload.
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    // Dates in the tests are days in Sweden, wherever the tests run.
    env: { TZ: 'Europe/Stockholm' },
  },
})
