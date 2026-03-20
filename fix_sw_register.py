path = "frontend/src/main.jsx"
c = open(path, encoding="utf-8").read()

# Replace whatever SW code is there with bulletproof registration
old_sw = """// Force unregister all service workers
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.unregister());
  });
  navigator.serviceWorker.ready.then(reg => reg.unregister()).catch(() => {});
}

"""

new_sw = ""

if old_sw in c:
    c = c.replace(old_sw, new_sw)
    print("Removed old SW code")

# Add error boundary around the whole app render
old_render = """ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);"""

new_render = """// Register SW with error handling
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(reg => {
        console.log("SW registered");
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              newSW.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(err => console.warn("SW registration failed:", err));

    // If SW causes error, reload without SW
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);"""

if old_render in c:
    c = c.replace(old_render, new_render)
    print("Fixed: proper SW registration added")
else:
    print("MATCH FAILED on render block")

open(path, "w", encoding="utf-8").write(c)
