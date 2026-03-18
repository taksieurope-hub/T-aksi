path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = "        </Tabs>\n\n        <div"
new = "          {/* -- CORPORATE -- */}\n          <TabsContent value=\"corporate\">\n            <CorporateAdminPanel api={api} />\n          </TabsContent>\n        </Tabs>\n\n        <div"

if old in c:
    c = c.replace(old, new)
    print("OK: corporate TabsContent added")
else:
    print("MISS: still not found")
    idx = c.find("</Tabs>")
    print(repr(c[idx-20:idx+40]))

open(path, "w", encoding="utf-8", newline="\n").write(c)
