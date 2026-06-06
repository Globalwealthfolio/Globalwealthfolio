/**
 * Bank-statement OCR pipeline.
 * 1. Run Tesseract.js on the uploaded image.
 * 2. Parse the recognized text with heuristic rules to extract
 *    date / description / amount rows.
 *
 * Heavy assets (tesseract.js + worker) are loaded lazily on the client.
 */

import type { Expense } from "./types";
import { uid, nowISO } from "./store";

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  raw: string;
}

export interface OCRProgress {
  status: string;
  progress: number; // 0-1
}

export interface OCRResult {
  text: string;
  transactions: ParsedTransaction[];
  durationMs: number;
}

/* ── Heuristic transaction parser ───────────────────────────── */
const DATE_PATTERNS: RegExp[] = [
  // 01/02/2024, 01-02-2024, 1 Feb 2024
  /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
  // 2024-02-01, 2024/02/01
  /(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/,
  // 01 Feb 2024, 1 Feb 2024
  /(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/,
];

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseDate(s: string): string | null {
  // YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  // DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const yRaw = parseInt(slashMatch[3], 10);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    // Heuristic: if first part > 12, it must be DD/MM
    const day = a > 12 ? a : a;
    const month = a > 12 ? b : b;
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // 01 Feb 2024
  const textMatch = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (textMatch) {
    const day = parseInt(textMatch[1], 10);
    const monthKey = textMatch[2].toLowerCase();
    const month = MONTH_MAP[monthKey];
    const yRaw = parseInt(textMatch[3], 10);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    if (month) return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

function extractAmount(s: string): { amount: number; type: "debit" | "credit" } | null {
  // Look for currency-formatted numbers
  const re = /([\d,]+\.\d{2}|\d+)/g;
  const matches: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (!isNaN(n) && n > 0 && n < 1e9) matches.push(n);
  }
  if (matches.length === 0) return null;
  // Largest match is the amount
  const amount = Math.max(...matches);
  const lower = s.toLowerCase();
  const isCredit = /\b(cr|credit|deposit|received|refund|salary|income)\b/.test(lower);
  const isDebit = /\b(dr|debit|withdraw|payment|spent|purchase|charge|fee)\b/.test(lower);
  return { amount, type: isCredit && !isDebit ? "credit" : "debit" };
}

export function parseTransactions(text: string): ParsedTransaction[] {
  if (!text) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const results: ParsedTransaction[] = [];

  for (const line of lines) {
    let date: string | null = null;
    let rest = line;
    for (const re of DATE_PATTERNS) {
      const m = line.match(re);
      if (m) {
        date = parseDate(m[1]);
        if (date) {
          rest = line.replace(m[1], "").trim();
          break;
        }
      }
    }
    if (!date) continue;
    const amt = extractAmount(rest);
    if (!amt) continue;
    // Clean description: collapse spaces, drop the amount itself
    let desc = rest;
    desc = desc.replace(/[\d,]+\.\d{2}/g, "").replace(/\b\d+\b/g, "");
    desc = desc.replace(/\b(dr|cr|debit|credit|dr\.|cr\.)\b/gi, "");
    desc = desc.replace(/[\s\-_|]+/g, " ").trim();
    if (desc.length < 2) desc = "Bank transaction";

    results.push({
      date,
      description: desc.slice(0, 100),
      amount: amt.amount,
      type: amt.type,
      raw: line,
    });
  }
  return results;
}

/* ── Tesseract worker (lazy loaded) ─────────────────────────── */
let workerPromise: Promise<unknown> | null = null;

async function getWorker(onProgress?: (p: OCRProgress) => void) {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const Tesseract = await import("tesseract.js");
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        onProgress?.({ status: m.status, progress: m.progress });
      },
    });
    return worker;
  })();
  return workerPromise;
}

export async function ocrImage(
  file: File | Blob,
  onProgress?: (p: OCRProgress) => void,
): Promise<OCRResult> {
  const start = performance.now();
  const worker = (await getWorker(onProgress)) as {
    recognize: (input: File | Blob) => Promise<{ data: { text: string } }>;
  };
  const { data } = await worker.recognize(file);
  const text = data.text ?? "";
  const transactions = parseTransactions(text);
  return { text, transactions, durationMs: performance.now() - start };
}

export async function terminateOCR() {
  if (!workerPromise) return;
  try {
    const w = (await workerPromise) as { terminate: () => Promise<void> };
    await w.terminate();
  } catch {
    // ignore
  }
  workerPromise = null;
}

/* ── Convert OCR results to Expense entities ─────────────────── */
export function transactionsToExpenses(
  txns: ParsedTransaction[],
  defaultCategory: Expense["category"] = "Other",
): Expense[] {
  const ts = nowISO();
  return txns
    .filter((t) => t.type === "debit") // only expenses by default
    .map((t) => ({
      id: uid(),
      description: t.description,
      category: guessCategory(t.description) ?? defaultCategory,
      amount: t.amount,
      date: t.date,
      recurring: "one-time",
      notes: `Imported from bank statement`,
      createdAt: ts,
      updatedAt: ts,
    }));
}

const CATEGORY_KEYWORDS: Record<Expense["category"], RegExp> = {
  Housing: /\b(rent|mortgage|maintenance|society|electricity|water|gas bill)\b/i,
  "Food & Dining": /\b(restaurant|cafe|coffee|swiggy|zomato|food|dining|lunch|dinner|breakfast|starbucks|mcdonald|kfc)\b/i,
  Transport: /\b(uber|ola|lyft|taxi|metro|petrol|diesel|fuel|bus|train|flight|airline|rapido)\b/i,
  Utilities: /\b(electricity|water|gas|internet|wifi|broadland|airtel|jio|vi|reliance)\b/i,
  Healthcare: /\b(apollo|medplus|pharmacy|hospital|clinic|doctor|medic|health|labs)\b/i,
  Education: /\b(school|college|tuition|course|udemy|coursera|book|class)\b/i,
  Shopping: /\b(amazon|flipkart|myntra|ajio|shop|store|mall|retail|cloth)\b/i,
  Entertainment: /\b(netflix|spotify|hotstar|prime|youtube|game|steam|cinema|movie|pvr|inox)\b/i,
  Insurance: /\b(insurance|lic|hdfc life|icici prudential|policy|premium)\b/i,
  Investment: /\b(mutual fund|sip|stock|share|zerodha|groww|kuvera|upstox|coin)\b/i,
  Travel: /\b(booking|hotel|airbnb|oyo|makemytrip|goibibo|yatra|vacation|holiday)\b/i,
  "Personal Care": /\b(salon|spa|gym|beauty|cosmetic|parlour)\b/i,
  Gifts: /\b(gift|donation|charity|gpay to family)\b/i,
  Other: /.*/,
};

export function guessCategory(desc: string): Expense["category"] | null {
  for (const [cat, re] of Object.entries(CATEGORY_KEYWORDS)) {
    if (cat === "Other") continue;
    if (re.test(desc)) return cat as Expense["category"];
  }
  return null;
}
