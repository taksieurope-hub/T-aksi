path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '<TabsContent value="drivers">'
new = '<TabsContent value="drivers"><CompetitionPayoutPanel />'

if old in c:
    c = c.replace(old, new)
    print("OK: CompetitionPayoutPanel inserted in drivers tab")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
