import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: "T'aksi App",
        short_name: "T'aksi",
        description: 'Ride-hailing for Georgia',
        theme_color: '#000000',
        background_color: '#000000',
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "ka",
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globDirectory: 'dist',
        globIgnores: ['**/*.map'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/maps\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-maps-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/t-aksi\.onrender\.com\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'taksi-api-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
        type: 'module'
      }
    })
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force ALL packages to share the exact same React instance.
      // Must use path.resolve with __dirname so the path is absolute —
      // relative strings like "node_modules/react" silently fail on Linux (Render).
      "react":           path.resolve(__dirname, "./node_modules/react/index.js"),
      "react-dom":       path.resolve(__dirname, "./node_modules/react-dom/index.js"),
      "react-dom/client":path.resolve(__dirname, "./node_modules/react-dom/client.js"),
      "react/jsx-runtime": path.resolve(__dirname, "./node_modules/react/jsx-runtime.js"),
    },
    // Vite module-graph level deduplication — belt AND suspenders
    dedupe: [
      'react',
      'react-dom',
      'react-router-dom',
      'react-router',
      'scheduler',
    ],
  },

  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── RULE: anything that imports React MUST share the same chunk
          // as React itself, OR must resolve React via the alias above.
          // The safest split strategy: keep ALL React-ecosystem packages together,
          // only split truly independent heavy libs (Firebase, Maps).

          if (id.includes('node_modules')) {
            // React core + everything that uses React context/hooks
            // must all live in ONE chunk — never split these.
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/') ||
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/@remix-run/') ||           // react-router v6 internals
              id.includes('/react-is/') ||
              id.includes('/prop-types/')
            ) {
              return 'vendor-react'
            }

            // Heavy standalone libs — safe to split because they don't use React context
            if (id.includes('/firebase/'))                               return 'vendor-firebase'
            if (id.includes('/@googlemaps/') || id.includes('/google-maps/')) return 'vendor-maps'

            // PayPal — keep separate but it WILL use the aliased React
            if (id.includes('/paypal/') || id.includes('@paypal'))       return 'vendor-paypal'

            // Radix + Sonner + all other React UI libs go in ONE chunk with React
            // so their createContext calls all share the same React object.
            // DO NOT split these into vendor-misc — that's what caused the crash.
            if (
              id.includes('/@radix-ui/') ||
              id.includes('/sonner/') ||
              id.includes('/lucide-react/') ||
              id.includes('/class-variance-authority/') ||
              id.includes('/clsx/') ||
              id.includes('/tailwind-merge/')
            ) {
              return 'vendor-ui'
            }

            // Everything else non-React
            return 'vendor-misc'
          }

          // App portal chunks — lazy loaded
          if (id.includes('/components/RiderPortal') || id.includes('/rider/'))   return 'portal-rider'
          if (id.includes('/components/DriverPortal') || id.includes('/driver/')) return 'portal-driver'
          if (id.includes('/components/AdminPortal') || id.includes('/admin/'))   return 'portal-admin'
        }
      }
    },
    chunkSizeWarningLimit: 700,
    minify: 'esbuild',
    target: 'esnext',
  },

  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})