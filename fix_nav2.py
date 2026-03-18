path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old5 = '  return (\n    <div className="relative w-full rounded-2xl overflow-hidden" style={{ background: "#0d0d1a" }}>\n      <div ref={mapRef} style={{ height: "46vh", minHeight: "300px", width: "100%" }} />'
new5 = '''  const getTurnArrow = (h) => {
    const n = ((h % 360) + 360) % 360;
    if (n < 30 || n > 330) return "↑";
    if (n < 90) return "↗";
    if (n < 150) return "→";
    if (n < 210) return "↓";
    if (n < 270) return "←";
    return "↖";
  };

  return (
    <div className="relative w-full rounded-2xl overflow-hidden" style={{ background: "#0d0d1a" }}>
      {status !== "preview" && (
        <div style={{ position:"absolute", top:0, left:0, right:0, zIndex:20, pointerEvents:"none" }}>
          <div style={{ background:"rgba(7,7,15,0.96)", backdropFilter:"blur(12px)", borderBottom:"1px solid rgba(0,212,255,0.2)", padding:"12px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ flexShrink:0, width:56, height:56, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,212,255,0.15)", border:"2px solid rgba(0,212,255,0.5)" }}>
                <span style={{ fontSize:30, color:"#00d4ff", lineHeight:1 }}>{getTurnArrow(navInfo.heading)}</span>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                {navInfo.distanceToNext ? <div style={{ color:"#00d4ff", fontSize:22, fontWeight:900, fontFamily:"monospace", lineHeight:1 }}>{navInfo.distanceToNext}</div> : null}
                <div style={{ color:"#ffffff", fontSize:13, fontWeight:600, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {navInfo.nextStreet || (status === "accepted" ? "Heading to pickup..." : "On the way...")}
                </div>
              </div>
              {etaSeconds != null && etaSeconds > 0 && (
                <div style={{ flexShrink:0, textAlign:"right" }}>
                  <div style={{ color:"#00ff88", fontSize:20, fontWeight:900, fontFamily:"monospace" }}>{fmtEta(etaSeconds)}</div>
                  <div style={{ color:"rgba(255,255,255,0.4)", fontSize:10 }}>ETA</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <div ref={mapRef} style={{ height:"52vh", minHeight:"320px", width:"100%" }} />'''

if old5 in c:
    c = c.replace(old5, new5)
    print("OK nav panel JSX added")
else:
    print("MISS return JSX - checking variant...")
    # try CRLF variant
    old5b = old5.replace('\n', '\r\n')
    if old5b in c:
        c = c.replace(old5b, new5)
        print("OK nav panel JSX added (CRLF)")
    else:
        print("STILL MISS - manual check needed")

# hide old ETA pill
old6 = '      {etaSeconds != null && etaSeconds > 0 && status !== "preview" && (\n        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none">'
new6 = '      {false && etaSeconds != null && etaSeconds > 0 && status !== "preview" && (\n        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none">'
if old6 in c:
    c = c.replace(old6, new6)
    print("OK old ETA pill hidden")
else:
    print("MISS ETA pill (may already be hidden)")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
