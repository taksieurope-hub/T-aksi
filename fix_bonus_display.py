path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '                  <GlassCard accent className="p-4 text-center">\n                    <p className="text-[#00ff88]/50 text-[10px] uppercase tracking-widest mb-1">Balance</p>\n                    <p className="text-3xl font-bold font-mono text-[#00ff88]">GEL {balance.toFixed(2)}</p>\n                  </GlassCard>'

new = '                  <GlassCard accent className="p-4 text-center">\n                    <p className="text-[#00ff88]/50 text-[10px] uppercase tracking-widest mb-1">Balance</p>\n                    <p className="text-3xl font-bold font-mono text-[#00ff88]">GEL {balance.toFixed(2)}</p>\n                    {remainingBonus > 0 && (\n                      <p className="text-amber-400 text-[10px] mt-1">🎁 GEL {remainingBonus.toFixed(2)} signup bonus (commission only)</p>\n                    )}\n                  </GlassCard>'

if old in c:
    c = c.replace(old, new)
    print("OK: signup bonus display added")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
