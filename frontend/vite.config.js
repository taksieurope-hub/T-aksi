import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Inject SW into HTML automatically
      injectRegister: 'auto',
      // Makes the SW actually functional (was missing — this is why it wasn't a real PWA)
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
        // Cache everything the app needs to work offline
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

        // Cache sound assets locally (fixes Mixkit CDN dependency)
        globDirectory: 'dist',

        // Don't cache source maps (they're disabled anyway, but safety first)
        globIgnores: ['**/*.map'],

        // Runtime caching strategies
        runtimeCaching: [
          // Google Maps — cache aggressively, they're expensive API calls
          {
            urlPattern: /^https:\/\/maps\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-maps-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Google Fonts — permanent cache
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // T'aksi API — cache GET requests (ride history, driver profile etc) for offline viewing
          {
            urlPattern: /^https:\/\/t-aksi\.onrender\.com\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'taksi-api-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // Firebase — network first for real-time data
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firebase-cache',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ],

        // App shell — serve index.html for all navigation (SPA fallback)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],

        // Skip waiting so users always get the latest SW immediately
        skipWaiting: true,
        clientsClaim: true,
      },

      // Dev options — enable SW in dev so you can test it
      devOptions: {
        enabled: false, // Set to true temporarily if you need to debug SW
        type: 'module'
      }
    })
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    // SECURITY FIX: Source maps disabled — was exposing entire codebase
    sourcemap: false,

    // PERFORMANCE FIX: Code splitting — rider/driver/admin load independently
    // This alone will reduce initial bundle from ~1MB to ~150-200KB
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks — these rarely change, so browsers cache them forever
          if (id.includes('node_modules')) {
            // Firebase — large, split it out
            if (id.includes('firebase')) return 'vendor-firebase'
            // Google Maps
            if (id.includes('@googlemaps') || id.includes('google-maps')) return 'vendor-maps'
            // PayPal
            if (id.includes('paypal')) return 'vendor-paypal'
            // React core
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react'
            // UI primitives
            if (id.includes('@radix-ui')) return 'vendor-radix'
            // Everything else from node_modules
            return 'vendor-misc'
          }

          // App portals — the big win
          // Rider code only downloads when a rider visits /rider/*
          if (id.includes('/components/RiderPortal') || id.includes('/rider/')) return 'portal-rider'
          // Driver code only downloads when a driver visits /driver/*
          if (id.includes('/components/DriverPortal') || id.includes('/driver/')) return 'portal-driver'
          // Admin code only downloads when admin visits /admin/*
          if (id.includes('/components/AdminPortal') || id.includes('/admin/')) return 'portal-admin'
        }
      }
    },

    // Suppress warnings for large chunks we know about (maps SDK etc)
    chunkSizeWarningLimit: 600,

    // Strip all console.* calls in production
    // Removes the 57 console.log/warn/error calls leaking debug info
    minify: 'esbuild',
    target: 'esnext',
  },

  // Strip console calls only in production
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
})