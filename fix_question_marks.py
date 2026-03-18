path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Fix wallet ? separator
c = c.replace('<span className="text-white/25">?</span>', '<span className="text-white/25">·</span>')

# Fix request ride button ? GEL
c = c.replace('{t("request_ride")} {carType} ? GEL {fareEstimate?.total.toFixed(2)}',
              '{t("request_ride")} {carType} · GEL {fareEstimate?.total.toFixed(2)}')

open(path, "w", encoding="utf-8").write(c)
print("Done")
