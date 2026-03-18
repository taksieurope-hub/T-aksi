path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '            <div>\n              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">{t("vehicle_class")}</p>'

new = '            {(user?.welcome_discount_rides_remaining > 0) && (\n              <div style={{background:"rgba(255,140,0,0.06)",border:"1px solid rgba(255,140,0,0.3)",borderRadius:16,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,marginBottom:4}}>\n                <span style={{fontSize:24}}>🎉</span>\n                <div style={{flex:1}}>\n                  <div style={{color:"#ff8c00",fontWeight:800,fontSize:13}}>Welcome Discount Active!</div>\n                  <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,marginTop:2}}>15% off your next {user.welcome_discount_rides_remaining} ride{user.welcome_discount_rides_remaining !== 1 ? "s" : ""}</div>\n                </div>\n                <div style={{background:"rgba(255,140,0,0.2)",border:"1px solid rgba(255,140,0,0.4)",borderRadius:10,padding:"4px 10px",color:"#ff8c00",fontWeight:900,fontSize:15}}>-15%</div>\n              </div>\n            )}\n\n            <div>\n              <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-3">{t("vehicle_class")}</p>'

if old in c:
    c = c.replace(old, new)
    print("OK: welcome banner added to booking screen")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
