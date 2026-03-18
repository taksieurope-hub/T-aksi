path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '  AlertTriangle, RefreshCw, Eye, ChevronRight, Siren, Wallet, Search, X,\n} from "lucide-react";'
new = '  AlertTriangle, RefreshCw, Eye, ChevronRight, Siren, Wallet, Search, X, Trash2,\n} from "lucide-react";'

if old in c:
    c = c.replace(old, new)
    print("OK: Trash2 imported")
else:
    print("MISS")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
