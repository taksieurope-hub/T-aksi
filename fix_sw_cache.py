path = "frontend/src/sw.js"
c = open(path, "r", encoding="utf-8").read()

old = 'import { clientsClaim } from "workbox-core";\nclientsClaim();\nself.skipWaiting();\n// Cache essential assets\nself.__WB_MANIFEST;'
new = 'import { clientsClaim } from "workbox-core";\nclientsClaim();\nself.skipWaiting();\n// Cache essential assets\nself.__WB_MANIFEST;\n\n// Clear ALL old caches on activate so stale chunks never cause white screens\nself.addEventListener("activate", function(event) {\n  event.waitUntil(\n    caches.keys().then(function(cacheNames) {\n      return Promise.all(\n        cacheNames.map(function(cacheName) {\n          return caches.delete(cacheName);\n        })\n      );\n    })\n  );\n});'

if old in c:
    c = c.replace(old, new)
    print("OK: cache clear on activate added")
else:
    print("MISS - appending instead")
    c = c + '\n\nself.addEventListener("activate", function(event) {\n  event.waitUntil(\n    caches.keys().then(function(cacheNames) {\n      return Promise.all(\n        cacheNames.map(function(cacheName) {\n          return caches.delete(cacheName);\n        })\n      );\n    })\n  );\n});'
    print("OK: appended cache clear handler")

open(path, "w", encoding="utf-8", newline="\n").write(c)
