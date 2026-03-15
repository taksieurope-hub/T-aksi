c = open("frontend/src/components/DriverPortal.jsx", "r", encoding="utf-8").read()
# Remove from wrong position
c = c.replace("const FeedbackPanel = React.lazy(() => import(\"@/components/Feedbackpanel\"));\n", "")
# Insert after lucide import closes
target = "} from \"lucide-react\";"
idx = c.find(target)
if idx != -1:
    insert_pos = idx + len(target)
    c = c[:insert_pos] + "\n\nconst FeedbackPanel = React.lazy(() => import(\"@/components/Feedbackpanel\"));" + c[insert_pos:]
    print("Inserted after lucide-react import")
else:
    print("Target not found")
open("frontend/src/components/DriverPortal.jsx", "w", encoding="utf-8").write(c)
