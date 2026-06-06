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
