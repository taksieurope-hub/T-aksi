// SOSButton.jsx - Emergency SOS Component
import React, { useState, useRef } from "react";
import { AlertTriangle, Phone, X, Shield, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import api from "@/api";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

const SOSButton = ({ rideId = null, variant = "floating" }) => {
  const { t } = useLanguage();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const countdownRef = useRef(null);

  const startCountdown = () => {
    setShowConfirm(true);
    setCountdown(5);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          triggerSOS();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelCountdown = () => {
    clearInterval(countdownRef.current);
    setCountdown(null);
    setShowConfirm(false);
  };

  const triggerSOS = async () => {
    setLoading(true);
    setShowConfirm(false);
    
    try {
      // Get current location
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000
        });
      });

      const res = await api.post("/sos", {
        ride_id: rideId,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        message: message || "Emergency! Need help!"
      });

      setShowSOS(true);
      toast.success(t('sos_triggered') || "Emergency services notified!");
    } catch (error) {
      toast.error(t('sos_error') || "Failed to send SOS. Please call emergency services directly.");
      // Show emergency number as fallback
      setShowSOS(true);
    } finally {
      setLoading(false);
    }
  };

  if (variant === "inline") {
    return (
      <>
        <Button
          variant="destructive"
          size="sm"
          onClick={startCountdown}
          className="bg-red-600 hover:bg-red-700"
          data-testid="sos-btn-inline"
        >
          <AlertTriangle className="w-4 h-4 mr-2" />
          SOS
        </Button>
        <SOSDialogs 
          showConfirm={showConfirm}
          countdown={countdown}
          cancelCountdown={cancelCountdown}
          showSOS={showSOS}
          setShowSOS={setShowSOS}
          message={message}
          setMessage={setMessage}
          loading={loading}
          triggerSOS={triggerSOS}
          t={t}
        />
      </>
    );
  }

  // Floating variant
  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={startCountdown}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shadow-lg hover:bg-red-700 transition-colors"
        data-testid="sos-btn-floating"
      >
        <Shield className="w-6 h-6 text-white" />
      </motion.button>
      
      <SOSDialogs 
        showConfirm={showConfirm}
        countdown={countdown}
        cancelCountdown={cancelCountdown}
        showSOS={showSOS}
        setShowSOS={setShowSOS}
        message={message}
        setMessage={setMessage}
        loading={loading}
        triggerSOS={triggerSOS}
        t={t}
      />
    </>
  );
};

// Extracted dialogs component
const SOSDialogs = ({ 
  showConfirm, countdown, cancelCountdown, 
  showSOS, setShowSOS, message, setMessage,
  loading, triggerSOS, t 
}) => (
  <>
    {/* Countdown Confirmation Dialog */}
    <Dialog open={showConfirm} onOpenChange={cancelCountdown}>
      <DialogContent className="bg-red-950 border-red-500 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-400 text-center flex items-center justify-center gap-2">
            <AlertTriangle className="w-6 h-6 animate-pulse" />
            {t('emergency_sos') || "Emergency SOS"}
          </DialogTitle>
          <DialogDescription className="text-center text-red-200">
            {t('sos_warning') || "Emergency services will be contacted"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 space-y-4">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto rounded-full bg-red-600 flex items-center justify-center mb-4">
              <span className="text-4xl font-bold text-white">{countdown}</span>
            </div>
            <p className="text-red-200">
              {t('sos_countdown') || "Sending SOS in"} {countdown} {t('seconds') || "seconds"}
            </p>
          </div>

          <Textarea
            placeholder={t('sos_message_placeholder') || "Describe your emergency (optional)"}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="bg-red-900/50 border-red-500/50 text-white placeholder:text-red-300/50"
            rows={2}
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={cancelCountdown}
              className="flex-1 border-red-500 text-red-400 hover:bg-red-900"
            >
              <X className="w-4 h-4 mr-2" />
              {t('cancel') || "Cancel"}
            </Button>
            <Button
              onClick={triggerSOS}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              disabled={loading}
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              {t('send_now') || "Send Now"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* SOS Sent Confirmation */}
    <Dialog open={showSOS} onOpenChange={setShowSOS}>
      <DialogContent className="bg-background border-primary/30 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary text-center">
            {t('help_on_way') || "Help is on the way!"}
          </DialogTitle>
        </DialogHeader>

        <div className="py-6 space-y-4 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          
          <p className="text-muted-foreground">
            {t('sos_sent_message') || "Your emergency has been reported. Stay calm."}
          </p>

          <div className="bg-background-secondary rounded-xl p-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t('emergency_contacts') || "Emergency Contacts"}</p>
            
            <a 
              href="tel:112" 
              className="flex items-center justify-center gap-2 text-lg font-bold text-primary hover:underline"
            >
              <Phone className="w-5 h-5" />
              112 - Emergency
            </a>
            
            <a 
              href="tel:022" 
              className="flex items-center justify-center gap-2 text-muted-foreground hover:text-white"
            >
              <Phone className="w-4 h-4" />
              022 - Police
            </a>
          </div>

          <Button 
            onClick={() => setShowSOS(false)}
            className="w-full bg-primary text-black"
          >
            {t('close') || "Close"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </>
);

export default SOSButton;
