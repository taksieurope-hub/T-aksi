path = "frontend/vite.config.js"
c = open(path, encoding="utf-8").read()

old = """      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectManifest: {
          injectionPoint: undefined,
        },
        manifest: false,
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
      }),"""

new = """      VitePWA({
        registerType: 'prompt',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectManifest: {
          injectionPoint: undefined,
        },
        manifest: false,
        devOptions: { enabled: false },
      }),"""

if old in c:
    open(path, "w", encoding="utf-8").write(c.replace(old, new))
    print("Done. VitePWA fixed.")
else:
    print("MATCH FAILED")
