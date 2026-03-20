path = "backend/server.py"
c = open(path, encoding="utf-8").read()

old = 'ELIGIBLE_TYPES = {"economy":{"economy","jumpstart","personal"},"comfort":{"comfort","economy","jumpstart","personal"},"suv":{"suv","comfort","economy","jumpstart","personal"},"jumpstart":{"economy","comfort","suv","personal","jumpstart"},"personal":{"economy","comfort","suv","personal","jumpstart"}}'

# comfort ride -> only comfort/suv/personal drivers
# suv ride -> only suv drivers
# economy ride -> economy/jumpstart drivers
new = 'ELIGIBLE_TYPES = {"economy":{"economy","jumpstart"},"comfort":{"comfort","suv","personal"},"suv":{"suv"},"jumpstart":{"economy","jumpstart"},"personal":{"personal","suv","comfort"}}'

if old in c:
    open(path, "w", encoding="utf-8").write(c.replace(old, new))
    print("Done. Vehicle tier matching fixed.")
else:
    print("MATCH FAILED")
