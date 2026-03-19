path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Fix 1: Add vehicle_tier to form submission
old = '      ["car_make","car_model","car_year","car_color","license_plate"].forEach(k =>\n        fd.append(k, k === "car_year" ? parseInt(vehicleData[k]) : vehicleData[k])\n      );'
new = '      ["car_make","car_model","car_year","car_color","license_plate"].forEach(k =>\n        fd.append(k, k === "car_year" ? parseInt(vehicleData[k]) : vehicleData[k])\n      );\n      fd.append("vehicle_tier", vehicleTier);'
if old in c:
    c = c.replace(old, new)
    changes.append("OK: vehicle_tier added to form submission")
else:
    changes.append("MISS: form submission")

# Fix 2: Add tier selector UI before license plate
old2 = '                  <div className="col-span-2 space-y-1">\n                    <Label className="text-white/40 text-[11px]">License Plate</Label>'
new2 = '''                  <div className="col-span-2 space-y-1">
                    <Label className="text-white/40 text-[11px]">Vehicle Class</Label>
                    <div className="grid grid-cols-3 gap-2 mb-1">
                      {[["economy","Economy","Standard"],["comfort","Comfort","Premium"],["suv","SUV / XL","Large"]].map(([val,label,desc]) => (
                        <button key={val} type="button" onClick={() => setVehicleTier(val)}
                          className={"p-2.5 rounded-xl border-2 text-left transition-all " + (vehicleTier === val ? "border-[#00ff88] bg-[#00ff88]/10" : "border-white/10 bg-white/3")}>
                          <div className={"text-xs font-bold " + (vehicleTier === val ? "text-[#00ff88]" : "text-white")}>{label}</div>
                          <div className="text-white/40 text-[10px]">{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-white/40 text-[11px]">License Plate</Label>'''
if old2 in c:
    c = c.replace(old2, new2)
    changes.append("OK: tier selector UI added")
else:
    changes.append("MISS: UI insertion point")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
