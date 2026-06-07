/**
 * Live benchmark data fetcher.
 * Pulls 1M / 6M / 1Y / 3Y / 5Y returns from public market-data sources,
 * caches the result in localStorage, and gracefully falls back to the
 * built-in static BENCHMARKS table when the network is unavailable.
 *
 * Data sources:
 *  - Yahoo Finance daily history (most equity, commodity, crypto indices)
 *  - CORS proxy as a fallback for browser-side fetches
 */

import { BENCHMARKS, type Benchmark } from "./types";

const CACHE_KEY = "gwp:benchmarks:v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

interface CacheShape {
  ts: number;
  benchmarks: Benchmark[];
}

interface YSeriesPoint {
  date: number; // seconds since epoch
  close: number;
}

interface YSeriesResult {
  meta: { regularMarketPrice: number; symbol: string };
  timestamp: number[];
  indicators: { quote: { close: (number | null)[] }[] };
}

interface TickerConfig {
  symbol: string;
  range: "5y" | "max";
  interval: "1d" | "1wk" | "1mo";
}

const TICKERS: Record<string, TickerConfig> = {
  nifty50: { symbol: "^NSEI", range: "5y", interval: "1d" },
  sensex: { symbol: "^BSESN", range: "5y", interval: "1d" },
  niftymidcap: { symbol: "NIFTY_MIDCAP_150.NS", range: "5y", interval: "1d" },
  sp500: { symbol: "^GSPC", range: "5y", interval: "1d" },
  nasdaq: { symbol: "^NDX", range: "5y", interval: "1d" },
  goldmcx: { symbol: "GOLDBEES.NS", range: "5y", interval: "1d" },
  goldintl: { symbol: "GC=F", range: "5y", interval: "1d" },
  btc: { symbol: "BTC-USD", range: "5y", interval: "1d" },
  eth: { symbol: "ETH-USD", range: "5y", interval: "1d" },
};

const PROXIES = [
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readCache(): CacheShape | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (!parsed?.ts || !Array.isArray(parsed.benchmarks)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(b: Benchmark[]): void {
  if (!isBrowser()) return;
  try {
    const payload: CacheShape = { ts: Date.now(), benchmarks: b };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
}

function logFailure(id: string, reason: string): void {
  // One-line console warning keeps the UI quiet but useful in dev tools.
  // eslint-disable-next-line no-console
  console.warn(`[benchmarks] ${id}: ${reason}`);
}

function findClosestIndex(timestamps: number[], targetMs: number): number {
  if (timestamps.length === 0) return -1;
  let lo = 0;
  let hi = timestamps.length - 1;
  // Binary search for the largest timestamp <= target
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (timestamps[mid] * 1000 <= targetMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function pctReturnFromPoints(closes: (number | null)[], timestamps: number[], daysAgo: number): number | null {
  if (closes.length === 0 || timestamps.length === 0) return null;
  const target = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  const idx = findClosestIndex(timestamps, target);
  if (idx < 0) return null;
  const past = closes[idx];
  const last = closes[closes.length - 1];
  if (past == null || last == null || past <= 0) return null;
  return ((last - past) / past) * 100;
}

async function fetchYahoo(ticker: TickerConfig): Promise<YSeriesResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker.symbol,
  )}?range=${ticker.range}&interval=${ticker.interval}`;

  // Try direct fetch first
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = (await res.json()) as { chart?: { result?: YSeriesResult[]; error?: unknown } };
      const r = data?.chart?.result?.[0];
      if (r) return r;
    }
  } catch {
    /* network or CORS — try proxy */
  }

  // Try proxies
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = (await res.json()) as { chart?: { result?: YSeriesResult[]; error?: unknown } };
        const r = data?.chart?.result?.[0];
        if (r) return r;
      }
    } catch {
      /* try next proxy */
    }
  }
  return null;
}

async function fetchBenchmark(b: Benchmark): Promise<Benchmark> {
  const ticker = TICKERS[b.id];
  if (!ticker) return b; // No live data source for this benchmark
  try {
    const result = await fetchYahoo(ticker);
    if (!result) {
      logFailure(b.id, "no data from Yahoo");
      return b;
    }
    const closes = result.indicators.quote[0]?.close ?? [];
    const timestamps = result.timestamp ?? [];
    const oneMonth = pctReturnFromPoints(closes, timestamps, 30);
    const sixMonth = pctReturnFromPoints(closes, timestamps, 182);
    const oneYear = pctReturnFromPoints(closes, timestamps, 365);
    const threeYear = pctReturnFromPoints(closes, timestamps, 365 * 3);
    const fiveYear = pctReturnFromPoints(closes, timestamps, 365 * 5);
    // Use CAGR for multi-year periods when full history is present
    const annualized = (closeAtDays: number, days: number): number | null => {
      const target = Date.now() - closeAtDays * 24 * 60 * 60 * 1000;
      const idx = findClosestIndex(timestamps, target);
      if (idx < 0) return null;
      const past = closes[idx];
      const last = closes[closes.length - 1];
      if (past == null || last == null || past <= 0) return null;
      const years = days / 365;
      return (Math.pow(last / past, 1 / years) - 1) * 100;
    };
    const threeYearCagr = annualized(365 * 3, 365 * 3);
    const fiveYearCagr = annualized(365 * 5, 365 * 5);
    if (
      oneMonth == null ||
      sixMonth == null ||
      oneYear == null ||
      threeYearCagr == null ||
      fiveYearCagr == null
    ) {
      logFailure(b.id, "incomplete history");
      return b;
    }
    return {
      ...b,
      oneMonth: round1(oneMonth),
      sixMonth: round1(sixMonth),
      oneYear: round1(oneYear),
      threeYear: round1(threeYearCagr),
      fiveYear: round1(fiveYearCagr),
    };
  } catch (e) {
    logFailure(b.id, e instanceof Error ? e.message : "fetch error");
    return b;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function fetchLiveBenchmarks(): Promise<{
  benchmarks: Benchmark[];
  live: boolean;
  fetchedAt: number;
}> {
  const cached = readCache();
  if (cached) {
    return { benchmarks: cached.benchmarks, live: true, fetchedAt: cached.ts };
  }
  // Fetch all in parallel; keep the static fallback on failure
  const results = await Promise.all(BENCHMARKS.map((b) => fetchBenchmark(b)));
  const anyLive = results.some((r, i) => r !== BENCHMARKS[i]);
  if (anyLive) writeCache(results);
  return { benchmarks: results, live: anyLive, fetchedAt: Date.now() };
}

export function clearBenchmarkCache(): void {
  if (isBrowser()) localStorage.removeItem(CACHE_KEY);
}
