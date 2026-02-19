import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Send, X, User, Car } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

const ChatWidget = ({ rideId, userType, API, onClose }) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchMessages = async () => {
    try {
      const res = await axios.get(`${API}/rides/${rideId}/chat`);
      setMessages(res.data.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));

    // Poll for new messages every 3 seconds
    pollIntervalRef.current = setInterval(fetchMessages, 3000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [rideId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      await axios.post(`${API}/rides/${rideId}/chat`, { message: newMessage });
      setNewMessage('');
      await fetchMessages();
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Card className="fixed bottom-4 right-4 w-80 sm:w-96 h-[450px] bg-black/95 backdrop-blur-xl border border-[#00d4ff]/30 shadow-2xl z-50 flex flex-col">
      <CardHeader className="pb-2 border-b border-[#00d4ff]/20 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#00d4ff] flex items-center text-sm">
            <MessageCircle className="w-4 h-4 mr-2" />
            {userType === 'rider' ? t('chat_with_driver') : t('chat_with_rider')}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-gray-400 hover:text-white h-8 w-8 p-0"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <ScrollArea className="flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              {t('loading')}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <MessageCircle className="w-12 h-12 mb-2 opacity-30" />
              <p>{t('no_messages')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const isOwn = msg.sender_type === userType;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] ${isOwn ? 'order-2' : 'order-1'}`}>
                      <div className={`flex items-center gap-1 mb-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        {!isOwn && (
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            msg.sender_type === 'driver' ? 'bg-[#00ff88]' : 'bg-[#00d4ff]'
                          }`}>
                            {msg.sender_type === 'driver' ? (
                              <Car className="w-3 h-3 text-black" />
                            ) : (
                              <User className="w-3 h-3 text-black" />
                            )}
                          </div>
                        )}
                        <span className="text-xs text-gray-500">
                          {!isOwn && msg.sender_name}
                          {!isOwn && ' • '}
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <div
                        className={`rounded-2xl px-4 py-2 ${
                          isOwn
                            ? 'bg-[#00d4ff] text-black rounded-tr-sm'
                            : 'bg-gray-800 text-white rounded-tl-sm'
                        }`}
                      >
                        <p className="text-sm break-words">{msg.message}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </ScrollArea>

        <form 
          onSubmit={handleSend} 
          className="p-3 border-t border-[#00d4ff]/20 flex-shrink-0"
        >
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={t('type_message')}
              className="flex-1 bg-black/50 border-[#00d4ff]/30 text-white placeholder:text-gray-500"
              disabled={sending}
            />
            <Button 
              type="submit" 
              size="icon"
              className="bg-[#00ff88] text-black hover:bg-[#00ff88]/80"
              disabled={sending || !newMessage.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

// Chat toggle button component
export const ChatButton = ({ rideId, unreadCount, onClick }) => {
  const { t } = useLanguage();
  
  return (
    <Button
      onClick={onClick}
      className="bg-[#00d4ff] text-black hover:bg-[#00d4ff]/80 relative"
    >
      <MessageCircle className="w-4 h-4 mr-2" />
      {t('chat')}
      {unreadCount > 0 && (
        <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-xs h-5 w-5 flex items-center justify-center p-0 rounded-full">
          {unreadCount}
        </Badge>
      )}
    </Button>
  );
};

export default ChatWidget;
