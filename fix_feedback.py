c = open("backend/server.py", "r", encoding="utf-8").read()
old = '@app.get("/api/health", tags=["System"])\n@app.post("/feedback")'
new = '@app.get("/api/health", tags=["System"])\n\n@app.post("/feedback")'
old2 = '@app.get("/api/health", tags=["System"])\r\n@app.post("/feedback")'
new2 = '@app.get("/api/health", tags=["System"])\r\n\r\n@app.post("/feedback")'
if old in c:
    c = c.replace(old, new)
    print("Fixed LF")
elif old2 in c:
    c = c.replace(old2, new2)
    print("Fixed CRLF")
else:
    print("Pattern not found - already separated?")
open("backend/server.py", "w", encoding="utf-8").write(c)
