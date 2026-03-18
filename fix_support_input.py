path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = 'className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none placeholder:text-white/20 focus:outline-none focus:border-[#00d4ff]/40"'
new = 'className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-[#00d4ff]/40" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"#ffffff",caretColor:"#00d4ff"}}'

if old in c:
    c = c.replace(old, new)
    print("OK: support textarea text visibility fixed")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
