import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, Send, X, Car, User, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import api from '@/api';

// Quick reply templates
const QUICK_REPLIES = {
  rider: [
    { key: 'on_my_way',   en: "I'm on my way",         ka: "მოვდივარ" },
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

const formatTime = (ts) => {
  if (!ts) return '';
  try {
    const date = typeof ts === 'string' ? new Date(ts) : new Date(ts.seconds * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

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
      if (fetched.length > lastMessageCount.current) {
        lastMessageCount.current = fetched.length;
        const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
        if (el && (el.scrollHeight - el.scrollTop - el.clientHeight < 120)) {
          scrollToBottom();
        } else {
          setShowScrollBtn(true);
        }
      }
    } catch { setConnected(false); }
  }, [rideId, scrollToBottom]);

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => {
      setLoading(false);
      setTimeout(() => scrollToBottom(false), 100);
    });
    api.post(`/rides/${rideId}/chat/read`).catch(() => {});
    onRead?.();
    pollIntervalRef.current = setInterval(fetchMessages, 3000);
    return () => clearInterval(pollIntervalRef.current);
  }, [rideId, fetchMessages, onRead, scrollToBottom]);

  const handleSend = async (text) => {
    const msg = (text || newMessage).trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      await api.post(`/rides/${rideId}/chat`, { message: msg });
      setNewMessage('');
      fetchMessages();
      scrollToBottom();
    } catch { toast.error("Failed to send"); }
    finally { setSending(false); }
  };

  const quickReplies = QUICK_REPLIES[userType] || [];

  return (
    <div className="fixed bottom-4 right-4 w-[340px] sm:w-[380px] h-[500px] flex flex-col bg-[#08080f] border border-[#00d4ff]/25 rounded-2xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#00d4ff]/15 bg-[#0a0a18]">
        <span className="text-white text-sm font-bold">{userType === 'rider' ? t('chat_with_driver') : t('chat_with_rider')}</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex-1 relative">
        <ScrollArea className="h-full" ref={scrollAreaRef}>
          <div className="p-3 space-y-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender_type === userType ? 'justify-end' : 'justify-start'}`}>
                <div className={`px-3 py-2 rounded-xl text-sm ${msg.sender_type === userType ? 'bg-[#00d4ff] text-black' : 'bg-white/10 text-white'}`}>
                  {msg.message}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>
      <div className="p-3 border-t border-white/10 bg-[#0a0a18] flex gap-2">
        <Input 
          value={newMessage} 
          onChange={e => setNewMessage(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type..." 
          className="bg-white/5 border-white/10 text-white"
        />
        <Button onClick={() => handleSend()} disabled={sending} className="bg-[#00ff88] text-black">
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export const ChatButton = ({ unreadCount, onClick }) => (
  <button onClick={onClick} className="relative p-2 rounded-xl bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/30">
    <MessageCircle className="w-5 h-5" />
    {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">{unreadCount}</span>}
  </button>
);

export default ChatWidget;