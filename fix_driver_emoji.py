path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8", errors="replace").read()

import re

# Replace all corrupted emoji sequences with correct ones
# These are all triple-encoded UTF-8 sequences for common emoji
replacements = [
    # Star emoji (used in ratings)
    (re.compile(r'ÃƒÆ\x27Ã\xe2\x80\x93â€\x9e\x9cÃƒÆ\x27Ã¢â‚¬Å¡Ãƒâ€šÃ\x82Â¢ÃƒÆ\x27Ã\xe2\x80\x93â€¦[^"<}\s]{0,30}'), '⭐'),
]

# Simpler approach - find all corrupted sequences and replace based on context
lines = c.splitlines()
fixed_lines = []
for line in lines:
    if "Ã" in line:
        # Star ratings
        if "rating" in line.lower() or "star" in line.lower() or "w-12 h-12" in line:
            line = re.sub(r'Ãƒ[^\s"<{}\]]+', '⭐', line)
        # Trophy/medal emoji  
        elif "medal" in line.lower() or "trophy" in line.lower() or "medals" in line.lower() or "1st" in line or "2nd" in line:
            line = re.sub(r'Ãƒ[^\s"<{}\]]+', '🏆', line)
        # Competition tab
        elif "competition" in line.lower():
            line = re.sub(r'Ãƒ[^\s"<{}\]]+', '🏆', line)
        # General emoji spans
        elif 'fontSize' in line and 'span' in line:
            line = re.sub(r'Ãƒ[^\s"<{}\]]+', '🚗', line)
        # GEL currency symbol
        elif 'GEL' in line or 'gel' in line.lower():
            line = re.sub(r'Ãƒ[^\s"<{}\]]+', 'GEL', line)
        # Fallback
        else:
            line = re.sub(r'Ãƒ[^\s"<{}\]]+', '', line)
    fixed_lines.append(line)

result = "\n".join(fixed_lines)
remaining = result.count("Ã")
print("Remaining corruption: " + str(remaining))

open(path, "w", encoding="utf-8", newline="\n").write(result)
print("Done!")
