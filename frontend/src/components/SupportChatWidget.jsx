// SupportChatWidget.jsx - AI Support Chat Component
import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import api from "@/api";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

const SupportChatWidget = () => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  
  // Chat State
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! I'm T'aksi AI Support. How can I help you today?",
      timestamp: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  
  // 🎟️ NEW: Ticket Tracking State
  const [activeTicketId, setActiveTicketId] = useState(null);
  const [ticketStatus, setTicketStatus] = useState("open");

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 🔄 NEW: THE POLLING ENGINE (Listens for Admin Replies)
  useEffect(() => {
    // Only poll if we have an active ticket, the chat is open, and it isn't closed yet
    if (!activeTicketId || ticketStatus === "closed" || !isOpen) return;

    const pollMessages = async () => {
      try {
        // 👇 MAKE SURE THIS MATCHES YOUR BACKEND ROUTE FOR FETCHING TICKETS
        const res = await api.get(`/support/tickets/${activeTicketId}`);
        
        if (res.data && res.data.messages) {
          // Replace local chat with the live database chat (reveals admin messages)
          setMessages(res.data.messages);
          
          // Lock the chat if the admin closed it
          if (res.data.status === "closed") {
            setTicketStatus("closed");
          }
        }
      } catch (error) {
        console.error("Failed to poll chat updates:", error);
      }
    };

    const interval = setInterval(pollMessages, 3000); // Check every 3 seconds
    return () => clearInterval(interval);
  }, [activeTicketId, ticketStatus, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    // Show user message instantly
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const payload = { 
        message: userMessage.content,
        ticket_id: activeTicketId 
      };
      
      const res = await api.post("/support/message", payload);
      
      const currentTicketId = res.data.ticket_id || activeTicketId;
      if (!activeTicketId && currentTicketId) {
        setActiveTicketId(currentTicketId);
      }

      // 🔥 THE FIX: ONLY inject this message if the chat just started!
      // If it's an ongoing chat with an admin, we stay silent and let the polling handle it.
      if (!activeTicketId) {
        const assistantMessage = {
          role: "assistant",
          content: "We appreciate you contacting us, I have forwarded your ticket to our support team and someone will get back to you promptly.",
          timestamp: new Date().toISOString(),
          escalated: true,
          ticketId: currentTicketId
        };
        setMessages(prev => [...prev, assistantMessage]);
      }

    } catch (error) {
      console.error("Support error:", error);
      toast.error("Failed to send message. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center shadow-[0_0_15px_rgba(0,255,136,0.3)] hover:shadow-[0_0_25px_rgba(0,255,136,0.6)] transition-all"
          >
            <MessageCircle className="w-6 h-6 text-black" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-48px)] h-[500px] max-h-[calc(100vh-120px)]"
          >
            <Card className="h-full flex flex-col bg-black/90 border border-[#00ff88]/30 overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
              
              {/* Header */}
              <div className="p-4 border-b border-[#00ff88]/20 flex items-center justify-between bg-black">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#00ff88] to-[#00d4ff] flex items-center justify-center">
                    <Bot className="w-5 h-5 text-black" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#00ff88]">T'aksi Support</h3>
                    <p className="text-xs text-[#00d4ff]">
                      {ticketStatus === "closed" ? "Ticket Closed" : "Live Assistance"}
                    </p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                        msg.role === "user"
                          ? "bg-[#00ff88] text-black rounded-br-sm"
                          : msg.role === "admin"
                          ? "bg-blue-600 border border-blue-400 text-white rounded-bl-sm shadow-[0_0_10px_rgba(37,99,235,0.3)]"
                          : msg.isError
                          ? "bg-red-500/20 text-red-400 border border-red-500/30 rounded-bl-sm"
                          : "bg-gray-800 border border-gray-700 text-white rounded-bl-sm"
                      }`}
                    >
                      {/* Admin Tag */}
                      {msg.role === "admin" && (
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200 mb-1 flex items-center">
                          <ShieldCheck className="w-3 h-3 mr-1" /> Human Support
                        </p>
                      )}
                      
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      
                      {/* Escalated Tag */}
                      {msg.escalated && msg.role === "assistant" && (
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-yellow-400 uppercase font-bold tracking-wider">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Forwarded to Human Support</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#00ff88]" />
                        <span className="text-sm text-gray-400">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 border-t border-[#00ff88]/20 bg-black">
                {ticketStatus === "closed" ? (
                  <div className="text-center p-3 border border-gray-700 bg-gray-900 rounded-lg">
                    <p className="text-sm text-gray-400">This ticket has been closed by an admin.</p>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Type your message..."
                      className="flex-1 bg-gray-900 border-gray-700 text-white focus-visible:ring-[#00ff88]"
                      disabled={loading}
                    />
                    <Button
                      onClick={handleSend}
                      disabled={!input.trim() || loading}
                      className="bg-[#00ff88] hover:bg-[#00d4ff] text-black transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SupportChatWidget;