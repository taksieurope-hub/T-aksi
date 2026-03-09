import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';

// 1. Map your supported languages to their official currency codes
const currencyMap = {
  de: { code: 'eur', symbol: '€' },
  fr: { code: 'eur', symbol: '€' },
  nl: { code: 'eur', symbol: '€' },
  pl: { code: 'pln', symbol: 'zł' },
  ru: { code: 'rub', symbol: '₽' },
  en: { code: 'usd', symbol: '$' },
  zh: { code: 'cny', symbol: '¥' },
  hi: { code: 'inr', symbol: '₹' },
  af: { code: 'zar', symbol: 'R' },
  zu: { code: 'zar', symbol: 'R' },
  xh: { code: 'zar', symbol: 'R' },
  default: { code: 'usd', symbol: '$' }
};

// 2. Cache the rates outside the component so it only fetches ONCE per session
let cachedRates = null;

const CurrencyConverter = ({ gelAmount, className = "" }) => {
  const { language } = useLanguage();
  const [rates, setRates] = useState(cachedRates);

  useEffect(() => {
    // If it's a Georgian user, or we already have the rates, do nothing.
    if (language === 'ka' || cachedRates) return;

    // Fetch real-time GEL exchange rates from a free, keyless CDN
    fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/gel.json')
      .then(res => res.json())
      .then(data => {
        cachedRates = data.gel; // Save to global memory
        setRates(data.gel);     // Update component state
      })
      .catch(err => console.error("Currency fetch failed:", err));
  }, [language]);

  // Hide the converter if they are local, if the amount is broken, or if rates are loading
  if (language === 'ka' || gelAmount == null || isNaN(gelAmount) || !rates) {
    return null;
  }

  // Get the correct currency code based on their selected language
  const { code, symbol } = currencyMap[language] || currencyMap.default;
  
  // Multiply the GEL amount by the live API multiplier
  const multiplier = rates[code];
  if (!multiplier) return null; // Safety check in case the currency code isn't in the API

  const convertedAmount = (parseFloat(gelAmount) * multiplier).toFixed(2);

  return (
    <span className={`text-white/40 text-xs ml-1.5 font-normal tracking-wide ${className}`}>
      (~{symbol}{convertedAmount})
    </span>
  );
};

export default CurrencyConverter;