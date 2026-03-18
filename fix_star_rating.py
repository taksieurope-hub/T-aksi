path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '      <div className="flex justify-center gap-3">\n        {[1,2,3,4,5].map(s => (\n          <button key={s} onClick={() => setRating(s)}\n            className={`w-12 h-12 rounded-xl text-2xl transition-all ${s <= rating ? "\u2b50\u2b50 \u2b50\u2b50\u2b50" : "\u2b50\u2b50 \u2b50\u2b50\u2b50 "}`}>\n            ?\n          </button>\n        ))}\n      </div>'

new = '      <div className="flex justify-center gap-3">\n        {[1,2,3,4,5].map(s => (\n          <button key={s} onClick={() => setRating(s)}\n            className={`w-12 h-12 rounded-xl text-2xl transition-all active:scale-95 ${s <= rating ? "text-yellow-400 scale-110" : "text-white/20"}`}>\n            <Star className="w-7 h-7 mx-auto" fill={s <= rating ? "currentColor" : "none"} />\n          </button>\n        ))}\n      </div>'

if old in c:
    c = c.replace(old, new)
    print("OK: star rating fixed")
else:
    print("MISS - trying simple replace")
    # Find by line numbers
    lines = c.splitlines()
    for i in range(362, 370):
        print(repr(lines[i]))

open(path, "w", encoding="utf-8", newline="\n").write(c)
