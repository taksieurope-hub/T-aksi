/**
 * FeedbackPanel.jsx
 * 
 * Feedback station for T'aksi beta — collects:
 *  - NPS score (0–10)
 *  - Category: Bug / Suggestion / Compliment
 *  - Star rating (1–5)
 *  - Free-text comment
 * 
 * Usage (in DriverPortal MorePanel or RiderPortal profile tab):
 *   import FeedbackPanel from "@/components/FeedbackPanel";
 *   <FeedbackPanel userType="driver" />   // or "rider"
 */

import { useState } from "react";
import { Loader2, Send, CheckCircle2, Star, Zap, AlertCircle, Heart, MessageSquare, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n/LanguageContext";
import api from "@/api";
import { toast } from "sonner";

// ─── Category config ─────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "bug",        label: "Bug Report",   icon: AlertCircle, color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/25"    },
  { id: "suggestion", label: "Suggestion",   icon: Zap,         color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/25" },
  { id: "compliment", label: "Compliment",   icon: Heart,       color: "text-pink-400",   bg: "bg-pink-400/10",   border: "border-pink-400/25"   },
  { id: "other",      label: "Other",        icon: MessageSquare, color: "text-white/50", bg: "bg-white/5",       border: "border-white/10"      },
];

// ─── NPS labels ───────────────────────────────────────────────────────────────
const npsLabel = (score) => {
  if (score === null) return "";
  if (score <= 3)  return "Not likely at all";
  if (score <= 6)  return "Maybe";
  if (score <= 8)  return "Likely";
  return "Absolutely!";
};

const npsColor = (score) => {
  if (score === null) return "text-white/30";
  if (score <= 3)  return "text-red-400";
  if (score <= 6)  return "text-yellow-400";
  if (score <= 8)  return "text-blue-400";
  return "text-[#00ff88]";
};

// ─── Component ────────────────────────────────────────────────────────────────
const FeedbackPanel = ({ userType = "rider" }) => {
  const { t } = useLanguage();

  const [step,       setStep]       = useState("form"); // "form" | "submitted"
  const [nps,        setNps]        = useState(null);
  const [category,   setCategory]   = useState(null);
  const [stars,      setStars]      = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment,    setComment]    = useState("");
  const [loading,    setLoading]    = useState(false);

  const isValid = nps !== null && category && stars > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await api.post("/feedback", {
        user_type:  userType,
        nps_score:  nps,
        category,
        star_rating: stars,
        comment:    comment.trim() || null,
      });
      setStep("submitted");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit feedback. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep("form");
    setNps(null);
    setCategory(null);
    setStars(0);
    setHoveredStar(0);
    setComment("");
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (step === "submitted") {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
        <div className="w-20 h-20 rounded-3xl bg-[#00ff88]/10 border border-[#00ff88]/25 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-[#00ff88]" />
        </div>
        <div>
          <h3 className="text-white font-bold text-xl">Thank you! 🙏</h3>
          <p className="text-white/40 text-sm mt-1 max-w-xs mx-auto">
            Your feedback helps us build a better T'aksi for everyone in Georgia.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-white/30 text-sm hover:text-white/60 transition-colors mt-2"
        >
          Submit another response
        </button>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center shrink-0">
          <ThumbsUp className="w-5 h-5 text-[#00ff88]" />
        </div>
        <div>
          <h3 className="text-white font-bold text-base">Beta Feedback</h3>
          <p className="text-white/35 text-xs">Help us improve T'aksi — takes 30 seconds</p>
        </div>
      </div>

      {/* ── NPS ─────────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">
            How likely are you to recommend T'aksi?
          </p>
          {nps !== null && (
            <span className={`text-xs font-bold transition-all ${npsColor(nps)}`}>
              {npsLabel(nps)}
            </span>
          )}
        </div>

        {/* Score grid 0–10 */}
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              onClick={() => setNps(i)}
              className={`h-9 rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                nps === i
                  ? i <= 3
                    ? "bg-red-500/25 border-red-400 text-red-300"
                    : i <= 6
                    ? "bg-yellow-500/25 border-yellow-400 text-yellow-300"
                    : i <= 8
                    ? "bg-blue-500/25 border-blue-400 text-blue-300"
                    : "bg-[#00ff88]/25 border-[#00ff88] text-[#00ff88]"
                  : "bg-white/4 border-white/10 text-white/40 hover:border-white/25 hover:text-white/70"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-white/20 px-0.5">
          <span>Not likely</span>
          <span>Very likely</span>
        </div>
      </div>

      {/* ── Category ─────────────────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">
          What type of feedback is this?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map(({ id, label, icon: Icon, color, bg, border }) => (
            <button
              key={id}
              onClick={() => setCategory(id)}
              className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm font-semibold transition-all active:scale-95 text-left ${
                category === id
                  ? `${bg} ${border} ${color}`
                  : "bg-white/3 border-white/8 text-white/40 hover:border-white/20 hover:text-white/60"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Star Rating ──────────────────────────────────────────────────────── */}
      <div className="space-y-2.5">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">
          Overall experience
        </p>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setStars(s)}
              onMouseEnter={() => setHoveredStar(s)}
              onMouseLeave={() => setHoveredStar(0)}
              className="transition-all active:scale-90"
            >
              <Star
                className={`w-9 h-9 transition-all duration-100 ${
                  s <= (hoveredStar || stars)
                    ? "fill-yellow-400 text-yellow-400 scale-110"
                    : "text-white/15"
                }`}
              />
            </button>
          ))}
          {stars > 0 && (
            <span className="text-yellow-400/70 text-sm ml-1 font-semibold">
              {["", "Poor", "Fair", "Good", "Great", "Excellent!"][stars]}
            </span>
          )}
        </div>
      </div>

      {/* ── Comment ──────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-wider">
          Tell us more <span className="text-white/25 normal-case font-normal">(optional)</span>
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={
            category === "bug"
              ? "Describe what happened and when…"
              : category === "suggestion"
              ? "What feature or improvement would help you most?"
              : category === "compliment"
              ? "Tell us what you loved!"
              : "Share your thoughts…"
          }
          className="w-full bg-white/4 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none placeholder:text-white/20 focus:outline-none focus:border-[#00ff88]/35 transition-colors"
        />
        <p className="text-white/20 text-[10px] text-right">{comment.length}/500</p>
      </div>

      {/* ── Submit ───────────────────────────────────────────────────────────── */}
      <Button
        onClick={handleSubmit}
        disabled={!isValid || loading}
        className="w-full h-12 bg-gradient-to-r from-[#00ff88] to-[#00d4ff] text-black font-bold text-base disabled:opacity-30 disabled:grayscale"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending…</>
          : <><Send className="w-4 h-4 mr-2" /> Submit Feedback</>
        }
      </Button>

      {!isValid && (
        <p className="text-white/25 text-xs text-center">
          Please rate your likelihood, choose a category, and give stars to continue
        </p>
      )}
    </div>
  );
};

export default FeedbackPanel;