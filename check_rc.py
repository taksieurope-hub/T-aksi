path = "frontend/src/components/RideCommunication.jsx"
c = open(path, "r", encoding="utf-8-sig").read()
lines = c.splitlines()
for i, line in enumerate(lines):
    if "tel:" in line or "call" in line.lower() or "otherPartyPhone" in line or "phone" in line.lower():
        print(str(i+1) + ": " + line)
