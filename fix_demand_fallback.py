path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '        logger.warning(f"Error calculating area demand: {e}")\n        return 0.3'
new = '        logger.warning(f"Error calculating area demand: {e}")\n        return 0.0'

if old in c:
    c = c.replace(old, new)
    print("OK: demand fallback fixed to 0.0")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
