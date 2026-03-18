path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old = '''              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-xs font-medium transition-all border border-white/8 hover:border-white/15"
                onClick={() => onReceipt(ride.id)}>
                <Receipt className="w-3.5 h-3.5" /> Receipt
              </button>'''

new = '''              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/50 text-xs font-medium transition-all border border-white/8 hover:border-white/15"
                onClick={() => onReceipt(ride.id)}>
                <Receipt className="w-3.5 h-3.5" /> Receipt
              </button>
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#00d4ff]/8 hover:bg-[#00d4ff]/15 text-[#00d4ff]/80 text-xs font-medium transition-all border border-[#00d4ff]/20 hover:border-[#00d4ff]/35"
                onClick={() => generatePDFReceipt(ride)}>
                <Download className="w-3.5 h-3.5" /> PDF
              </button>'''

if old in c:
    c = c.replace(old, new)
    print("OK: PDF button added")
else:
    print("MISS")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("Done!")
