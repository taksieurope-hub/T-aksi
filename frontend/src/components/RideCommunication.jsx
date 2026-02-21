import React, { useState, useEffect, useRef } from "react";
import { Phone, MessageCircle, X, Send, Loader2 } from "lucide-react";
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // Polling Engine for Active Chat
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

    fetchMessages(); // Initial fetch
    const interval = setInterval(fetchMessages, 3000); // Poll every 3 seconds
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
      // Optimistic UI update
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender_id: currentUserId,
        message: messageText,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 mt-4">
      {/* 📞 Call Button */}
      {otherPartyPhone && (
        <a href={`tel:${otherPartyPhone}`} className="flex-1">
          <Button variant="outline" className={`w-full ${themeColor} hover:${themeBg} hover:text-black transition-colors`}>
            <Phone className="w-4 h-4 mr-2" /> Call
          </Button>
        </a>
      )}

      {/* 💬 Chat Button */}
      <Button 
        variant="outline" 
        className={`flex-1 ${themeColor} hover:${themeBg} hover:text-black transition-colors`}
        onClick={() => setIsOpen(true)}
      >
        <MessageCircle className="w-4 h-4 mr-2" /> Chat
      </Button>

      {/* 🗨️ Chat Popup Window */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/60 backdrop-blur-sm">
          <Card className={`w-full max-w-md h-[500px] flex flex-col bg-black border ${themeColor} shadow-2xl animate-in slide-in-from-bottom-10`}>
            
            {/* Header */}
            <div className={`p-4 border-b ${themeColor.replace('text', 'border')}/30 flex justify-between items-center`}>
              <div>
                <h3 className={`font-bold ${themeColor.split(' ')[1]}`}>
                  Contact {otherPartyName || (isDriver ? "Rider" : "Driver")}
                </h3>
              </div>
              <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white" onClick={() => setIsOpen(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-black/50">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                  Send a message to coordinate pickup.
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === currentUserId;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        isMe 
                          ? `${themeBg} text-black rounded-br-sm` 
                          : "bg-gray-800 text-white border border-gray-700 rounded-bl-sm"
                      }`}>
                        <p className="text-sm">{msg.message}</p>
                        <p className={`text-[10px] mt-1 ${isMe ? "text-black/60" : "text-gray-400"}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className={`p-3 border-t ${themeColor.replace('text', 'border')}/30 bg-black flex gap-2`}>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className={`flex-1 bg-gray-900 border-gray-800 text-white focus-visible:ring-1 focus-visible:ring-${themeColor.split('-')[1].replace(']', '')}`}
              />
              <Button type="submit" disabled={!input.trim() || loading} className={`${themeBg} text-black hover:opacity-80`}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default RideCommunication;