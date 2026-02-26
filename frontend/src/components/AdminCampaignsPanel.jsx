// AdminCampaignsPanel.jsx - Driver Incentive Campaigns Management
import React, { useState, useEffect } from "react";
import { 
  Gift, Plus, Calendar, Target, DollarSign, Users, Trophy,
  Zap, Star, Flame, Banknote, Rocket, Clock, Edit, Trash2,
  Play, Pause, CheckCircle, ChevronRight, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
// BUG FIX: Added missing DialogDescription import (was causing a React crash)
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import api from "@/api";
import { toast } from "sonner";

const CAMPAIGN_ICONS = {
  gift:     { icon: Gift,     emoji: "🎁" },
  trophy:   { icon: Trophy,   emoji: "🏆" },
  zap:      { icon: Zap,      emoji: "⚡" },
  star:     { icon: Star,     emoji: "⭐" },
  flame:    { icon: Flame,    emoji: "🔥" },
  banknote: { icon: Banknote, emoji: "💰" },
  rocket:   { icon: Rocket,   emoji: "🚀" },
  target:   { icon: Target,   emoji: "🎯" },
  clock:    { icon: Clock,    emoji: "⏰" },
};

const CAMPAIGN_TYPES = [
  { value: "rides_count",    label: "Complete X Rides",    description: "Driver completes target number of rides" },
  { value: "earnings_target",label: "Earnings Target",     description: "Driver earns target amount" },
  { value: "peak_hours",     label: "Peak Hour Rides",     description: "Rides during specified peak hours" },
  { value: "rating_bonus",   label: "Rating Bonus",        description: "Maintain rating while completing rides" },
  { value: "streak",         label: "Daily Streak",        description: "Complete rides on consecutive days" },
  { value: "new_driver",     label: "New Driver Bonus",    description: "Special bonus for new drivers" },
];

// BUG FIX: Safe date formatter — Firestore can return Timestamps (objects with .seconds),
// ISO strings, or already-Date objects. All three cases handled here.
const safeFormatDate = (value) => {
  if (!value) return "N/A";
  try {
    // Firestore Timestamp object (has .seconds)
    if (value && typeof value === "object" && value.seconds != null) {
      return new Date(value.seconds * 1000).toLocaleDateString();
    }
    // ISO string or number
    const d = new Date(value);
    if (isNaN(d.getTime())) return "N/A";
    return d.toLocaleDateString();
  } catch {
    return "N/A";
  }
};

const AdminCampaignsPanel = () => {
  const [campaigns,          setCampaigns]          = useState([]);
  const [templates,          setTemplates]          = useState({});
  const [loading,            setLoading]            = useState(true);
  const [showCreateModal,    setShowCreateModal]    = useState(false);
  const [showTemplateModal,  setShowTemplateModal]  = useState(false);
  const [selectedCampaign,   setSelectedCampaign]   = useState(null);
  const [filter,             setFilter]             = useState("active");

  const [formData, setFormData] = useState({
    title:         "",
    description:   "",
    campaign_type: "rides_count",
    target_value:  10,
    bonus_amount:  20,
    start_date:    new Date().toISOString().split("T")[0],
    end_date:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    min_rating:    null,
    icon:          "gift",
    color:         "#00d4ff",
  });

  useEffect(() => {
    fetchCampaigns();
    fetchTemplates();
  }, [filter]);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/campaigns${filter ? `?status=${filter}` : ""}`);
      setCampaigns(res.data.campaigns || []);
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
      toast.error("Could not load campaigns");
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await api.get("/admin/campaigns/templates");
      setTemplates(res.data.templates || {});
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    }
  };

  const handleCreateCampaign = async () => {
    try {
      await api.post("/admin/campaigns", {
        ...formData,
        start_date: new Date(formData.start_date).toISOString(),
        end_date:   new Date(formData.end_date).toISOString(),
      });
      toast.success("Campaign created successfully!");
      setShowCreateModal(false);
      resetForm();
      fetchCampaigns();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create campaign");
    }
  };

  const handleCreateFromTemplate = async (templateId) => {
    try {
      const startDate = new Date().toISOString();
      const endDate   = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await api.post(`/admin/campaigns/from-template/${templateId}`, null, {
        params: { start_date: startDate, end_date: endDate },
      });
      toast.success("Campaign created from template!");
      setShowTemplateModal(false);
      fetchCampaigns();
    } catch (error) {
      toast.error("Failed to create campaign from template");
    }
  };

  const handleUpdateStatus = async (campaignId, newStatus) => {
    try {
      await api.put(`/admin/campaigns/${campaignId}`, { status: newStatus });
      toast.success(`Campaign ${newStatus}`);
      fetchCampaigns();
    } catch (error) {
      toast.error("Failed to update campaign");
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!window.confirm("Are you sure you want to cancel this campaign?")) return;
    try {
      await api.delete(`/admin/campaigns/${campaignId}`);
      toast.success("Campaign cancelled");
      fetchCampaigns();
    } catch (error) {
      toast.error("Failed to cancel campaign");
    }
  };

  const resetForm = () => {
    setFormData({
      title:         "",
      description:   "",
      campaign_type: "rides_count",
      target_value:  10,
      bonus_amount:  20,
      start_date:    new Date().toISOString().split("T")[0],
      end_date:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      min_rating:    null,
      icon:          "gift",
      color:         "#00d4ff",
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      active:    "bg-green-500/20 text-green-400 border-green-500/30",
      paused:    "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      completed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
    };
    return styles[status] || styles.active;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Gift className="w-6 h-6" />
            Driver Campaigns
          </h2>
          <p className="text-muted-foreground">Create incentive campaigns to motivate drivers</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowTemplateModal(true)}
            className="border-secondary text-secondary"
          >
            <Rocket className="w-4 h-4 mr-2" />
            Quick Template
          </Button>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-primary to-secondary text-black"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Campaign
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {["active", "paused", "completed", "cancelled"].map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
            className={filter === status
              ? "bg-primary text-black"
              : "border-primary/30 text-primary"}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {/* Campaigns Grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card className="glass-heavy border-primary/30">
          <CardContent className="py-12 text-center">
            <Gift className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No {filter} campaigns</p>
            <Button
              className="mt-4 bg-primary text-black"
              onClick={() => setShowCreateModal(true)}
            >
              Create Your First Campaign
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              className="glass-heavy border-primary/30 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => setSelectedCampaign(campaign)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: `${campaign.color || "#00d4ff"}20` }}
                  >
                    {campaign.emoji || "🎁"}
                  </div>
                  <Badge variant="outline" className={getStatusBadge(campaign.status)}>
                    {campaign.status}
                  </Badge>
                </div>
                <CardTitle className="text-white mt-2">{campaign.title}</CardTitle>
                <CardDescription className="text-muted-foreground line-clamp-2">
                  {campaign.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Target className="w-4 h-4" /> Target
                    </span>
                    <span className="text-white font-medium">{campaign.target_value}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Banknote className="w-4 h-4" /> Bonus
                    </span>
                    <span className="text-secondary font-bold">₾{campaign.bonus_amount}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="w-4 h-4" /> Participants
                    </span>
                    <span className="text-white">{campaign.participants_count || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" /> Completed
                    </span>
                    <span className="text-primary">{campaign.completions_count || 0}</span>
                  </div>

                  {/* BUG FIX: safeFormatDate() handles Firestore Timestamps, ISO strings, and nulls */}
                  <div className="pt-2 border-t border-border text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {safeFormatDate(campaign.start_date)} – {safeFormatDate(campaign.end_date)}
                  </div>

                  {/* Actions */}
                  {campaign.status === "active" && (
                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(campaign.id, "paused"); }}
                        className="flex-1 border-yellow-500/30 text-yellow-400"
                      >
                        <Pause className="w-3 h-3 mr-1" /> Pause
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(campaign.id); }}
                        className="border-red-500/30 text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  {campaign.status === "paused" && (
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleUpdateStatus(campaign.id, "active"); }}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      <Play className="w-3 h-3 mr-1" /> Resume
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* CREATE CAMPAIGN MODAL                                               */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="glass-heavy border-primary/30 sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create New Campaign
            </DialogTitle>
            <DialogDescription>
              Set up an incentive campaign for your drivers
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Campaign Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Weekend Warrior"
                className="bg-background-secondary border-border text-white"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the campaign goal and reward..."
                className="bg-background-secondary border-border text-white"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign Type</Label>
                <Select
                  value={formData.campaign_type}
                  onValueChange={(v) => setFormData({ ...formData, campaign_type: v })}
                >
                  <SelectTrigger className="bg-background-secondary border-border text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background-secondary border-border">
                    {CAMPAIGN_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-white">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex gap-1 flex-wrap">
                  {Object.entries(CAMPAIGN_ICONS).map(([key, { emoji }]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFormData({ ...formData, icon: key })}
                      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-colors ${
                        formData.icon === key
                          ? "bg-primary/20 border-2 border-primary"
                          : "bg-background-secondary border border-border hover:border-muted-foreground"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Value</Label>
                <Input
                  type="number"
                  value={formData.target_value}
                  onChange={(e) => setFormData({ ...formData, target_value: parseFloat(e.target.value) })}
                  className="bg-background-secondary border-border text-white"
                />
                <p className="text-xs text-muted-foreground">
                  {formData.campaign_type === "rides_count"    && "Number of rides to complete"}
                  {formData.campaign_type === "earnings_target"&& "Amount in ₾ to earn"}
                  {formData.campaign_type === "streak"         && "Number of consecutive days"}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Bonus Amount (₾)</Label>
                <Input
                  type="number"
                  value={formData.bonus_amount}
                  onChange={(e) => setFormData({ ...formData, bonus_amount: parseFloat(e.target.value) })}
                  className="bg-background-secondary border-border text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="bg-background-secondary border-border text-white"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  className="bg-background-secondary border-border text-white"
                />
              </div>
            </div>

            {formData.campaign_type === "rating_bonus" && (
              <div className="space-y-2">
                <Label>Minimum Rating Required</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  value={formData.min_rating || ""}
                  onChange={(e) => setFormData({ ...formData, min_rating: parseFloat(e.target.value) || null })}
                  placeholder="e.g., 4.5"
                  className="bg-background-secondary border-border text-white"
                />
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 border-border text-muted-foreground"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateCampaign}
                className="flex-1 bg-gradient-to-r from-primary to-secondary text-black font-bold"
                disabled={!formData.title || !formData.description}
              >
                Create Campaign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* TEMPLATE SELECTION MODAL                                            */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="glass-heavy border-primary/30 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-primary flex items-center gap-2">
              <Rocket className="w-5 h-5" />
              Quick Templates
            </DialogTitle>
            <DialogDescription>
              Choose a pre-configured campaign template
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 py-4">
            {Object.entries(templates).length === 0 ? (
              <p className="text-muted-foreground col-span-2 text-center py-4">No templates available</p>
            ) : (
              Object.entries(templates).map(([id, template]) => (
                <Card
                  key={id}
                  className="bg-background-secondary border-border hover:border-primary/50 cursor-pointer transition-colors"
                  onClick={() => handleCreateFromTemplate(id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                        style={{ backgroundColor: `${template.color || "#00d4ff"}20` }}
                      >
                        {CAMPAIGN_ICONS[template.icon]?.emoji || "🎁"}
                      </div>
                      <div>
                        <p className="font-medium text-white">{template.title}</p>
                        <p className="text-xs text-muted-foreground">₾{template.bonus_amount} bonus</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* CAMPAIGN DETAIL MODAL                                               */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="glass-heavy border-primary/30 sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedCampaign && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
                    style={{ backgroundColor: `${selectedCampaign.color || "#00d4ff"}20` }}
                  >
                    {selectedCampaign.emoji || "🎁"}
                  </div>
                  <div>
                    <DialogTitle className="text-primary">{selectedCampaign.title}</DialogTitle>
                    <DialogDescription>{selectedCampaign.description}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Participants",  value: selectedCampaign.participants_count  || 0, color: "text-white"    },
                    { label: "Completed",     value: selectedCampaign.completions_count   || 0, color: "text-primary"  },
                    { label: "Per Driver",    value: `₾${selectedCampaign.bonus_amount}`,       color: "text-secondary"},
                    { label: "Total Paid",    value: `₾${selectedCampaign.total_bonus_paid || 0}`, color: "text-yellow-400"},
                  ].map(({ label, value, color }) => (
                    <Card key={label} className="bg-background-secondary border-border">
                      <CardContent className="p-3 text-center">
                        <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-muted-foreground">{label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Details */}
                <div className="bg-background-secondary rounded-lg p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="text-white capitalize">{selectedCampaign.campaign_type?.replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target</span>
                    <span className="text-white">{selectedCampaign.target_value}</span>
                  </div>
                  {/* BUG FIX: safeFormatDate used here too */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="text-white">
                      {safeFormatDate(selectedCampaign.start_date)} – {safeFormatDate(selectedCampaign.end_date)}
                    </span>
                  </div>
                  {selectedCampaign.min_rating && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Min Rating</span>
                      <span className="text-yellow-400">{selectedCampaign.min_rating}+ ⭐</span>
                    </div>
                  )}
                </div>

                {/* Participants */}
                {selectedCampaign.participants?.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Recent Participants</p>
                    <div className="space-y-2">
                      {selectedCampaign.participants.slice(0, 5).map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-background-secondary rounded-lg p-3">
                          <div>
                            <p className="text-white">{p.driver_name || "Driver"}</p>
                            <p className="text-xs text-muted-foreground">{p.driver_phone}</p>
                          </div>
                          <div className="text-right">
                            <Progress
                              value={Math.min(100, ((p.current_progress || 0) / (selectedCampaign.target_value || 1)) * 100)}
                              className="w-24 h-2"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              {p.current_progress || 0}/{selectedCampaign.target_value}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCampaignsPanel;