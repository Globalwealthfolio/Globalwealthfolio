/**
 * Multi-currency support for Global Wealth Portfolio
 * Covers 30+ major world currencies with locale-aware formatting
 */

export const currencies = {
  INR: { name: "Indian Rupee", symbol: "₹", locale: "en-IN", country: "India" },
  USD: { name: "US Dollar", symbol: "$", locale: "en-US", country: "United States" },
  EUR: { name: "Euro", symbol: "€", locale: "de-DE", country: "European Union" },
  GBP: { name: "British Pound", symbol: "£", locale: "en-GB", country: "United Kingdom" },
  JPY: { name: "Japanese Yen", symbol: "¥", locale: "ja-JP", country: "Japan" },
  CNY: { name: "Chinese Yuan", symbol: "¥", locale: "zh-CN", country: "China" },
  AUD: { name: "Australian Dollar", symbol: "A$", locale: "en-AU", country: "Australia" },
  CAD: { name: "Canadian Dollar", symbol: "C$", locale: "en-CA", country: "Canada" },
  CHF: { name: "Swiss Franc", symbol: "CHF", locale: "de-CH", country: "Switzerland" },
  HKD: { name: "Hong Kong Dollar", symbol: "HK$", locale: "en-HK", country: "Hong Kong" },
  SGD: { name: "Singapore Dollar", symbol: "S$", locale: "en-SG", country: "Singapore" },
  NZD: { name: "New Zealand Dollar", symbol: "NZ$", locale: "en-NZ", country: "New Zealand" },
  KRW: { name: "South Korean Won", symbol: "₩", locale: "ko-KR", country: "South Korea" },
  RUB: { name: "Russian Ruble", symbol: "₽", locale: "ru-RU", country: "Russia" },
  BRL: { name: "Brazilian Real", symbol: "R$", locale: "pt-BR", country: "Brazil" },
  MXN: { name: "Mexican Peso", symbol: "Mex$", locale: "es-MX", country: "Mexico" },
  ZAR: { name: "South African Rand", symbol: "R", locale: "en-ZA", country: "South Africa" },
  AED: { name: "UAE Dirham", symbol: "د.إ", locale: "ar-AE", country: "UAE" },
  SAR: { name: "Saudi Riyal", symbol: "﷼", locale: "ar-SA", country: "Saudi Arabia" },
  TRY: { name: "Turkish Lira", symbol: "₺", locale: "tr-TR", country: "Turkey" },
  THB: { name: "Thai Baht", symbol: "฿", locale: "th-TH", country: "Thailand" },
  IDR: { name: "Indonesian Rupiah", symbol: "Rp", locale: "id-ID", country: "Indonesia" },
  MYR: { name: "Malaysian Ringgit", symbol: "RM", locale: "ms-MY", country: "Malaysia" },
  PHP: { name: "Philippine Peso", symbol: "₱", locale: "en-PH", country: "Philippines" },
  VND: { name: "Vietnamese Dong", symbol: "₫", locale: "vi-VN", country: "Vietnam" },
  PKR: { name: "Pakistani Rupee", symbol: "₨", locale: "en-PK", country: "Pakistan" },
  BDT: { name: "Bangladeshi Taka", symbol: "৳", locale: "bn-BD", country: "Bangladesh" },
  NGN: { name: "Nigerian Naira", symbol: "₦", locale: "en-NG", country: "Nigeria" },
  EGP: { name: "Egyptian Pound", symbol: "E£", locale: "ar-EG", country: "Egypt" },
  KES: { name: "Kenyan Shilling", symbol: "KSh", locale: "en-KE", country: "Kenya" },
  SEK: { name: "Swedish Krona", symbol: "kr", locale: "sv-SE", country: "Sweden" },
  NOK: { name: "Norwegian Krone", symbol: "kr", locale: "nb-NO", country: "Norway" },
  DKK: { name: "Danish Krone", symbol: "kr", locale: "da-DK", country: "Denmark" },
  PLN: { name: "Polish Zloty", symbol: "zł", locale: "pl-PL", country: "Poland" },
} as const;

export type CurrencyCode = keyof typeof currencies;

/**
 * Format a number as currency using locale-aware rules
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = "INR",
  options: { compact?: boolean; decimals?: number; sign?: boolean } = {}
): string {
  const meta = currencies[currency];
  if (!meta) return `${amount.toFixed(2)}`;
  const { compact = false, decimals, sign = false } = options;

  if (compact) {
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
      signDisplay: sign ? "exceptZero" : "auto",
    }).format(amount);
  }

  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
    signDisplay: sign ? "exceptZero" : "auto",
  }).format(amount);
}

/**
 * Parse a localized currency string back to a number.
 * Handles symbols, commas, decimals, and trailing spaces.
 */
export function parseCurrency(value: string): number {
  if (!value) return 0;
  // Remove everything except digits, decimal point, and minus sign
  const cleaned = value.replace(/[^\d.-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Get the symbol of a currency (for inline display)
 */
export function getCurrencySymbol(currency: CurrencyCode): string {
  return currencies[currency]?.symbol ?? currency;
}

/* ── Exchange Rate Cache ───────────────────────────────────── */
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/** Approximate fallback rates (updated periodically) for when APIs are unavailable */
const FALLBACK_RATES: Record<string, Record<string, number>> = {
  USD: { USD: 1, INR: 86.5, EUR: 0.92, GBP: 0.78, JPY: 150.2, CNY: 7.24, AUD: 1.54, CAD: 1.37, CHF: 0.88, SGD: 1.33, HKD: 7.82, KRW: 1380, RUB: 88.5, BRL: 5.12, MXN: 17.3, ZAR: 18.6, AED: 3.67, SAR: 3.75, TRY: 30.2, THB: 35.5, IDR: 15700, MYR: 4.45, PHP: 56.3, VND: 24800, PKR: 278, BDT: 110, NGN: 1590, EGP: 30.9, KES: 152, SEK: 10.45, NOK: 10.55, DKK: 6.92, PLN: 4.02 },
  INR: { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0090, JPY: 1.74, CNY: 0.084, AUD: 0.018, CAD: 0.016, CHF: 0.010, SGD: 0.015, HKD: 0.090, KRW: 15.95, RUB: 1.02, BRL: 0.059, MXN: 0.20, ZAR: 0.21, AED: 0.042, SAR: 0.043, TRY: 0.35, THB: 0.41, IDR: 181.5, MYR: 0.051, PHP: 0.65, VND: 286.7, PKR: 3.21, BDT: 1.27, NGN: 18.38, EGP: 0.36, KES: 1.76, SEK: 0.12, NOK: 0.12, DKK: 0.080, PLN: 0.046 },
  EUR: { EUR: 1, INR: 94.0, USD: 1.09, GBP: 0.86, JPY: 163.5, CNY: 7.88, AUD: 1.68, CAD: 1.49, CHF: 0.96, SGD: 1.45, HKD: 8.51, KRW: 1502, RUB: 96.3, BRL: 5.57, MXN: 18.83, ZAR: 20.24, AED: 4.0, SAR: 4.08, TRY: 32.87, THB: 38.64, IDR: 17085, MYR: 4.84, PHP: 61.28, VND: 26992, PKR: 302.6, BDT: 119.7, NGN: 1731, EGP: 33.64, KES: 165.5, SEK: 11.38, NOK: 11.48, DKK: 7.54, PLN: 4.37 },
  GBP: { GBP: 1, INR: 109.8, USD: 1.27, EUR: 1.17, JPY: 190.9, CNY: 9.20, AUD: 1.96, CAD: 1.74, CHF: 1.12, SGD: 1.69, HKD: 9.94, KRW: 1754, RUB: 112.4, BRL: 6.50, MXN: 21.99, ZAR: 23.64, AED: 4.67, SAR: 4.77, TRY: 38.38, THB: 45.12, IDR: 19952, MYR: 5.65, PHP: 71.56, VND: 31520, PKR: 353.4, BDT: 139.8, NGN: 2021, EGP: 39.29, KES: 193.3, SEK: 13.29, NOK: 13.40, DKK: 8.80, PLN: 5.11 },
};

const FX_API_URLS = [
  (base: string) => `https://api.frankfurter.app/latest?from=${base}`,
  (base: string) => `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`,
];

interface RateCache {
  rates: Record<string, number>;
  ts: number;
}

function getRateCacheKey(base: CurrencyCode): string {
  return `gwp:fx:${base}`;
}

function readRateCache(base: CurrencyCode): Record<string, number> | null {
  try {
    const raw = localStorage.getItem(getRateCacheKey(base));
    if (!raw) return null;
    const parsed: RateCache = JSON.parse(raw);
    if (Date.now() - parsed.ts < CACHE_TTL) return parsed.rates;
  } catch {}
  return null;
}

function writeRateCache(base: CurrencyCode, rates: Record<string, number>): void {
  try {
    localStorage.setItem(getRateCacheKey(base), JSON.stringify({ rates, ts: Date.now() }));
  } catch {}
}

/**
 * Fetch exchange rates for a base currency from multiple free APIs.
 * Caches in localStorage for 1 hour.
 * Falls back to approximate hardcoded rates if all APIs fail.
 */
export async function fetchExchangeRates(base: CurrencyCode): Promise<Record<string, number>> {
  const cached = readRateCache(base);
  if (cached) return cached;

  for (const urlFn of FX_API_URLS) {
    try {
      const url = urlFn(base);
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      let rates: Record<string, number> | undefined;

      if (data.rates) {
        rates = data.rates;
      } else if (data[base.toLowerCase()]) {
        const raw = data[base.toLowerCase()];
        rates = {};
        for (const [k, v] of Object.entries(raw)) {
          rates[k.toUpperCase()] = v as number;
        }
      }

      if (rates) {
        rates[base] = 1;
        writeRateCache(base, rates);
        return rates;
      }
    } catch {}
  }

  const fallback = FALLBACK_RATES[base];
  if (fallback) {
    writeRateCache(base, { ...fallback });
    return { ...fallback };
  }

  return {};
}

/**
 * Get the conversion rate from one currency to another.
 * Uses frankfurter.app with localStorage caching.
 */
export async function getConversionRate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
  if (from === to) return 1;
  const rates = await fetchExchangeRates(from);
  return rates[to] ?? 1;
}

/**
 * Convert an amount from one currency to another.
 */
export async function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
): Promise<number> {
  if (from === to || amount === 0) return amount;
  const rate = await getConversionRate(from, to);
  return amount * rate;
}

/**
 * Synchronous version of getConversionRate that reads from cache only.
 * Falls back to approximate hardcoded rates if not cached.
 * Computes cross-rates via USD when direct rate is unavailable.
 * Returns null only if no path exists.
 */
export function getCachedConversionRate(from: CurrencyCode, to: CurrencyCode): number | null {
  if (from === to) return 1;
  const cached = readRateCache(from);
  if (cached && cached[to] != null) return cached[to];
  const fallback = FALLBACK_RATES[from];
  if (fallback && fallback[to] != null) return fallback[to];
  // Try via USD as intermediary
  if (from !== "USD" && to !== "USD") {
    const toUsd = getCachedConversionRate(from, "USD" as CurrencyCode);
    const fromUsd = getCachedConversionRate("USD" as CurrencyCode, to);
    if (toUsd != null && fromUsd != null) return toUsd * fromUsd;
  }
  // Try inverse
  const inverse = getCachedConversionRate(to, from);
  if (inverse != null && inverse !== 0) return 1 / inverse;
  return null;
}

/**
 * Auto-detect currency from browser locale
 */
export function getBrowserCurrency(): CurrencyCode {
  if (typeof navigator === "undefined") return "USD";
  try {
    const locale = navigator.language || "en-US";
    // Use Intl to get currency for locale
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    })
      .formatToParts(0);
    // Crude country → currency mapping
    const countryCode = locale.split("-")[1]?.toUpperCase();
    const countryToCurrency: Record<string, CurrencyCode> = {
      IN: "INR", US: "USD", GB: "GBP", JP: "JPY", CN: "CNY",
      AU: "AUD", CA: "CAD", CH: "CHF", HK: "HKD", SG: "SGD",
      NZ: "NZD", KR: "KRW", RU: "RUB", BR: "BRL", MX: "MXN",
      ZA: "ZAR", AE: "AED", SA: "SAR", TR: "TRY", TH: "THB",
      ID: "IDR", MY: "MYR", PH: "PHP", VN: "VND", PK: "PKR",
      BD: "BDT", NG: "NGN", EG: "EGP", KE: "KES", SE: "SEK",
      NO: "NOK", DK: "DKK", PL: "PLN",
    };
    // Handle EU
    if (["DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "FI"].includes(countryCode ?? "")) {
      return "EUR";
    }
    if (countryCode && countryCode in countryToCurrency) {
      return countryToCurrency[countryCode];
    }
    return "USD";
  } catch {
    return "USD";
  }
}
