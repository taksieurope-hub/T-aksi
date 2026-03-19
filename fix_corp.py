path = "frontend/src/components/AdminPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines()

# Fix 1: Remove duplicate Building2 from import
for i, line in enumerate(lines):
    if "Building2, Building2" in line:
        lines[i] = line.replace("Building2, Building2,", "Building2,")
        print(f"Fix 1 applied: duplicate Building2 removed at line {i+1}")
        break

# Fix 2: Remove the SECOND CorporateAdminPanel definition (lines 718 onwards)
# Find both definitions
definitions = [i for i, line in enumerate(lines) if line.strip() == "const CorporateAdminPanel = ({ api }) => {"]
print(f"CorporateAdminPanel defined at lines: {[d+1 for d in definitions]}")

if len(definitions) == 2:
    # Find the end of the second definition by tracking braces
    start = definitions[1]
    depth = 0
    end = start
    for i in range(start, len(lines)):
        depth += lines[i].count("{") - lines[i].count("}")
        if i > start and depth <= 0:
            end = i
            break
    # Remove second definition
    del lines[start:end+1]
    print(f"Fix 2 applied: second CorporateAdminPanel removed (lines {start+1}-{end+1})")
else:
    print(f"Fix 2 skipped: found {len(definitions)} definitions")

open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("Done.")
