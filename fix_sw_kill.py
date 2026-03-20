# Add a meta refresh + SW killer to index.html template
path = "frontend/index.html"
c = open(path, encoding="utf-8").read()
killer = """
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        regs.forEach(function(reg) { reg.unregister(); });
      });
      caches.keys().then(function(keys) {
        keys.forEach(function(key) { caches.delete(key); });
      });
    }
  </script>"""
if "serviceWorker" not in c:
    c = c.replace("</head>", killer + "\n  </head>")
    open(path, "w", encoding="utf-8").write(c)
    print("Done. SW killer added to index.html")
else:
    print("Already has SW code in index.html")
