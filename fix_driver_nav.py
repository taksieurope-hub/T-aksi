path = "frontend/src/components/Drivermap.jsx"
c = open(path, "r", encoding="utf-8").read()

# Move HUD from bottom to top, make it Waze-style
old_hud = '''      {activeRide && curStep && (
        <div
          className="absolute left-3 right-3 z-30 rounded-2xl overflow-hidden shadow-2xl"
          style={{
            bottom: "calc(72vh + 12px)",          // sits just above the bottom sheet
            background: "rgba(7,7,15,0.93)",
            border: "1px solid rgba(0,255,136,0.18)",
            backdropFilter: "blur(16px)",
            pointerEvents: "auto",
          }}
        >
          {/* Primary step row */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3"
            onClick={() => setHudCollapsed(p => !p)}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0,255,136,0.15)", border: "1.5px solid rgba(0,255,136,0.4)" }}
            >
              <Navigation2 className="w-6 h-6 text-[#00ff88]" />
            </div>

            <div className="flex-1 text-left min-w-0">
              <p className="text-white font-semibold text-sm leading-snug line-clamp-1">
                {curStep.instruction || "Continue"}
              </p>
              {curStep.distanceM > 0 && (
                <p className="text-white/50 text-xs mt-0.5">
                  {curStep.distanceM < 1000
                    ? `${curStep.distanceM} m`
                    : `${(curStep.distanceM / 1000).toFixed(1)} km`}
                </p>
              )}
            </div>

            {/* ETA pill */}
            {etaSeconds > 0 && (
              <div
                className="flex items-center gap-1 px-2.5 py-1 rounded-full shrink-0"
                style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.25)" }}
              >
                <Timer className="w-3 h-3 text-[#00d4ff]" />
                <span className="text-[#00d4ff] text-xs font-mono font-bold">
                  {fmtEta(etaSeconds)}
                </span>
              </div>
            )}'''

new_hud = '''      {activeRide && curStep && (
        <div
          className="absolute left-0 right-0 z-30 overflow-hidden shadow-2xl"
          style={{
            top: 0,
            background: "rgba(7,7,15,0.96)",
            borderBottom: "1px solid rgba(0,255,136,0.25)",
            backdropFilter: "blur(16px)",
            pointerEvents: "auto",
          }}
        >
          {/* Primary step row - Waze style */}
          <button
            className="w-full flex items-center gap-3 px-4 py-3"
            onClick={() => setHudCollapsed(p => !p)}
          >
            {/* Big turn arrow box */}
            <div
              className="shrink-0 flex items-center justify-center"
              style={{ width:58, height:58, borderRadius:12, background:"rgba(0,255,136,0.15)", border:"2px solid rgba(0,255,136,0.5)" }}
            >
              <span style={{ fontSize:32, color:"#00ff88", lineHeight:1 }}>
                {(() => {
                  const inst = (curStep.instruction || "").toLowerCase();
                  if (inst.includes("left")) return "\u2190";
                  if (inst.includes("right")) return "\u2192";
                  if (inst.includes("u-turn")) return "\u21BA";
                  if (inst.includes("roundabout") || inst.includes("circle")) return "\u21BB";
                  if (inst.includes("arrive") || inst.includes("destination")) return "\u2691";
                  return "\u2191";
                })()}
              </span>
            </div>

            <div className="flex-1 text-left min-w-0">
              {curStep.distanceM > 0 && (
                <p style={{ color:"#00ff88", fontSize:22, fontWeight:900, fontFamily:"monospace", lineHeight:1 }}>
                  {curStep.distanceM < 1000 ? `${curStep.distanceM} m` : `${(curStep.distanceM/1000).toFixed(1)} km`}
                </p>
              )}
              <p className="text-white font-semibold text-sm leading-snug line-clamp-1 mt-0.5">
                {curStep.instruction || "Continue"}
              </p>
            </div>

            {/* ETA */}
            {etaSeconds > 0 && (
              <div className="shrink-0 text-right">
                <div style={{ color:"#00d4ff", fontSize:20, fontWeight:900, fontFamily:"monospace" }}>
                  {fmtEta(etaSeconds)}
                </div>
                <div style={{ color:"rgba(255,255,255,0.35)", fontSize:10 }}>ETA</div>
              </div>
            )}'''

if old_hud in c:
    c = c.replace(old_hud, new_hud)
    print("OK: HUD moved to top Waze-style")
else:
    print("MISS: HUD pattern not found")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
