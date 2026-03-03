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
      target: 'esnext',
      minify: 'esbuild',
      rollupOptions: {
        input: {
          main: 'index.html',
          rider: 'rider/index.html',
          driver: 'driver/index.html',
          admin: 'admin/index.html',
        },
        output: {
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('react')) return 'vendor-react';
              if (id.includes('firebase')) return 'vendor-firebase';
              return 'vendor-libs';
            }
            if (id.includes('RiderPortal') || id.includes('/rider/')) return 'portal-rider';
            if (id.includes('DriverPortal') || id.includes('/driver/')) return 'portal-driver';
            if (id.includes('AdminPortal') || id.includes('/admin/')) return 'portal-admin';
          }
        }
      }
    }
  }
})