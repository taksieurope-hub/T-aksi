path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '  const [paymentMethod, setPaymentMethod] = useState("cash");'
new = '  const [paymentMethod, setPaymentMethod] = useState("cash");\n  const [savedCards, setSavedCards] = useState([]);\n  const [selectedVaultId, setSelectedVaultId] = useState(null);'

if old in c:
    c = c.replace(old, new)
    print("OK: state added")
else:
    # Check if savedCards already there but selectedVaultId missing
    if 'savedCards' in c:
        print("savedCards exists, adding only selectedVaultId")
        old2 = '  const [savedCards, setSavedCards] = useState([]);'
        new2 = '  const [savedCards, setSavedCards] = useState([]);\n  const [selectedVaultId, setSelectedVaultId] = useState(null);'
        if old2 in c:
            c = c.replace(old2, new2)
            print("OK: selectedVaultId added")
        else:
            print("MISS: cannot find insert point")
    else:
        print("MISS: paymentMethod state not found")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Saved!")
