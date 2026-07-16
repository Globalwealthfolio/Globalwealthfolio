/**
 * Bank-statement OCR pipeline.
 * 1. Run Tesseract.js on the uploaded image.
 * 2. Parse the recognized text with heuristic rules to extract
 *    date / description / amount rows.
 *
 * Heavy assets (tesseract.js + worker) are loaded lazily on the client.
 */

import type { Expense, Investment } from "./types";
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

/* ── Image preprocessing ────────────────────────────────────── */

async function preprocessImage(file: File | Blob): Promise<Blob> {
  const img = await createImageBitmap(file);
  let w = img.width;
  let h = img.height;

  // Scale to a reasonable size for Tesseract: max 2000px on longest side
  const MAX_DIM = 2000;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  if (scale < 1) { w = Math.round(w * scale); h = Math.round(h * scale); }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const len = d.length / 4;

  // Single pass: grayscale + accumulate histogram
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = Math.round(gray);
    d[i] = d[i + 1] = d[i + 2] = v;
    hist[v]++;
  }

  // Find 5th and 95th percentiles from histogram (no sorting needed)
  let cumul = 0;
  const p5 = Math.round(len * 0.05);
  const p95 = Math.round(len * 0.95);
  let lo = 0, hi = 255;
  for (let i = 0; i < 256; i++) {
    cumul += hist[i];
    if (cumul >= p5 && lo === 0) lo = i;
    if (cumul >= p95) { hi = i; break; }
  }
  const range = hi - lo || 255;

  // Contrast stretch (no binarization — preserves grayscale for Tesseract)
  for (let i = 0; i < d.length; i += 4) {
    let v = d[i];
    v = ((v - lo) / range) * 255;
    v = Math.max(0, Math.min(255, Math.round(v)));
    d[i] = d[i + 1] = d[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);

  // PNG is slower to encode but lossless — critical for OCR accuracy
  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

/* ── Tesseract worker (lazy loaded) ─────────────────────────── */
let workerPromise: Promise<unknown> | null = null;

// Reports progress from 0..1 mapped so it never goes backward.
// Tesseract's internal progress occupies [0.15, 0.9]; we reserve
// [0, 0.15) for preprocessing and [0.9, 1] for final parsing.
const PRE_START = 0.15;
const POST_END = 0.9;

async function getWorker(tesseractProgress?: (p: number) => void) {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const Tesseract = await import("tesseract.js");
    const worker = await Tesseract.createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => {
        tesseractProgress?.(m.progress);
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

  // Stage 1: preprocessing (0 → 0.15)
  onProgress?.({ status: "Enhancing image…", progress: 0 });
  const processed = await preprocessImage(file);
  onProgress?.({ status: "Recognising text…", progress: PRE_START });

  // Stage 2: Tesseract OCR (0.15 → 0.9 via mapped logger)
  const worker = (await getWorker((tp: number) => {
    const mapped = PRE_START + tp * (POST_END - PRE_START);
    onProgress?.({ status: "Recognising text…", progress: mapped });
  })) as {
    recognize: (input: File | Blob) => Promise<{ data: { text: string } }>;
  };
  const { data } = await worker.recognize(processed);
  const rawText = data.text ?? "";

  // Stage 3: parsing (0.9 → 1)
  let parseP = POST_END;
  const step = (1 - POST_END) / 3;
  onProgress?.({ status: "Parsing results…", progress: (parseP += step) });

  const transactions = parseTransactions(rawText);
  onProgress?.({ status: "Classifying statement…", progress: (parseP += step) });

  onProgress?.({ status: "Done", progress: 1 });
  return { text: rawText, transactions, durationMs: performance.now() - start };
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

/* ── Statement type classifier ──────────────────────────────── */

export type StatementType = "expense" | "investment" | "unknown";

const BANK_INDICATORS: RegExp[] = [
  /\b(opening balance|closing balance|dr\b|cr\b|debit|credit|withdrawal|deposit|transaction|payment|chq|cheque|ref\b|transfer|nft|neft|imps|rtgs|upi|atm|pos\b|billed)\b/i,
  /\b(bank|savings|current|account|statement|credit card|debit card)\b/i,
  /\b(balance|amount|paid|received|txn|paid to|by transfer|to self|by cash)\b/i,
];

const INVESTMENT_INDICATORS: RegExp[] = [
  /\b(portfolio|holding|valuation|holdings?|folio|scheme|fund|mutual fund|sip\b|nav\b|market value|iscin|isin)\b/i,
  /\b(scrip|script|security|equity|share|stock|bond|debenture|quantity|qty|units|unit)\b/i,
  /\b(as on|as at|statement of|demat|depository|cdsl|nsdl|broker|zerodha|groww|upstox|angel|icici direct|hdfc sec)\b/i,
  /\b(closing balance|opening balance|net asset|aum|face value|cost value|gain loss|p&l)\b/i,
  /\b(column|quantity|amount|rate|value|net total|grand total)\s*.*\d/i,
];

export function classifyStatementType(text: string): StatementType {
  if (!text || text.length < 20) return "unknown";

  const lines = text.split(/\n+/).filter(Boolean);
  const lineCount = lines.length;

  let bankScore = 0;
  let investmentScore = 0;

  // Check for date density (bank statements have many dates)
  const dateCount = lines.filter((l) => DATE_PATTERNS.some((p) => p.test(l))).length;
  if (dateCount > 2) bankScore += 2;
  if (dateCount > 5) bankScore += 2;

  // Check for amount density (both have amounts, but bank has more per line)
  const amountCount = lines.filter((l) => /[\d,]+\.\d{2}/.test(l)).length;
  if (amountCount > lineCount * 0.3) bankScore += 1;

  // Count keyword matches
  for (const re of BANK_INDICATORS) {
    if (re.test(text)) bankScore += 1;
  }
  for (const re of INVESTMENT_INDICATORS) {
    if (re.test(text)) investmentScore += 2;
  }

  // Check for top-line holdings patterns: word + number + number
  const holdingPatternCount = lines.filter((l) => {
    const words = l.match(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/g);
    const nums = l.match(/[\d,]+(?:\.\d+)?/g);
    return words && words.length >= 1 && nums && nums.length >= 2;
  }).length;

  if (holdingPatternCount > 2) investmentScore += 3;

  // Check for table-like structure (columns with whitespace alignment)
  const twoColNums = lines.filter((l) => {
    const nums = l.match(/[\d,]+\.\d{2}/g);
    return nums && nums.length >= 2;
  }).length;
  if (twoColNums > 3) investmentScore += 2;

  // Normalize by line count
  bankScore = bankScore / Math.max(1, lineCount / 10);
  investmentScore = investmentScore / Math.max(1, lineCount / 10);

  if (investmentScore > bankScore && investmentScore >= 1) return "investment";
  if (bankScore > investmentScore && bankScore >= 1) return "expense";
  return "unknown";
}

/* ── Investment data parsing (from OCR text) ────────────────── */

export interface OCRInvestment {
  name: string;
  quantity: number | null;
  /** Invested amount (Inv. Amount / Cost) */
  amount: number | null;
  /** Current / market value (Current Amount / Market Value) */
  currentValue: number | null;
  asOf: string | null;
  raw: string;
}

const HOLDING_DATE_PATTERNS = [
  /as\s*on\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  /as\s*at\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  /statement\s*(?:for|of|period|date)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  /(?:for|on|as at)\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i,
  /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}).*(?:folio|statement|holding)/i,
];

function parseHoldingDate(text: string): string | null {
  for (const re of HOLDING_DATE_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const d = parseDate(m[1]);
      if (d) return d;
    }
  }
  return null;
}

