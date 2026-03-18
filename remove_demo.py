path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '        <button onClick={async () => { const r = await api.post("/auth/demo-login?user_type=driver"); if(r.data?.token && r.data?.user){ login(r.data.token, r.data.user); navigate("/driver/dashboard"); } }} className="w-full h-11 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] font-bold text-sm mb-3 mt-4">\n          Demo Driver Login\n        </button>\n'
new = ''

if old in c:
    c = c.replace(old, new)
    print("OK: demo driver login removed")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
