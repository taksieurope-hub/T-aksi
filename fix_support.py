path = "frontend/src/components/RiderPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

# Remove the floating SupportChatWidget from the main view (line 602)
for i, line in enumerate(lines):
    if line.strip() == "<SupportChatWidget />":
        lines[i] = ""
        print(f"Fix 1 applied: removed floating SupportChatWidget from line {i+1}")
        break

# Add it inside the support tab instead, after RiderSupportPanel
for i, line in enumerate(lines):
    if "<RiderSupportPanel />" in line:
        lines[i] = lines[i] + "\n              <SupportChatWidget />"
        print(f"Fix 2 applied: SupportChatWidget added to support tab at line {i+1}")
        break

open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("Done.")
