path = "frontend/src/components/DriverPortal.jsx"
lines = open(path, "r", encoding="utf-8").read().splitlines(keepends=True)

# Replace lines 364-367 (0-indexed: 363-366)
new_lines = (
    '          <button key={s} onClick={() => setRating(s)}\n'
    '            className={`w-12 h-12 rounded-xl text-2xl transition-all active:scale-95 ${s <= rating ? "text-yellow-400 scale-110" : "text-white/20"}`}>\n'
    '            <Star className="w-7 h-7 mx-auto" fill={s <= rating ? "currentColor" : "none"} />\n'
)

lines[363] = new_lines
lines[364] = ""
lines[365] = ""
lines[366] = "          </button>\n"

result = "".join(l for l in lines if l != "")
open(path, "w", encoding="utf-8", newline="\n").write(result)
print("OK: star rating fixed")
