// RatingModal.jsx - Driver/Rider Rating Component
import React, { useState } from "react";
import { Star, ThumbsUp, ThumbsDown, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import api from "@/api";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

const POSITIVE_TAGS = [
  { id: "clean_car", label: "Clean Car", icon: "✨" },
  { id: "friendly", label: "Friendly", icon: "😊" },
  { id: "professional", label: "Professional", icon: "👔" },
  { id: "fast", label: "Fast", icon: "⚡" },
  { id: "safe_driving", label: "Safe Driving", icon: "🛡️" },
  { id: "good_music", label: "Good Music", icon: "🎵" },
  { id: "helpful", label: "Helpful", icon: "🤝" }
];

const NEGATIVE_TAGS = [
  { id: "dirty_car", label: "Dirty Car", icon: "🚗" },
  { id: "rude", label: "Rude", icon: "😤" },
  { id: "slow", label: "Slow", icon: "🐢" },
  { id: "unsafe_driving", label: "Unsafe Driving", icon: "⚠️" },
  { id: "wrong_route", label: "Wrong Route", icon: "🗺️" },
  { id: "late", label: "Late", icon: "⏰" }
];

const RatingModal = ({ 
  isOpen, 
  onClose, 
  rideId, 
  ratingType = "driver", // "driver" or "rider"
  driverName = "Driver",
  onRatingComplete 
}) => {
  const { t } = useLanguage();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);

  const tags = rating >= 4 ? POSITIVE_TAGS : rating > 0 ? NEGATIVE_TAGS : [];

  const toggleTag = (tagId) => {
    setSelectedTags(prev => 
      prev.includes(tagId) 
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error(t('select_rating') || "Please select a rating");
      return;
    }

    setLoading(true);
    try {
      // Submit rating
      const endpoint = ratingType === "driver" 
        ? `/rides/${rideId}/rate/driver`
        : `/rides/${rideId}/rate/rider`;
      
      await api.post(endpoint, {
        rating,
        comment: comment.trim() || null,
        tags: selectedTags
      });

      // Submit tip if any
      if (tipAmount > 0 && ratingType === "driver") {
        await api.post(`/rides/${rideId}/tip`, { amount: tipAmount, ride_id: rideId });
      }

      toast.success(t('rating_submitted') || "Thank you for your feedback!");
      onRatingComplete?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to submit rating");
    } finally {
      setLoading(false);
    }
  };

  const tipOptions = [0, 1, 2, 5, 10];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-heavy border-primary/30 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary text-center font-heading">
            {t('rate_your_ride') || "Rate Your Ride"}
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {ratingType === "driver" 
              ? `How was your ride with ${driverName}?`
              : "Rate your passenger"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <motion.button
                key={star}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-1"
                data-testid={`star-${star}`}
              >
                <Star
                  className={`w-10 h-10 transition-colors ${
                    star <= (hoverRating || rating)
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground"
                  }`}
                />
              </motion.button>
            ))}
          </div>

          {/* Rating Label */}
          <p className="text-center text-lg font-medium text-white">
            {rating === 5 && "Excellent! 🌟"}
            {rating === 4 && "Great! 😊"}
            {rating === 3 && "Good 👍"}
            {rating === 2 && "Fair 😐"}
            {rating === 1 && "Poor 😔"}
            {rating === 0 && t('tap_to_rate') || "Tap to rate"}
          </p>

          {/* Tags */}
          <AnimatePresence mode="wait">
            {rating > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <p className="text-sm text-muted-foreground text-center">
                  {rating >= 4 ? "What did you like?" : "What could be better?"}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.id}
                      variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                      className={`cursor-pointer transition-all ${
                        selectedTags.includes(tag.id)
                          ? rating >= 4 
                            ? "bg-secondary text-black" 
                            : "bg-orange-500 text-black"
                          : "border-muted-foreground/30 text-muted-foreground hover:border-primary"
                      }`}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.icon} {tag.label}
                    </Badge>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Comment */}
          {rating > 0 && (
            <Textarea
              placeholder={t('add_comment') || "Add a comment (optional)"}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="bg-background-secondary border-border text-white resize-none"
              rows={2}
            />
          )}

          {/* Tip Section (only for driver rating) */}
          {ratingType === "driver" && rating >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2"
            >
              <p className="text-sm text-muted-foreground text-center">
                {t('add_tip') || "Add a tip for your driver?"}
              </p>
              <div className="flex justify-center gap-2">
                {tipOptions.map((amount) => (
                  <Button
                    key={amount}
                    variant={tipAmount === amount ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTipAmount(amount)}
                    className={tipAmount === amount 
                      ? "bg-secondary text-black" 
                      : "border-secondary/30 text-secondary"}
                  >
                    {amount === 0 ? "No tip" : `₾${amount}`}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || loading}
            className="w-full bg-gradient-to-r from-primary to-secondary text-black font-bold h-12"
            data-testid="submit-rating-btn"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Submitting...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" />
                {tipAmount > 0 ? `Submit Rating & ₾${tipAmount} Tip` : "Submit Rating"}
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RatingModal;
