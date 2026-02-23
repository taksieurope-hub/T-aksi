import React, { useState, useEffect, useRef } from "react";
import { Phone, MessageSquare, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import api from "@/api";
import { toast } from "sonner"; // For toast notifications

const RideCommunication = ({ rideId, otherPartyPhone, otherPartyName, currentUserId, isDriver }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Audio & Notification state
  const [hasUnread, setHasUnread] = useState(false);
  const previousMessageCount = useRef(0);
  const messagesEndRef = useRef(null);

  const themeColor = isDriver ? "border-[#00d4ff] text-[#00d4ff]" : "border-[#00ff88] text-[#00ff88]";
  const themeBg = isDriver ? "bg-[#00d4ff]" : "bg-[#00ff88]";

  // 🔥 NEW: Play a clean message "Ding!"
  const playMessageSound = () => {
    const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
    audio.play().catch(e => console.log("Browser blocked auto-play:", e));
  };

  // Scroll Logic
  useEffect(() => {
    if (messages.length > 0 && isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isOpen]);

  // Polling Engine & Notification Trigger
  useEffect(() => {
    if (!rideId) return;

    const fetchMessages = async () => {
      try {
        const res = await api.get(`/rides/${rideId}/chat`);
        if (res.data && res.data.messages) {
          const newMessages = res.data.messages;
          
          // Check if we received NEW messages
          if (newMessages.length > previousMessageCount.current) {
            
            // Look at the very last message to see who sent it
            const lastMessage = newMessages[newMessages.length - 1];
            const isMe = String(lastMessage.sender_id) === String(currentUserId);
            
            if (!isMe) {
              playMessageSound();
              if (!isOpen) {
                setHasUnread(true);
                toast.info(`New message from ${otherPartyName || (isDriver ? "Rider" : "Driver")}`);
              }
            }
          }
          
          setMessages(newMessages);
          previousMessageCount.current = newMessages.length; // Update our tracker
        }
      } catch (error) {
        console.error("Failed to fetch chat:", error);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 3000); // Check every 3 seconds
    return () => clearInterval(interval);
  }, [isOpen, rideId, currentUserId, otherPartyName, isDriver]);

  // When they open the chat, clear the unread badge
  const handleOpenChat = () => {
    setIsOpen(true);
    setHasUnread(false);
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    const messageText = input.trim();
    setInput("");
    setLoading(true);

    try {
      await api.post(`/rides/${rideId}/chat`, { message: messageText });
      
      const optimisticMessage = {
        id: Date.now().toString(),
        sender_id: currentUserId,
        sender_type: isDriver ? "driver" : "rider", 
        message: messageText,
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, optimisticMessage]);
      previousMessageCount.current += 1; // Update tracker so we don't 'ding' ourselves on next poll

    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Failed to send message");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 mt-4 w-full">
      {/* 📞 Call Button - 🔥 FIXED to use native <a> tag for mobile dialer */}
      <a 
        href={`tel:${otherPartyPhone}`}
        className={`flex-1 flex items-center justify-center h-10 rounded-md border text-sm font-medium ${themeColor} hover:${themeBg} hover:text-black transition-colors`}
      >
        <Phone className="w-4 h-4 mr-2" /> Call
      </a>

      {/* 💬 Chat Button with Unread Badge */}
      <Button 
        variant="outline" 
        className={`flex-1 relative ${themeColor} hover:${themeBg} hover:text-black transition-colors`}
        onClick={handleOpenChat}
      >
        <MessageSquare className="w-4 h-4 mr-2" /> Chat
        {hasUnread && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        )}
      </Button>

      {/* 🗨️ Chat Popup Window */}
      {isOpen && (
        <div className="fixed inset-0 z-[10500] p-4 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          
          <Card className={`w-full max-w-md h-[600px] max-h-full flex flex-col bg-black border-2 rounded-2xl ${themeColor.replace('text', 'border')} shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 duration-200`}>
            
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#111] shrink-0">
              <div>
                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Live Chat</p>
                <h3 className={`font-bold text-lg ${isDriver ? 'text-[#00d4ff]' : 'text-[#00ff88]'}`}>
                  {otherPartyName || (isDriver ? "Rider" : "Driver")}
                </h3>
              </div>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-white bg-gray-800 hover:bg-red-500 rounded-full h-10 w-10 border border-gray-600 transition-colors shrink-0" 
                onClick={() => setIsOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Message Area */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-4 bg-black/40 w-full">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm italic px-6 text-center">
                  No messages yet. Send a message to coordinate.
                </div>
              ) : (
                messages.map((msg, i) => {
                  let isMe = false;
                  const role = msg.sender_type || msg.sender_role; 
                  
                  if (role) {
                    isMe = (isDriver && role === "driver") || (!isDriver && role === "rider");
                  } else {
                    isMe = String(msg.sender_id) === String(currentUserId);
                  }

                  const senderLabel = isMe ? "You" : (isDriver ? "Rider" : "Driver");

                  return (
                    <div key={msg.id || i} className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] w-fit rounded-2xl px-3 py-2 flex flex-col ${
                        isMe 
                          ? `${themeBg} text-black rounded-tr-none shadow-md` 
                          : "bg-gray-800 text-white border border-gray-700 rounded-tl-none"
                      }`}>
                        
                        <span className="text-[9px] font-bold uppercase opacity-50 mb-0.5">
                          {senderLabel}
                        </span>
                        
                        <span className="text-sm leading-snug break-words whitespace-pre-wrap">
                          {msg.message}
                        </span>
                        <span className={`text-[9px] mt-1 opacity-50 self-end`}>
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-3 sm:p-4 border-t border-white/10 bg-black flex gap-2 shrink-0">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-gray-900 border-gray-800 text-white h-12 rounded-xl focus-visible:ring-[#00ff88]"
              />
              <Button type="submit" disabled={!input.trim() || loading} className={`${themeBg} text-black w-12 h-12 rounded-xl hover:opacity-80 shrink-0`}>
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