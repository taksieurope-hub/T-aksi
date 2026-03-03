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
          // Standard naming, no custom manualChunks logic
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
        }
      }
    }
  }
})