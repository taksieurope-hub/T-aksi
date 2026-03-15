c = open("frontend/src/components/DriverPortal.jsx", "r", encoding="utf-8").read()
c = c.replace("const FeedbackPanel = React.lazy(() => import(\"@/components/Feedbackpanel\"));\n", "")
c = c.replace("\nimport {\nconst FeedbackPanel", "\nimport {")
# Find end of all imports - look for first non-import, non-blank line after imports
lines = c.split("\n")
in_import = False
last_safe = 0
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith("import "):
        in_import = False
        last_safe = i
    elif stripped.startswith("} from "):
        last_safe = i
        in_import = False
    elif stripped == "":
        pass
    elif in_import:
        pass
    elif stripped.startswith("{") or (i > 0 and lines[i-1].strip().startswith("import {")):
        in_import = True
    elif last_safe > 0 and not stripped.startswith("import"):
        break

lines.insert(last_safe + 1, "const FeedbackPanel = React.lazy(() => import(\"@/components/Feedbackpanel\"));")
c = "\n".join(lines)
open("frontend/src/components/DriverPortal.jsx", "w", encoding="utf-8").write(c)
print("Inserted after line", last_safe + 1)
