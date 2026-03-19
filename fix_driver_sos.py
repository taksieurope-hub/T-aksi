path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
if "<SupportChatWidget />" in c:
    c = c.replace("\n      <SupportChatWidget />", "")
    open(path, "w", encoding="utf-8").write(c)
    print("Done. Removed from DriverPortal.")
else:
    print("Not found - already removed.")
