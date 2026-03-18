path = "frontend/src/config.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '  const updateUserData = (data) => {'
new = '  const refreshUser = async () => {\n    const wasLoggedOut = sessionStorage.getItem("logged_out") === "true";\n    if (wasLoggedOut) return;\n    try {\n      const res = await fetch(`${API}/auth/me`, { credentials: "include" });\n      if (res.ok) {\n        const data = await res.json();\n        if (data?.user) updateUserData(data.user);\n      } else if (res.status === 401) {\n        tokenStorage.clearSession();\n        setUser(null);\n      }\n    } catch {}\n  };\n\n  const updateUserData = (data) => {'

if old in c:
    c = c.replace(old, new)
    print("OK: refreshUser added")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
