import { useState } from "react";
import { toast } from "react-hot-toast";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { api } from "./config"; // Make sure this points to your unified config.js

export const SaveCardModal = ({ isOpen, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
      <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
        
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#00ff88]/15 border border-[#00ff88]/25 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-7 h-7 text-[#00ff88]" />
          </div>
          <h2 className="text-white text-xl font-bold">Securely Save Card</h2>
          <p className="text-white/40 text-sm mt-1">
            Add a card for seamless automatic payments. You will not be charged right now.
          </p>
        </div>

        <div className="mb-4">
          <PayPalButtons
            fundingSource="card"
            style={{ layout: "vertical", shape: "rect" }}
            createBillingAgreement={(data, actions) => {
              // This tells PayPal: "Don't charge money, just verify the card and hold it."
              return actions.billingAgreement.create({
                description: "T'aksi App - Automatic Ride & Tip Payments",
                plan: { type: "MERCHANT_INITIATED_BILLING" }
              });
            }}
            onApprove={async (data, actions) => {
              setLoading(true);
              try {
                // 🚀 Send the generated vault token to your Python backend
                await api.post("/rider/wallet/vault", { 
                  billing_token: data.billingToken 
                });
                
                toast.success("Card successfully saved and ready for rides!");
                onSuccess?.();
                onClose();
              } catch (err) {
                toast.error("Failed to save card to profile. Please try again.");
              } finally {
                setLoading(false);
              }
            }}
            onError={() => toast.error("PayPal encountered an error verifying this card.")}
            onCancel={() => toast.info("Card save cancelled.")}
          />
        </div>

        <Button variant="ghost" className="w-full border border-white/10 text-white/40 rounded-xl h-12 text-sm hover:bg-white/5" onClick={onClose} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Cancel"}
        </Button>
      </div>
    </div>
  );
};