/* ── Column header patterns for investment statements ───────── */

const HEADER_COLUMNS = [
  { key: "name",     re: /\b(name|script|scrip|security|scheme|fund|holding|particulars|description|equity|shares|instrument)\b/i },
  { key: "quantity", re: /\b(quantity|qty|units?|count|no\.? of)\b/i },
  { key: "amount",   re: /\b(inv\.?\s*(?:amount|amt|value)|invested\s*(?:amount|value)?|cost\s*(?:value)?|purchase\s*(?:price|value)?|acquisition|buy\s*(?:price|value)?|face\s*value|amt\s*invested)\b/i },
  { key: "currentValue", re: /\b(current\s*(?:amount|value|amt|nav)?|market\s*(?:value)?|nav\s*(?:amount|value)?|closing\s*(?:value|balance|nav)?|valuation|cur\.?\s*value)\b/i },
  { key: "nav",      re: /\b(nav|rate|price|unit\s*price)\b/i },
];

type HeaderMap = Partial<Record<"name" | "quantity" | "amount" | "currentValue" | "nav", number>>;

/** Try to detect a column layout from header lines at the top of the text. */
function detectColumns(lines: string[]): HeaderMap | null {
  for (const line of lines.slice(0, 20)) {
    const tokens = line.split(/\s{2,}|\t|(?<=[a-z])\s+(?=[A-Z])/).filter(Boolean);
    const matched: HeaderMap = {};
    let foundAny = false;
    for (let ci = 0; ci < tokens.length; ci++) {
      for (const col of HEADER_COLUMNS) {
        if (col.re.test(tokens[ci]) && matched[col.key] === undefined) {
          matched[col.key] = ci;
          foundAny = true;
          break;
        }
      }
    }
    if (foundAny && matched.name !== undefined) return matched;
  }
  return null;
}

