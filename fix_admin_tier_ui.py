path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Find the approve/reject buttons area in driver management and add tier selector
old = '                  <Button onClick={() => approve(driver.id)} '
# Check if tier selector already exists
if "set-tier" in c or "setTier" in c:
    changes.append("SKIP: tier UI already exists")
else:
    # Add tier change function near other driver action functions
    old2 = '  const approve = async (id) => {'
    new2 = ('  const setDriverTier = async (id, tier) => {\n'
            '    try {\n'
            '      await api.post(`/admin/drivers/${id}/set-tier?tier=${tier}`);\n'
            '      toast.success("Vehicle tier updated to " + tier);\n'
            '      loadDrivers();\n'
            '    } catch { toast.error("Failed to update tier"); }\n'
            '  };\n\n'
            '  const approve = async (id) => {')
    if old2 in c:
        c = c.replace(old2, new2)
        changes.append("OK: setDriverTier function added")
    else:
        changes.append("MISS: approve function")

    # Add tier dropdown next to approve/reject buttons
    old3 = '                  <Button onClick={() => approve(driver.id)} '
    if old3 in c:
        insert = ('                  <select onChange={e => e.target.value && setDriverTier(driver.id, e.target.value)} '
                  'defaultValue="" '
                  'className="h-8 text-xs bg-white/5 border border-white/10 rounded-lg px-2 text-white/60 cursor-pointer">\n'
                  '                    <option value="" disabled>Set tier...</option>\n'
                  '                    {["economy","comfort","suv","jumpstart","personal"].map(t => (\n'
                  '                      <option key={t} value={t} style={{background:"#111"}}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>\n'
                  '                    ))}\n'
                  '                  </select>\n'
                  '                  <Button onClick={() => approve(driver.id)} ')
        c = c.replace(old3, insert, 1)
        changes.append("OK: tier selector added to driver list")
    else:
        changes.append("MISS: approve button in driver list")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
