path = "frontend/vite.config.js"
c = open(path, "r", encoding="utf-8").read()

old = "      VitePWA({\n        registerType: 'autoUpdate',\n        strategies: 'injectManifest',\n        srcDir: 'src',\n        filename: 'sw.js',\n        injectManifest: {\n          injectionPoint: undefined,\n        },\n        manifest: false,\n      }),"
new = "      VitePWA({\n        registerType: 'autoUpdate',\n        strategies: 'injectManifest',\n        srcDir: 'src',\n        filename: 'sw.js',\n        injectManifest: {\n          injectionPoint: undefined,\n        },\n        manifest: false,\n        workbox: {\n          cleanupOutdatedCaches: true,\n          skipWaiting: true,\n          clientsClaim: true,\n        },\n      }),"

if old in c:
    c = c.replace(old, new)
    print("OK: PWA cache fix applied")
else:
    print("MISS: trying alternate")
    # Try finding just the VitePWA block end
    idx = c.find("manifest: false,\n      }),")
    if idx != -1:
        old2 = "manifest: false,\n      }),"
        new2 = "manifest: false,\n        workbox: {\n          cleanupOutdatedCaches: true,\n          skipWaiting: true,\n          clientsClaim: true,\n        },\n      }),"
        c = c.replace(old2, new2)
        print("OK: PWA cache fix applied (alternate)")
    else:
        print("MISS: could not find insertion point")

open(path, "w", encoding="utf-8", newline="\n").write(c)
