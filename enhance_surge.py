path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Enhance the surge warning banner to be more prominent
old = '''            {surgeInfo?.is_surge && (
              <div className="bg-orange-500/10 border border-orange-500/25 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/20 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-orange-400" />
                  </div>
                  <div>
                    <p className="text-orange-300 font-semibold text-sm">{t("surge_active")}</p>
                    <p className="text-orange-400/60 text-xs">{surgeInfo.surge_reason}</p>
                  </div>
                </div>
                <span className="text-orange-300 font-bold text-xl bg-orange-500/20 px-3 py-1 rounded-xl">GEL {surgeInfo.multiplier}</span>
              </div>
            )}'''

new = '''            {surgeInfo?.is_surge && (
              <div style={{background:"rgba(255,140,0,0.1)",border:"2px solid rgba(255,140,0,0.4)",borderRadius:16,padding:"14px 16px",animation:"pulse 2s infinite"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:24}}>⚡</span>
                  <div style={{flex:1}}>
                    <div style={{color:"#ff8c00",fontWeight:900,fontSize:14}}>Surge Pricing Active</div>
                    <div style={{color:"rgba(255,140,0,0.6)",fontSize:12}}>{surgeInfo.surge_reason}</div>
                  </div>
                  <div style={{background:"rgba(255,140,0,0.25)",border:"1px solid rgba(255,140,0,0.5)",borderRadius:10,padding:"6px 12px",textAlign:"center"}}>
                    <div style={{color:"#ff8c00",fontWeight:900,fontSize:20}}>{surgeInfo.multiplier}x</div>
                    <div style={{color:"rgba(255,140,0,0.6)",fontSize:9,fontWeight:700}}>MULTIPLIER</div>
                  </div>
                </div>
                <div style={{background:"rgba(255,140,0,0.08)",borderRadius:10,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{color:"rgba(255,255,255,0.5)",fontSize:12}}>Base fare</span>
                  <span style={{color:"rgba(255,255,255,0.4)",fontSize:12,fontFamily:"monospace",textDecoration:"line-through"}}>
                    GEL {fareEstimate ? (fareEstimate.total / (surgeInfo.multiplier||1)).toFixed(2) : "—"}
                  </span>
                  <span style={{color:"#ff8c00",fontSize:14,fontWeight:900,fontFamily:"monospace"}}>
                    → GEL {fareEstimate?.total.toFixed(2)}
                  </span>
                </div>
                <div style={{color:"rgba(255,140,0,0.5)",fontSize:11,marginTop:6,textAlign:"center"}}>
                  High demand in your area. Fares will return to normal soon.
                </div>
              </div>
            )}'''

if old in c:
    c = c.replace(old, new)
    print("OK: surge warning enhanced")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
