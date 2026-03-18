path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '''                  <span>{routeInfo.distance} {t("km")} ? {routeInfo.duration} {t("min")}</span>
                </div>
                <div className="text-right">
  <div className="flex items-baseline justify-end">
    <span className="text-[#00ff88] font-bold text-2xl">GEL {fareEstimate.total.toFixed(2)}</span>
    <CurrencyConverter gelAmount={fareEstimate.total} />
  </div>
  {paymentMethod === "card" && <p className="text-white/25 text-xs mt-0.5">incl. ?2 card fee</p>}
</div>'''

new = '''                  <span>{routeInfo.distance} {t("km")} · {routeInfo.duration} {t("min")}</span>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline justify-end">
                    <span className="text-[#00ff88] font-bold text-2xl">GEL {fareEstimate.total.toFixed(2)}</span>
                    <CurrencyConverter gelAmount={fareEstimate.total} />
                  </div>
                  {paymentMethod === "card" && <p className="text-white/25 text-xs mt-0.5">incl. GEL 2 card fee</p>}
                  <p style={{color:"rgba(0,212,255,0.6)",fontSize:11,marginTop:2}}>
                    ETA: {(() => { const arr = new Date(Date.now() + (routeInfo.duration||0)*60000); return arr.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); })()}
                  </p>
                </div>'''

if old in c:
    c = c.replace(old, new)
    print("OK: ETA before booking added, broken char fixed")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
