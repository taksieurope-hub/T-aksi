path = "frontend/src/components/CorporatePortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '<a href="mailto:taksigeorgia@gmail.com?subject=Corporate Wallet Top Up - " + corp.company_name'
new = '<a href={`mailto:taksigeorgia@gmail.com?subject=Corporate Wallet Top Up - ${corp.company_name}`}'

if old in c:
    c = c.replace(old, new)
    print("OK: href fixed")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
