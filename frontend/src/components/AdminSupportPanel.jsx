import { useState, useEffect } from "react";

const PRIORITY_CONFIG = {
  urgent: { color: "#ff2d2d", bg: "#1a0000", border: "#ff2d2d", label: "URGENT", dot: "🔴" },
  high:   { color: "#ff7a00", bg: "#1a0800", border: "#ff7a00", label: "HIGH",   dot: "🟠" },
  medium: { color: "#ffd700", bg: "#1a1400", border: "#ffd700", label: "MEDIUM", dot: "🟡" },
  low:    { color: "#00cc88", bg: "#001a10", border: "#00cc88", label: "LOW",    dot: "🟢" },
};

const STATUS_CONFIG = {
  escalated:  { color: "#ff2d2d", label: "Needs Human" },
  ai_handled: { color: "#00cc88", label: "AI Resolved" },
  in_progress:{ color: "#ffd700", label: "In Progress" },
  resolved:   { color: "#4488ff", label: "Resolved" },
  closed:     { color: "#888",    label: "Closed" },
};

// ── Mock data for demo ───────────────────────────────────────────────────────
const MOCK_TICKETS = [
  {
    id: "TKT001",
    user_name: "Giorgi Beridze",
    user_phone: "+995 599 123 456",
    user_type: "rider",
    message: "The driver was very rude and made inappropriate comments during my ride. I feel unsafe.",
    ai_response: "We take this very seriously. Your report has been escalated to our team and a human agent will review it and contact you as soon as possible.",
    status: "escalated",
    priority: "high",
    category: "complaint",
    admin_tag: "⚠️ HARASSMENT",
    escalation_reason: "Escalation triggered: harassment",
    matched_keywords: ["rude", "inappropriate"],
    needs_human: true,
    created_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    chat_history: [
      { role: "user", content: "The driver was very rude and made inappropriate comments during my ride. I feel unsafe.", timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString() },
      { role: "assistant", content: "We take this very seriously. Your report has been escalated to our team.", timestamp: new Date(Date.now() - 1000 * 60 * 7).toISOString(), escalated: true },
    ],
  },
  {
    id: "TKT002",
    user_name: "Nino Kvaratskhelia",
    user_phone: "+995 577 987 654",
    user_type: "rider",
    message: "Emergency! I'm in the car and the driver is taking a completely wrong route and won't stop. I'm scared.",
    ai_response: "⚠️ This looks like an emergency. Your case has been immediately escalated to our safety team. A T'aksi agent will contact you right away. If you are in immediate danger, please call emergency services (112).",
    status: "escalated",
    priority: "urgent",
    category: "safety",
    admin_tag: "🚨 SAFETY",
    escalation_reason: "Escalation triggered: safety",
    matched_keywords: ["emergency", "scared"],
    needs_human: true,
    created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    chat_history: [
      { role: "user", content: "Emergency! I'm in the car and the driver is taking a completely wrong route and won't stop. I'm scared.", timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString() },
      { role: "assistant", content: "⚠️ This looks like an emergency. Your case has been immediately escalated to our safety team.", timestamp: new Date(Date.now() - 1000 * 60 * 1).toISOString(), escalated: true },
    ],
  },
  {
    id: "TKT003",
    user_name: "David Tabatadze",
    user_phone: "+995 598 456 789",
    user_type: "driver",
    message: "My documents were submitted 5 days ago and I still haven't been approved. I need to start working.",
    ai_response: "Your request has been received and forwarded to our support team. A T'aksi agent will review your case and get back to you shortly.",
    status: "escalated",
    priority: "medium",
    category: "driver_docs",
    admin_tag: "📋 DRIVER DOCS",
    escalation_reason: "Escalation triggered: driver_approval",
    matched_keywords: ["documents", "approval"],
    needs_human: true,
    created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    chat_history: [
      { role: "user", content: "My documents were submitted 5 days ago and I still haven't been approved.", timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
      { role: "assistant", content: "Your request has been forwarded to our support team.", timestamp: new Date(Date.now() - 1000 * 60 * 44).toISOString(), escalated: true },
    ],
  },
  {
    id: "TKT004",
    user_name: "Ana Lomidze",
    user_phone: "+995 591 234 567",
    user_type: "rider",
    message: "How do I add a stop to my ride? I need to pick someone up on the way.",
    ai_response: "You can add stops while booking your ride! After entering your pickup and destination, tap the '+' button to add a waypoint. You can add up to 3 stops per ride. Each stop can have a short wait time which is billed at ₾0.50/min after the first 2 minutes. Hope that helps!",
    status: "ai_handled",
    priority: "low",
    category: "trip",
    admin_tag: null,
    needs_human: false,
    created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    chat_history: [
      { role: "user", content: "How do I add a stop to my ride?", timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString() },
      { role: "assistant", content: "You can add stops while booking your ride! After entering your pickup and destination, tap the '+' button...", timestamp: new Date(Date.now() - 1000 * 60 * 119).toISOString(), escalated: false },
    ],
  },
  {
    id: "TKT005",
    user_name: "Levan Mikiashvili",
    user_phone: "+995 593 876 543",
    user_type: "rider",
    message: "I was charged ₾78 for a ride that should have been ₾15. This is fraud!",
    ai_response: "We take this very seriously. Your report has been escalated to our team and a human agent will review it and contact you as soon as possible.",
    status: "escalated",
    priority: "high",
    category: "payment",
    admin_tag: "💳 FRAUD",
    escalation_reason: "Escalation triggered: fraud",
    matched_keywords: ["fraud"],
    needs_human: true,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    chat_history: [
      { role: "user", content: "I was charged ₾78 for a ride that should have been ₾15. This is fraud!", timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
      { role: "assistant", content: "We take this very seriously. Your report has been escalated.", timestamp: new Date(Date.now() - 1000 * 60 * 29).toISOString(), escalated: true },
    ],
  },
];

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function AdminSupportPortal() {
  const [tickets, setTickets] = useState(MOCK_TICKETS);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("escalated");
  const [replyText, setReplyText] = useState("");
  const [resolving, setResolving] = useState(false);
  const [tab, setTab] = useState("queue"); // queue | all

  const escalated = tickets.filter(t => t.needs_human && t.status === "escalated");
  const filtered = tab === "queue"
    ? escalated
    : (filter === "all" ? tickets : tickets.filter(t => t.status === filter || t.priority === filter));

  const sorted = [...filtered].sort((a, b) => {
    const pOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3);
  });

  function handleReply() {
    if (!replyText.trim() || !selected) return;
    setResolving(true);
    setTimeout(() => {
      const adminMsg = { role: "admin", content: replyText, timestamp: new Date().toISOString() };
      setTickets(prev => prev.map(t => t.id === selected.id
        ? { ...t, chat_history: [...t.chat_history, adminMsg], status: "in_progress" }
        : t
      ));
      setSelected(prev => ({ ...prev, chat_history: [...prev.chat_history, adminMsg], status: "in_progress" }));
      setReplyText("");
      setResolving(false);
    }, 600);
  }

  function handleResolve() {
    if (!selected) return;
    setResolving(true);
    setTimeout(() => {
      setTickets(prev => prev.map(t => t.id === selected.id ? { ...t, status: "resolved", needs_human: false } : t));
      setSelected(prev => ({ ...prev, status: "resolved", needs_human: false }));
      setResolving(false);
    }, 600);
  }

  const urgentCount = escalated.filter(t => t.priority === "urgent").length;
  const highCount = escalated.filter(t => t.priority === "high").length;

  return (
    <div style={{
      fontFamily: "'DM Mono', 'Courier New', monospace",
      background: "#0a0a0f",
      color: "#e0e0e8",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        background: "#0f0f18",
        borderBottom: "1px solid #1e1e2e",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, color: "#fff" }}>
          T'AKSI
        </div>
        <div style={{ color: "#444", fontSize: 18 }}>|</div>
        <div style={{ color: "#aaa", fontSize: 13, letterSpacing: 1 }}>SUPPORT PORTAL</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          {urgentCount > 0 && (
            <div style={{
              background: "#1a0000", border: "1px solid #ff2d2d", color: "#ff2d2d",
              borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700,
              animation: "pulse 1.5s infinite",
            }}>
              🚨 {urgentCount} URGENT
            </div>
          )}
          {highCount > 0 && (
            <div style={{
              background: "#1a0800", border: "1px solid #ff7a00", color: "#ff7a00",
              borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700,
            }}>
              ⚠️ {highCount} HIGH
            </div>
          )}
          <div style={{
            background: "#111", border: "1px solid #1e1e2e", color: "#888",
            borderRadius: 6, padding: "4px 10px", fontSize: 12,
          }}>
            {escalated.length} in queue
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", height: "calc(100vh - 57px)" }}>
        {/* Left panel — ticket list */}
        <div style={{
          width: 320, borderRight: "1px solid #1e1e2e", display: "flex",
          flexDirection: "column", overflow: "hidden",
        }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #1e1e2e" }}>
            {[["queue", `Queue (${escalated.length})`], ["all", "All Tickets"]].map(([key, label]) => (
              <button key={key} onClick={() => { setTab(key); setSelected(null); }} style={{
                flex: 1, padding: "12px 8px", fontSize: 12, letterSpacing: 1,
                background: tab === key ? "#141420" : "transparent",
                color: tab === key ? "#fff" : "#555",
                border: "none", borderBottom: tab === key ? "2px solid #7c6dfa" : "2px solid transparent",
                cursor: "pointer", fontFamily: "inherit",
              }}>{label.toUpperCase()}</button>
            ))}
          </div>

          {/* Filter (all tab only) */}
          {tab === "all" && (
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #1e1e2e", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["all", "escalated", "ai_handled", "resolved"].map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "3px 8px", fontSize: 11, borderRadius: 4,
                  background: filter === f ? "#7c6dfa" : "#1a1a2e",
                  color: filter === f ? "#fff" : "#777",
                  border: "1px solid " + (filter === f ? "#7c6dfa" : "#2a2a3e"),
                  cursor: "pointer", fontFamily: "inherit",
                }}>{f.toUpperCase()}</button>
              ))}
            </div>
          )}

          {/* Ticket list */}
          <div style={{ overflow: "auto", flex: 1 }}>
            {sorted.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "#444", fontSize: 13 }}>
                No tickets in this view
              </div>
            ) : sorted.map(ticket => {
              const p = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.low;
              const s = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.closed;
              const isSelected = selected?.id === ticket.id;
              return (
                <div key={ticket.id} onClick={() => setSelected(ticket)} style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #1a1a28",
                  borderLeft: `3px solid ${isSelected ? "#7c6dfa" : p.border}`,
                  background: isSelected ? "#141420" : "transparent",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>{ticket.user_name}</div>
                    <div style={{ fontSize: 11, color: "#555" }}>{timeAgo(ticket.created_at)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                    {ticket.admin_tag && (
                      <span style={{
                        fontSize: 10, padding: "2px 6px", borderRadius: 3,
                        background: p.bg, border: `1px solid ${p.border}`, color: p.color, fontWeight: 700,
                      }}>{ticket.admin_tag}</span>
                    )}
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 3,
                      background: "#111", border: "1px solid #1e1e2e", color: s.color,
                    }}>{s.label}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 3,
                      background: "#111", border: "1px solid #1e1e2e", color: "#666",
                    }}>{ticket.user_type.toUpperCase()}</span>
                  </div>
                  <div style={{
                    fontSize: 12, color: "#666", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}>{ticket.message}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel — ticket detail */}
        {selected ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Ticket header */}
            <div style={{
              padding: "16px 24px", borderBottom: "1px solid #1e1e2e",
              background: "#0f0f18", display: "flex", alignItems: "flex-start", gap: 16,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{selected.user_name}</span>
                  <span style={{ fontSize: 12, color: "#555" }}>{selected.user_phone}</span>
                  <span style={{
                    fontSize: 11, padding: "2px 7px", borderRadius: 3,
                    background: "#1a1a2e", border: "1px solid #2a2a3e", color: "#888",
                  }}>{selected.user_type.toUpperCase()}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selected.admin_tag && (() => {
                    const p = PRIORITY_CONFIG[selected.priority] || PRIORITY_CONFIG.low;
                    return (
                      <span style={{
                        fontSize: 12, padding: "3px 9px", borderRadius: 4,
                        background: p.bg, border: `1px solid ${p.border}`, color: p.color, fontWeight: 700,
                      }}>{selected.admin_tag}</span>
                    );
                  })()}
                  {selected.matched_keywords?.length > 0 && (
                    <span style={{ fontSize: 11, color: "#555", padding: "3px 0" }}>
                      Triggered by: {selected.matched_keywords.join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {selected.status !== "resolved" && (
                  <button onClick={handleResolve} disabled={resolving} style={{
                    padding: "8px 16px", borderRadius: 6, fontSize: 12,
                    background: "#002a1a", border: "1px solid #00cc88", color: "#00cc88",
                    cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                    opacity: resolving ? 0.6 : 1,
                  }}>
                    {resolving ? "..." : "✓ Resolve"}
                  </button>
                )}
                {selected.status === "resolved" && (
                  <span style={{
                    padding: "8px 16px", borderRadius: 6, fontSize: 12,
                    background: "#001a10", border: "1px solid #00cc88", color: "#00cc88",
                  }}>✓ Resolved</span>
                )}
              </div>
            </div>

            {/* Chat history */}
            <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
              {selected.chat_history.map((msg, i) => {
                const isUser = msg.role === "user";
                const isAI = msg.role === "assistant";
                const isAdmin = msg.role === "admin";
                return (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: isUser ? "flex-start" : "flex-end",
                    gap: 10,
                    alignItems: "flex-end",
                  }}>
                    {isUser && (
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%",
                        background: "#1a1a2e", border: "1px solid #2a2a3e",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, flexShrink: 0,
                      }}>
                        {selected.user_type === "driver" ? "🚗" : "👤"}
                      </div>
                    )}
                    <div style={{ maxWidth: "70%" }}>
                      <div style={{
                        fontSize: 10, color: "#444", marginBottom: 3,
                        textAlign: isUser ? "left" : "right",
                      }}>
                        {isUser ? selected.user_name : isAI ? "T'aksi AI" : "Admin"} · {timeAgo(msg.timestamp)}
                      </div>
                      <div style={{
                        padding: "10px 14px", borderRadius: 10,
                        background: isUser ? "#141420" : isAI ? (msg.escalated ? "#1a0800" : "#0f1a24") : "#141a2e",
                        border: `1px solid ${isUser ? "#1e1e2e" : isAI ? (msg.escalated ? "#ff7a0044" : "#4488ff44") : "#7c6dfa44"}`,
                        fontSize: 13, lineHeight: 1.6,
                        color: isUser ? "#ccc" : isAI ? (msg.escalated ? "#ffaa77" : "#88bbff") : "#bbb",
                      }}>
                        {isAI && msg.escalated && (
                          <div style={{ fontSize: 10, color: "#ff7a00", marginBottom: 4, fontWeight: 700 }}>
                            ⚡ ESCALATED TO HUMAN
                          </div>
                        )}
                        {msg.content}
                      </div>
                    </div>
                    {(isAI || isAdmin) && (
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%",
                        background: isAdmin ? "#1a1a35" : "#0f1a24",
                        border: `1px solid ${isAdmin ? "#7c6dfa" : "#4488ff"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, flexShrink: 0,
                      }}>
                        {isAdmin ? "🛡️" : "🤖"}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Reply box */}
            {selected.needs_human && selected.status !== "resolved" && (
              <div style={{
                padding: "16px 24px", borderTop: "1px solid #1e1e2e", background: "#0f0f18",
              }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type your reply to the user..."
                    rows={3}
                    style={{
                      flex: 1, background: "#141420", border: "1px solid #2a2a3e",
                      borderRadius: 8, color: "#ddd", fontSize: 13, padding: "10px 14px",
                      fontFamily: "inherit", resize: "none", outline: "none",
                      lineHeight: 1.6,
                    }}
                    onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleReply(); }}
                  />
                  <button onClick={handleReply} disabled={!replyText.trim() || resolving} style={{
                    padding: "0 20px", borderRadius: 8, background: "#7c6dfa",
                    border: "none", color: "#fff", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit", opacity: !replyText.trim() ? 0.4 : 1,
                  }}>
                    Send<br/><span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>⌘↩</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 16,
          }}>
            <div style={{ fontSize: 48 }}>🎯</div>
            <div style={{ color: "#555", fontSize: 14, letterSpacing: 1 }}>SELECT A TICKET TO REVIEW</div>
            {escalated.length > 0 && (
              <div style={{ color: "#444", fontSize: 12 }}>
                {escalated.length} tickets need human attention
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 3px; }
      `}</style>
    </div>
  );
}