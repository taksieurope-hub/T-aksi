path = "frontend/src/config.jsx"
c = open(path, "r", encoding="utf-8").read()

# Fix clearSession to set a logged_out flag
old = '  clearSession() {\n    if (USE_LS_FALLBACK) {\n      localStorage.removeItem("token");\n      localStorage.removeItem("user");\n    } else {\n      sessionStorage.removeItem("user");\n    }\n  },'

new = '  clearSession() {\n    if (USE_LS_FALLBACK) {\n      localStorage.removeItem("token");\n      localStorage.removeItem("user");\n    } else {\n      sessionStorage.removeItem("user");\n    }\n    sessionStorage.setItem("logged_out", "true");\n  },'

if old in c:
    c = c.replace(old, new)
    print("OK: clearSession sets logged_out flag")
else:
    print("MISS clearSession")

# Fix AuthProvider useEffect to respect logged_out flag
old2 = '    // Restore user profile from session/local storage on page load.\n    const userData = tokenStorage.getUser();\n    if (userData) setUser(userData);'

new2 = '    // Restore user profile from session/local storage on page load.\n    const wasLoggedOut = sessionStorage.getItem("logged_out") === "true";\n    const userData = tokenStorage.getUser();\n    if (userData && !wasLoggedOut) setUser(userData);'

if old2 in c:
    c = c.replace(old2, new2)
    print("OK: AuthProvider respects logged_out flag")
else:
    print("MISS AuthProvider restore")

# Fix login to clear logged_out flag
old3 = '  const login = (token, userData) => {\n    tokenStorage.setSession(token, userData);\n    setUser(userData);\n  };'

new3 = '  const login = (token, userData) => {\n    sessionStorage.removeItem("logged_out");\n    tokenStorage.setSession(token, userData);\n    setUser(userData);\n  };'

if old3 in c:
    c = c.replace(old3, new3)
    print("OK: login clears logged_out flag")
else:
    print("MISS login")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
