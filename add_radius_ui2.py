path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add state near other driver states
old = "  const handleToggleOnline = async (online) => {"
new = """  const [preferredRadius, setPreferredRadius] = React.useState(2);

  const updateRadius = async (r) => {
    setPreferredRadius(r);
    try { await api.post("/driver/preferred-radius?radius=" + r); } catch(e) {}
  };

  const handleToggleOnline = async (online) => {"""

if old in c:
    c = c.replace(old, new)
    print("OK: radius state added")
else:
    print("MISS: handleToggleOnline")

# Add slider after the online toggle button closing )}
old = '''            {registrationStatus === "approved" && (
              <button onClick={() => handleToggleOnline(!isOnline)}
                className={`relative w-14 h-7 rounded-full transition-colors duration-300 border ${isOnline ? "bg-[#00ff88]/25 border-[#00ff88]/50" : "bg-white/8 border-white/15"}`}>
                <div className={`absolute top-0.5 w-6 h-6 rounded-full transition-transform duration-300 shadow-lg ${isOnline ? "translate-x-7 bg-[#00ff88]" : "translate-x-0.5 bg-white/40"}`} />
              </button>
            )}'''

new = '''            {registrationStatus === "approved" && (
              <button onClick={() => handleToggleOnline(!isOnline)}
                className={`relative w-14 h-7 rounded-full transition-colors duration-300 border ${isOnline ? "bg-[#00ff88]/25 border-[#00ff88]/50" : "bg-white/8 border-white/15"}`}>
                <div className={`absolute top-0.5 w-6 h-6 rounded-full transition-transform duration-300 shadow-lg ${isOnline ? "translate-x-7 bg-[#00ff88]" : "translate-x-0.5 bg-white/40"}`} />
              </button>
            )}
            {isOnline && (
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"2px 8px",background:"rgba(0,255,136,0.05)",borderRadius:8,border:"1px solid rgba(0,255,136,0.15)"}}>
                <span style={{color:"rgba(255,255,255,0.4)",fontSize:10,whiteSpace:"nowrap"}}>{preferredRadius}km</span>
                <input type="range" min="1" max="15" step="0.5" value={preferredRadius}
                  onChange={e => updateRadius(parseFloat(e.target.value))}
                  style={{width:60,accentColor:"#00ff88"}} />
              </div>
            )}'''

if old in c:
    c = c.replace(old, new)
    print("OK: radius slider added")
else:
    print("MISS: toggle button")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
