path = "frontend/src/components/RideCommunication.jsx"
c = open(path, "r", encoding="utf-8-sig").read()
lines = c.splitlines()
# Show props and top of component
for i in range(85, 115):
    print(str(i+1) + ": " + lines[i])
