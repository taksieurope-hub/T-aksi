// TripCompletionModal.jsx - Trip Completion Popup for Rider and Driver
import React, { useState, useEffect } from "react";
import { 
  CheckCircle, Banknote, CreditCard, X, Star, 
  DollarSign, AlertTriangle, ThumbsUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
// 🔥 ADDED DialogDescription to the import
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

// Driver's Trip Completion Modal
export const DriverTripCompletionModal = ({ 
  isOpen, 
  onClose, 
  fareAmount, 
  paymentMethod,
  riderName,
  onConfirm 
}) => {
  const { t } = useLanguage();
  const isCash = String(paymentMethod).toLowerCase().trim() === "cash";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent aria-describedby="driver-trip-desc" className="sm:max-w-md border-0 p-0 overflow-hidden">
        
        {/* 🔥 ADDED HIDDEN HEADER TO SILENCE RADIX WARNINGS */}
        <DialogHeader className="sr-only">
          <DialogTitle>Trip Completed</DialogTitle>
          <DialogDescription id="driver-trip-desc">
            Payment collection instructions and trip summary.
          </DialogDescription>
        </DialogHeader>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`p-6 ${isCash ? 'bg-gradient-to-br from-green-900 to-green-950' : 'bg-gradient-to-br from-blue-900 to-blue-950'}`}
        >
          {/* Header Icon */}
          <div className="flex justify-center mb-4">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className={`w-20 h-20 rounded-full flex items-center justify-center ${
                isCash ? 'bg-green-500' : 'bg-blue-500'
              }`}
            >
              {isCash ? (
                <Banknote className="w-10 h-10 text-black" />
              ) : (
                <CreditCard className="w-10 h-10 text-white" />
              )}
            </motion.div>
          </div>

          {/* Trip Complete Title */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-6"
          >
            <h2 className="text-2xl font-bold text-white mb-2">
              {t('trip_completed') || "Trip Completed!"}
            </h2>
            <p className="text-white/70">
              {riderName ? `Rider: ${riderName}` : ""}
            </p>
          </motion.div>

          {/* Payment Instruction */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className={`rounded-2xl p-6 mb-6 ${
              isCash 
                ? 'bg-green-500/20 border-2 border-green-500' 
                : 'bg-blue-500/20 border-2 border-blue-500'
            }`}
          >
            {isCash ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Banknote className="w-6 h-6 text-green-400" />
                  <span className="text-xl font-bold text-green-400">
                    {t('take_cash') || "TAKE CASH"}
                  </span>
                </div>
                <p className="text-green-300/80 text-sm mb-4">
                  {t('collect_cash_from_rider') || "Collect cash payment from rider"}
                </p>
              </div>
            ) : (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <AlertTriangle className="w-6 h-6 text-blue-400" />
                  <span className="text-xl font-bold text-blue-400">
                    {t('dont_take_cash') || "DON'T TAKE CASH"}
                  </span>
                </div>
                <p className="text-blue-300/80 text-sm mb-4">
                  {t('payment_via_card') || "Payment already processed via card/wallet"}
                </p>
              </div>
            )}

            {/* Fare Amount */}
            <div className="text-center">
              <p className="text-white/60 text-sm mb-1">{t('fare_amount') || "Fare Amount"}</p>
              <p className={`text-5xl font-bold ${isCash ? 'text-green-400' : 'text-blue-400'}`}>
                ₾{fareAmount?.toFixed(2) || "0.00"}
              </p>
            </div>
          </motion.div>

          {/* Confirm Button */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <Button
              onClick={onConfirm || onClose}
              className={`w-full h-14 text-lg font-bold ${
                isCash 
                  ? 'bg-green-500 hover:bg-green-600 text-black' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
              data-testid="driver-trip-complete-confirm"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              {isCash 
                ? (t('cash_collected') || "Cash Collected") 
                : (t('got_it') || "Got It")}
            </Button>
          </motion.div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

// Rider's Trip Completion Modal
export const RiderTripCompletionModal = ({ 
  isOpen, 
  onClose, 
  fareAmount, 
  paymentMethod,
  driverName,
  onRateDriver 
}) => {
  const { t } = useLanguage();
  

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent aria-describedby="rider-trip-desc" className="sm:max-w-md border-0 p-0 overflow-hidden">
        
        {/* 🔥 ADDED HIDDEN HEADER TO SILENCE RADIX WARNINGS */}
        <DialogHeader className="sr-only">
          <DialogTitle>Trip Completed</DialogTitle>
          <DialogDescription id="rider-trip-desc">
            Trip total fare and driver rating prompt.
          </DialogDescription>
        </DialogHeader>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-br from-background to-background-secondary p-6"
        >
          {/* Success Icon */}
          <div className="flex justify-center mb-4">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="w-20 h-20 rounded-full bg-gradient-to-r from-secondary to-primary flex items-center justify-center"
            >
              <CheckCircle className="w-10 h-10 text-black" />
            </motion.div>
          </div>

          {/* Title */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-6"
          >
            <h2 className="text-2xl font-bold text-white mb-2">
              {t('trip_completed') || "Trip Completed!"}
            </h2>
            {driverName && (
              <p className="text-muted-foreground">
                {t('thank_your_driver') || "Thank you for riding with"} {driverName}
              </p>
            )}
          </motion.div>

          {/* Fare Card */}
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="glass-heavy rounded-2xl p-6 mb-6"
          >
            {/* Fare Amount */}
            <div className="text-center mb-4">
              <p className="text-muted-foreground text-sm mb-1">
                {t('total_fare') || "Total Fare"}
              </p>
              <p className="text-4xl font-bold text-secondary">
                ₾{fareAmount?.toFixed(2) || "0.00"}
              </p>
            </div>

            {/* Payment Method Indicator */}
            <div className={`flex items-center justify-center gap-3 p-3 rounded-xl ${
              isCash 
                ? 'bg-green-500/20 border border-green-500/30' 
                : 'bg-blue-500/20 border border-blue-500/30'
            }`}>
              {isCash ? (
                <>
                  <Banknote className="w-6 h-6 text-green-400" />
                  <div>
                    <p className="font-semibold text-green-400">
                      {t('cash_payment') || "Cash Payment"}
                    </p>
                    <p className="text-xs text-green-300/70">
                      {t('pay_driver_directly') || "Pay the driver directly"}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CreditCard className="w-6 h-6 text-blue-400" />
                  <div>
                    <p className="font-semibold text-blue-400">
                      {t('card_payment') || "Digital Payment"}
                    </p>
                    <p className="text-xs text-blue-300/70">
                      {t('payment_processed') || "Payment automatically processed"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="space-y-3"
          >
            <Button
              onClick={onRateDriver}
              className="w-full h-12 bg-gradient-to-r from-secondary to-primary text-black font-bold"
              data-testid="rider-rate-driver-btn"
            >
              <Star className="w-5 h-5 mr-2" />
              {t('rate_your_driver') || "Rate Your Driver"}
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full h-12 border-muted-foreground/30 text-muted-foreground"
              data-testid="rider-skip-rating-btn"
            >
              {t('maybe_later') || "Maybe Later"}
            </Button>
          </motion.div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default { DriverTripCompletionModal, RiderTripCompletionModal };