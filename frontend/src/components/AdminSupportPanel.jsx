import { useState, useEffect, useRef, useCallback } from "react";
import api from "@/api";
import { toast } from "sonner";

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg:        "#09090d",
  surface:   "#0f0f16",
  surfaceEl: "#141420",
  border:    "#1c1c28",
  borderEl:  "#252535",
  text:      "#e8e8f0",
  textMid:   "#8888a0",
  textDim:   "#44445a",

  urgent:  { fg: "#ff3b3b", bg: "#1a0505", border: "#ff3b3b33" },
  high:    { fg: "#ff8c00", bg: "#130900", border: "#ff8c0033" },
  medium:  { fg: "#f5c800", bg: "#131000", border: "#f5c80033" },
  low:     { fg: "#22d98a", bg: "#021510", border: "#22d98a33" },

  accent:   "#635bff",
  accentLo: "#635bff22",
  success:  "#22d98a",
  danger:   "#ff3b3b",
  warn:     "#ff8c00",
};

const PRIORITY = {
  urgent: { label: "URGENT", order: 0, ...C.urgent },
  high:   { label: "HIGH",   order: 1, ...C.high },
  medium: { label: "MEDIUM", order: 2, ...C.medium },
  low:    { label: "LOW",    order: 3, ...C.low },
};

const STATUS = {
  escalated:   { label: "Needs Human",  color: C.danger },
  open:        { label: "Open",         color: C.warn },
  in_progress: { label: "In Progress",  color: C.medium.fg },
  ai_handled:  { label: "AI Handled",   color: C.success },
  resolved:    { label: "Resolved",     color: "#4488ff" },
  closed:      { label: "Closed",       color: C.textDim },
};

const CATEGORY_ICON = {
  safety: "🚨", payment: "💳", complaint: "⚠️",
  trip: "🚕", technical: "🔧", driver_docs: "📋", general: "💬",
};

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const btnBase = {
  borderRadius: 6, cursor: "pointer",
  fontFamily: "'IBM Plex Mono','Fira Code',monospace",
  transition: "all 0.15s", whiteSpace: "nowrap",
};

function PriorityBadge({ priority }) {
  const p = PRIORITY[priority] || PRIORITY.low;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, padding: "2px 6px", borderRadius: 3, background: p.bg, border: `1px solid ${p.border}`, color: p.fg }}>
      {p.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.closed;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 3, background: s.color + "18", border: `1px solid ${s.color}30`, color: s.color }}>
      {s.label}
    </span>
  );
}

function StatPill({ label, value, color, pulse }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 6, background: color + "12", border: `1px solid ${color}28`, animation: pulse ? "pulse-badge 2s ease-in-out infinite" : "none" }}>
      {pulse && <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "block" }} />}
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 11, color: color + "88" }}>{label}</span>
    </div>
  );
}

