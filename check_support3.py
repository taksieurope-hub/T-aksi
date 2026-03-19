path = "frontend/src/components/RiderPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()
for i, line in enumerate(lines):
    if any(x in line for x in ["support", "Support", "SupportAI", "AiSupport", "chatbot", "t-aksi support"]):
        print(str(i+1) + ": " + line)
