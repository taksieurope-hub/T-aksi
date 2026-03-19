import React, { useState, useEffect, useRef, useCallback } from "react";
import { startCall, endCall, isCalling } from "@/hooks/useAgoraCall";
import { Phone, MessageSquare, X, Send, Loader2, CheckCheck, Mic, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import api from "@/api";
import { toast } from "sonner";


// -------------------------------------------------------------
// Quick-reply presets — different sets for driver vs rider
// -------------------------------------------------------------
const QUICK_REPLIES_DRIVER = [
  "On my way! ??",
  "I've arrived ?",
  "2 mins away ??",
  "Please come outside",
  "I'm in a black car",
  "Wait for me, stuck in traffic",
];
const QUICK_REPLIES_RIDER = [
  "I'm coming down now ??",
  "Please wait 2 mins ??",
  "I'm at the main entrance",
  "Can't find you, call me?",
  "On my way out!",
  "Thanks! ??",
];

// -------------------------------------------------------------
// Soft notification sound via Web Audio API (no network request)
// -------------------------------------------------------------
const playPing = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}
};

// -------------------------------------------------------------
// Tiny timestamp formatter
// -------------------------------------------------------------
const formatTime = (ts) => {
  if (!ts) return "";
  try {
    // Handle Firestore Timestamp objects
    const d = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

// -------------------------------------------------------------
// Typing indicator (three bouncing dots)
// -------------------------------------------------------------
const TypingIndicator = ({ color }) => (
  <div className="flex items-center gap-1 px-3 py-2 bg-gray-800/80 rounded-2xl rounded-tl-none w-fit">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full"
        style={{
          backgroundColor: color,
          animation: `typingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }}
      />
    ))}
    <style>{`
      @keyframes typingBounce {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
        30% { transform: translateY(-5px); opacity: 1; }
      }
    `}</style>
  </div>
);

// -------------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------------
const RideCommunication = ({
  rideId,
  otherPartyPhone,
  otherPartyName,
  currentUserId,
  isDriver,
}) => {
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [isTyping, setIsTyping] = useState(false); // simulated "other party typing"
  const [hasNewMessage, setHasNewMessage] = useState(false); // pulse the button

  const prevCountRef = useRef(0);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const pollRef = useRef(null);

  // Theme
  const accent   = isDriver ? "#00d4ff" : "#00ff88";
  const accentBg = isDriver ? "bg-[#00d4ff]" : "bg-[#00ff88]";
  const accentText = isDriver ? "text-[#00d4ff]" : "text-[#00ff88]";
  const accentBorder = isDriver ? "border-[#00d4ff]" : "border-[#00ff88]";
  const quickReplies = isDriver ? QUICK_REPLIES_DRIVER : QUICK_REPLIES_RIDER;
  const otherLabel = otherPartyName || (isDriver ? "Rider" : "Driver");

  // -- Scroll to bottom -------------------------------------
  const [isInCall, setIsInCall] = useState(false);
  const [callStatus, setCallStatus] = useState("");

  const handleCall = async () => {
    if (isInCall) {
      await endCall();
      setIsInCall(false);
      setCallStatus("");
    } else {
      setCallStatus("Connecting...");
      const result = await startCall(
        rideId,
        () => setCallStatus("Connected"),
        () => { setIsInCall(false); setCallStatus(""); }
      );
      if (result.success) {
        setIsInCall(true);
        setCallStatus("Connected");
      } else {
        setCallStatus("");
        alert("Call failed: " + result.error);
      }
    }
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isOpen && messages.length) {
      setTimeout(scrollToBottom, 60);
    }
  }, [messages.length, isOpen, scrollToBottom]);

  // -- Focus input when opened -------------------------------
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // -- Polling -----------------------------------------------
  const fetchMessages = useCallback(async () => {
    if (!rideId) return;
    try {
      const res = await api.get(`/rides/${rideId}/chat`);
      const newMsgs = res.data?.messages || [];

      if (newMsgs.length > prevCountRef.current) {
        const diff = newMsgs.length - prevCountRef.current;
        const latest = newMsgs[newMsgs.length - 1];
        const isMe = latest.sender_id && currentUserId ? String(latest.sender_id) === String(currentUserId) : (isDriver ? latest.sender_type === "driver" : latest.sender_type === "rider");

        if (!isMe) {
          playPing();
          setHasNewMessage(true);
          setTimeout(() => setHasNewMessage(false), 2000);

          if (!isOpen) {
            setUnreadCount((c) => c + diff);
            toast.info(`?? ${otherLabel}: "${latest.message}"`, {
              duration: 4000,
              style: { background: "#111", color: "#fff", border: `1px solid ${accent}` },
            });
          }

          // Simulate typing indicator briefly then show message
          setIsTyping(true);
          setTimeout(() => setIsTyping(false), 800);
        }

        prevCountRef.current = newMsgs.length;
      }

      // Normalize sender_id to string for reliable comparison
      const normalized = newMsgs.map(m => ({...m, sender_id: m.sender_id ? String(m.sender_id) : m.sender_id}));
      setMessages(normalized);
    } catch (_) {}
  }, [rideId, currentUserId, isOpen, otherLabel, accent]);

  useEffect(() => {
    if (!rideId) return;
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchMessages]);

  // -- Open / close ------------------------------------------
  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
    setShowQuickReplies(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    setShowQuickReplies(false);
  };

  // -- Send message ------------------------------------------
  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    setShowQuickReplies(false);
    setLoading(true);

    // Optimistic insert
    const optimistic = {
      id: `opt_${Date.now()}`,
      sender_id: currentUserId,
      sender_type: isDriver ? "driver" : "rider",
      message: msg,
      timestamp: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    prevCountRef.current += 1;

    try {
      await api.post(`/rides/${rideId}/chat`, { message: msg });
    } catch {
      toast.error("Message failed to send");
      // Roll back optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      prevCountRef.current -= 1;
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ---------------------------------------------------------
  // RENDER — trigger row
  // ---------------------------------------------------------
  return (
    <>
      {/* -- Trigger buttons ------------------------------- */}
      <div className="flex gap-2 mt-3 w-full">
        {/* Call */}
        <a
          onClick={handleCall}
          className={`flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border font-semibold text-sm transition-all duration-200 ${accentBorder} ${accentText} hover:${accentBg} hover:text-black active:scale-95`}
          style={{ borderColor: accent, color: accent }}
          onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.color = "#000"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = accent; }}
        >
          <Phone className="w-4 h-4" />
          Call
        </a>

        {/* Chat */}
        <button
          onClick={handleOpen}
          className="flex-1 relative flex items-center justify-center gap-2 h-11 rounded-xl border font-semibold text-sm transition-all duration-200 active:scale-95"
          style={{
            borderColor: accent,
            color: accent,
            animation: hasNewMessage ? "chatPulse 0.6s ease-in-out 2" : "none",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.color = "#000"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = accent; }}
        >
          <MessageSquare className="w-4 h-4" />
          Chat
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-red-500 border-2 border-black text-[10px] font-black text-white shadow-lg">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      <style>{`
        @keyframes chatPulse {
          0%, 100% { transform: scale(1); box-shadow: none; }
          50% { transform: scale(1.04); box-shadow: 0 0 18px ${accent}80; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%) scale(0.96); opacity: 0; }
          to   { transform: translateY(0)   scale(1);    opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* -- Chat panel ------------------------------------ */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[10500] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div
            className="w-full sm:max-w-md flex flex-col bg-[#0a0a0a] border rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
            style={{
              borderColor: `${accent}40`,
              maxHeight: "92dvh",
              animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
              boxShadow: `0 0 60px ${accent}18, 0 25px 60px rgba(0,0,0,0.9)`,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 shrink-0"
              style={{ borderBottom: `1px solid ${accent}25`, background: `${accent}08` }}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-black font-black text-sm shrink-0"
                  style={{ background: `linear-gradient(135deg, ${accent}, ${accent}88)` }}
                >
                  {(otherLabel[0] || "?").toUpperCase()}
                </div>
                <div>
                  <p className="text-white font-bold leading-none">{otherLabel}</p>
                  <p className="text-xs mt-0.5" style={{ color: `${accent}90` }}>
                    {isTyping ? "typing…" : "In ride • Live chat"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  onClick={handleCall}
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                  style={{ background: `${accent}18`, color: accent }}
                  title="Call"
                >
                  <Phone className="w-4 h-4" />
                </a>
                <button
                  onClick={handleClose}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Message list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 py-12">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: `${accent}15` }}
                  >
                    <MessageSquare className="w-7 h-7" style={{ color: accent }} />
                  </div>
                  <p className="text-gray-500 text-sm text-center">
                    No messages yet.<br />
                    <span style={{ color: `${accent}80` }}>Tap a quick reply to get started</span>
                  </p>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const isMe = msg.sender_id && currentUserId ? String(msg.sender_id) === String(currentUserId) : (isDriver ? msg.sender_type === "driver" || msg.sender_role === "driver" : msg.sender_type === "rider" || msg.sender_role === "rider");
                    const showTime = i === 0 ||
                      formatTime(msg.timestamp) !== formatTime(messages[i - 1]?.timestamp);

                    return (
                      <div
                        key={msg.id || i}
                        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                        style={{ animation: "fadeIn 0.2s ease forwards" }}
                      >
                        <div
                          className={`max-w-[82%] px-4 py-2.5 text-sm leading-snug break-words whitespace-pre-wrap rounded-2xl ${
                            isMe
                              ? "text-black rounded-tr-sm"
                              : "text-white bg-gray-800/90 border border-white/5 rounded-tl-sm"
                          } ${msg._optimistic ? "opacity-70" : "opacity-100"}`}
                          style={isMe ? { background: accent } : {}}
                        >
                          {msg.translated_message ? (
                            <>
                              <span>{msg.translated_message}</span>
                              <span style={{display:"block",fontSize:10,opacity:0.5,marginTop:3,fontStyle:"italic"}}>{msg.original_message}</span>
                            </>
                          ) : msg.message}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 px-1">
                          <span className="text-[10px] text-gray-600">
                            {formatTime(msg.timestamp)}
                          </span>
                          {isMe && (
                            <CheckCheck
                              className="w-3 h-3"
                              style={{ color: msg._optimistic ? "#555" : accent }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isTyping && (
                    <div className="flex items-start" style={{ animation: "fadeIn 0.2s ease forwards" }}>
                      <TypingIndicator color={accent} />
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick replies */}
            {showQuickReplies && (
              <div
                className="px-3 py-2 flex gap-2 overflow-x-auto shrink-0 scrollbar-none"
                style={{ borderTop: `1px solid ${accent}15` }}
              >
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    onClick={() => handleSend(reply)}
                    className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-all hover:text-black active:scale-95 whitespace-nowrap"
                    style={{ borderColor: `${accent}50`, color: accent }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = accent; e.currentTarget.style.color = "#000"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = accent; }}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}

            {/* Input bar */}
            <div
              className="px-3 pb-safe pt-3 pb-3 flex items-center gap-2 shrink-0"
              style={{ borderTop: `1px solid ${accent}20`, background: "#0a0a0a" }}
            >
              {/* Quick reply toggle */}
              <button
                onClick={() => setShowQuickReplies((p) => !p)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors shrink-0"
                style={{
                  background: showQuickReplies ? `${accent}25` : "transparent",
                  color: showQuickReplies ? accent : "#555",
                  border: `1px solid ${showQuickReplies ? accent : "#333"}`,
                }}
                title="Quick replies"
              >
                <Smile className="w-4 h-4" />
              </button>

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message…"
                className="flex-1 bg-gray-900/80 border border-gray-800 text-white text-sm px-4 h-10 rounded-full outline-none transition-colors placeholder:text-gray-600"
                style={{ "--focus-ring": accent }}
                onFocus={(e) => { e.target.style.borderColor = `${accent}60`; }}
                onBlur={(e) => { e.target.style.borderColor = "#1f2937"; }}
              />

              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ background: input.trim() ? accent : "#1f2937" }}
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin text-black" />
                  : <Send className="w-4 h-4" style={{ color: input.trim() ? "#000" : "#666" }} />
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RideCommunication;