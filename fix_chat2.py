path = "frontend/src/components/RideCommunication.jsx"
c = open(path, "r", encoding="utf-8").read()

fixes = 0

# Fix 1: Message list - ensure it actually scrolls on mobile by setting explicit flex and overflow
old1 = '            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">'
new1 = '            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0" style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>'
if old1 in c:
    c = c.replace(old1, new1)
    fixes += 1
    print("Fix 1 applied: scroll touch enabled")
else:
    print("Fix 1 FAILED - message list div not matched")

# Fix 2: Make the chat panel taller on mobile so messages are visible
old2 = '              maxHeight: "92dvh",'
new2 = '              height: "85dvh",'
if old2 in c:
    c = c.replace(old2, new2)
    fixes += 1
    print("Fix 2 applied: panel height set to 85dvh")
else:
    print("Fix 2 FAILED")

# Fix 3: Close button - make it more tappable and visible on mobile
old3 = '                <button\n                  onClick={handleClose}\n                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"\n                >'
new3 = '                <button\n                  onClick={handleClose}\n                  className="w-11 h-11 rounded-full flex items-center justify-center bg-white/10 active:bg-red-500/30 text-white transition-colors"\n                  style={{ minWidth: 44, minHeight: 44 }}\n                >'
if old3 in c:
    c = c.replace(old3, new3)
    fixes += 1
    print("Fix 3 applied: close button enlarged")
else:
    print("Fix 3 FAILED - trying fallback...")
    # fallback: find and patch by content
    old3b = 'className="w-9 h-9 rounded-full flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"'
    new3b = 'className="w-11 h-11 rounded-full flex items-center justify-center bg-white/10 active:bg-red-500/30 text-white transition-colors" style={{ minWidth: 44, minHeight: 44 }}'
    if old3b in c:
        c = c.replace(old3b, new3b)
        fixes += 1
        print("Fix 3 fallback applied")
    else:
        print("Fix 3 fallback also FAILED")

open(path, "w", encoding="utf-8").write(c)
print(f"\nDone. {fixes}/3 fixes applied.")
