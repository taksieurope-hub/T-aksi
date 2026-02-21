import React, { useState, useEffect, useRef } from "react";
import { Phone, MessageSquare, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import api from "@/api";

const RideCommunication = ({ rideId, otherPartyPhone, otherPartyName, currentUserId, isDriver }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const themeColor = isDriver ? "border-[#00d4ff] text-[#00d4ff]" : "border-[#00ff88] text-[#00ff88]";
  const themeBg = isDriver ? "bg-[#00d4ff]" : "bg-[#00ff88]";

  // 1. Better Scroll Logic: Only snaps to bottom when a new message actually arrives
  useEffect(() => {
    if (messages.length > 0 && isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isOpen]);

  // 2. Polling Engine
  useEffect(() => {
    if (!isOpen || !rideId) return;

    const fetchMessages = async () => {
      try {
        const res = await api.get(`/rides/${rideId}/chat`);
        if (res.data && res.data.messages) {
          setMessages(res.data.messages);
        }
      } catch (error) {
        console.error("Failed to fetch chat:", error);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [isOpen, rideId]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const messageText = input.trim();
    setInput("");
    setLoading(true);

    try {
      await api.post(`/rides/${rideId}/chat`, { message: messageText });
      // Logic for Polling will pick up the real message
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 mt-4">
      {/* 📞 Call Button (Always visible to both) */}
      <Button 
        variant="outline" 
        className={`flex-1 ${themeColor} hover:${themeBg} hover:text-black transition-colors`}
        onClick={() => window.location.href = `tel:${otherPartyPhone}`}
      >
        <Phone className="w-4 h-4 mr-2" /> Call
      </Button>

      {/* 💬 Chat Button */}
      <Button 
        variant="outline" 
        className={`flex-1 ${themeColor} hover:${themeBg} hover:text-black transition-colors`}
        onClick={() => setIsOpen(true)}
      >
        <MessageSquare className="w-4 h-4 mr-2" /> Chat
      </Button>

      {/* 🗨️ Chat Popup Window */}
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <Card className={`w-full max-w-md h-[85vh] flex flex-col bg-black border ${themeColor} shadow-[0_0_50px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-200`}>
            
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black">
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Live Chat</p>
                <h3 className={`font-bold text-lg ${isDriver ? 'text-[#00d4ff]' : 'text-[#00ff88]'}`}>
                  {otherPartyName || (isDriver ? "Rider" : "Driver")}
                </h3>
              </div>
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={() => setIsOpen(false)}>
                <X className="w-6 h-6" />
              </Button>
            </div>

            {/* Message Area (Whose is Whose) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/40">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm italic">
                  No messages yet. Send a message to coordinate.
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isMe = String(msg.sender_id) === String(currentUserId);
                  return (
                    <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                        isMe 
                          ? `${themeBg} text-black rounded-tr-none shadow-lg` 
                          : "bg-gray-800 text-white border border-gray-700 rounded-tl-none"
                      }`}>
                        <p className="text-[9px] font-bold uppercase opacity-50 mb-1">
                          {isMe ? 'You' : (isDriver ? 'Rider' : 'Driver')}
                        </p>
                        <p className="text-sm leading-relaxed">{msg.message}</p>
                        <p className={`text-[8px] mt-1 text-right opacity-40`}>
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-4 border-t border-white/10 bg-black flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-900 border-gray-800 text-white h-12 rounded-xl focus-visible:ring-[#00ff88]"
              />
              <Button type="submit" disabled={!input.trim() || loading} className={`${themeBg} text-black w-12 h-12 rounded-xl hover:opacity-80`}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default RideCommunication;