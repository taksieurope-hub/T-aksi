// ShareTripModal.jsx - Share Trip with Friends/Family
import React, { useState } from "react";
import { Share2, Copy, Check, MessageCircle, Mail, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import api from "@/api";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageContext";

const ShareTripModal = ({ isOpen, onClose, rideId }) => {
  const { t } = useLanguage();
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    try {
      const res = await api.post(`/rides/${rideId}/share`, {
        ride_id: rideId,
        recipient_phone: phone || null,
        recipient_email: email || null
      });
      setShareLink(res.data.share_link);
      toast.success(t('link_generated') || "Share link generated!");
    } catch (error) {
      toast.error("Failed to generate share link");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast.success(t('copied') || "Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  const shareViaWhatsApp = () => {
    const text = encodeURIComponent(`Track my T'aksi ride: ${shareLink}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const shareViaSMS = () => {
    const text = encodeURIComponent(`Track my T'aksi ride: ${shareLink}`);
    window.open(`sms:?body=${text}`, '_blank');
  };

  const shareViaEmail = () => {
    const subject = encodeURIComponent("Track my T'aksi ride");
    const body = encodeURIComponent(`I'm sharing my live ride location with you.\n\nTrack here: ${shareLink}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-heavy border-primary/30 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary text-center flex items-center justify-center gap-2">
            <Share2 className="w-5 h-5" />
            {t('share_trip') || "Share Your Trip"}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {t('share_trip_desc') || "Let friends and family track your ride in real-time"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!shareLink ? (
            <>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t('phone_optional') || "Phone (optional)"}</label>
                <Input
                  type="tel"
                  placeholder="+995 XXX XXX XXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="bg-background-secondary border-border text-white"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">{t('email_optional') || "Email (optional)"}</label>
                <Input
                  type="email"
                  placeholder="friend@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background-secondary border-border text-white"
                />
              </div>

              <Button
                onClick={generateLink}
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-secondary text-black font-bold"
                data-testid="generate-share-link"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    {t('generating') || "Generating..."}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    {t('generate_link') || "Generate Share Link"}
                  </span>
                )}
              </Button>
            </>
          ) : (
            <>
              {/* Share Link Display */}
              <div className="bg-background-secondary rounded-xl p-4 space-y-3">
                <p className="text-sm text-muted-foreground">{t('share_link') || "Share Link"}</p>
                <div className="flex gap-2">
                  <Input
                    value={shareLink}
                    readOnly
                    className="bg-background border-border text-white text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyToClipboard}
                    className="border-primary text-primary hover:bg-primary hover:text-black"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Quick Share Options */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">{t('quick_share') || "Quick Share"}</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    onClick={shareViaWhatsApp}
                    className="flex-col h-auto py-3 border-green-500/30 text-green-400 hover:bg-green-500/10"
                  >
                    <MessageCircle className="w-5 h-5 mb-1" />
                    <span className="text-xs">WhatsApp</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={shareViaSMS}
                    className="flex-col h-auto py-3 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  >
                    <MessageCircle className="w-5 h-5 mb-1" />
                    <span className="text-xs">SMS</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={shareViaEmail}
                    className="flex-col h-auto py-3 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  >
                    <Mail className="w-5 h-5 mb-1" />
                    <span className="text-xs">Email</span>
                  </Button>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                {t('share_privacy') || "Only your trip status and location will be visible"}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareTripModal;
