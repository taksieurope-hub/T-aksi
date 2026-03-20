import React, { useState, useEffect } from "react";
import { Building2, Users, CreditCard, LogOut, Plus, Trash2, RefreshCw, ChevronRight, Loader2, CheckCircle, Clock, XCircle } from "lucide-react";
import api from "@/api";

const statusBadge = (status) => {
  const map = {
    pending_review: { label: "Pending Review", color: "#f59e0b", icon: <Clock className="w-3 h-3" /> },
    approved: { label: "Approved", color: "#00ff88", icon: <CheckCircle className="w-3 h-3" /> },
    rejected: { label: "Rejected", color: "#ef4444", icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] || map.pending_review;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: s.color + "22", border: `1px solid ${s.color}44`, color: s.color, borderRadius: 8, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
      {s.icon} {s.label}
    </span>
  );
};

// ── Auth screens ──────────────────────────────────────────────
const CorporateAuth = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ company_name: "", contact_name: "", contact_email: "", contact_phone: "", password: "", tax_id: "" });

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      if (isLogin) {
        const r = await api.post("/corporate/login", { contact_email: form.contact_email, password: form.password });
        localStorage.setItem("corp_token", r.data.token);
        onLogin(r.data.corporate);
      } else {
        const r = await api.post("/corporate/register", form);
        localStorage.setItem("corp_token", r.data.token);
        onLogin(r.data.corporate);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080810", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#00ff88,#00d4ff)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Building2 style={{ width: 28, height: 28, color: "#000" }} />
          </div>
          <h1 style={{ color: "#fff", fontSize: 24, fontWeight: 800, margin: 0 }}>T'aksi Business</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 4 }}>{isLogin ? "Sign in to your business account" : "Register your company"}</p>
        </div>

        <form onSubmit={handle} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24 }}>
          {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#ef4444", fontSize: 13, marginBottom: 16 }}>{error}</div>}

          {!isLogin && (
            <>
              {[["company_name","Company Name","Acme Ltd"],["contact_name","Your Name","Full Name"],["contact_phone","Phone","+995 555 000 000"],["tax_id","Tax ID (optional)","123456789"]].map(([k,l,p]) => (
                <div key={k} style={{ marginBottom: 12 }}>
                  <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 4 }}>{l}</label>
                  <input value={form[k]} onChange={e => setForm({...form,[k]:e.target.value})} placeholder={p}
                    style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
                </div>
              ))}
            </>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 4 }}>Email</label>
            <input type="email" value={form.contact_email} onChange={e => setForm({...form,contact_email:e.target.value})} placeholder="company@example.com" required
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, display: "block", marginBottom: 4 }}>Password</label>
            <input type="password" value={form.password} onChange={e => setForm({...form,password:e.target.value})} required
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 14, boxSizing: "border-box" }} />
          </div>

          <button type="submit" disabled={loading} style={{ width: "100%", background: "linear-gradient(135deg,#00ff88,#00d4ff)", color: "#000", fontWeight: 800, fontSize: 15, border: "none", borderRadius: 12, padding: "13px 0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {loading && <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />}
            {isLogin ? "Sign In" : "Create Business Account"}
          </button>
        </form>

        <button onClick={() => { setIsLogin(!isLogin); setError(""); }} style={{ width: "100%", background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 16, cursor: "pointer", padding: 8 }}>
          {isLogin ? "New company? Register here" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
};

// ── Main Dashboard ────────────────────────────────────────────
const CorporateDashboard = ({ corp, onLogout }) => {
  const [tab, setTab] = useState("overview");
  const [employees, setEmployees] = useState(corp.employees || []);
  const [rides, setRides] = useState([]);
  const [phone, setPhone] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [ridesLoading, setRidesLoading] = useState(false);
  const [balance, setBalance] = useState(corp.wallet_balance || 0);

  const loadRides = async () => {
    setRidesLoading(true);
    try {
      const r = await api.get("/corporate/rides");
      setRides(r.data.rides || []);
    } catch (e) {} finally { setRidesLoading(false); }
  };

  useEffect(() => { if (tab === "rides") loadRides(); }, [tab]);

  const addEmployee = async () => {
    if (!phone.trim()) return;
    setAddLoading(true); setAddError("");
    try {
      const r = await api.post("/corporate/employees/add", { phone: phone.trim() });
      setEmployees(prev => [...prev, r.data.employee]);
      setPhone("");
    } catch (e) {
      setAddError(e.response?.data?.detail || "Failed to add employee");
    } finally { setAddLoading(false); }
  };

  const removeEmployee = async (emp) => {
    if (!window.confirm(`Remove ${emp.name}?`)) return;
    try {
      await api.post("/corporate/employees/remove", { phone: emp.phone });
      setEmployees(prev => prev.filter(e => e.rider_id !== emp.rider_id));
    } catch (e) { alert("Failed to remove employee"); }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: <Building2 className="w-4 h-4" /> },
    { id: "employees", label: "Employees", icon: <Users className="w-4 h-4" /> },
    { id: "rides", label: "Rides", icon: <ChevronRight className="w-4 h-4" /> },
    { id: "wallet", label: "Wallet", icon: <CreditCard className="w-4 h-4" /> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#fff" }}>
      {/* Header */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#00ff88,#00d4ff)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Building2 style={{ width: 18, height: 18, color: "#000" }} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>{corp.company_name}</p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>T'aksi Business</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {statusBadge(corp.status)}
          <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <LogOut style={{ width: 14, height: 14 }} /> Logout
          </button>
        </div>
      </div>

      {/* Pending notice */}
      {corp.status === "pending_review" && (
        <div style={{ background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.2)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 8 }}>
          <Clock style={{ width: 16, height: 16, color: "#f59e0b", flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 13, color: "#f59e0b" }}>Your account is under review. T'aksi will approve it within 24 hours. Once approved you can add employees and they'll see the Business payment option.</p>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: tab === t.id ? "rgba(0,255,136,0.12)" : "transparent", color: tab === t.id ? "#00ff88" : "rgba(255,255,255,0.4)", transition: "all 0.15s" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { label: "Wallet Balance", value: `GEL ${balance.toFixed(2)}`, color: "#00ff88" },
              { label: "Employees", value: employees.length, color: "#00d4ff" },
              { label: "Company", value: corp.company_name, color: "#fff" },
              { label: "Contact", value: corp.contact_name, color: "#fff" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 20 }}>
                <p style={{ margin: "0 0 6px", fontSize: 11, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</p>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* EMPLOYEES */}
        {tab === "employees" && (
          <div>
            {corp.status === "approved" && (
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, color: "rgba(255,255,255,0.5)" }}>Add employee by their T'aksi phone number</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+995 555 000 000"
                    style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 12px", color: "#fff", fontSize: 14 }} />
                  <button onClick={addEmployee} disabled={addLoading || !phone.trim()}
                    style={{ background: "linear-gradient(135deg,#00ff88,#00d4ff)", color: "#000", fontWeight: 700, border: "none", borderRadius: 10, padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    {addLoading ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} /> : <Plus style={{ width: 14, height: 14 }} />} Add
                  </button>
                </div>
                {addError && <p style={{ color: "#ef4444", fontSize: 12, margin: "8px 0 0" }}>{addError}</p>}
              </div>
            )}

            {employees.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)" }}>
                <Users style={{ width: 32, height: 32, margin: "0 auto 8px", display: "block" }} />
                <p style={{ margin: 0, fontSize: 14 }}>No employees yet</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {employees.map(emp => (
                  <div key={emp.rider_id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{emp.name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{emp.phone}</p>
                    </div>
                    <button onClick={() => removeEmployee(emp)}
                      style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "6px 10px", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                      <Trash2 style={{ width: 12, height: 12 }} /> Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* RIDES */}
        {tab === "rides" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>{rides.length} rides charged to your account</p>
              <button onClick={loadRides} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 10px", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
              </button>
            </div>
            {ridesLoading ? (
              <div style={{ textAlign: "center", padding: 40 }}><Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite", color: "#00ff88", margin: "0 auto" }} /></div>
            ) : rides.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "rgba(255,255,255,0.3)", fontSize: 14 }}>No rides yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rides.map(r => (
                  <div key={r.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "12px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{r.pickup || "—"} → {r.destination || "—"}</p>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#00ff88" }}>GEL {(r.final_fare || 0).toFixed(2)}</p>
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* WALLET */}
        {tab === "wallet" && (
          <div>
            <div style={{ background: "linear-gradient(135deg,rgba(0,255,136,0.1),rgba(0,212,255,0.1))", border: "1px solid rgba(0,255,136,0.2)", borderRadius: 20, padding: 24, marginBottom: 16, textAlign: "center" }}>
              <p style={{ margin: "0 0 4px", fontSize: 12, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>Wallet Balance</p>
              <p style={{ margin: 0, fontSize: 40, fontWeight: 900, color: "#00ff88", fontFamily: "monospace" }}>GEL {balance.toFixed(2)}</p>
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 20 }}>
              <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14 }}>Top Up</p>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>To top up your corporate wallet, contact T'aksi directly. We'll process bank transfers, cash deposits, and card payments.</p>
              <a href={`mailto:taksigeorgia@gmail.com?subject=Corporate Wallet Top Up - ${corp.company_name}`}
                style={{ display: "block", background: "linear-gradient(135deg,#00ff88,#00d4ff)", color: "#000", fontWeight: 800, fontSize: 14, textAlign: "center", borderRadius: 12, padding: "13px 0", textDecoration: "none" }}>
                Email Us to Top Up
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────
const CorporatePortal = () => {
  const [corp, setCorp] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("corp_token");
    if (token) {
      api.get("/corporate/me")
        .then(r => setCorp(r.data))
        .catch(() => localStorage.removeItem("corp_token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#080810", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 style={{ width: 32, height: 32, color: "#00ff88", animation: "spin 1s linear infinite" }} />
    </div>
  );

  if (!corp) return <CorporateAuth onLogin={c => setCorp(c)} />;

  return <CorporateDashboard corp={corp} onLogout={() => { localStorage.removeItem("corp_token"); setCorp(null); }} />;
};

export default CorporatePortal;
