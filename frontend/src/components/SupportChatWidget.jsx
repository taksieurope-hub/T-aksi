import React, { useState, useEffect, useRef } from "react";
import api from "@/api";
import { useAuth } from "@/config";

const SupportChatWidget = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I am T aksi Support AI. I can help with anything - app questions, ride issues, or general questions. What can I help you with?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const history = messages.filter(m => m.role !== "system");
      const res = await api.post("/support/chat", { message: userMsg, history });
      setMessages(prev => [...prev, { role: "assistant", content: res.data.reply }]);
      if (res.data.ticket_created) {
        setMessages(prev => [...prev, { role: "system", content: "A support ticket has been created. Our team will follow up shortly." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, having trouble connecting. Please try again or email taksigeorgia@gmail.com" }]);
    } finally { setLoading(false); }
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  if (!user) return null;

  return (
    <div style={{ background: "#0a0a14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 400 }}>
      <div style={{ background: "linear-gradient(135deg,rgba(0,255,136,0.15),rgba(0,212,255,0.15))", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#00ff88,#00d4ff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>AI</div>
        <div>
          <p style={{ margin: 0, color: "#fff", fontWeight: 700, fontSize: 13 }}>T aksi Support AI</p>
          <p style={{ margin: 0, color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Always online - Powered by AI</p>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, maxHeight: 320 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            {m.role === "system" ? (
              <div style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#00ff88", width: "100%" }}>{m.content}</div>
            ) : (
              <div style={{ maxWidth: "80%", background: m.role === "user" ? "linear-gradient(135deg,#00ff88,#00d4ff)" : "rgba(255,255,255,0.06)", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 13px", fontSize: 13, color: m.role === "user" ? "#000" : "#fff", lineHeight: 1.5 }}>{m.content}</div>
            )}
          </div>
        ))}
        {loading && <div style={{ display: "flex", justifyContent: "flex-start" }}><div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "16px 16px 16px 4px", padding: "10px 16px" }}>...</div></div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", padding: 12, display: "flex", gap: 8 }}>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey} placeholder="Ask anything..." rows={1}
          style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "8px 12px", color: "#fff", fontSize: 13, resize: "none", outline: "none", fontFamily: "inherit" }} />
        <button onClick={send} disabled={loading || !input.trim()}
          style={{ width: 38, height: 38, borderRadius: "50%", background: input.trim() ? "linear-gradient(135deg,#00ff88,#00d4ff)" : "rgba(255,255,255,0.05)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
          &gt;
        </button>
      </div>
    </div>
  );
};

export default SupportChatWidget;
