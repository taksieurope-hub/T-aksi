c = open("frontend/src/components/DriverPortal.jsx", "r", encoding="utf-8").read()
c = c.replace("const FeedbackPanel = React.lazy(() => import(\"@/components/Feedbackpanel\"));\n", "")
c = c.replace("const FeedbackPanel = React.lazy(() => import(\"@/components/Feedbackpanel\"));\r\n", "")
lines = c.split("\n")
last_import = 0
for i, line in enumerate(lines):
    if line.startswith("import "):
        last_import = i
lines.insert(last_import + 1, "")
lines.insert(last_import + 2, "const FeedbackPanel = React.lazy(() => import(\"@/components/Feedbackpanel\"));")
c = "\n".join(lines)
open("frontend/src/components/DriverPortal.jsx", "w", encoding="utf-8").write(c)
print("Done, moved to after line", last_import + 1)
