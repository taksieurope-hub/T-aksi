path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add delete button to rider row
old_rider = '''                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-white"
                                onClick={() => { setDetailUserId(rider.id); setDetailUserType("rider"); }}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> View
                              </Button>
                              <AddBalanceDialog user={rider} userType="rider" onSuccess={fetchAll}>
                                <Button size="sm" variant="outline" className="h-7 px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                                  <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add
                                </Button>
                              </AddBalanceDialog>
                            </div>'''

new_rider = '''                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-white"
                                onClick={() => { setDetailUserId(rider.id); setDetailUserType("rider"); }}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> View
                              </Button>
                              <AddBalanceDialog user={rider} userType="rider" onSuccess={fetchAll}>
                                <Button size="sm" variant="outline" className="h-7 px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                                  <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add
                                </Button>
                              </AddBalanceDialog>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={async () => { if(window.confirm(`Delete rider ${rider.name} ${rider.surname}? This cannot be undone.`)) { try { await api.delete(`/admin/users/${rider.id}`); toast.success("Rider deleted"); fetchAll(); } catch(e) { toast.error("Failed to delete rider"); } } }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>'''

if old_rider in c:
    c = c.replace(old_rider, new_rider)
    print("OK: delete button added to rider row")
else:
    print("MISS: rider row")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
