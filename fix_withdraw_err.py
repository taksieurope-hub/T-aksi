path = "frontend/src/components/DriverPortal.jsx"
c = open(path, encoding="utf-8").read()

old = '      toast.error(err.response?.data?.detail || "Withdrawal failed");'
new = '      toast.error(err.response?.data?.detail || err.response?.data?.message || "Withdrawal failed. Check your balance.");'

if old in c:
    c = c.replace(old, new)
    open(path, "w", encoding="utf-8").write(c)
    print("Done.")
else:
    print("MATCH FAILED")
