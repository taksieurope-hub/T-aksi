path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Find the online/offline toggle area to add radius slider nearby
old = '  const toggleOnline = async () => {'
new = '''  const [preferredRadius, setPreferredRadius] = React.useState(2);

  const updateRadius = async (r) => {
    setPreferredRadius(r);
    try { await api.post("/driver/preferred-radius?radius=" + r); } catch(e) {}
  };

  const toggleOnline = async () => {'''

if old in c:
    c = c.replace(old, new)
    print("OK: radius state added")
else:
    print("MISS: toggleOnline")

# Add radius slider in the UI near the online toggle
old = '{/* Online Toggle */}'
new = '''{/* Online Toggle */}
              {isOnline && (
                <div style={{padding:"8px 16px",background:"rgba(0,255,136,0.05)",borderTop:"1px solid rgba(255,255,255,0.05)"}}>
                  <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,marginBottom:4}}>Search radius: {preferredRadius}km</div>
                  <input type="range" min="1" max="15" step="0.5" value={preferredRadius}
                    onChange={e => updateRadius(parseFloat(e.target.value))}
                    style={{width:"100%",accentColor:"#00ff88"}} />
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.3)"}}>
                    <span>1km</span><span>15km</span>
                  </div>
                </div>
              )}'''

if old in c:
    c = c.replace(old, new)
    print("OK: radius slider added")
else:
    print("MISS: online toggle comment")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
