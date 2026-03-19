path = "frontend/src/components/RideCommunication.jsx"
c = open(path, "r", encoding="utf-8-sig").read()
lines = c.splitlines()
for i in range(220, 290):
    print(str(i+1) + ": " + lines[i])
