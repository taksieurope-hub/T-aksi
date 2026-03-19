path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Add tier state
old = '  const [vehicleData, setVehicleData] = useState({'
new = '  const [vehicleTier, setVehicleTier] = useState("economy");\n  const [vehicleData, setVehicleData] = useState({'
if old in c:
    c = c.replace(old, new)
    changes.append("OK: vehicleTier state added")
else:
    changes.append("MISS: state")

# Add tier to formData submission
old2 = 'formData.append("license_plate", vehicleData.license_plate);'
new2 = 'formData.append("license_plate", vehicleData.license_plate);\n      formData.append("vehicle_tier", vehicleTier);'
if old2 in c:
    c = c.replace(old2, new2)
    changes.append("OK: tier added to form submission")
else:
    changes.append("MISS: form submission")

# Add tier selector UI - find license plate input area
old3 = '                <Label className="text-white/60 text-xs uppercase tracking-wider">License Plate</Label>'
new3 = '''                <Label className="text-white/60 text-xs uppercase tracking-wider">Vehicle Class</Label>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[["economy","Economy","Standard sedan"],["comfort","Comfort","Premium sedan"],["suv","SUV / XL","Large vehicle"]].map(([val,label,desc]) => (
                    <button key={val} type="button" onClick={() => setVehicleTier(val)}
                      className={"p-3 rounded-xl border-2 text-left transition-all " + (vehicleTier === val ? "border-[#00ff88] bg-[#00ff88]/10" : "border-white/10 bg-white/3")}>
                      <div className={"text-sm font-bold " + (vehicleTier === val ? "text-[#00ff88]" : "text-white")}>{label}</div>
                      <div className="text-white/40 text-xs mt-0.5">{desc}</div>
                    </button>
                  ))}
                </div>
                <Label className="text-white/60 text-xs uppercase tracking-wider">License Plate</Label>'''
if old3 in c:
    c = c.replace(old3, new3)
    changes.append("OK: tier selector UI added")
else:
    changes.append("MISS: UI insertion point")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
