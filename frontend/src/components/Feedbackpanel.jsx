import { useState } from "react";
import api from "@/api";
import { toast } from "sonner";

const CATEGORIES = [
  { id: "bug", label: "Bug Report" },
  { id: "suggestion", label: "Suggestion" },
  { id: "compliment", label: "Compliment" },
];

export default function FeedbackPanel({ userType = "rider" }) {
  const [nps, setNps] = useState(null);
  const [category, setCategory] = useState(null);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (nps === null || !category || stars === 0) {
      toast.error("Please complete all fields.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/feedback", {
        user_type: userType,
        nps,
        category,
        stars,
        comment: comment.trim(),
      });
      setSubmitted(true);
      toast.success("Thanks for your feedback!");
    } catch (e) {
      toast.error("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <p className="text-4xl">&#x1F64F;</p>
        <p className="text-white font-bold text-lg">Thank you!</p>
        <p className="text-white/40 text-sm text-center">Your feedback helps us improve T&apos;aksi.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* NPS */}
      <div>
        <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-3">
          Recommend T&apos;aksi? (0-10)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => (
            <button
              key={i}
              onClick={() => setNps(i)}
              className={
                "w-9 h-9 rounded-xl text-sm font-bold border transition-all " +
                (nps === i
                  ? "bg-[#00ff88] text-black border-[#00ff88]"
                  : "bg-white/5 text-white/50 border-white/10 hover:border-white/30")
              }
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-3">Category</p>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={
                "px-3 py-2 rounded-xl text-sm font-medium border transition-all " +
                (category === c.id
                  ? "bg-[#00d4ff]/20 text-[#00d4ff] border-[#00d4ff]/40"
                  : "bg-white/5 text-white/50 border-white/10 hover:border-white/30")
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stars */}
      <div>
        <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-3">Overall Rating</p>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setStars(s)}
              className="text-3xl transition-transform hover:scale-110 focus:outline-none"
              style={{ color: s <= stars ? "#fbbf24" : "rgba(255,255,255,0.2)" }}
            >
              {s <= stars ? "\u2605" : "\u2606"}
            </button>
          ))}
        </div>
      </div>

      {/* Comment */}
      <div>
        <p className="text-white/50 text-xs uppercase tracking-wider font-semibold mb-2">
          Comments (optional)
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Tell us more..."
          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm resize-none placeholder:text-white/30 focus:outline-none focus:border-[#00d4ff]/40 transition-colors"
        />
      </div>

      <button
        onClick={submit}
        disabled={submitting || nps === null || !category || stars === 0}
        className="w-full h-11 rounded-xl bg-[#00ff88] text-black font-bold text-sm disabled:opacity-40 transition-opacity"
      >
        {submitting ? "Submitting..." : "Submit Feedback"}
      </button>
    </div>
  );
}