export default function AdminSupportPanel() {
  const [tickets, setTickets]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [viewMode, setViewMode]   = useState("queue");
  const [filterStatus, setFilter] = useState("all");
  const [search, setSearch]       = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending]     = useState(false);
  const [resolving, setResolving] = useState(false);
  const chatEndRef = useRef(null);

  const fetchTickets = useCallback(async () => {
    try {
      const [escalR, allR] = await Promise.allSettled([
        api.get("/admin/support/tickets/escalated"),
        api.get("/admin/support/tickets"),
      ]);
      const escalated = escalR.status === "fulfilled" ? escalR.value.data.tickets || [] : [];
      const all       = allR.status === "fulfilled"   ? allR.value.data.tickets   || [] : [];
      const allIds = new Set(all.map(t => t.id));
      const merged = [...all, ...escalated.filter(t => !allIds.has(t.id))];
      setTickets(merged);
    } catch {
      toast.error("Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    const iv = setInterval(fetchTickets, 30000);
    return () => clearInterval(iv);
  }, [fetchTickets]);

  useEffect(() => {
    if (selected) {
      const updated = tickets.find(t => t.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [tickets]); // eslint-disable-line

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.chat_history?.length]);

  const openTicket = async (ticket) => {
    setSelected(ticket);
    try {
      const r = await api.get(`/support/tickets/${ticket.id}`);
      const msgs = r.data.messages || [];
      if (msgs.length > 0) {
        setSelected(prev => prev ? { ...prev, chat_history: msgs } : null);
        setTickets(prev => prev.map(t => t.id === ticket.id ? { ...t, chat_history: msgs } : t));
      }
    } catch { /* use existing */ }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      await api.post(`/admin/support/tickets/${selected.id}/respond`, null, {
        params: { response: replyText, resolve: false },
      });
      const newMsg = { role: "admin", content: replyText, timestamp: new Date().toISOString() };
      const upd = t => t.id === selected.id
        ? { ...t, status: "in_progress", chat_history: [...(t.chat_history || []), newMsg] }
        : t;
      setTickets(prev => prev.map(upd));
      setSelected(prev => prev ? upd(prev) : null);
      setReplyText("");
      toast.success("Reply sent");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to send reply");
    } finally { setSending(false); }
  };

  const handleResolve = async () => {
    if (!selected) return;
    setResolving(true);
    try {
      await api.post(`/admin/support/tickets/${selected.id}/resolve`, null, {
        params: { notes: "Resolved by admin" },
      });
      const upd = t => t.id === selected.id ? { ...t, status: "closed", needs_human: false } : t;
      setTickets(prev => prev.map(upd));
      setSelected(prev => prev ? upd(prev) : null);
      toast.success("Ticket resolved");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to resolve");
    } finally { setResolving(false); }
  };

  const escalated = tickets.filter(t => t.needs_human && t.status === "escalated");
  const urgentCnt = escalated.filter(t => t.priority === "urgent").length;
  const highCnt   = escalated.filter(t => t.priority === "high").length;

  const displayList = (() => {
    let list = viewMode === "queue" ? escalated : tickets;
    if (filterStatus !== "all") list = list.filter(t => t.status === filterStatus || t.priority === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.user_name?.toLowerCase().includes(q) ||
        t.message?.toLowerCase().includes(q) ||
        t.user_phone?.includes(q) ||
        t.admin_tag?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const po = { urgent: 0, high: 1, medium: 2, low: 3 };
      return (po[a.priority] ?? 3) - (po[b.priority] ?? 3);
    });
  })();

  const isDone = selected?.status === "closed" || selected?.status === "resolved";

  return (
    <div style={{ fontFamily: "'IBM Plex Mono','Fira Code','Courier New',monospace", background: C.bg, color: C.text, display: "flex", flexDirection: "column", height: "calc(100vh - 140px)", minHeight: 540, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.border}` }}>

      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "10px 18px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: C.text }}>SUPPORT OPS</span>
        <span style={{ color: C.textDim }}>·</span>
        <span style={{ fontSize: 11, color: C.textMid }}>{tickets.length} total</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ fontSize: 11, color: C.textDim }}>syncing…</span>}
          {urgentCnt > 0 && <StatPill label="URGENT" value={urgentCnt} color={C.danger} pulse />}
          {highCnt > 0   && <StatPill label="HIGH"   value={highCnt}   color={C.warn} />}
          <StatPill label="in queue" value={escalated.length} color={C.accent} />
          <button onClick={fetchTickets} style={{ ...btnBase, padding: "5px 10px", fontSize: 11, color: C.textMid, background: C.surfaceEl, border: `1px solid ${C.border}` }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT: Ticket list */}
        <div style={{ width: 300, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>

          {/* View toggle */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {[["queue", `Queue (${escalated.length})`], ["all", "All"]].map(([key, lbl]) => (
              <button key={key} onClick={() => { setViewMode(key); setFilter("all"); setSearch(""); }}
                style={{ flex: 1, padding: "10px 6px", fontSize: 11, letterSpacing: 1, background: viewMode === key ? C.surfaceEl : "transparent", color: viewMode === key ? C.text : C.textDim, border: "none", borderBottom: `2px solid ${viewMode === key ? C.accent : "transparent"}`, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {lbl.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, tag…"
              style={{ width: "100%", background: C.surfaceEl, border: `1px solid ${C.borderEl}`, borderRadius: 5, padding: "6px 10px", fontSize: 11, color: C.text, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Status filters */}
          {viewMode === "all" && (
            <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 4, flexWrap: "wrap", flexShrink: 0 }}>
              {["all", "escalated", "in_progress", "ai_handled", "resolved", "closed"].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: "3px 7px", fontSize: 10, borderRadius: 3, background: filterStatus === f ? C.accent : C.surfaceEl, color: filterStatus === f ? "#fff" : C.textDim, border: `1px solid ${filterStatus === f ? C.accent : C.borderEl}`, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.5 }}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* List */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {loading && displayList.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: C.textDim, fontSize: 12 }}>Loading…</div>
            ) : displayList.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                <div style={{ color: C.textDim, fontSize: 12 }}>{viewMode === "queue" ? "Queue is clear" : "No tickets match"}</div>
              </div>
            ) : displayList.map(ticket => {
              const p = PRIORITY[ticket.priority] || PRIORITY.low;
              const isSelected = selected?.id === ticket.id;
              const needsAction = ticket.needs_human && ticket.status === "escalated";
              return (
                <div key={ticket.id} onClick={() => openTicket(ticket)} style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${isSelected ? C.accent : needsAction ? p.fg : C.border}`, background: isSelected ? C.surfaceEl : "transparent", cursor: "pointer", transition: "background 0.12s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{CATEGORY_ICON[ticket.category] || "💬"}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{ticket.user_name || "Unknown"}</span>
                      {needsAction && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.danger, display: "inline-block" }} />}
                    </div>
                    <span style={{ fontSize: 10, color: C.textDim }}>{timeAgo(ticket.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 5, flexWrap: "wrap" }}>
                    <PriorityBadge priority={ticket.priority} />
                    <StatusBadge status={ticket.status} />
                    {ticket.user_type && <span style={{ fontSize: 10, padding: "2px 5px", borderRadius: 3, background: C.surfaceEl, border: `1px solid ${C.borderEl}`, color: C.textDim }}>{ticket.user_type.toUpperCase()}</span>}
                  </div>
                  {ticket.admin_tag && <div style={{ fontSize: 11, color: p.fg, fontWeight: 600, marginBottom: 4 }}>{ticket.admin_tag}</div>}
                  <div style={{ fontSize: 11, color: C.textMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.5 }}>{ticket.message}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Detail */}
        {selected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

            {/* Header */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{selected.user_name}</span>
                    <span style={{ fontSize: 12, color: C.textMid }}>{selected.user_phone}</span>
                    {selected.user_type && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: C.surfaceEl, border: `1px solid ${C.borderEl}`, color: C.textDim }}>{selected.user_type.toUpperCase()}</span>}
                    <StatusBadge status={selected.status} />
                    <span style={{ fontSize: 10, color: C.textDim, marginLeft: "auto" }}>#{selected.id?.slice(-8)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <PriorityBadge priority={selected.priority} />
                    {selected.admin_tag && <span style={{ fontSize: 11, color: (PRIORITY[selected.priority] || PRIORITY.low).fg, fontWeight: 700 }}>{selected.admin_tag}</span>}
                    {selected.matched_keywords?.length > 0 && <span style={{ fontSize: 10, color: C.textDim }}>triggered: {selected.matched_keywords.join(", ")}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {!isDone && (
                    <button onClick={handleResolve} disabled={resolving} style={{ ...btnBase, padding: "7px 14px", fontSize: 11, fontWeight: 700, background: C.success + "18", border: `1px solid ${C.success}40`, color: C.success }}>
                      {resolving ? "…" : "✓ Resolve"}
                    </button>
                  )}
                  {isDone && <span style={{ fontSize: 11, color: C.success, padding: "7px 14px" }}>✓ Resolved</span>}
                </div>
              </div>
            </div>

            {/* Chat */}
            <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {(selected.chat_history || []).map((msg, i) => {
                const isUser  = msg.role === "user";
                const isAI    = msg.role === "assistant";
                const isAdmin = msg.role === "admin";
                const p = PRIORITY[selected.priority] || PRIORITY.low;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-start" : "flex-end", gap: 8, alignItems: "flex-end" }}>
                    {isUser && (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surfaceEl, border: `1px solid ${C.borderEl}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                        {selected.user_type === "driver" ? "🚗" : "👤"}
                      </div>
                    )}
                    <div style={{ maxWidth: "72%", minWidth: 80 }}>
                      <div style={{ fontSize: 10, color: C.textDim, marginBottom: 3, textAlign: isUser ? "left" : "right" }}>
                        {isUser ? selected.user_name : isAI ? "T'aksi AI" : "Admin"} · {fmtTime(msg.timestamp) || timeAgo(msg.timestamp)}
                      </div>
                      <div style={{ padding: "9px 13px", borderRadius: 8, lineHeight: 1.6, fontSize: 12, background: isUser ? C.surfaceEl : isAdmin ? C.accentLo : (msg.escalated ? p.bg : "#0e1929"), border: `1px solid ${isUser ? C.borderEl : isAdmin ? C.accent + "44" : (msg.escalated ? p.border : "#4488ff22")}`, color: isUser ? C.text : isAdmin ? "#c0bbff" : (msg.escalated ? p.fg : "#88b8ff") }}>
                        {isAI && msg.escalated && <div style={{ fontSize: 9, fontWeight: 700, color: C.warn, marginBottom: 4, letterSpacing: 1 }}>⚡ ESCALATED TO HUMAN</div>}
                        {msg.content}
                      </div>
                    </div>
                    {(isAI || isAdmin) && (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: isAdmin ? "#1a1a35" : "#0e1929", border: `1px solid ${isAdmin ? C.accent : "#4488ff"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>
                        {isAdmin ? "🛡️" : "🤖"}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Reply / status footer */}
            {selected.needs_human && !isDone ? (
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleReply(); }} placeholder="Type reply… (⌘↵ to send)" rows={3}
                    style={{ flex: 1, background: C.surfaceEl, border: `1px solid ${C.borderEl}`, borderRadius: 7, color: C.text, fontSize: 12, padding: "9px 12px", fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.6 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button onClick={handleReply} disabled={!replyText.trim() || sending} style={{ ...btnBase, padding: "9px 16px", fontSize: 11, fontWeight: 700, background: replyText.trim() ? C.accent : C.surfaceEl, border: `1px solid ${replyText.trim() ? C.accent : C.borderEl}`, color: replyText.trim() ? "#fff" : C.textDim, flex: 1 }}>
                      {sending ? "…" : "Send"}
                    </button>
                    <button onClick={handleResolve} disabled={resolving} style={{ ...btnBase, padding: "9px 16px", fontSize: 11, fontWeight: 700, background: C.success + "18", border: `1px solid ${C.success}40`, color: C.success }}>
                      {resolving ? "…" : "Resolve"}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 5 }}>Reply stored on ticket · visible in user's support history · ⌘↵ to send</div>
              </div>
            ) : (
              <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.border}`, background: C.surface, textAlign: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: isDone ? C.success : C.textDim }}>
                  {isDone ? "✓ Ticket resolved" : "AI-handled — no human reply needed"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <div style={{ fontSize: 36 }}>🎯</div>
            <div style={{ color: C.textDim, fontSize: 12, letterSpacing: 1 }}>SELECT A TICKET</div>
            {escalated.length > 0 && <div style={{ fontSize: 11, color: C.danger }}>{escalated.length} ticket{escalated.length > 1 ? "s" : ""} need human attention</div>}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse-badge { 0%,100% { opacity:1; } 50% { opacity:0.55; } }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.borderEl}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.textDim}; }
      `}</style>
    </div>
  );
}