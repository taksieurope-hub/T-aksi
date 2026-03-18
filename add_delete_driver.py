path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

old_driver = '''                                  <AddBalanceDialog user={driver} userType="driver" onSuccess={fetchAll}>
                                    <Button size="sm" variant="outline" className="h-7 px-2 border-sky-500/30 text-sky-400 hover:bg-sky-500/10">
                                      <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add
                                    </Button>
                                  </AddBalanceDialog>
                                </div>
                              </TableCell>
                            </TableRow>'''

new_driver = '''                                  <AddBalanceDialog user={driver} userType="driver" onSuccess={fetchAll}>
                                    <Button size="sm" variant="outline" className="h-7 px-2 border-sky-500/30 text-sky-400 hover:bg-sky-500/10">
                                      <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add
                                    </Button>
                                  </AddBalanceDialog>
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                    onClick={async () => { if(window.confirm(`Delete driver ${driver.name} ${driver.surname}? This cannot be undone.`)) { try { await api.delete(`/admin/users/${driver.id}`); toast.success("Driver deleted"); fetchAll(); } catch(e) { toast.error("Failed to delete driver"); } } }}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>'''

if old_driver in c:
    c = c.replace(old_driver, new_driver)
    print("OK: delete button added to driver row")
else:
    print("MISS: driver row")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
