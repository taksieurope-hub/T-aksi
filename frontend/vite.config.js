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
    // ── WHY ARRAY FORM: When alias is an object, Vite matches by simple string
    // prefix, so "react" matches "react/jsx-runtime" first → turns it into
    // "<index.js>/jsx-runtime" → ENOTDIR crash on Linux (Render).
    // Array form processes entries IN ORDER: specific subpaths matched before
    // bare package names. This is the only correct way to alias React subpaths.
    alias: [
      // ① Subpath aliases — MUST come before bare package aliases
      {
        find: 'react/jsx-runtime',
        replacement: path.resolve(__dirname, './node_modules/react/jsx-runtime.js'),
      },
      {
        find: 'react/jsx-dev-runtime',
        replacement: path.resolve(__dirname, './node_modules/react/jsx-dev-runtime.js'),
      },
      {
        find: 'react-dom/client',
        replacement: path.resolve(__dirname, './node_modules/react-dom/client.js'),
      },
      {
        find: 'react-dom/server',
        replacement: path.resolve(__dirname, './node_modules/react-dom/server.js'),
      },
      // ② Bare package aliases — must come AFTER subpath aliases above
      {
        find: 'react',
        replacement: path.resolve(__dirname, './node_modules/react/index.js'),
      },
      {
        find: 'react-dom',
        replacement: path.resolve(__dirname, './node_modules/react-dom/index.js'),
      },
      // ③ App path alias
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],

    // Belt-and-suspenders: catches nested node_modules with their own react copy
    dedupe: [
      'react',
      'react-dom',
      'react-router',
      'react-router-dom',
      'scheduler',
    ],
  },

  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // ── React ecosystem: everything that calls createContext/useContext
            // MUST land in the same chunk. Splitting any of these causes the
            // "Cannot read properties of undefined (reading 'createContext')" crash.
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/scheduler/') ||
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/@remix-run/')     // react-router v6 internals
            ) {
              return 'vendor-react'
            }

            // ── UI components: Radix, Sonner, Lucide all use React context
            // and must NOT go into vendor-misc (separate chunk = separate React)
            if (
              id.includes('/@radix-ui/') ||
              id.includes('/sonner/') ||
              id.includes('/lucide-react/')
            ) {
              return 'vendor-ui'
            }

            // ── Heavy independent libs (no React context usage)
            if (id.includes('/firebase/'))   return 'vendor-firebase'
            if (id.includes('/@googlemaps/') || id.includes('/google-maps/')) return 'vendor-maps'

            // ── PayPal: separate chunk is fine because it resolves React
            // via the alias above, not its own bundled copy
            if (id.includes('/paypal/') || id.includes('@paypal')) return 'vendor-paypal'

            // ── Everything else: pure utilities, non-React packages
            return 'vendor-misc'
          }

          // App portals — each downloads only when that portal is visited
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