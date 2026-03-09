/**
 * PaymentMethodManager.jsx
 *
 * Premium PayPal card vaulting for T'aksi - smoother than ever
 * - Lists saved cards with animated brand icons
 * - Smooth add card flow with skeleton loading
 * - Set default, delete cards with confirmations
 * - Animated success/error states
 */

import { useState, useEffect, useCallback } from "react"
import axios from "axios"
import { PayPalScriptProvider, PayPalCardFieldsProvider, PayPalCardFieldsForm, usePayPalCardFields } from "@paypal/react-paypal-js"
import { CreditCard, Trash2, CheckCircle2, Plus, Loader2, Star, Shield, X } from "lucide-react"

// ── Brand icons with modern styling ──────────────────────────────────────────
const BRAND_COLORS = {
  VISA:       { bg: "linear-gradient(135deg, #1a1f71 0%, #0d1147 100%)", text: "#fff", label: "VISA" },
  MASTERCARD: { bg: "linear-gradient(135deg, #eb001b 0%, #a00012 100%)", text: "#fff", label: "MC" },
  AMEX:       { bg: "linear-gradient(135deg, #007bc1 0%, #005a8d 100%)", text: "#fff", label: "AMEX" },
  DISCOVER:   { bg: "linear-gradient(135deg, #ff6600 0%, #cc5200 100%)", text: "#fff", label: "DISC" },
  DEFAULT:    { bg: "linear-gradient(135deg, #333 0%, #1a1a1a 100%)", text: "#f5c842", label: "CARD" },
}

