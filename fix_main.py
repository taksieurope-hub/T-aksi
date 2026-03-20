path = "frontend/src/main.jsx"
c = open(path, encoding="utf-8").read()

cleanup = """// Unregister broken service workers then reload
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
}

"""

if "serviceWorker" not in c:
    c = cleanup + c
    open(path, "w", encoding="utf-8").write(c)
    print("Done. SW cleanup added.")
else:
    print("Already has SW code.")
