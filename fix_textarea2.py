path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = 'className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-[#00d4ff]/40" style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",color:"#ffffff",caretColor:"#00d4ff"}}'
new = 'style={{width:"100%",borderRadius:12,padding:"12px 16px",fontSize:14,resize:"none",outline:"none",background:"#1a1a2e",border:"1px solid rgba(0,212,255,0.3)",color:"#ffffff",caretColor:"#00d4ff",fontFamily:"inherit",lineHeight:1.5}}'

if old in c:
    c = c.replace(old, new)
    print("OK: textarea style hardened")
else:
    print("MISS - searching for textarea...")
    import re
    m = re.search(r'<textarea[^>]*onChange.*?>', c)
    if m:
        print("Found at:", c[:m.start()].count("\n")+1)
        print("Content:", m.group()[:200])

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
