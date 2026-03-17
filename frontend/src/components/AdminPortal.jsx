import { useState, useEffect, useCallback, useMemo } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/config";
import api from "@/api";
import { useLanguage } from "@/i18n/LanguageContext";
import AdminSupportPanel from "@/components/AdminSupportPanel";
import AdminFeedbackPanel from "@/components/AdminFeedbackPanel";
import AdminCampaignsPanel from "@/components/AdminCampaignsPanel";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import DisputeManager from "./DisputeManager";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogTrigger
} from "@/components/ui/dialog";
import React from "react";
import {
  Shield, Users, Car, Home, LogOut, Lock, ArrowLeft, Loader2,
  CheckCircle2, XCircle, TrendingUp, UserCheck, Banknote, BarChart3,
  PlusCircle, CreditCard, MessageSquare, ArrowRightLeft, FileWarning,
  AlertTriangle, RefreshCw, Eye, ChevronRight, Siren, Wallet, Search, X, Trash2,
} from "lucide-react";

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------
const fmt = (n) => `GEL ${Number(n || 0).toFixed(2)}`;
const timeAgo = (iso) => {
  if (!iso) return "?";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const StatusBadge = ({ status }) => {
  const map = {
    approved:        "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    pending_review:  "bg-amber-500/20  text-amber-400  border-amber-500/30",
    pending_vehicle: "bg-sky-500/20    text-sky-400    border-sky-500/30",
    rejected:        "bg-red-500/20    text-red-400    border-red-500/30",
    active:          "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    pending:         "bg-amber-500/20  text-amber-400  border-amber-500/30",
  };
  const cls = map[status] || "bg-gray-500/20 text-gray-400 border-gray-500/30";
  return (
    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${cls} uppercase tracking-wide`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, color }) => (
  <Card className={`bg-black/60 border ${color} p-5 flex flex-col gap-2`}>
    <Icon className={`w-6 h-6 ${color.replace("border-", "text-").replace("/30", "")}`} />
    <p className="text-3xl font-bold text-white">{value ?? 0}</p>
    <p className="text-xs text-gray-500 uppercase tracking-widest">{label}</p>
  </Card>
);

// -----------------------------------------------------------------------------
// ADD BALANCE DIALOG ? single user
// -----------------------------------------------------------------------------
const AddBalanceDialog = ({ user, userType, onSuccess, children }) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const accent = userType === "driver" ? "text-sky-400 border-sky-500/30" : "text-emerald-400 border-emerald-500/30";
  const btnBg  = userType === "driver" ? "bg-sky-500 hover:bg-sky-600"    : "bg-emerald-500 hover:bg-emerald-600";

  const handle = async () => {
    if (!amount || isNaN(amount) || Number(amount) <= 0)
      return toast.error("Enter a valid amount");
    setLoading(true);
    try {
      await api.post(`/admin/add-balance/${user.id}`, {
        amount: parseFloat(amount),
        reason: reason || "Admin adjustment",
      });
      toast.success(`${fmt(amount)} added to ${user.name}`);
      setAmount(""); setReason(""); setOpen(false);
      onSuccess?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    } finally { setLoading(false); }
  };

  const balance = userType === "driver" ? user?.earnings?.balance : user?.wallet_balance;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className={`bg-[#0a0a12] border ${accent.split(" ")[1]}`}>
        <DialogHeader>
          <DialogTitle className={accent.split(" ")[0]}>Add Balance</DialogTitle>
          <DialogDescription className="text-gray-500">
            {user?.name} {user?.surname} ? {user?.cellphone}
          </DialogDescription>
        </DialogHeader>
        <div className={`rounded-lg p-3 bg-black/40 border ${accent.split(" ")[1]} mb-2`}>
          <p className="text-xs text-gray-500 uppercase">Current Balance</p>
          <p className="text-2xl font-bold text-white">{fmt(balance)}</p>
        </div>
        <div className="space-y-3">
          <div>
            <Label className={accent.split(" ")[0]}>Amount (?)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="bg-black/50 border-white/10 text-white mt-1" placeholder="0.00" />
          </div>
          <div>
            <Label className={accent.split(" ")[0]}>Reason</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)}
              className="bg-black/50 border-white/10 text-white mt-1" placeholder="e.g. Refund for cancelled ride" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="text-gray-500">Cancel</Button>
          <Button onClick={handle} disabled={loading} className={`${btnBg} text-white font-semibold`}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlusCircle className="w-4 h-4 mr-2" />}
            Add Funds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// -----------------------------------------------------------------------------
// BULK ADD BALANCE DIALOG ? multiple drivers
// -----------------------------------------------------------------------------
const BulkAddBalanceDialog = ({ drivers, onSuccess, children }) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const totalAmount = drivers.length * parseFloat(amount || 0);

  const handle = async () => {
    if (!amount || isNaN(amount) || Number(amount) <= 0) return toast.error("Enter a valid amount");
    if (drivers.length === 0) return toast.error("No drivers selected");
    setLoading(true);
    setResults(null);
    const settled = await Promise.allSettled(
      drivers.map(d => api.post(`/admin/add-balance/${d.id}`, {
        amount: parseFloat(amount),
        reason: reason || "Bulk admin adjustment",
      }))
    );
    const succeeded = settled.filter(r => r.status === "fulfilled").length;
    const failed    = settled.filter(r => r.status === "rejected").length;
    setResults({ succeeded, failed });
    setLoading(false);
    if (succeeded > 0) { toast.success(`${fmt(amount)} added to ${succeeded} driver${succeeded > 1 ? "s" : ""}`); onSuccess?.(); }
    if (failed > 0) toast.error(`Failed for ${failed} driver${failed > 1 ? "s" : ""}`);
  };

  const handleClose = () => { setOpen(false); setAmount(""); setReason(""); setResults(null); };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="bg-[#0a0a12] border border-sky-500/30 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sky-400 flex items-center gap-2">
            <Wallet className="w-5 h-5" /> Bulk Add Balance
          </DialogTitle>
          <DialogDescription className="text-gray-500">
            Adding to <span className="text-sky-400 font-semibold">{drivers.length} driver{drivers.length !== 1 ? "s" : ""}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-black/40 border border-white/10 max-h-40 overflow-y-auto">
          {drivers.map(d => (
            <div key={d.id} className="flex items-center justify-between px-3 py-2 border-b border-white/5 last:border-0">
              <div>
                <p className="text-white text-sm font-medium">{d.name} {d.surname}</p>
                <p className="text-gray-600 text-xs">{d.cellphone}</p>
              </div>
              <p className="text-sky-400 text-sm font-semibold">{fmt(d.earnings?.balance)}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-sky-400">Amount per driver (?)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="bg-black/50 border-white/10 text-white mt-1" placeholder="0.00" />
          </div>
          <div>
            <Label className="text-sky-400">Reason</Label>
            <Input value={reason} onChange={e => setReason(e.target.value)}
              className="bg-black/50 border-white/10 text-white mt-1" placeholder="e.g. Weekly bonus" />
          </div>
          {amount && !isNaN(amount) && Number(amount) > 0 && (
            <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 p-3 flex justify-between items-center">
              <p className="text-sky-300 text-sm">Total payout</p>
              <p className="text-sky-400 text-xl font-bold">{fmt(totalAmount)}</p>
            </div>
          )}
          {results && (
            <div className="rounded-lg bg-black/40 border border-white/10 p-3 space-y-1">
              {results.succeeded > 0 && (
                <p className="text-emerald-400 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {results.succeeded} succeeded
                </p>
              )}
              {results.failed > 0 && (
                <p className="text-red-400 text-sm flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> {results.failed} failed
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} className="text-gray-500">{results ? "Close" : "Cancel"}</Button>
          {!results && (
            <Button onClick={handle} disabled={loading || !amount || Number(amount) <= 0}
              className="bg-sky-500 hover:bg-sky-600 text-white font-semibold">
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing?</>
                : <><PlusCircle className="w-4 h-4 mr-2" /> Add to {drivers.length} Driver{drivers.length !== 1 ? "s" : ""}</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// -----------------------------------------------------------------------------
// USER DETAIL DRAWER
// -----------------------------------------------------------------------------
const UserDetailPanel = ({ userId, userType, onClose, onRefresh }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const endpoint = userType === "driver" ? `/admin/drivers/${userId}` : `/admin/riders/${userId}`;
    api.get(endpoint)
      .then(r => setData(userType === "driver" ? r.data.driver : r.data.rider))
      .catch(() => toast.error("Failed to load details"))
      .finally(() => setLoading(false));
  }, [userId, userType]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[420px] bg-[#0a0a12] border-l border-white/10 flex flex-col overflow-hidden">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-white font-semibold">User Details</h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-gray-500">
            <XCircle className="w-5 h-5" />
          </Button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : data ? (
          <ScrollArea className="flex-1 p-5">
            <div className="space-y-5">
              <div className="rounded-xl bg-white/5 p-4 space-y-1">
                <p className="text-xl font-bold text-white">{data.name} {data.surname}</p>
                <p className="text-gray-400 text-sm">{data.cellphone}</p>
                {data.email && <p className="text-gray-500 text-xs">{data.email}</p>}
                <div className="flex gap-2 mt-2">
                  <StatusBadge status={data.registration_status || "active"} />
                  {data.is_online !== undefined && (
                    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${data.is_online ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-gray-500/20 text-gray-500 border-gray-600/30"}`}>
                      {data.is_online ? "ONLINE" : "OFFLINE"}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-white/5 p-4">
                <p className="text-xs uppercase text-gray-500 tracking-widest mb-3">Financials</p>
                {userType === "driver" ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ["Balance", data.earnings?.balance],
                      ["Total Earned", data.earnings?.total_earned],
                      ["Commission Paid", data.earnings?.total_commission_paid],
                      ["Tips", data.earnings?.total_tips],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[11px] text-gray-600">{k}</p>
                        <p className="text-white font-semibold">{fmt(v)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-gray-600">Wallet Balance</p>
                    <p className="text-2xl font-bold text-emerald-400">{fmt(data.wallet_balance)}</p>
                  </div>
                )}
              </div>

              {userType === "driver" && data.driver_info?.vehicles?.length > 0 && (
                <div className="rounded-xl bg-white/5 p-4">
                  <p className="text-xs uppercase text-gray-500 tracking-widest mb-3">Vehicles & Documents</p>
                  {data.driver_info.vehicles.map((v, i) => (
                    <div key={i} className="border border-white/10 rounded-lg p-3 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-white font-semibold">{v.car_year} {v.car_make} {v.car_model}</p>
                          <p className="text-gray-400 text-sm">{v.car_color} Â· {v.license_plate}</p>
                        </div>
                        <div className="flex gap-2">
                          <StatusBadge status={v.status || "pending"} />
                          <span className="px-2 py-0.5 text-[11px] rounded border bg-purple-500/20 text-purple-400 border-purple-500/30 uppercase">{v.tier}</span>
                        </div>
                      </div>
                      {v.documents && Object.keys(v.documents).some(k => v.documents[k]) && (
                        <div>
                          <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 mt-3">Car Photos</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {[["car_photo_front","Front"],["car_photo_back","Back"],["car_photo_left","Left"],["car_photo_right","Right"]].map(([key, label]) => (
                              v.documents[key] ? (
                                <a key={key} href={v.documents[key]} target="_blank" rel="noreferrer" className="block">
                                  <img src={v.documents[key]} alt={label} style={{width:"100%",height:90,objectFit:"cover",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)"}} />
                                  <p className="text-gray-500 text-[10px] text-center mt-1">{label}</p>
                                </a>
                              ) : (
                                <div key={key} style={{width:"100%",height:90,borderRadius:8,border:"1px dashed rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  <p className="text-gray-600 text-[10px]">{label} missing</p>
                                </div>
                              )
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">License & Registration</p>
                          <div className="grid grid-cols-2 gap-2">
                            {[["license_front","License Front"],["license_back","License Back"],["reg_front","Tech Cert Front"],["reg_back","Tech Cert Back"]].map(([key, label]) => (
                              v.documents[key] ? (
                                <a key={key} href={v.documents[key]} target="_blank" rel="noreferrer" className="block">
                                  <img src={v.documents[key]} alt={label} style={{width:"100%",height:90,objectFit:"cover",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)"}} />
                                  <p className="text-gray-500 text-[10px] text-center mt-1">{label}</p>
                                </a>
                              ) : (
                                <div key={key} style={{width:"100%",height:90,borderRadius:8,border:"1px dashed rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                                  <p className="text-gray-600 text-[10px]">{label} missing</p>
                                </div>
                              )
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl bg-white/5 p-4">
                <p className="text-xs uppercase text-gray-500 tracking-widest mb-3">Stats</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-gray-600">Total Rides</p>
                    <p className="text-white font-semibold">{data.total_rides || 0}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-600">Rating</p>
                    <p className="text-white font-semibold">? {data.rating || 5.0}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <AddBalanceDialog user={data} userType={userType} onSuccess={onRefresh}>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                    <PlusCircle className="w-4 h-4 mr-2" /> Add Balance
                  </Button>
                </AddBalanceDialog>
                {userType === "driver" && data.registration_status?.includes("pending") && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => { api.post(`/admin/drivers/${data.id}/approve`).then(() => { toast.success("Approved"); onRefresh?.(); onClose(); }).catch(() => toast.error("Failed")); }}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                    </Button>
                    <Button variant="destructive"
                      onClick={() => { api.post(`/admin/drivers/${data.id}/reject`).then(() => { toast.success("Rejected"); onRefresh?.(); onClose(); }).catch(() => toast.error("Failed")); }}>
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : <p className="p-5 text-gray-500">No data</p>}
      </div>
    </div>
  );
};

// -----------------------------------------------------------------------------
// SOS PANEL
// -----------------------------------------------------------------------------
const SOSPanel = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);

  const fetchAlerts = useCallback(() => {
    setLoading(true);
    api.get("/admin/sos/active")
      .then(r => setAlerts(r.data.alerts || []))
      .catch(() => toast.error("Failed to load SOS alerts"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAlerts(); const i = setInterval(fetchAlerts, 30000); return () => clearInterval(i); }, [fetchAlerts]);

  const resolve = async (id) => {
    setResolving(id);
    try {
      await api.post(`/admin/sos/${id}/resolve`, null, { params: { notes: "Resolved by admin" } });
      toast.success("SOS resolved");
      fetchAlerts();
    } catch { toast.error("Failed to resolve"); }
    finally { setResolving(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-red-500" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <h2 className="text-red-400 font-bold text-lg">Active SOS Alerts</h2>
          {alerts.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold">
              {alerts.length} ACTIVE
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={fetchAlerts} className="text-gray-500 hover:text-white">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh
        </Button>
      </div>
      {alerts.length === 0 ? (
        <Card className="bg-black/40 border border-white/10 py-16 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="text-gray-400">No active SOS alerts</p>
          <p className="text-gray-600 text-sm mt-1">Auto-refreshes every 30 seconds</p>
        </Card>
      ) : (
        alerts.map(alert => (
          <Card key={alert.id} className="bg-red-950/30 border border-red-500/40">
            <CardContent className="p-5">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <Siren className="w-5 h-5 text-red-400" />
                    <span className="text-white font-bold text-lg">{alert.user_name || "Unknown User"}</span>
                    <span className="text-gray-500 text-sm">{alert.user_phone}</span>
                  </div>
                  <p className="text-red-300 font-medium">{alert.message}</p>
                  {alert.lat && alert.lng && (
                    <a href={`https://www.google.com/maps?q=${alert.lat},${alert.lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-sm underline">
                      ?? {Number(alert.lat).toFixed(5)}, {Number(alert.lng).toFixed(5)} ? Open in Maps
                    </a>
                  )}
                  {alert.ride_id && <p className="text-gray-500 text-xs font-mono">Ride: {alert.ride_id}</p>}
                  <p className="text-gray-600 text-xs">{timeAgo(alert.created_at)}</p>
                </div>
                <Button onClick={() => resolve(alert.id)} disabled={resolving === alert.id}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
                  {resolving === alert.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><CheckCircle2 className="w-4 h-4 mr-1" /> Resolve</>}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// ADMIN LOGIN
// -----------------------------------------------------------------------------
const AdminLogin = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/admin/login", { password });
      login(res.data.token, res.data.user);
      toast.success("Welcome to Command Center");
      navigate("/admin/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid credentials");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050508] p-4">
      <div className="fixed inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(#a855f7 1px, transparent 1px), linear-gradient(90deg, #a855f7 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      <Card className="w-full max-w-sm bg-[#0a0a12]/90 backdrop-blur-xl border border-purple-500/20 relative z-10">
        <CardHeader className="text-center pb-4">
          <Button variant="ghost" className="absolute left-4 top-4 text-gray-500 hover:text-white" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-sky-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-xl text-white">Command Center</CardTitle>
          <CardDescription className="text-gray-500 text-sm">T'aksi Admin Portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-sm">Master Key</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="pl-9 bg-black/50 border-white/10 text-white focus:border-purple-500/50"
                  placeholder="Enter master key" required />
              </div>
            </div>
            <Button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-sky-600 text-white font-semibold" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
              Unlock Access
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

// -----------------------------------------------------------------------------
// ADMIN DASHBOARD
// -----------------------------------------------------------------------------
const AdminDashboard = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState(null);
  const [riders, setRiders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [pendingTopups, setPendingTopups] = useState([]);
  const [sosCount, setSosCount] = useState(0);

  const [detailUserId, setDetailUserId] = useState(null);
  const [detailUserType, setDetailUserType] = useState(null);

  const [dispute, setDispute] = useState({ driverId: "", riderId: "", amount: "", reason: "" });
  const [isRefunding, setIsRefunding] = useState(false);

  // -- Driver search + bulk selection --
  const [driverSearch, setDriverSearch] = useState("");
  const [selectedDriverIds, setSelectedDriverIds] = useState(new Set());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, ridersR, driversR, pendingR, wdR, topupsR, sosR] = await Promise.allSettled([
        api.get("/admin/dashboard"),
        api.get("/admin/riders"),
        api.get("/admin/drivers"),
        api.get("/admin/drivers/pending"),
        api.get("/admin/withdrawals/pending"),
        api.get("/admin/topups/pending"),
        api.get("/admin/sos/active"),
      ]);
      if (dash.status === "fulfilled")     setStats(dash.value.data);
      if (ridersR.status === "fulfilled")  setRiders(ridersR.value.data.riders || []);
      if (driversR.status === "fulfilled") setDrivers(driversR.value.data.drivers || []);
      if (pendingR.status === "fulfilled") setPendingDrivers(pendingR.value.data.pending_drivers || []);
      if (wdR.status === "fulfilled")      setPendingWithdrawals(wdR.value.data.pending_withdrawals || []);
      if (topupsR.status === "fulfilled")  setPendingTopups(topupsR.value.data.pending_topups || []);
      if (sosR.status === "fulfilled")     setSosCount(sosR.value.data.count || 0);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // -- Filtered drivers (search by name, phone, or ID) --
  const filteredDrivers = useMemo(() => {
    const q = driverSearch.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(d =>
      `${d.name} ${d.surname}`.toLowerCase().includes(q) ||
      d.cellphone?.includes(q) ||
      d.id?.toLowerCase().includes(q)
    );
  }, [drivers, driverSearch]);

  const selectedDrivers = useMemo(
    () => drivers.filter(d => selectedDriverIds.has(d.id)),
    [drivers, selectedDriverIds]
  );

  const allFilteredSelected =
    filteredDrivers.length > 0 && filteredDrivers.every(d => selectedDriverIds.has(d.id));

  const toggleDriver = (id) =>
    setSelectedDriverIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAllFiltered = () =>
    setSelectedDriverIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredDrivers.forEach(d => next.delete(d.id));
      else filteredDrivers.forEach(d => next.add(d.id));
      return next;
    });

  const clearSelection = () => setSelectedDriverIds(new Set());

  const quickAction = async (url, successMsg) => {
    try { await api.post(url); toast.success(successMsg); fetchAll(); }
    catch (e) { toast.error(e.response?.data?.detail || "Action failed"); }
  };

  const handleDisputeRefund = async (e) => {
    e.preventDefault();
    if (!dispute.driverId || !dispute.riderId || !dispute.amount || !dispute.reason)
      return toast.error("Fill in all fields");
    setIsRefunding(true);
    try {
      await api.post("/admin/dispute/refund", {
        driver_id: dispute.driverId.trim(),
        rider_id: dispute.riderId.trim(),
        amount: parseFloat(dispute.amount),
        reason: dispute.reason,
      });
      toast.success(`${fmt(dispute.amount)} transferred from Driver ? Rider`);
      setDispute({ driverId: "", riderId: "", amount: "", reason: "" });
      fetchAll();
    } catch (e) { toast.error(e.response?.data?.detail || "Transfer failed"); }
    finally { setIsRefunding(false); }
  };

  const alertCount = pendingDrivers.length + pendingTopups.length;

  if (loading) return (
    <div className="min-h-screen bg-[#050508] flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto" />
        <p className="text-gray-500 text-sm">Loading Command Center?</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050508]">
      <div className="fixed inset-0 opacity-[0.025] pointer-events-none"
        style={{ backgroundImage: "linear-gradient(#a855f7 1px,transparent 1px),linear-gradient(90deg,#a855f7 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#050508]/90 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-sky-500 flex items-center justify-center shadow-md shadow-purple-500/20">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-white font-semibold text-sm">T'aksi</span>
              <span className="text-gray-600 text-sm"> / Command Center</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {sosCount > 0 && (
              <button onClick={() => setActiveTab("sos")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-bold animate-pulse mr-2">
                <Siren className="w-3.5 h-3.5" /> {sosCount} SOS
              </button>
            )}
            <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white" onClick={() => navigate("/")}>
              <Home className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-gray-500 hover:text-white" onClick={fetchAll}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-gray-500 hover:text-red-400" onClick={logout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {detailUserId && (
        <UserDetailPanel
          userId={detailUserId}
          userType={detailUserType}
          onClose={() => { setDetailUserId(null); setDetailUserType(null); }}
          onRefresh={fetchAll}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 relative z-10">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto mb-6">
            <TabsList className="bg-[#0a0a12] border border-white/8 p-1 gap-0.5 inline-flex w-auto min-w-full">
              {[
                { value: "overview",    icon: BarChart3,      label: "Overview" },
                { value: "riders",      icon: Users,          label: "Riders",      count: riders.length },
                { value: "drivers",     icon: Car,            label: "Drivers",     count: drivers.length },
                { value: "approvals",   icon: UserCheck,      label: "Approvals",   badge: alertCount },
                { value: "withdrawals", icon: Banknote,       label: "Withdrawals", badge: pendingWithdrawals.length },
                { value: "feedback",    icon: MessageSquare,  label: "Feedback" },
                { value: "campaigns",   icon: PlusCircle,     label: "Campaigns" },
                { value: "support",     icon: MessageSquare,  label: "Support" },
                { value: "disputes",    icon: ArrowRightLeft, label: "Disputes" },
                { value: "sos",         icon: Siren,          label: "SOS",         badge: sosCount, badgeColor: "bg-red-500" },
                { value: "financials",  icon: BarChart3,      label: "Financials" },
              ].map(({ value, icon: Icon, label, count, badge, badgeColor }) => (
                <TabsTrigger key={value} value={value}
                  className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-gray-500 hover:text-gray-300 relative px-3 py-2 text-xs font-medium rounded-md transition-all gap-1.5">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                  {count !== undefined && <span className="text-[10px] opacity-50">({count})</span>}
                  {badge > 0 && (
                    <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full ${badgeColor || "bg-amber-500"} text-black text-[9px] font-bold flex items-center justify-center`}>
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* -- OVERVIEW -- */}
          <TabsContent value="overview">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <StatCard icon={Users}      label="Riders"          value={stats?.total_riders}             color="border-emerald-500/30" />
              <StatCard icon={Car}        label="Drivers"         value={stats?.total_drivers}            color="border-sky-500/30" />
              <StatCard icon={TrendingUp} label="Active Rides"    value={stats?.active_rides}             color="border-amber-500/30" />
              <StatCard icon={UserCheck}  label="Pending Drivers" value={stats?.pending_driver_approvals} color="border-orange-500/30" />
              <StatCard icon={CreditCard} label="Pending Top-ups" value={stats?.pending_topups}           color="border-purple-500/30" />
              <StatCard icon={Banknote}   label="Withdrawals"     value={stats?.pending_withdrawals}      color="border-pink-500/30" />
            </div>
            {sosCount > 0 && (
              <Card className="bg-red-950/40 border border-red-500/40 p-4 flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Siren className="w-6 h-6 text-red-400 animate-pulse" />
                  <div>
                    <p className="text-red-300 font-semibold">{sosCount} Active SOS Alert{sosCount > 1 ? "s" : ""}</p>
                    <p className="text-red-500/70 text-xs">Requires immediate attention</p>
                  </div>
                </div>
                <Button onClick={() => setActiveTab("sos")} className="bg-red-600 hover:bg-red-700 text-white text-sm">
                  View Now <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Card>
            )}
            <div className="grid grid-cols-2 gap-3">
              {alertCount > 0 && (
                <Card className="bg-amber-950/30 border border-amber-500/30 p-4 cursor-pointer hover:border-amber-500/60 transition-colors" onClick={() => setActiveTab("approvals")}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-amber-400 font-semibold">{alertCount} Pending Approvals</p>
                      <p className="text-amber-700 text-xs mt-0.5">{pendingDrivers.length} drivers ? {pendingTopups.length} top-ups</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-amber-600" />
                  </div>
                </Card>
              )}
              {pendingWithdrawals.length > 0 && (
                <Card className="bg-pink-950/30 border border-pink-500/30 p-4 cursor-pointer hover:border-pink-500/60 transition-colors" onClick={() => setActiveTab("withdrawals")}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-pink-400 font-semibold">{pendingWithdrawals.length} Pending Withdrawals</p>
                      <p className="text-pink-700 text-xs mt-0.5">Awaiting payout</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-pink-600" />
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* -- RIDERS -- */}
          <TabsContent value="riders">
            <Card className="bg-[#0a0a12] border border-white/8">
              <CardHeader className="pb-3">
                <CardTitle className="text-emerald-400 text-base">All Riders <span className="text-gray-600 font-normal">({riders.length})</span></CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[560px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/5 hover:bg-transparent">
                        {["Name", "Phone", "Wallet", "Rides", "Rating", "Actions"].map(h => (
                          <TableHead key={h} className="text-gray-500 text-xs uppercase tracking-wider">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {riders.map(rider => (
                        <TableRow key={rider.id} className="border-white/5 hover:bg-white/3 group">
                          <TableCell>
                            <div>
                              <p className="text-white text-sm font-medium">{rider.name} {rider.surname}</p>
                              <p className="text-gray-600 text-[10px] font-mono">{rider.id}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-400 text-sm">{rider.cellphone}</TableCell>
                          <TableCell className="text-emerald-400 font-semibold text-sm">{fmt(rider.wallet_balance)}</TableCell>
                          <TableCell className="text-gray-400 text-sm">{rider.total_rides || 0}</TableCell>
                          <TableCell className="text-gray-400 text-sm">? {rider.rating || 5.0}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
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
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* -- DRIVERS -- */}
          <TabsContent value="drivers"><CompetitionPayoutPanel />
            <Card className="bg-[#0a0a12] border border-white/8">
              <CardHeader className="pb-3 space-y-3">

                {/* Title row + bulk toolbar */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sky-400 text-base">
                    All Drivers{" "}
                    <span className="text-gray-600 font-normal">
                      ({filteredDrivers.length}{driverSearch ? ` of ${drivers.length}` : ""})
                    </span>
                  </CardTitle>

                  {selectedDriverIds.size > 0 && (
                    <div className="flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-1.5">
                      <span className="text-sky-400 text-sm font-semibold">
                        {selectedDriverIds.size} selected
                      </span>
                      <BulkAddBalanceDialog
                        drivers={selectedDrivers}
                        onSuccess={() => { fetchAll(); clearSelection(); }}
                      >
                        <Button size="sm" className="h-7 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold">
                          <Wallet className="w-3.5 h-3.5 mr-1" /> Add Balance
                        </Button>
                      </BulkAddBalanceDialog>
                      <Button size="sm" variant="ghost" onClick={clearSelection}
                        className="h-7 px-2 text-gray-500 hover:text-white text-xs">
                        <X className="w-3.5 h-3.5 mr-1" /> Clear
                      </Button>
                    </div>
                  )}
                </div>

                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                  <Input
                    value={driverSearch}
                    onChange={e => setDriverSearch(e.target.value)}
                    placeholder="Search by name, phone or ID?"
                    className="pl-9 pr-9 bg-black/50 border-white/10 text-white placeholder:text-gray-600 focus:border-sky-500/50 h-9"
                  />
                  {driverSearch && (
                    <button onClick={() => setDriverSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                {filteredDrivers.length === 0 ? (
                  <div className="text-center py-16 text-gray-600">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No drivers match <span className="text-gray-400 font-medium">"{driverSearch}"</span></p>
                  </div>
                ) : (
                  <ScrollArea className="h-[520px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/5 hover:bg-transparent">
                          <TableHead className="w-10">
                            <Checkbox
                              checked={allFilteredSelected}
                              onCheckedChange={toggleAllFiltered}
                              className="border-white/20 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                            />
                          </TableHead>
                          {["Name", "Phone", "Balance", "Status", "Vehicle", "Rides", "Actions"].map(h => (
                            <TableHead key={h} className="text-gray-500 text-xs uppercase tracking-wider">{h}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDrivers.map(driver => {
                          const vehicles = driver.driver_info?.vehicles || [];
                          const activeVehicle = vehicles.find(v => v.id === driver.driver_info?.active_vehicle_id) || vehicles[0];
                          const isSelected = selectedDriverIds.has(driver.id);

                          return (
                            <TableRow key={driver.id}
                              className={`border-white/5 hover:bg-white/3 transition-colors ${isSelected ? "bg-sky-500/5" : ""}`}>
                              <TableCell>
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => toggleDriver(driver.id)}
                                  className="border-white/20 data-[state=checked]:bg-sky-500 data-[state=checked]:border-sky-500"
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${driver.is_online ? "bg-emerald-400" : "bg-gray-600"}`} />
                                  <div>
                                    <p className="text-white text-sm font-medium">{driver.name} {driver.surname}</p>
                                    <p className="text-gray-600 text-[10px] font-mono">{driver.id}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-gray-400 text-sm">{driver.cellphone}</TableCell>
                              <TableCell className="text-sky-400 font-semibold text-sm">{fmt(driver.earnings?.balance)}</TableCell>
                              <TableCell><StatusBadge status={driver.registration_status} /></TableCell>
                              <TableCell className="text-gray-400 text-xs">
                                {activeVehicle ? `${activeVehicle.car_year} ${activeVehicle.car_make} ${activeVehicle.car_model}` : "?"}
                              </TableCell>
                              <TableCell className="text-gray-400 text-sm">{driver.total_rides || 0}</TableCell>
                              <TableCell>
                                <div className="flex gap-1.5 flex-wrap">
                                  {driver.registration_status?.includes("pending") && (
                                    <Button size="sm" className="h-7 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                                      onClick={() => quickAction(`/admin/drivers/${driver.id}/approve`, "Driver approved")}>
                                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-white"
                                    onClick={() => { setDetailUserId(driver.id); setDetailUserType("driver"); }}>
                                    <Eye className="w-3.5 h-3.5 mr-1" /> View
                                  </Button>
                                  <AddBalanceDialog user={driver} userType="driver" onSuccess={fetchAll}>
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
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* -- APPROVALS -- */}
          <TabsContent value="approvals">
            <div className="space-y-5">
              <Card className="bg-[#0a0a12] border border-amber-500/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-amber-400 text-base">
                    Pending Driver Approvals
                    {pendingDrivers.length > 0 && <span className="ml-2 px-2 py-0.5 text-xs rounded bg-amber-500/20 border border-amber-500/30">{pendingDrivers.length}</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {pendingDrivers.length === 0 ? (
                    <p className="text-center text-gray-600 py-8 text-sm">No pending driver approvals ?</p>
                  ) : (
                    <div className="space-y-3">
                      {pendingDrivers.map(driver => {
                        const vehicles = driver.driver_info?.vehicles || [];
                        const v = vehicles[0];
                        return (
                          <div key={driver.id} className="bg-black/40 border border-white/8 rounded-xl p-4 flex justify-between items-start gap-4">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-white font-semibold">{driver.name} {driver.surname}</p>
                                <p className="text-gray-500 text-sm">{driver.cellphone}</p>
                              </div>
                              <p className="text-gray-600 text-[10px] font-mono">{driver.id}</p>
                              {v && (
                                <div className="flex gap-2 flex-wrap mt-1">
                                  <span className="text-sky-400 text-xs">{v.car_year} {v.car_make} {v.car_model}</span>
                                  <span className="text-gray-500 text-xs">{v.car_color} ? {v.license_plate}</span>
                                  {v.tier && <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/20 border border-purple-500/30 text-purple-400 uppercase">{v.tier}</span>}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => quickAction(`/admin/drivers/${driver.id}/approve`, "Driver approved")}>
                                <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="destructive"
                                onClick={() => quickAction(`/admin/drivers/${driver.id}/reject`, "Driver rejected")}>
                                <XCircle className="w-4 h-4 mr-1" /> Reject
                              </Button>
                              <Button size="sm" variant="ghost" className="text-gray-500"
                                onClick={() => { setDetailUserId(driver.id); setDetailUserType("driver"); }}>
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-[#0a0a12] border border-purple-500/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-purple-400 text-base">
                    Pending Top-up Requests
                    {pendingTopups.length > 0 && <span className="ml-2 px-2 py-0.5 text-xs rounded bg-purple-500/20 border border-purple-500/30">{pendingTopups.length}</span>}
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-xs">Drivers requesting manual wallet top-ups</CardDescription>
                </CardHeader>
                <CardContent>
                  {pendingTopups.length === 0 ? (
                    <p className="text-center text-gray-600 py-8 text-sm">No pending top-up requests ?</p>
                  ) : (
                    <div className="space-y-3">
                      {pendingTopups.map(topup => (
                        <div key={topup.id} className="bg-black/40 border border-white/8 rounded-xl p-4 flex justify-between items-center gap-4">
                          <div className="space-y-1 flex-1">
                            <p className="text-white font-semibold">{topup.driver_name}</p>
                            <p className="text-gray-500 text-sm">{topup.driver_cellphone}</p>
                            {topup.payment_reference && <p className="text-gray-600 text-xs">Ref: {topup.payment_reference}</p>}
                            <p className="text-gray-700 text-xs">{timeAgo(topup.requested_at)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-2xl font-bold text-purple-400">{fmt(topup.amount)}</p>
                            <div className="flex gap-2 mt-2">
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => quickAction(`/admin/topups/${topup.id}/approve`, `Top-up of ${fmt(topup.amount)} approved`)}>
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="destructive"
                                onClick={() => quickAction(`/admin/topups/${topup.id}/reject`, "Top-up rejected")}>
                                <XCircle className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -- WITHDRAWALS -- */}
          <TabsContent value="withdrawals">
            <Card className="bg-[#0a0a12] border border-pink-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-pink-400 text-base">
                  Pending Withdrawals
                  {pendingWithdrawals.length > 0 && <span className="ml-2 px-2 py-0.5 text-xs rounded bg-pink-500/20 border border-pink-500/30">{pendingWithdrawals.length}</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingWithdrawals.length === 0 ? (
                  <p className="text-center text-gray-600 py-8 text-sm">No pending withdrawals ?</p>
                ) : (
                  <div className="space-y-3">
                    {pendingWithdrawals.map(wd => (
                      <div key={wd.id} className="bg-black/40 border border-white/8 rounded-xl p-4 flex justify-between items-center gap-4">
                        <div className="space-y-1 flex-1">
                          <p className="text-white font-semibold">{wd.driver_name || "Driver"}</p>
                          <p className="text-gray-500 text-sm">Bank: {wd.bank_details}</p>
                          {wd.fee > 0 && <p className="text-gray-600 text-xs">Fee: {fmt(wd.fee)} ? Total deducted: {fmt(wd.total_deducted)}</p>}
                          <p className="text-gray-700 text-xs">{timeAgo(wd.created_at || wd.requested_at)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-2xl font-bold text-pink-400">{fmt(wd.amount)}</p>
                          <div className="flex gap-2 mt-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => quickAction(`/admin/withdrawals/${wd.id}/approve`, `Withdrawal of ${fmt(wd.amount)} approved`)}>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive"
                              onClick={() => quickAction(`/admin/withdrawals/${wd.id}/reject`, "Withdrawal rejected & refunded")}>
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* __ FEEDBACK __ */}
          <TabsContent value="feedback"><AdminFeedbackPanel /></TabsContent>

          {/* __ CAMPAIGNS __ */}
          <TabsContent value="campaigns">
            <React.Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>}>
              <AdminCampaignsPanel />
            </React.Suspense>
          </TabsContent>

          {/* -- SUPPORT -- */}
          <TabsContent value="support">
            <AdminSupportPanel />
          </TabsContent>

          {/* -- DISPUTES -- */}
          <TabsContent value="disputes">
            <div className="max-w-xl mx-auto">
              <Card className="bg-[#0a0a12] border border-red-500/30">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                      <FileWarning className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <CardTitle className="text-red-400 text-base">Dispute Resolution</CardTitle>
                      <CardDescription className="text-gray-600 text-xs">Force-transfer funds from Driver ? Rider wallet</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-3 mb-5 text-xs text-red-400/80">
                    ?? This action is <strong>irreversible</strong> and logged for audit. Use only for verified disputes.
                  </div>
                  <form onSubmit={handleDisputeRefund} className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-red-400 text-xs">Driver ID <span className="text-gray-600">(take from)</span></Label>
                        <Input value={dispute.driverId} onChange={e => setDispute(p => ({ ...p, driverId: e.target.value }))}
                          placeholder="Paste Driver ID" className="bg-black/50 border-red-500/20 text-white font-mono text-xs mt-1" required />
                      </div>
                      <div>
                        <Label className="text-emerald-400 text-xs">Rider ID <span className="text-gray-600">(give to)</span></Label>
                        <Input value={dispute.riderId} onChange={e => setDispute(p => ({ ...p, riderId: e.target.value }))}
                          placeholder="Paste Rider ID" className="bg-black/50 border-emerald-500/20 text-white font-mono text-xs mt-1" required />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-gray-400 text-xs">Amount (?)</Label>
                        <Input type="number" step="0.01" value={dispute.amount}
                          onChange={e => setDispute(p => ({ ...p, amount: e.target.value }))}
                          placeholder="e.g. 15.50" className="bg-black/50 border-white/10 text-white mt-1" required />
                      </div>
                      <div>
                        <Label className="text-gray-400 text-xs">Reason (audit log)</Label>
                        <Input value={dispute.reason} onChange={e => setDispute(p => ({ ...p, reason: e.target.value }))}
                          placeholder="e.g. Driver overcharged" className="bg-black/50 border-white/10 text-white mt-1" required />
                      </div>
                    </div>
                    <Button type="submit" disabled={isRefunding}
                      className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-900/40">
                      {isRefunding
                        ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        : <ArrowRightLeft className="w-4 h-4 mr-2" />}
                      Execute Transfer
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* -- SOS -- */}
          <TabsContent value="sos">
            <SOSPanel />
          </TabsContent>
          <TabsContent value="financials">
            <FinancialsPanel />
          </TabsContent>
        </Tabs>

        <div className="mt-12 mb-8 border-t border-purple-500/30 pt-6">
          <DisputeManager />
        </div>
      </main>
    </div>
  );
};

// -----------------------------------------------------------------------------
// ROUTER
// -----------------------------------------------------------------------------


// =============================================================================
// FINANCIALS PANEL
// =============================================================================
const FinancialsPanel = () => {
  const [period, setPeriod] = React.useState("month");
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    api.get(`/admin/financials?period=${period}`)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  const fmt = (v) => `GEL ${(v||0).toFixed(2)}`;
  const pct = (v, t) => t > 0 ? ((v/t)*100).toFixed(1)+"%" : "0%";

  const periods = [["week","This Week"],["month","This Month"],["quarter","This Quarter"],["year","This Year"],["all","All Time"]];

  if (loading) return <div style={{textAlign:"center",padding:40,color:"rgba(255,255,255,0.3)"}}>Loading financials...</div>;
  if (!data) return <div style={{textAlign:"center",padding:40,color:"red"}}>Failed to load</div>;

  const s = data.summary;
  const tax = data.tax;

  return (
    <div style={{padding:"0 0 40px"}}>
      {/* Period selector */}
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {periods.map(([v,l]) => (
          <button key={v} onClick={() => setPeriod(v)} style={{padding:"8px 16px",borderRadius:10,border:`1px solid ${period===v?"#a855f7":"rgba(255,255,255,0.1)"}`,background:period===v?"rgba(168,85,247,0.2)":"transparent",color:period===v?"#a855f7":"rgba(255,255,255,0.5)",fontWeight:700,fontSize:13,cursor:"pointer"}}>
            {l}
          </button>
        ))}
        <button onClick={() => { const csv = generateCSV(data); downloadCSV(csv, `taksi-financials-${period}.csv`); }} style={{marginLeft:"auto",padding:"8px 16px",borderRadius:10,border:"1px solid rgba(0,212,255,0.3)",background:"rgba(0,212,255,0.1)",color:"#00d4ff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
          Export CSV
        </button>
      </div>

      {/* Key metrics */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:20}}>
        {[
          ["Total Rides", s.total_rides, "#ffffff", null],
          ["Gross Revenue", fmt(s.gross_revenue), "#00d4ff", null],
          ["Platform Commission", fmt(s.platform_commission), "#a855f7", pct(s.platform_commission, s.gross_revenue)],
          ["Driver Earnings", fmt(s.driver_earnings), "#00ff88", pct(s.driver_earnings, s.gross_revenue)],
          ["Card Service Fees", fmt(s.card_service_fees), "#ffd700", null],
          ["Net Platform Revenue", fmt(s.net_platform_revenue), "#ff8c00", null],
          ["Total Topups", fmt(s.total_topups), "#00d4ff", null],
          ["Total Withdrawals", fmt(s.total_withdrawals), "#ff4444", null],
        ].map(([label, value, color, sub]) => (
          <div key={label} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:14}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>{label}</div>
            <div style={{color,fontSize:20,fontWeight:900,fontFamily:"monospace"}}>{value}</div>
            {sub && <div style={{color:"rgba(255,255,255,0.3)",fontSize:11,marginTop:2}}>{sub} of gross</div>}
          </div>
        ))}
      </div>

      {/* Payment method breakdown */}
      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:12}}>Payment Method Breakdown</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[["Cash",s.cash_rides,"#00ff88"],["Card",s.card_rides,"#00d4ff"],["Wallet",s.wallet_rides,"#ffd700"]].map(([label,count,color])=>(
            <div key={label} style={{textAlign:"center",padding:10,background:"rgba(255,255,255,0.03)",borderRadius:10}}>
              <div style={{color,fontSize:24,fontWeight:900}}>{count}</div>
              <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>{label} rides</div>
              <div style={{color:"rgba(255,255,255,0.25)",fontSize:11}}>{pct(count, s.total_rides)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tax section */}
      <div style={{background:"rgba(255,60,60,0.04)",border:"1px solid rgba(255,60,60,0.2)",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{color:"#ff4444",fontSize:13,fontWeight:900,marginBottom:12}}>Georgian Tax Estimate</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginBottom:4}}>ANNUAL PROJECTION</div>
            <div style={{color:"white",fontSize:18,fontWeight:900,fontFamily:"monospace"}}>{fmt(tax.annual_projection)}</div>
          </div>
          <div style={{background:"rgba(255,255,255,0.03)",borderRadius:10,padding:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginBottom:4}}>TAX BRACKET</div>
            <div style={{color:"#ff8c00",fontSize:12,fontWeight:700}}>{tax.bracket}</div>
          </div>
          <div style={{background:"rgba(255,60,60,0.08)",borderRadius:10,padding:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginBottom:4}}>ESTIMATED TAX DUE</div>
            <div style={{color:"#ff4444",fontSize:18,fontWeight:900,fontFamily:"monospace"}}>{fmt(tax.estimated_tax)}</div>
          </div>
          <div style={{background:"rgba(0,255,136,0.08)",borderRadius:10,padding:12}}>
            <div style={{color:"rgba(255,255,255,0.4)",fontSize:10,marginBottom:4}}>NET AFTER TAX</div>
            <div style={{color:"#00ff88",fontSize:18,fontWeight:900,fontFamily:"monospace"}}>{fmt(tax.net_after_tax)}</div>
          </div>
        </div>
        <div style={{color:"rgba(255,255,255,0.25)",fontSize:11,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:8}}>
          Georgia flat income tax 20% (individual) · Corporate 15% + VAT 18% above 100k GEL · Consult your accountant for exact figures
        </div>
      </div>

      {/* Driver breakdown table */}
      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:16,marginBottom:16}}>
        <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:12}}>Driver Earnings Breakdown</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
                {["Driver","Phone","Rides","Gross Fare","Commission (our cut)","Driver Earnings"].map(h=>(
                  <th key={h} style={{padding:"8px 10px",textAlign:"left",color:"rgba(255,255,255,0.35)",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.driver_breakdown?.map((d,i) => (
                <tr key={d.driver_id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                  <td style={{padding:"8px 10px",color:"white",fontWeight:600}}>{d.name || "Unknown"}</td>
                  <td style={{padding:"8px 10px",color:"rgba(255,255,255,0.4)",fontSize:12}}>{d.phone||"-"}</td>
                  <td style={{padding:"8px 10px",color:"#00d4ff",fontWeight:700}}>{d.rides}</td>
                  <td style={{padding:"8px 10px",color:"white",fontFamily:"monospace"}}>{fmt(d.gross)}</td>
                  <td style={{padding:"8px 10px",color:"#a855f7",fontFamily:"monospace",fontWeight:700}}>{fmt(d.commission)}</td>
                  <td style={{padding:"8px 10px",color:"#00ff88",fontFamily:"monospace"}}>{fmt(d.driver_earnings)}</td>
                </tr>
              ))}
              {data.driver_breakdown?.length === 0 && (
                <tr><td colSpan={6} style={{textAlign:"center",padding:20,color:"rgba(255,255,255,0.2)"}}>No data for this period</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{borderTop:"2px solid rgba(255,255,255,0.15)"}}>
                <td colSpan={2} style={{padding:"10px",color:"rgba(255,255,255,0.5)",fontWeight:700}}>TOTALS</td>
                <td style={{padding:"10px",color:"#00d4ff",fontWeight:900}}>{s.total_rides}</td>
                <td style={{padding:"10px",color:"white",fontFamily:"monospace",fontWeight:900}}>{fmt(s.gross_revenue)}</td>
                <td style={{padding:"10px",color:"#a855f7",fontFamily:"monospace",fontWeight:900}}>{fmt(s.platform_commission)}</td>
                <td style={{padding:"10px",color:"#00ff88",fontFamily:"monospace",fontWeight:900}}>{fmt(s.driver_earnings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Daily breakdown */}
      {data.daily_breakdown?.length > 0 && (
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:16}}>
          <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontWeight:700,textTransform:"uppercase",marginBottom:12}}>Daily Transaction Log</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
                  {["Date","Rides","Gross Revenue","Commission","Driver Earnings"].map(h=>(
                    <th key={h} style={{padding:"8px 10px",textAlign:"left",color:"rgba(255,255,255,0.35)",fontWeight:700,fontSize:11}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.daily_breakdown].reverse().map((d,i) => (
                  <tr key={d.date} style={{borderBottom:"1px solid rgba(255,255,255,0.04)",background:i%2===0?"transparent":"rgba(255,255,255,0.01)"}}>
                    <td style={{padding:"8px 10px",color:"rgba(255,255,255,0.7)",fontFamily:"monospace"}}>{d.date}</td>
                    <td style={{padding:"8px 10px",color:"#00d4ff",fontWeight:700}}>{d.rides}</td>
                    <td style={{padding:"8px 10px",color:"white",fontFamily:"monospace"}}>{fmt(d.gross)}</td>
                    <td style={{padding:"8px 10px",color:"#a855f7",fontFamily:"monospace"}}>{fmt(d.commission)}</td>
                    <td style={{padding:"8px 10px",color:"#00ff88",fontFamily:"monospace"}}>{fmt(d.driver_earnings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const generateCSV = (data) => {
  const s = data.summary;
  const tax = data.tax;
  let csv = "T'aksi Financial Report\n";
  csv += `Period,${data.period}\n`;
  csv += `Generated,${new Date().toISOString()}\n\n`;
  csv += "SUMMARY\n";
  csv += `Total Rides,${s.total_rides}\n`;
  csv += `Gross Revenue,${s.gross_revenue}\n`;
  csv += `Platform Commission,${s.platform_commission}\n`;
  csv += `Driver Earnings,${s.driver_earnings}\n`;
  csv += `Card Service Fees,${s.card_service_fees}\n`;
  csv += `Net Platform Revenue,${s.net_platform_revenue}\n`;
  csv += `Total Driver Topups,${s.total_topups}\n`;
  csv += `Total Withdrawals,${s.total_withdrawals}\n\n`;
  csv += "TAX ESTIMATE\n";
  csv += `Annual Projection,${tax.annual_projection}\n`;
  csv += `Tax Bracket,${tax.bracket}\n`;
  csv += `Estimated Tax,${tax.estimated_tax}\n`;
  csv += `Net After Tax,${tax.net_after_tax}\n\n`;
  csv += "DRIVER BREAKDOWN\n";
  csv += "Driver,Phone,Rides,Gross Fare,Commission,Driver Earnings\n";
  data.driver_breakdown?.forEach(d => {
    csv += `${d.name||"Unknown"},${d.phone||""},${d.rides},${d.gross.toFixed(2)},${d.commission.toFixed(2)},${d.driver_earnings.toFixed(2)}\n`;
  });
  csv += "\nDAILY LOG\n";
  csv += "Date,Rides,Gross,Commission,Driver Earnings\n";
  data.daily_breakdown?.forEach(d => {
    csv += `${d.date},${d.rides},${d.gross.toFixed(2)},${d.commission.toFixed(2)},${d.driver_earnings.toFixed(2)}\n`;
  });
  return csv;
};

const downloadCSV = (csv, filename) => {
  const blob = new Blob([csv], {type:"text/csv"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// Competition Payout Panel
const CompetitionPayoutPanel = () => {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [history, setHistory] = React.useState([]);
  const [status, setStatus] = React.useState(null);

  React.useEffect(() => {
    api.get("/competition/status").then(r => setStatus(r.data)).catch(() => {});
    api.get("/admin/competition/payout-history").then(r => setHistory(r.data.payouts || [])).catch(() => {});
  }, []);

  const runPayout = async () => {
    if (!window.confirm("Pay out prizes to top 5 drivers for the last competition week?")) return;
    setLoading(true);
    try {
      const r = await api.post("/admin/competition/payout");
      setResult(r.data);
      toast.success("Payout complete!");
      const h = await api.get("/admin/competition/payout-history");
      setHistory(h.data.payouts || []);
    } catch(e) {
      toast.error(e.response?.data?.detail || "Payout failed");
    }
    setLoading(false);
  };

  return (
    <div style={{background:"rgba(255,215,0,0.04)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:16,padding:20,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <span style={{fontSize:24}}>&#x1F3C6;</span>
        <div>
          <div style={{color:"#ffd700",fontWeight:900,fontSize:16}}>Competition Payouts</div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:12}}>
            {status ? (status.active ? "Competition week is ACTIVE" : "Break week - ready to pay out last competition") : "Loading..."}
          </div>
        </div>
        <button onClick={runPayout} disabled={loading} style={{marginLeft:"auto",background:"linear-gradient(135deg,#ffd700,#ff8c00)",color:"#000",fontWeight:900,border:"none",borderRadius:10,padding:"10px 20px",cursor:"pointer",opacity:loading?0.6:1}}>
          {loading ? "Processing..." : "Run Payout"}
        </button>
      </div>
      {/* Schedule Timeline */}
      {status && (() => {
        const weekEnd = new Date(status.week_end);
        const now = new Date();
        const daysLeft = Math.ceil((weekEnd - now) / 86400000);
        const hoursLeft = Math.ceil((weekEnd - now) / 3600000);
        const fmt = (d) => new Date(d).toLocaleDateString("en-GB", {weekday:"short",day:"numeric",month:"short"});
        return (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {status.active ? (<>
              <div style={{background:"rgba(0,255,136,0.08)",border:"1px solid rgba(0,255,136,0.2)",borderRadius:10,padding:10}}>
                <div style={{color:"#00ff88",fontSize:10,fontWeight:700,marginBottom:4}}>COMPETITION ACTIVE</div>
                <div style={{color:"white",fontSize:13,fontWeight:700}}>Ends {fmt(status.week_end)}</div>
                <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>{daysLeft > 1 ? `${daysLeft} days left` : `${hoursLeft} hours left`}</div>
              </div>
              <div style={{background:"rgba(255,140,0,0.08)",border:"1px solid rgba(255,140,0,0.2)",borderRadius:10,padding:10}}>
                <div style={{color:"#ff8c00",fontSize:10,fontWeight:700,marginBottom:4}}>PAYOUT DUE</div>
                <div style={{color:"white",fontSize:13,fontWeight:700}}>{fmt(status.week_end)}</div>
                <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>Run payout after competition ends</div>
              </div>
            </>) : (<>
              <div style={{background:"rgba(255,215,0,0.08)",border:"1px solid rgba(255,215,0,0.2)",borderRadius:10,padding:10}}>
                <div style={{color:"#ffd700",fontSize:10,fontWeight:700,marginBottom:4}}>BREAK WEEK</div>
                <div style={{color:"white",fontSize:13,fontWeight:700}}>Next comp: {fmt(status.week_end)}</div>
                <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>Starts Monday 00:00</div>
              </div>
              <div style={{background:"rgba(255,60,60,0.08)",border:"1px solid rgba(255,60,60,0.2)",borderRadius:10,padding:10}}>
                <div style={{color:"#ff4444",fontSize:10,fontWeight:700,marginBottom:4}}>PAY OUT NOW</div>
                <div style={{color:"white",fontSize:13,fontWeight:700}}>Last competition ended</div>
                <div style={{color:"rgba(255,255,255,0.4)",fontSize:11}}>Click Run Payout to pay winners</div>
              </div>
            </>)}
          </div>
        );
      })()}
      {result && (
        <div style={{background:"rgba(0,255,136,0.08)",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{color:"#00ff88",fontWeight:700,marginBottom:8}}>Last Payout Results:</div>
          {result.results?.map(r => (
            <div key={r.rank} style={{display:"flex",justifyContent:"space-between",color:"white",fontSize:13,padding:"4px 0"}}>
              <span>#{r.rank} {r.name} Ã¢â‚¬â€ {r.trips} trips</span>
              <span style={{color:"#ffd700",fontWeight:700}}>+{r.prize} GEL</span>
            </div>
          ))}
        </div>
      )}
      {history.length > 0 && (
        <div>
          <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginBottom:6}}>PAYOUT HISTORY</div>
          {history.slice(0,5).map(h => (
            <div key={h.week_key} style={{color:"rgba(255,255,255,0.5)",fontSize:12,padding:"3px 0"}}>
              Week of {h.week_key} Ã¢â‚¬â€ {h.results?.length || 0} drivers paid
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AdminPortal = () => {
  const { user, token } = useAuth();
  const location = useLocation();

  const isAdmin = (() => {
    if (user?.user_type === "admin") return true;
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.role === "admin";
    } catch { return false; }
  })();

  if (!isAdmin) {
    return location.pathname === "/admin" || location.pathname === "/admin/"
      ? <AdminLogin />
      : <Navigate to="/admin" replace />;
  }

  

  return (
    <Routes>
      <Route path="/" element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<AdminDashboard />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
};

export default AdminPortal;