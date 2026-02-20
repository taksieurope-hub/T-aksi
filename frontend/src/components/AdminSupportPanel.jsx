// AdminSupportPanel.jsx - Admin Support Ticket Management
import React, { useState, useEffect } from "react";
import { 
  MessageSquare, AlertTriangle, CheckCircle, Clock, 
  User, Phone, Calendar, ChevronRight, Filter,
  Shield, Send, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import api from "@/api";
import { toast } from "sonner";

const AdminSupportPanel = () => {
  const [tickets, setTickets] = useState([]);
  const [sosAlerts, setSOSAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [filter, setFilter] = useState("escalated");

  useEffect(() => {
    fetchData();
    // Poll for new alerts every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchData = async () => {
    try {
      const [ticketsRes, sosRes] = await Promise.all([
        filter === "escalated" 
          ? api.get("/admin/support/tickets/escalated")
          : api.get(`/admin/support/tickets?status=${filter}`),
        api.get("/admin/sos/active")
      ]);
      
      setTickets(ticketsRes.data.tickets || []);
      setSOSAlerts(sosRes.data.alerts || []);
    } catch (error) {
      console.error("Failed to fetch support data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (resolve = false) => {
    if (!adminResponse.trim()) {
      toast.error("Please enter a response");
      return;
    }

    try {
      await api.post(`/admin/support/tickets/${selectedTicket.id}/respond`, null, {
        params: { response: adminResponse, resolve }
      });
      
      toast.success(resolve ? "Ticket resolved" : "Response sent");
      setSelectedTicket(null);
      setAdminResponse("");
      fetchData();
    } catch (error) {
      toast.error("Failed to respond");
    }
  };

  const handleResolveTicket = async (ticketId) => {
    try {
      await api.post(`/admin/support/tickets/${ticketId}/resolve`);
      toast.success("Ticket resolved");
      fetchData();
    } catch (error) {
      toast.error("Failed to resolve");
    }
  };

  const handleResolveSOSClick = async (alertId) => {
    try {
      await api.post(`/admin/sos/${alertId}/resolve`);
      toast.success("SOS alert resolved");
      fetchData();
    } catch (error) {
      toast.error("Failed to resolve SOS");
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case "urgent": return "bg-red-500";
      case "high": return "bg-orange-500";
      case "medium": return "bg-yellow-500";
      default: return "bg-green-500";
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "escalated": return "bg-red-500/20 text-red-400 border-red-500/30";
      case "in_progress": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "resolved": return "bg-green-500/20 text-green-400 border-green-500/30";
      default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  return (
    <div className="space-y-6">
      {/* SOS Alerts - Always visible at top */}
      {sosAlerts.length > 0 && (
        <Card className="bg-red-950/50 border-red-500 animate-pulse-slow">
          <CardHeader className="pb-2">
            <CardTitle className="text-red-400 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Active SOS Alerts ({sosAlerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sosAlerts.map((alert) => (
              <div 
                key={alert.id}
                className="bg-red-900/30 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <AlertTriangle className="w-8 h-8 text-red-400 animate-pulse" />
                  <div>
                    <p className="font-bold text-white">{alert.user_name}</p>
                    <p className="text-sm text-red-200">{alert.user_phone}</p>
                    <p className="text-xs text-red-300 mt-1">{alert.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    href={`https://maps.google.com/?q=${alert.lat},${alert.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm hover:underline"
                  >
                    View Location
                  </a>
                  <Button
                    size="sm"
                    onClick={() => handleResolveSOSClick(alert.id)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Resolve
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Support Tickets */}
      <Card className="glass-heavy border-primary/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-primary flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Support Tickets
            </CardTitle>
            <div className="flex gap-2">
              {["escalated", "in_progress", "resolved", "ai_handled"].map((status) => (
                <Button
                  key={status}
                  variant={filter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(status)}
                  className={filter === status 
                    ? "bg-primary text-black" 
                    : "border-primary/30 text-primary"}
                >
                  {status.replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No tickets in this category</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="bg-background-secondary rounded-lg p-4 hover:bg-background-tertiary transition-colors cursor-pointer"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${getPriorityColor(ticket.priority)}`} />
                        <span className="font-medium text-white">{ticket.user_name}</span>
                        <Badge variant="outline" className={getStatusColor(ticket.status)}>
                          {ticket.status}
                        </Badge>
                        <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                          {ticket.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{ticket.message}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {ticket.user_phone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(ticket.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Modal */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="glass-heavy border-primary/30 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Ticket #{selectedTicket?.id?.slice(-6)}
            </DialogTitle>
          </DialogHeader>

          {selectedTicket && (
            <div className="space-y-4">
              {/* User Info */}
              <div className="bg-background-secondary rounded-lg p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{selectedTicket.user_name}</p>
                    <p className="text-sm text-muted-foreground">{selectedTicket.user_phone}</p>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Badge className={getPriorityColor(selectedTicket.priority)}>
                      {selectedTicket.priority}
                    </Badge>
                    <Badge variant="outline" className={getStatusColor(selectedTicket.status)}>
                      {selectedTicket.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* User Message */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">User Message</p>
                <div className="bg-background-tertiary rounded-lg p-4">
                  <p className="text-white">{selectedTicket.message}</p>
                </div>
              </div>

              {/* AI Response */}
              {selectedTicket.ai_response && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">AI Response</p>
                  <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                    <p className="text-white whitespace-pre-wrap">{selectedTicket.ai_response}</p>
                  </div>
                </div>
              )}

              {/* Admin Response */}
              {selectedTicket.status !== "resolved" && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Your Response</p>
                  <Textarea
                    value={adminResponse}
                    onChange={(e) => setAdminResponse(e.target.value)}
                    placeholder="Type your response to the user..."
                    className="bg-background-secondary border-border text-white"
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleRespond(false)}
                      variant="outline"
                      className="flex-1 border-primary text-primary"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Send Response
                    </Button>
                    <Button
                      onClick={() => handleRespond(true)}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Resolve & Send
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSupportPanel;
