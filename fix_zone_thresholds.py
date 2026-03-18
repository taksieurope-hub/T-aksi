path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()

old = '''            if demand >= 0.15:
                if demand >= 0.75:
                    level, color, multiplier = "very_high", "#ff2200", 2.0
                elif demand >= 0.5:
                    level, color, multiplier = "high", "#ff6600", 1.8
                elif demand >= 0.30:
                    level, color, multiplier = "moderate", "#ffaa00", 1.5
                else:
                    level, color, multiplier = "elevated", "#ffdd00", 1.2'''

new = '''            if demand >= 0.50:
                if demand >= 1.0:
                    level, color, multiplier = "very_high", "#ff2200", 2.0
                elif demand >= 0.75:
                    level, color, multiplier = "high", "#ff6600", 1.8
                elif demand >= 0.60:
                    level, color, multiplier = "moderate", "#ffaa00", 1.5
                else:
                    level, color, multiplier = "elevated", "#ffdd00", 1.2'''

if old in c:
    c = c.replace(old, new)
    print("OK: zones thresholds updated to match")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