/** Extract numeric values from a line, returning an array of { value, raw } pairs. */
function extractNums(line: string): { value: number; end: number }[] {
  const results: { value: number; end: number }[] = [];
  const re = /(\d[\d,]*)(?:\.(\d{1,2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const intPart = m[1].replace(/,/g, "");
    // Build full decimal — if it ends in ".00" use the integer part
    let full: string;
    if (m[2] !== undefined) {
      // If decimals are "00", treat as whole number suffix
      full = m[2] === "00" ? intPart : intPart + "." + m[2];
    } else {
      full = intPart;
    }
    const n = parseFloat(full);
    if (!isNaN(n) && n > 0 && n < 1e10) {
      results.push({ value: n, end: m.index + m[0].length });
    }
  }
  return results;
}

export function parseInvestmentText(text: string): OCRInvestment[] {
  if (!text) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const results: OCRInvestment[] = [];

  const asOf = parseHoldingDate(text.slice(0, 2000));
  const columns = detectColumns(lines);

  for (const line of lines) {
    if (line.length < 6 || line.length > 300) continue;

    // Skip header and summary lines
    if (/^(page|date|particulars|description|scheme|folio|statement|summary|total|grand|sub\s*total|closing|opening|sno|sr|#)/i.test(line)) {
      continue;
    }

    const nums = extractNums(line);
    if (nums.length === 0) continue;
    if (!/[A-Za-z]/.test(line)) continue;

    // Extract the asset name: everything before the first number
    const firstNumIdx = line.search(/[\d,]+/);
    let name = firstNumIdx > 0 ? line.slice(0, firstNumIdx).trim() : "";
    name = name.replace(/[^A-Za-z0-9 .&\-\(\)\/]/g, " ").replace(/\s+/g, " ").trim();

    if (name.length < 2) continue;
    if (/^(total|sub|net|page|date|as on|as at|statement|opening|closing|balance|c\d+)$/i.test(name)) {
      continue;
    }

    let quantity: number | null = null;
    let amount: number | null = null;
    let currentValue: number | null = null;

    if (columns) {
      // Try to use column positions to map values
      const sorted = [...nums].sort((a, b) => b.value - a.value);
      if (columns.amount !== undefined || columns.currentValue !== undefined) {
        const hasBoth = columns.amount !== undefined && columns.currentValue !== undefined;
        if (hasBoth && nums.length >= 2) {
          // Two values: larger is usually current value (market), smaller is invested
          currentValue = sorted[0].value;
          amount = sorted[1].value;
        } else if (nums.length === 1) {
          // Single value — treat as current value if "current" column exists
          currentValue = nums[0].value;
          amount = null;
        } else {
          currentValue = sorted[0].value;
          amount = sorted.length > 1 ? sorted[1].value : null;
        }
      }
      if (columns.quantity !== undefined && nums.length >= (columns.amount !== undefined ? 3 : 2)) {
        quantity = sorted[sorted.length - 1].value;
      }
    } else {
      // No headers detected: use heuristic sorting
      const sorted = [...nums].sort((a, b) => b.value - a.value);
      if (nums.length >= 2) {
        currentValue = sorted[0].value;
        amount = sorted[1].value;
        if (nums.length >= 3) quantity = sorted[sorted.length - 1].value;
      } else {
        currentValue = sorted[0].value;
      }
    }

    results.push({
      name: name.slice(0, 100),
      quantity,
      amount,
      currentValue: currentValue ?? amount,
      asOf,
      raw: line,
    });
  }

  // Deduplicate by name, keeping the version with the most data
  const seen = new Map<string, OCRInvestment>();
  for (const h of results) {
    const key = h.name.toLowerCase();
    const prev = seen.get(key);
    const score = (h.currentValue ?? 0) + (h.amount ?? 0);
    const prevScore = prev ? (prev.currentValue ?? 0) + (prev.amount ?? 0) : 0;
    if (!prev || score > prevScore) {
      seen.set(key, h);
    }
  }
  return Array.from(seen.values());
}

export function ocrInvestmentsToInvestments(
  items: OCRInvestment[],
  defaultType: Investment["type"] = "Equity",
): Investment[] {
  const ts = nowISO();
  return items
    .filter((h) => (h.amount ?? h.currentValue ?? 0) > 0)
    .map((h) => ({
      id: uid(),
      name: h.name,
      type: defaultType,
      amount: h.amount ?? h.currentValue ?? 0,
      currentValue: h.currentValue ?? h.amount ?? 0,
      date: h.asOf ?? ts.split("T")[0],
      risk: 6,
      notes: `Imported from statement image`,
      createdAt: ts,
      updatedAt: ts,
    }));
}
