import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, X, Car, User, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import api from '@/api'; // ← uses your existing api instance (has auth token baked in)

// Quick reply templates — translated per role
const QUICK_REPLIES = {
  rider: [
    { key: 'on_my_way',   en: "I'm on my way",          ka: "მოვდივარ" },
    { key: 'be_ready',    en: "Please be ready outside", ka: "გთხოვ გამოდი" },
    { key: 'arrived',     en: "I've arrived",            ka: "მოვედი" },
    { key: 'wait_moment', en: "Wait a moment please",    ka: "ერთი წამი" },
  ],
  driver: [
    { key: 'where_are_you', en: "Where are you?",           ka: "სად ხარ?" },
    { key: 'coming_soon',   en: "Coming in 2 minutes",      ka: "2 წუთში ვიქნები" },
    { key: 'at_entrance',   en: "I'm at the main entrance", ka: "მთავარ შესასვლელთან ვარ" },
    { key: 'on_the_way',    en: "On my way to you",         ka: "მოდივარ" },
  ],
};

// Format Firestore timestamp (can be string, object, or null)
const formatTime = (ts) => {
  if (!ts) return '';
  try {
    const date = typeof ts === 'string' ? new Date(ts) : new Date(ts.seconds * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN WIDGET
// ─────────────────────────────────────────────────────────────────────────────
const ChatWidget = ({ rideId, userType, onClose, onRead }) => {
  const { t, language } = useLanguage();
  const [messages, setMessages]       = useState([]);
  const [newMessage, setNewMessage]   = useState('');
  const [loading, setLoading]         = useState(true);
  const [sending, setSending]         = useState(false);
  const [connected, setConnected]     = useState(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  const messagesEndRef    = useRef(null);
  const scrollAreaRef     = useRef(null);
  const pollIntervalRef   = useRef(null);
  const inputRef          = useRef(null);
  const lastMessageCount  = useRef(0);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    setShowScrollBtn(false);
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.get(`/rides/${rideId}/chat`);
      const fetched = res.data.messages || [];
      setMessages(fetched);
      setConnected(true);

      // Show scroll-to-bottom button if new messages arrived while scrolled up
      if (fetched.length > lastMessageCount.current) {
        lastMessageCount.current = fetched.length;
        // Auto-scroll only if already near bottom
        const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (el) {
          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distanceFromBottom < 120) {
            scrollToBottom();
          } else {
            setShowScrollBtn(true);
          }
        } else {
          scrollToBottom();
        }
      }
    } catch {
      setConnected(false);
    }
  }, [rideId, scrollToBottom]);

  // Initial load + polling
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    lastMessageCount.current = 0;

    fetchMessages().finally(() => {
      setLoading(false);
      setTimeout(() => scrollToBottom(false), 100);
    });

    // Mark as read when opened
    api.post(`/rides/${rideId}/chat/read`).catch(() => {});
    onRead?.();

    pollIntervalRef.current = setInterval(fetchMessages, 3000);
    return () => clearInterval(pollIntervalRef.current);
  }, [rideId]);

  // Focus input on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const handleSend = async (text) => {
    const msg = (text || newMessage).trim();
    if (!msg || sending) return;

    // Optimistic update
    const tempId = `temp_${Date.now()}`;
    const optimistic = {
      id: tempId,
      message: msg,
      sender_type: userType,
      sender_name: 'You',
      timestamp: new Date().toISOString(),
      _pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setNewMessage('');
    setShowQuickReplies(false);
    scrollToBottom();

    setSending(true);
    try {
      await api.post(`/rides/${rideId}/chat`, { message: msg });
      await fetchMessages();
    } catch {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setNewMessage(msg); // restore text
      toast.error(t('error') + ': failed to send');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const quickReplies = QUICK_REPLIES[userType] || [];
  const charCount = newMessage.length;
  const maxChars = 500;

  return (
    <div className="fixed bottom-4 right-4 w-[340px] sm:w-[380px] h-[500px] flex flex-col bg-[#08080f] border border-[#00d4ff]/25 rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#00d4ff]/15 bg-[#0a0a18] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#00d4ff] to-purple-600 flex items-center justify-center">
              {userType === 'rider'
                ? <Car className="w-4 h-4 text-white" />
                : <User className="w-4 h-4 text-white" />
              }
            </div>
            {/* online dot */}
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#0a0a18]" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">
              {userType === 'rider' ? t('chat_with_driver') : t('chat_with_rider')}
            </p>
            <div className="flex items-center gap-1">
              {connected
                ? <><Wifi className="w-2.5 h-2.5 text-emerald-400" /><span className="text-emerald-400 text-[10px]">Live</span></>
                : <><WifiOff className="w-2.5 h-2.5 text-red-400" /><span className="text-red-400 text-[10px]">Reconnecting…</span></>
              }
            </div>
          </div>
        </div>
        <button onClick={onClose}
          className="w-7 h-7 rounded-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 relative overflow-hidden">
        <ScrollArea className="h-full" ref={scrollAreaRef}>
          <div className="px-3 py-3 space-y-3">
            {loading ? (
              <div className="flex flex-col gap-2.5 pt-4">
                {[80, 60, 90, 50].map((w, i) => (
                  <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                    <div className={`h-9 rounded-2xl bg-white/8 animate-pulse`} style={{ width: `${w}%` }} />
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
                  <MessageCircle className="w-6 h-6 text-gray-600" />
                </div>
                <p className="text-gray-500 text-sm">{t('no_messages')}</p>
                <p className="text-gray-700 text-xs mt-1">Say hello 👋</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isOwn = msg.sender_type === userType;
                const showAvatar = !isOwn && (idx === 0 || messages[idx - 1]?.sender_type !== msg.sender_type);
                const isPending = msg._pending;

                return (
                  <div key={msg.id} className={`flex gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {/* Avatar placeholder for alignment */}
                    {!isOwn && (
                      <div className="w-6 flex-shrink-0 flex items-end pb-1">
                        {showAvatar && (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            msg.sender_type === 'driver' ? 'bg-[#00ff88]/20' : 'bg-[#00d4ff]/20'
                          }`}>
                            {msg.sender_type === 'driver'
                              ? <Car className="w-3 h-3 text-[#00ff88]" />
                              : <User className="w-3 h-3 text-[#00d4ff]" />
                            }
                          </div>
                        )}
                      </div>
                    )}

                    <div className={`max-w-[75%] flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                      <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                        isOwn
                          ? `bg-[#00d4ff] text-black rounded-tr-sm ${isPending ? 'opacity-60' : ''}`
                          : 'bg-white/10 text-white rounded-tl-sm'
                      }`}>
                        {msg.message}
                      </div>
                      <div className="flex items-center gap-1 px-1">
                        <span className="text-[10px] text-gray-600">{formatTime(msg.timestamp)}</span>
                        {isOwn && isPending && (
                          <span className="text-[10px] text-gray-600">·</span>
                        )}
                        {isOwn && isPending && (
                          <span className="text-[10px] text-gray-500">sending…</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#00d4ff] text-black text-xs font-semibold shadow-lg shadow-[#00d4ff]/30 hover:bg-[#00d4ff]/90 transition-all"
          >
            <ChevronDown className="w-3 h-3" />
            New messages
          </button>
        )}
      </div>

      {/* ── Quick Replies ── */}
      {showQuickReplies && (
        <div className="px-3 py-2 border-t border-white/5 flex gap-2 overflow-x-auto scrollbar-none flex-shrink-0">
          {quickReplies.map(qr => (
            <button key={qr.key}
              onClick={() => handleSend(language === 'ka' ? qr.ka : qr.en)}
              className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs text-[#00d4ff] border border-[#00d4ff]/30 hover:bg-[#00d4ff]/10 transition-colors whitespace-nowrap"
            >
              {language === 'ka' ? qr.ka : qr.en}
            </button>
          ))}
        </div>
      )}

      {/* ── Input ── */}
      <div className="px-3 py-2.5 border-t border-white/8 flex-shrink-0 bg-[#0a0a18]">
        <div className="flex items-end gap-2">
          {/* Quick reply toggle */}
          <button
            onClick={() => setShowQuickReplies(p => !p)}
            className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-colors mb-0.5 ${
              showQuickReplies ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'text-gray-600 hover:text-gray-400'
            }`}
            title="Quick replies"
          >
            <span className="text-base">⚡</span>
          </button>

          {/* Text input */}
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={e => setNewMessage(e.target.value.slice(0, maxChars))}
              onKeyDown={handleKeyDown}
              placeholder={t('type_message')}
              disabled={sending}
              className="w-full bg-white/8 border-white/10 text-white text-sm placeholder:text-gray-600 rounded-xl pr-10 focus:border-[#00d4ff]/40 focus:ring-0 resize-none"
            />
            {charCount > 400 && (
              <span className={`absolute right-2 bottom-2 text-[10px] ${charCount >= maxChars ? 'text-red-400' : 'text-gray-500'}`}>
                {maxChars - charCount}
              </span>
            )}
          </div>

          {/* Send */}
          <button
            onClick={() => handleSend()}
            disabled={sending || !newMessage.trim()}
            className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all mb-0.5 ${
              newMessage.trim()
                ? 'bg-[#00ff88] text-black hover:bg-[#00ff88]/90 shadow-md shadow-[#00ff88]/30'
                : 'bg-white/8 text-gray-600 cursor-not-allowed'
            }`}
          >
            {sending
              ? <div className="w-3 h-3 border-2 border-black/40 border-t-black rounded-full animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CHAT BUTTON (same as before but improved)
// ─────────────────────────────────────────────────────────────────────────────
export const ChatButton = ({ rideId, unreadCount, onClick }) => {
  const { t } = useLanguage();
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/20 transition-colors text-sm font-medium"
    >
      <MessageCircle className="w-4 h-4" />
      {t('chat')}
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export default ChatWidget;