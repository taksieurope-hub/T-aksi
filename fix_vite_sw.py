# Update vite config to use injectManifest mode
vite_path = "frontend/vite.config.js"
c = open(vite_path, "r", encoding="utf-8").read()

old = '''      VitePWA({
        registerType: "autoUpdate",
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
        manifest: false,
      }),'''

new = '''      VitePWA({
        registerType: "autoUpdate",
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.js",
        injectManifest: {
          injectionPoint: undefined,
        },
        manifest: false,
      }),'''

# Try with single quotes too
old2 = """      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
        },
        manifest: false,
      }),"""

new2 = """      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.js',
        injectManifest: {
          injectionPoint: undefined,
        },
        manifest: false,
      }),"""

if old in c:
    c = c.replace(old, new)
    print("OK: vite config updated (double quotes)")
elif old2 in c:
    c = c.replace(old2, new2)
    print("OK: vite config updated (single quotes)")
else:
    print("MISS")

open(vite_path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
