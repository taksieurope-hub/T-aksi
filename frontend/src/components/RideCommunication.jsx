import { useState, useEffect, useRef, useCallback } from "react";
import api from "@/api";
import { toast } from "sonner";
import { Phone, X, Send, MessageSquare, Loader2 } from "lucide-react";

const RideCommunication = ({
  rideId,
  otherPartyPhone,
  otherPartyName = "Other",
  currentUserId,
  isDriver = false,
}) => {
  const [isOpen, setIsOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [sending, setSending]   = useState(false);
  const [unread, setUnread]     = useState(0);

  const scrollRef    = useRef(null);
  const pollInterval = useRef(null);
  const inputRef     = useRef(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!rideId) return;
    try {
      const res = await api.get(`/rides/${rideId}/chat`);
      const msgs = res.data.messages || [];
      setMessages(msgs);
      const unreadCount = msgs.filter(m => {
        const fromOther = isDriver
          ? (m.sender_role === "rider" || m.sender_type === "rider")
          : (m.sender_role === "driver" || m.sender_type === "driver");
        return fromOther && !m.read;
      }).length;
      setUnread(unreadCount);
    } catch (_) {}
  }, [rideId, isDriver]);

  const markRead = useCallback(async () => {
    if (!rideId) return;
    try { await api.post(`/rides/${rideId}/chat/read`); setUnread(0); } catch (_) {}
  }, [rideId]);

  useEffect(() => {
    fetchMessages();
    pollInterval.current = setInterval(fetchMessages, 4000);
    return () => clearInterval(pollInterval.current);
  }, [fetchMessages]);

  useEffect(() => {
    if (isOpen) setTimeout(scrollToBottom, 50);
  }, [messages, isOpen, scrollToBottom]);

  useEffect(() => {
    if (isOpen) { markRead(); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [isOpen, markRead]);

  const handleOpen  = () => { setIsOpen(true); fetchMessages(); };
  const handleClose = () => { setIsOpen(false); markRead(); };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await api.post(`/rides/${rideId}/chat`, { message: msg });
      setInput("");
      await fetchMessages();
      setTimeout(scrollToBottom, 80);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send message");
    } finally { setSending(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const getIsMe = (msg) => {
    if (msg.sender_id && currentUserId) return String(msg.sender_id) === String(currentUserId);
    return isDriver ? msg.sender_role === "driver" : msg.sender_role === "rider";
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch (_) { return ""; }
  };

  const QUICK_REPLIES = isDriver
    ? ["On my way!", "I've arrived", "Please come down", "2 minutes away", "Where are you?"]
    : ["On my way down", "Give me 2 minutes", "I'm at the entrance", "Coming now!", "Thank you!"];

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative w-full h-11 flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:bg-white/8 hover:text-white transition-all font-medium text-sm"
      >
        <MessageSquare className="w-4 h-4" />
        Message {otherPartyName}
        {unread > 0 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {otherPartyPhone && (
        <a href={`tel:${otherPartyPhone}`}
          className="w-full h-11 flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-2xl text-gray-300 hover:bg-white/8 hover:text-white transition-all font-medium text-sm">
          <Phone className="w-4 h-4" />
          Call {otherPartyName}
        </a>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}>
          <div className="flex flex-col bg-[#0d0d18] border-t border-white/10 shadow-2xl"
            style={{ height: "85dvh", position: "absolute", bottom: 0, left: 0, right: 0, borderRadius: "24px 24px 0 0" }}>

            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{otherPartyName}</p>
                  <p className="text-gray-500 text-xs">{isDriver ? "Rider" : "Driver"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {otherPartyPhone && (
                  <a href={`tel:${otherPartyPhone}`}
                    className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400"
                    style={{ minWidth: 44, minHeight: 44 }}>
                    <Phone className="w-4 h-4" />
                  </a>
                )}
                <button onClick={handleClose}
                  className="w-11 h-11 rounded-xl bg-white/8 flex items-center justify-center text-white hover:bg-white/15 active:bg-white/20 transition-all"
                  style={{ minWidth: 44, minHeight: 44 }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 px-4 py-3 space-y-3 min-h-0"
              style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-12">
                  <MessageSquare className="w-12 h-12 text-gray-700 mb-3" />
                  <p className="text-gray-500 text-sm font-medium">No messages yet</p>
                  <p className="text-gray-600 text-xs mt-1">Start the conversation</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isMe = getIsMe(msg);
                const showName = !isMe && (i === 0 || getIsMe(messages[i - 1]));
                return (
                  <div key={msg.id || i} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {showName && (
                      <p className="text-gray-500 text-[10px] font-medium mb-1 px-1">
                        {msg.sender_name || otherPartyName}
                      </p>
                    )}
                    <div className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                      isMe ? "bg-emerald-500 text-black font-medium rounded-br-sm" : "bg-white/10 text-white rounded-bl-sm"
                    }`}>
                      {msg.message}
                    </div>
                    <p className={`text-[10px] text-gray-600 mt-1 px-1 ${isMe ? "text-right" : "text-left"}`}>
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2 shrink-0">
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {QUICK_REPLIES.map(reply => (
                  <button key={reply} onClick={() => setInput(reply)}
                    className="shrink-0 px-3 py-1.5 bg-white/6 border border-white/10 rounded-xl text-gray-300 text-xs font-medium hover:bg-white/10 transition-all whitespace-nowrap">
                    {reply}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 pb-5 pt-2 border-t border-white/8 shrink-0">
              <div className="flex items-center gap-2 bg-white/6 border border-white/10 rounded-2xl px-4 py-2">
                <input ref={inputRef} type="text" value={input}
                  onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Type a message..." maxLength={500}
                  className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none" />
                <button onClick={handleSend} disabled={!input.trim() || sending}
                  className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-black shrink-0 disabled:opacity-40 hover:bg-emerald-400 active:scale-95 transition-all">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RideCommunication;
