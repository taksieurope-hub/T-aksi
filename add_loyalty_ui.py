path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

loyalty_ui = """
            {/* Loyalty Progress */}
            {(() => {
              const totalRides = user?.total_rides || 0;
              const cycleRides = totalRides % 13;
              const hasDiscount = user?.loyalty_free_ride_earned;
              const pct = hasDiscount ? 100 : Math.round((cycleRides / 12) * 100);
              return (
                <div style={{background:"rgba(0,212,255,0.04)",border:"1px solid rgba(0,212,255,0.2)",borderRadius:16,padding:16}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                    <span style={{fontSize:22}}>🎁</span>
                    <div style={{flex:1}}>
                      <div style={{color:"#00d4ff",fontWeight:700,fontSize:14}}>Loyalty Reward</div>
                      <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>Every 13th ride gets 15% off</div>
                    </div>
                    {hasDiscount && (
                      <div style={{background:"rgba(0,255,136,0.15)",border:"1px solid rgba(0,255,136,0.4)",borderRadius:8,padding:"4px 10px",color:"#00ff88",fontWeight:700,fontSize:12}}>
                        15% OFF READY!
                      </div>
                    )}
                  </div>
                  <div style={{background:"rgba(255,255,255,0.06)",borderRadius:99,height:10,overflow:"hidden",marginBottom:8}}>
                    <div style={{height:"100%",width:`${pct}%`,background: hasDiscount ? "linear-gradient(90deg,#00ff88,#00d4ff)" : "linear-gradient(90deg,#00d4ff,#0099ff)",borderRadius:99,transition:"width 0.5s ease"}} />
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>
                      {hasDiscount ? "Book your next ride to use discount!" : `${cycleRides} / 12 rides completed`}
                    </span>
                    <span style={{color:"#00d4ff",fontWeight:700,fontSize:12}}>{pct}%</span>
                  </div>
                  {!hasDiscount && cycleRides > 0 && (
                    <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginTop:4}}>
                      {12 - cycleRides} more ride{12 - cycleRides !== 1 ? "s" : ""} until 15% off
                    </div>
                  )}
                </div>
              );
            })()}
"""

# Insert after the stats grid (after wallet balance stat card closing div)
old = """            <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#00ff88]/15 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-[#00ff88]" />"""

new = loyalty_ui + """
            <div className="bg-white/3 border border-white/8 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#00ff88]/15 flex items-center justify-center">
                    <Wallet className="w-4 h-4 text-[#00ff88]" />"""

if old in c:
    c = c.replace(old, new)
    print("OK: loyalty progress bar added to profile")
else:
    print("MISS: insert point not found")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
