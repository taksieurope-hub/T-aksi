path = "frontend/src/config.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add refreshUser to AuthProvider that respects logged_out flag
old = '  const updateUser = (data) => {'
new = '  const refreshUser = async () => {\n    const wasLoggedOut = sessionStorage.getItem("logged_out") === "true";\n    if (wasLoggedOut) return;\n    try {\n      const res = await fetch(`${API}/auth/me`, { credentials: "include" });\n      if (res.ok) {\n        const data = await res.json();\n        if (data?.user) updateUserData(data.user);\n      } else if (res.status === 401) {\n        tokenStorage.clearSession();\n        setUser(null);\n      }\n    } catch {}\n  };\n\n  const updateUser = (data) => {'

# Also rename internal updateUser to avoid conflict
old2 = '  const updateUser = (data) => {\n    setUser(data);\n    if (USE_LS_FALLBACK) {\n      localStorage.setItem("user", JSON.stringify(data));\n    } else {\n      sessionStorage.setItem("user", JSON.stringify(data));\n    }\n  };'
new2 = '  const updateUserData = (data) => {\n    setUser(data);\n    if (USE_LS_FALLBACK) {\n      localStorage.setItem("user", JSON.stringify(data));\n    } else {\n      sessionStorage.setItem("user", JSON.stringify(data));\n    }\n  };\n  const updateUser = updateUserData;'

if old2 in c:
    c = c.replace(old2, new2)
    print("OK: updateUserData alias added")
else:
    print("MISS updateUser")

if old in c:
    c = c.replace(old, new)
    print("OK: refreshUser added")
else:
    print("MISS refreshUser insert")

# Add refreshUser to the value export
old3 = '  const value = useMemo(\n    () => ({ user, login, logout, updateUser }),\n    [user]\n  );'
new3 = '  const value = useMemo(\n    () => ({ user, login, logout, updateUser, refreshUser }),\n    [user]\n  );'

if old3 in c:
    c = c.replace(old3, new3)
    print("OK: refreshUser exported")
else:
    print("MISS value export")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
