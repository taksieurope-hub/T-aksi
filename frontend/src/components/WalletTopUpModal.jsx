import React, { useState } from "react";
import { Wallet, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import api from "@/api";
import { useAuth } from "@/config"; 
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

const WalletTopUpModal = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState(20);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const AMOUNTS = [5, 10, 20, 50];

  if (!isOpen) return null;

  const finalAmount = custom ? (parseFloat(custom) || 0) : amount;
  const usdAmount   = (finalAmount * 0.37).toFixed(2);
  const canPay      = finalAmount >= 1;

  const savedCard = user?.saved_cards?.[0]; 

  const handleVaultedTopUp = async () => {
    setLoading(true);
    try {
      await api.post("/rider/wallet/topup-vaulted", { 
        amount: finalAmount,
        vault_id: savedCard.vault_id 
      });
      
      toast.success(`₾${finalAmount.toFixed(2)} added via saved card! ⚡`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Quick Top-Up failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PayPalScriptProvider
      options={{
        "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
        currency: "USD",
        components: "buttons,card-fields",
        vault: true // 👈 Removed intent: "capture" to stop the dual-intent crash
      }}
    >
      <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-end justify-center" onClick={onClose}>
        <div className="bg-[#0d0d1a] border border-white/10 rounded-t-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
          <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-5" />
          
          <div className="flex items-center gap-3 mb-5">
            <div className="w-11 h-11 rounded-xl bg-[#00ff88]/15 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-[#00ff88]" />
            </div>
            <div>
              <h2 className="text-white text-lg font-bold">Top Up Wallet</h2>
              <p className="text-white/40 text-sm">Add funds to your T'aksi wallet</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            {AMOUNTS.map(a => (
              <button key={a} onClick={() => { setAmount(a); setCustom(""); }}
                className={`py-3.5 rounded-xl border-2 font-bold transition-all active:scale-95 ${(!custom && amount === a) ? "border-[#00ff88] bg-[#00ff88]/12 text-[#00ff88]" : "border-white/10 text-white bg-white/4 hover:border-white/25"}`}>
                ₾{a}
              </button>
            ))}
          </div>

          <Input type="number" placeholder="Custom amount (₾)" value={custom} min="1" max="1000"
            onChange={e => setCustom(e.target.value)}
            className="bg-white/5 border-white/10 text-white text-center h-11 rounded-xl mb-4 placeholder:text-white/25" />

          {canPay && (
            <p className="text-white/30 text-xs text-center mb-4">₾{finalAmount.toFixed(2)} GEL ≈ ${usdAmount} USD</p>
          )}

          {canPay && savedCard ? (
            <div className="space-y-3 mb-4">
              <Button 
                className="w-full bg-[#00ff88] text-black font-bold h-14 rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,255,136,0.2)] hover:bg-[#00cc6a] transition-colors"
                onClick={handleVaultedTopUp}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 fill-black" />}
                Quick Pay with {savedCard.brand} •••• {savedCard.last4}
              </Button>
              
              <div className="flex items-center gap-3 py-2">
                <div className="h-[1px] bg-white/10 flex-1" />
                <span className="text-white/20 text-[10px] uppercase font-bold">Or use another method</span>
                <div className="h-[1px] bg-white/10 flex-1" />
              </div>
            </div>
          ) : null}

          {canPay ? (
            <div className={savedCard ? "opacity-60 hover:opacity-100 transition-opacity" : ""}>
              <PayPalButtons
                fundingSource="card"
                style={{ layout: "vertical", shape: "rect" }}
                createOrder={(data, actions) => {
                  const safeUsdAmount = Number(usdAmount);
                  if (isNaN(safeUsdAmount) || safeUsdAmount <= 0) {
                    toast.error("Invalid amount.");
                    return null;
                  }
                  return actions.order.create({
                    purchase_units: [{ 
                      amount: { value: safeUsdAmount.toFixed(2), currency_code: "USD" },
                    }],
                    payment_source: {
                      card: {
                        attributes: {
                          vault: { store_in_vault: "ON_SUCCESS" }
                        }
                      }
                    },
                    application_context: { shipping_preference: "NO_SHIPPING" },
                  });
                }}
                onApprove={async (data, actions) => {
                  const orderDetails = await actions.order.capture();
                  try {
                    const paymentSource = orderDetails.payment_source?.card;
                    const vaultId = paymentSource?.attributes?.vault?.id || null;

                    await api.post("/rider/wallet/topup", { 
                      amount: finalAmount, 
                      reference: data.orderID,
                      vault_id: vaultId,
                      card_last4: paymentSource?.last_digits || null,
                      card_brand: paymentSource?.brand || null
                    });

                    toast.success(`₾${finalAmount.toFixed(2)} added!`);
                    onSuccess();
                    onClose();
                  } catch { toast.error("Payment captured but wallet not updated."); }
                }}
                onError={() => toast.error("Payment failed")}
              />
            </div>
          ) : (
            <div className="bg-white/4 rounded-xl p-4 text-center mb-2">
              <p className="text-white/25 text-sm">Enter ₾1 or more to pay</p>
            </div>
          )}
          
          <Button variant="ghost" className="w-full text-white/30 mt-2 rounded-xl" onClick={onClose} disabled={loading}>Cancel</Button>
        </div>
      </div>
    </PayPalScriptProvider>
  );
};

export default WalletTopUpModal;