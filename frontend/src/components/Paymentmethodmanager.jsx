/**
 * PaymentMethodManager.jsx
 *
 * Handles PayPal card vaulting for T'aksi.
 * - Lists saved cards with brand icon + last 4 digits
 * - Lets users add a new card (one-time entry, saved forever)
 * - Set default, delete cards
 * - Used in: RiderPortal settings + checkout flow
 *
 * Usage:
 *   import PaymentMethodManager from "@/components/PaymentMethodManager"
 *
 *   // In settings:
 *   <PaymentMethodManager />
 *
 *   // At checkout (selectable mode):
 *   <PaymentMethodManager
 *     selectable
 *     onSelect={(method) => setSelectedPayment(method)}
 *   />
 */

import { useState, useEffect, useCallback } from "react"
import axios from "axios"
import { PayPalScriptProvider, PayPalCardFieldsProvider, PayPalCardFieldsForm, usePayPalCardFields } from "@paypal/react-paypal-js"
import { CreditCard, Trash2, CheckCircle2, Plus, Loader2, Star } from "lucide-react"

// ── Brand icons (text fallback — replace with SVGs if you want) ──────────────
const BRAND_COLORS = {
  VISA:       { bg: "#1a1f71", text: "#fff",    label: "VISA" },
  MASTERCARD: { bg: "#eb001b", text: "#fff",    label: "MC" },
  AMEX:       { bg: "#007bc1", text: "#fff",    label: "AMEX" },
  DISCOVER:   { bg: "#ff6600", text: "#fff",    label: "DISC" },
  DEFAULT:    { bg: "#333",    text: "#f5c842", label: "CARD" },
}

function BrandBadge({ brand }) {
  const b = BRAND_COLORS[brand?.toUpperCase()] || BRAND_COLORS.DEFAULT
  return (
    <span style={{
      background: b.bg, color: b.text, fontSize: "0.6rem",
      fontWeight: 800, padding: "2px 6px", borderRadius: "4px",
      letterSpacing: "0.5px", minWidth: "36px", textAlign: "center",
    }}>
      {b.label}
    </span>
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

  // Styles
  const card = (selected, isDefault) => ({
    display: "flex", alignItems: "center", gap: "14px",
    padding: "14px 16px",
    background: selected ? "#1a1a0a" : "#111",
    border: `1px solid ${selected ? "#f5c842" : isDefault ? "#3a3a2a" : "#222"}`,
    borderRadius: "12px", cursor: selectable ? "pointer" : "default",
    transition: "all 0.15s", marginBottom: "8px",
  })

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#e8e8f0" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
          <CreditCard size={18} color="#f5c842" />
          Payment Methods
        </h3>
        {!showAddCard && (
          <button
            onClick={startAddCard}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "8px 14px", background: "#f5c842", color: "#000",
              border: "none", borderRadius: "8px", fontWeight: 700,
              fontSize: "0.82rem", cursor: "pointer",
            }}
          >
            <Plus size={14} /> Add card
          </button>
        )}
      </div>

      {/* Feedback */}
      {error && (
        <div style={{ background: "#2a1010", border: "1px solid #5a2020", borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "0.85rem", color: "#f07070" }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#102010", border: "1px solid #205020", borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "0.85rem", color: "#70d070" }}>
          ✓ {success}
        </div>
      )}

      {/* Saved cards list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "24px", color: "#555" }}>
          <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto" }} />
        </div>
      ) : methods.length === 0 && !showAddCard ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#555", fontSize: "0.88rem" }}>
          No saved cards yet.<br />
          <span style={{ color: "#888" }}>Add a card once, pay forever with one tap.</span>
        </div>
      ) : (
        methods.map((method) => (
          <div
            key={method.id}
            style={card(selectedId === method.id, method.is_default)}
            onClick={() => selectable && onSelect?.(method)}
          >
            {/* Selection indicator */}
            {selectable && (
              <div style={{
                width: "18px", height: "18px", borderRadius: "50%",
                border: `2px solid ${selectedId === method.id ? "#f5c842" : "#444"}`,
                background: selectedId === method.id ? "#f5c842" : "transparent",
                flexShrink: 0,
              }} />
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