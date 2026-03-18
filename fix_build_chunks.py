path = "frontend/vite.config.js"
c = open(path, "r", encoding="utf-8").read()

old = "    build: {\n      target: 'esnext',\n      minify: 'esbuild',\n      outDir: 'dist',\n    }"
new = "    build: {\n      target: 'esnext',\n      minify: 'esbuild',\n      outDir: 'dist',\n      rollupOptions: {\n        output: {\n          manualChunks: {\n            vendor: ['react', 'react-dom', 'react-router-dom'],\n            axios: ['axios'],\n          }\n        }\n      }\n    }"

if old in c:
    c = c.replace(old, new)
    print("OK: build chunks config added")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
