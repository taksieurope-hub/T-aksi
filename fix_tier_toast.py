path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '      await api.post("/driver/vehicle", fd, { headers: { "Content-Type": "multipart/form-data" } });\n      toast.success("Documents submitted!");'
new = ('      const res = await api.post("/driver/vehicle", fd, { headers: { "Content-Type": "multipart/form-data" } });\n'
       '      const tierLabel = { economy: "Economy", comfort: "Comfort", suv: "SUV / XL", jumpstart: "Jumpstart", personal: "Personal" };\n'
       '      const detectedTier = res.data?.tier || "economy";\n'
       '      toast.success("Documents submitted! Vehicle classified as: " + (tierLabel[detectedTier] || detectedTier));')

if old in c:
    c = c.replace(old, new)
    print("OK: tier toast added")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
