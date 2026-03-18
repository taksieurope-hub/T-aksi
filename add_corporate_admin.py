path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()
changes = []

old_icons = "  Shield, Users, Car, Home, LogOut, Lock, ArrowLeft, Loader2,\n  CheckCircle2, XCircle, TrendingUp, UserCheck, Banknote, BarChart3,\n  PlusCircle, CreditCard, MessageSquare, ArrowRightLeft, FileWarning,\n  AlertTriangle, RefreshCw, Eye, ChevronRight, Siren, Wallet, Search, X, Trash2, MapPin,"
new_icons = "  Shield, Users, Car, Home, LogOut, Lock, ArrowLeft, Loader2,\n  CheckCircle2, XCircle, TrendingUp, UserCheck, Banknote, BarChart3,\n  PlusCircle, CreditCard, MessageSquare, ArrowRightLeft, FileWarning,\n  AlertTriangle, RefreshCw, Eye, ChevronRight, Siren, Wallet, Search, X, Trash2, MapPin, Building2,"
if old_icons in c:
    c = c.replace(old_icons, new_icons)
    changes.append("OK: Building2 imported")
else:
    changes.append("MISS: icons import")

old_tab = '                { value: "livemap",     icon: MapPin,         label: "Live Map" },'
new_tab = '                { value: "livemap",     icon: MapPin,         label: "Live Map" },\n                { value: "corporate",   icon: Building2,      label: "Corporate" },'
if old_tab in c:
    c = c.replace(old_tab, new_tab)
    changes.append("OK: corporate tab added")
else:
    changes.append("MISS: tab list")

old_tabs_end = "        </Tabs>\n      </main>"
new_tabs_end = "          {/* -- CORPORATE -- */}\n          <TabsContent value=\"corporate\">\n            <CorporateAdminPanel api={api} />\n          </TabsContent>\n        </Tabs>\n      </main>"
if old_tabs_end in c:
    c = c.replace(old_tabs_end, new_tabs_end)
    changes.append("OK: corporate TabsContent added")
else:
    changes.append("MISS: tabs end")

corp_component = """
const CorporateAdminPanel = ({ api }) => {
  const [accounts, setAccounts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [topupAmounts, setTopupAmounts] = React.useState({});
  const [actionLoading, setActionLoading] = React.useState({});

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/corporate");
      setAccounts(r.data.accounts || []);
    } catch (e) {
      toast.error("Failed to load corporate accounts");
    } finally { setLoading(false); }
  };

  React.useEffect(() => { load(); }, []);

  const approve = async (id) => {
    setActionLoading(p => ({ ...p, [id + "_approve"]: true }));
    try {
      await api.post("/admin/corporate/" + id + "/approve");
      toast.success("Account approved");
      load();
    } catch { toast.error("Failed to approve"); }
    finally { setActionLoading(p => ({ ...p, [id + "_approve"]: false })); }
  };

  const reject = async (id) => {
    setActionLoading(p => ({ ...p, [id + "_reject"]: true }));
    try {
      await api.post("/admin/corporate/" + id + "/reject");
      toast.success("Account rejected");
      load();
    } catch { toast.error("Failed to reject"); }
    finally { setActionLoading(p => ({ ...p, [id + "_reject"]: false })); }
  };

  const topup = async (id) => {
    const amount = parseFloat(topupAmounts[id] || 0);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    setActionLoading(p => ({ ...p, [id + "_topup"]: true }));
    try {
      await api.post("/admin/corporate/" + id + "/topup", { amount });
      toast.success("Added GEL " + amount.toFixed(2));
      setTopupAmounts(p => ({ ...p, [id]: "" }));
      load();
    } catch { toast.error("Failed to top up"); }
    finally { setActionLoading(p => ({ ...p, [id + "_topup"]: false })); }
  };

  const statusColor = (s) => ({
    approved:       "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    pending_review: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    rejected:       "bg-red-500/20 text-red-400 border-red-500/30",
  }[s] || "bg-gray-500/20 text-gray-400 border-gray-500/30");

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5 text-purple-400" /> Corporate Accounts ({accounts.length})
        </h2>
        <Button onClick={load} variant="ghost" size="sm" className="text-gray-400 hover:text-white gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>
      {accounts.length === 0 ? (
        <Card className="bg-white/3 border-white/8 p-10 text-center text-gray-500">No corporate accounts yet</Card>
      ) : accounts.map(corp => (
        <Card key={corp.id} className="bg-white/3 border-white/8 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-white font-bold text-base">{corp.company_name}</span>
                <span className={"text-xs px-2 py-0.5 rounded-full border font-semibold " + statusColor(corp.status)}>
                  {corp.status?.replace("_", " ")}
                </span>
              </div>
              <p className="text-gray-400 text-sm">{corp.contact_name} · {corp.contact_email} · {corp.contact_phone}</p>
              {corp.tax_id && <p className="text-gray-500 text-xs mt-0.5">Tax ID: {corp.tax_id}</p>}
              <div className="flex gap-4 mt-2">
                <span className="text-emerald-400 font-bold text-sm">GEL {(corp.wallet_balance || 0).toFixed(2)} wallet</span>
                <span className="text-gray-500 text-xs mt-0.5">{(corp.employees || []).length} employees</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 min-w-[200px]">
              {corp.status === "pending_review" && (
                <div className="flex gap-2">
                  <Button onClick={() => approve(corp.id)} disabled={actionLoading[corp.id + "_approve"]}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8">
                    {actionLoading[corp.id + "_approve"] ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve
                  </Button>
                  <Button onClick={() => reject(corp.id)} disabled={actionLoading[corp.id + "_reject"]}
                    className="flex-1 bg-red-700 hover:bg-red-800 text-white text-xs h-8">
                    {actionLoading[corp.id + "_reject"] ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} Reject
                  </Button>
                </div>
              )}
              {corp.status === "approved" && (
                <Button onClick={() => reject(corp.id)} disabled={actionLoading[corp.id + "_reject"]}
                  variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-8">
                  Suspend
                </Button>
              )}
              <div className="flex gap-2 mt-1">
                <Input type="number" placeholder="GEL amount"
                  value={topupAmounts[corp.id] || ""}
                  onChange={e => setTopupAmounts(p => ({ ...p, [corp.id]: e.target.value }))}
                  className="flex-1 h-8 text-xs bg-white/5 border-white/10 text-white" />
                <Button onClick={() => topup(corp.id)} disabled={actionLoading[corp.id + "_topup"]}
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8 px-3">
                  {actionLoading[corp.id + "_topup"] ? <Loader2 className="w-3 h-3 animate-spin" /> : "Top Up"}
                </Button>
              </div>
            </div>
          </div>
          {(corp.employees || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/6">
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Employees</p>
              <div className="flex flex-wrap gap-2">
                {corp.employees.map(emp => (
                  <span key={emp.rider_id} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-gray-300">
                    {emp.name} · {emp.phone}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};

"""

old_dashboard = "\nconst AdminDashboard = () => {"
if old_dashboard in c:
    c = c.replace(old_dashboard, corp_component + "\nconst AdminDashboard = () => {", 1)
    changes.append("OK: CorporateAdminPanel component added")
else:
    changes.append("MISS: AdminDashboard insertion point")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
