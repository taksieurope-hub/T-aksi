path = "frontend/src/components/RiderPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# When saved card selected, bypass PayPal buttons and charge directly
old_card_check = '    if (paymentMethod === "card") { setShowPayPal(true); return; }'
new_card_check = '''    if (paymentMethod === "card") {
      if (selectedVaultId) {
        // One-tap charge with saved card
        try {
          const amount = fareEstimate?.total ?? calculateFare(carType, routeInfo?.distance ?? 5, 0, 0, validStopsCount, surgeInfo?.multiplier ?? 1.0, "card").total;
          setLoading(true);
          const chargeRes = await api.post("/rider/charge-saved-card", {
            vault_id: selectedVaultId,
            amount_gel: amount,
            description: `T'aksi ride - ${carType}`,
          });
          const orderId = chargeRes.data.order_id;
          await processRideRequest(orderId, selectedVaultId, savedCards.find(c => c.vault_id === selectedVaultId)?.last4 || null, savedCards.find(c => c.vault_id === selectedVaultId)?.brand || null);
        } catch (e) {
          setLoading(false);
          toast.error(e.response?.data?.detail || "Card charge failed. Please try another payment method.");
        }
        return;
      }
      setShowPayPal(true); return;
    }'''

if old_card_check in c:
    c = c.replace(old_card_check, new_card_check)
    print("OK: one-tap saved card charge wired up")
else:
    print("MISS: card check")

# Also add a "Manage Cards" link in the profile tab wallet section
old_wallet_section = '                  <p className="text-[#00ff88] text-xl font-bold font-mono">{user?.total_rides'
new_wallet_section = '''                  {savedCards.length > 0 && (
                    <div style={{background:"rgba(0,212,255,0.05)",border:"1px solid rgba(0,212,255,0.15)",borderRadius:12,padding:"10px 14px",marginBottom:8}}>
                      <p style={{color:"rgba(255,255,255,0.4)",fontSize:10,fontWeight:700,textTransform:"uppercase",marginBottom:6}}>Saved Cards</p>
                      {savedCards.map(card => (
                        <div key={card.vault_id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                          <span style={{color:"white",fontSize:13,flex:1}}>💳 {card.brand || "Card"} •••• {card.last4 || "****"}</span>
                          <button onClick={async () => { if(window.confirm("Remove this card?")) { await api.delete(`/rider/saved-cards/${card.vault_id}`); setSavedCards(prev => prev.filter(c => c.vault_id !== card.vault_id)); toast.success("Card removed"); }}}
                            style={{color:"rgba(255,60,60,0.6)",fontSize:11,background:"none",border:"none",cursor:"pointer",padding:"2px 6px"}}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[#00ff88] text-xl font-bold font-mono">{user?.total_rides'''

if old_wallet_section in c:
    c = c.replace(old_wallet_section, new_wallet_section)
    print("OK: saved cards shown in profile tab")
else:
    print("MISS: profile section")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
