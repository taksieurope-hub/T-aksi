path = "frontend/src/components/RideCommunication.jsx"
c = open(path, "r", encoding="utf-8-sig").read()
lines = c.splitlines()

# Find message sending
for i, line in enumerate(lines):
    if "send" in line.lower() and ("message" in line.lower() or "chat" in line.lower()) and "const" in line:
        print(str(i+1) + ": " + line)

print("---")
# Find message display
for i, line in enumerate(lines):
    if "message" in line.lower() and ("map" in line or "render" in line.lower() or "content" in line.lower()):
        print(str(i+1) + ": " + line)
