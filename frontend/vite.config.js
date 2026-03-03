import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY),
    },
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    build: {
      // 1. THIS PREVENTS VITE FROM TRYING TO BE SMART AND COMBINING CHUNKS
      modulePreload: { polyfill: false }, 
      rollupOptions: {
        input: {
          main: 'index.html',
          rider: 'rider/index.html',
          driver: 'driver/index.html',
          admin: 'admin/index.html',
        },
        output: {
          // 2. FORCE STRICT SEPARATION
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('react')) return 'vendor-react';
              if (id.includes('firebase')) return 'vendor-firebase';
              return 'vendor-libs';
            }
            // If the file is inside the driver folder or named Driver, shove it in its own box
            if (id.includes('/driver/') || id.includes('DriverPortal')) return 'portal-driver';
            if (id.includes('/rider/') || id.includes('RiderPortal')) return 'portal-rider';
            if (id.includes('/admin/') || id.includes('AdminPortal')) return 'portal-admin';
          },
          // 3. ENSURE NO CROSS-CONTAMINATION
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
        }
      }
    }
  }
})