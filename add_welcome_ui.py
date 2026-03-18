path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

welcome_ui = """
            {/* Welcome Discount */}
            {(user?.welcome_discount_rides_remaining > 0) && (
              <div style={{background:"rgba(255,140,0,0.06)",border:"1px solid rgba(255,140,0,0.3)",borderRadius:16,padding:16,display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:28}}>🎉</span>
                <div style={{flex:1}}>
                  <div style={{color:"#ff8c00",fontWeight:800,fontSize:14}}>Welcome Discount Active!</div>
                  <div style={{color:"rgba(255,255,255,0.5)",fontSize:12,marginTop:2}}>15% off your next {user.welcome_discount_rides_remaining} ride{user.welcome_discount_rides_remaining !== 1 ? "s" : ""}</div>
                </div>
                <div style={{background:"rgba(255,140,0,0.2)",border:"1px solid rgba(255,140,0,0.4)",borderRadius:10,padding:"6px 12px",color:"#ff8c00",fontWeight:900,fontSize:16}}>
                  -15%
                </div>
              </div>
            )}
"""

old = '            {/* Loyalty Progress */}'
if old in c:
    c = c.replace(old, welcome_ui + '\n            {/* Loyalty Progress */}')
    print("OK: welcome discount banner added to profile")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