function BrandBadge({ brand }) {
  const b = BRAND_COLORS[brand?.toUpperCase()] || BRAND_COLORS.DEFAULT
  return (
    <span 
      className="transition-transform duration-200 hover:scale-105"
      style={{
        background: b.bg, color: b.text, fontSize: "0.65rem",
        fontWeight: 800, padding: "4px 8px", borderRadius: "6px",
        letterSpacing: "0.5px", minWidth: "40px", textAlign: "center",
        display: "inline-block", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}>
      {b.label}
    </span>
  )
}

// ── Skeleton loader for smooth loading states ────────────────────────────────
function CardSkeleton() {
  return (
    <div className="animate-pulse flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10 mb-2">
      <div className="w-10 h-5 bg-white/10 rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-white/10 rounded w-3/4" />
        <div className="h-3 bg-white/10 rounded w-1/2" />
      </div>
    </div>
  )
}

// ── Submit button inside PayPalCardFieldsProvider ────────────────────────────
function VaultSubmitButton({ onSuccess, onError, loading, setLoading }) {
  const { cardFieldsForm } = usePayPalCardFields()

  const handleSubmit = async () => {
    if (!cardFieldsForm) return
    setLoading(true)
    try {
      const { approveSetup } = await cardFieldsForm.submit()
      if (approveSetup?.vaultSetupToken) {
        await onSuccess(approveSetup.vaultSetupToken)
      }
    } catch (err) {
      onError(err?.message || "Card save failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleSubmit}
      disabled={loading}
      style={{
        width: "100%", padding: "14px", marginTop: "16px",
        background: loading ? "#333" : "#f5c842",
        color: loading ? "#666" : "#000",
        border: "none", borderRadius: "10px", fontWeight: 700,
        fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
        transition: "all 0.2s",
      }}
    >
      {loading
        ? <><Loader2 size={16} className="animate-spin" /> Saving card...</>
        : <><CheckCircle2 size={16} /> Save card securely</>
      }
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PaymentMethodManager({ selectable = false, onSelect, selectedId }) {
  const [methods, setMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddCard, setShowAddCard] = useState(false)
  const [clientToken, setClientToken] = useState(null)
  const [setupTokenId, setSetupTokenId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  // Load saved cards
  const fetchMethods = useCallback(async () => {
    setLoading(true)
    try {
      const res = await axios.get("/api/payments/vault")
      setMethods(res.data.payment_methods || [])
    } catch (e) {
      setError("Failed to load payment methods")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMethods() }, [fetchMethods])

  // Start add-card flow: get PayPal client token + setup token from backend
  const startAddCard = async () => {
    setError(null)
    setSuccess(null)
    try {
      // 1. Get PayPal client token (for PayPal JS SDK)
      const tokenRes = await axios.get("/api/paypal/client-token")
      setClientToken(tokenRes.data.client_token || tokenRes.data.access_token)

      // 2. Create a setup token (tells PayPal this is a vault setup, not a payment)
      const setupRes = await axios.post("/api/payments/vault/setup")
      setSetupTokenId(setupRes.data.setup_token_id)

      setShowAddCard(true)
    } catch (e) {
      setError("Could not initialise card form. Please try again.")
    }
  }

  // Step 2: After PayPal card form approves, confirm vault on our backend
  const handleVaultSuccess = async (paymentToken) => {
    try {
      const res = await axios.post(`/api/payments/vault/confirm?payment_token=${paymentToken}`)
      setSuccess(`${res.data.brand} ****${res.data.last_digits} saved!`)
      setShowAddCard(false)
      setSetupTokenId(null)
      setClientToken(null)
      await fetchMethods()
    } catch (e) {
      throw new Error(e.response?.data?.detail || "Failed to save card")
    }
  }

  const handleVaultError = (msg) => {
    setError(msg)
    setShowAddCard(false)
  }

  const handleSetDefault = async (methodId) => {
    try {
      await axios.post(`/api/payments/vault/${methodId}/set-default`)
      await fetchMethods()
    } catch (e) {
      setError("Failed to update default card")
    }
  }

  const handleDelete = async (methodId) => {
    setDeletingId(methodId)
    try {
      await axios.delete(`/api/payments/vault/${methodId}`)
      setMethods(prev => prev.filter(m => m.id !== methodId))
    } catch (e) {
      setError("Failed to remove card")
    } finally {
      setDeletingId(null)
    }
  }

  // Modern card styling
  const card = (selected, isDefault) => ({
    display: "flex", alignItems: "center", gap: "14px",
    padding: "16px",
    background: selected ? "rgba(245,200,66,0.08)" : "rgba(255,255,255,0.03)",
    border: `1px solid ${selected ? "rgba(245,200,66,0.4)" : isDefault ? "rgba(0,255,136,0.2)" : "rgba(255,255,255,0.08)"}`,
    borderRadius: "14px", cursor: selectable ? "pointer" : "default",
    transition: "all 0.2s ease", marginBottom: "10px",
    transform: selected ? "scale(1.01)" : "scale(1)",
    boxShadow: selected ? "0 4px 20px rgba(245,200,66,0.1)" : "none",
  })

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: "#e8e8f0" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ 
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(245,200,66,0.2) 0%, rgba(245,200,66,0.05) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <CreditCard size={16} color="#f5c842" />
          </div>
          Payment Methods
        </h3>
        {!showAddCard && (
          <button
            onClick={startAddCard}
            className="transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "10px 16px", 
              background: "linear-gradient(135deg, #f5c842 0%, #e6b52e 100%)", 
              color: "#000",
              border: "none", borderRadius: "10px", fontWeight: 600,
              fontSize: "0.85rem", cursor: "pointer",
              boxShadow: "0 4px 12px rgba(245,200,66,0.25)",
            }}
          >
            <Plus size={14} strokeWidth={2.5} /> Add card
          </button>
        )}
      </div>

      {/* Feedback with animation */}
      {error && (
        <div 
          className="animate-in fade-in slide-in-from-top-2 duration-300"
          style={{ 
            background: "rgba(239,68,68,0.1)", 
            border: "1px solid rgba(239,68,68,0.3)", 
            borderRadius: "10px", 
            padding: "12px 16px", 
            marginBottom: "14px", 
            fontSize: "0.85rem", 
            color: "#f87171",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
          <X size={16} />
          {error}
        </div>
      )}
      {success && (
        <div 
          className="animate-in fade-in slide-in-from-top-2 duration-300"
          style={{ 
            background: "rgba(34,197,94,0.1)", 
            border: "1px solid rgba(34,197,94,0.3)", 
            borderRadius: "10px", 
            padding: "12px 16px", 
            marginBottom: "14px", 
            fontSize: "0.85rem", 
            color: "#4ade80",
            display: "flex",
            alignItems: "center",
            gap: "10px"
          }}>
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      {/* Saved cards list with skeleton loading */}
      {loading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : methods.length === 0 && !showAddCard ? (
        <div style={{ 
          textAlign: "center", 
          padding: "40px 20px", 
          background: "rgba(255,255,255,0.02)", 
          borderRadius: "14px",
          border: "1px dashed rgba(255,255,255,0.1)"
        }}>
          <Shield size={32} style={{ margin: "0 auto 12px", color: "#555" }} />
          <p style={{ color: "#888", fontSize: "0.9rem", marginBottom: "4px" }}>No saved cards yet</p>
          <span style={{ color: "#666", fontSize: "0.8rem" }}>Add a card once, pay forever with one tap.</span>
        </div>
      ) : (
        methods.map((method) => (
          <div
            key={method.id}
            className="transition-all duration-200 hover:bg-white/[0.04]"
            style={card(selectedId === method.id, method.is_default)}
            onClick={() => selectable && onSelect?.(method)}
          >
            {/* Selection indicator */}
            {selectable && (
              <div 
                className="transition-all duration-200"
                style={{
                  width: "20px", height: "20px", borderRadius: "50%",
                  border: `2px solid ${selectedId === method.id ? "#f5c842" : "rgba(255,255,255,0.2)"}`,
                  background: selectedId === method.id ? "#f5c842" : "transparent",
                  flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                {selectedId === method.id && <CheckCircle2 size={12} color="#000" />}
              </div>
            )}

            {/* Brand badge */}
            <BrandBadge brand={method.brand} />

            {/* Card details */}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                •••• •••• •••• {method.last_digits}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#666", marginTop: "2px" }}>
                Expires {method.expiry?.replace("-", "/")}
                {method.is_default && (
                  <span style={{ marginLeft: "8px", color: "#f5c842", fontSize: "0.7rem" }}>
                    ★ Default
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            {!selectable && (
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                {!method.is_default && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSetDefault(method.id) }}
                    title="Set as default"
                    style={{
                      padding: "6px", background: "#1e1e0e", border: "1px solid #3a3a2a",
                      borderRadius: "6px", cursor: "pointer", color: "#f5c842",
                    }}
                  >
                    <Star size={13} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(method.id) }}
                  disabled={deletingId === method.id}
                  title="Remove card"
                  style={{
                    padding: "6px", background: "#1e0e0e", border: "1px solid #3a2020",
                    borderRadius: "6px", cursor: "pointer", color: "#f07070",
                    opacity: deletingId === method.id ? 0.5 : 1,
                  }}
                >
                  {deletingId === method.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            )}
          </div>
        ))
      )}

      {/* Add card form — rendered inside PayPal provider */}
      {showAddCard && clientToken && setupTokenId && (
        <div style={{
          background: "#111", border: "1px solid #2a2a38", borderRadius: "12px",
          padding: "20px", marginTop: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h4 style={{ fontWeight: 700, fontSize: "0.92rem", color: "#fff" }}>Add new card</h4>
            <button
              onClick={() => { setShowAddCard(false); setError(null) }}
              style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: "1.1rem" }}
            >
              ✕
            </button>
          </div>

          <PayPalScriptProvider
            options={{
              clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID,
              dataClientToken: clientToken,
              components: "card-fields",
              vault: true,
            }}
          >
            <PayPalCardFieldsProvider
              createVaultSetupToken={() => Promise.resolve(setupTokenId)}
              onApprove={async (data) => {
                await handleVaultSuccess(data.vaultSetupToken)
              }}
              onError={(err) => handleVaultError(err?.message || "Card error")}
            >
              {/* PayPal renders these secure iframes — card data never hits your server */}
              <PayPalCardFieldsForm
                style={{
                  input: {
                    "font-size": "14px",
                    "font-family": "inherit",
                    color: "#e8e8f0",
                    "background-color": "#1a1a24",
                    padding: "10px",
                    "border-radius": "8px",
                    border: "1px solid #2a2a38",
                  },
                  ".invalid": { color: "#f07070" },
                }}
              />

              {/* Submit button must be inside PayPalCardFieldsProvider to access cardFieldsForm */}
              <VaultSubmitButton
                onSuccess={handleVaultSuccess}
                onError={handleVaultError}
                loading={saving}
                setLoading={setSaving}
              />
            </PayPalCardFieldsProvider>
          </PayPalScriptProvider>

          <p style={{ fontSize: "0.72rem", color: "#555", textAlign: "center", marginTop: "12px" }}>
            🔒 Card details are handled by PayPal. T'aksi never sees your card number.
          </p>
        </div>
      )}
    </div>
  )
}