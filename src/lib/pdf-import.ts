/**
 * PDF import pipeline.
 *
 * Two strategies, picked automatically:
 *  1. **Text layer** — when the PDF was generated from a digital source, pdf.js
 *     can extract its text directly. Cheap and accurate.
 *  2. **Rasterize + OCR** — when the PDF is a scanned image (or text extraction
 *     produces too few results), each page is rendered to a canvas and fed
 *     to Tesseract. Same engine used for image-based bank statements.
 *
 * The extracted text is fed through the existing `parseTransactions` heuristic
 * in `ocr.ts`, so all bank-statement parsing rules apply equally to PDFs and
 * images.
 */
import { ocrImage, parseTransactions, type ParsedTransaction } from "./ocr";

export type PdfMode = "bank" | "depository";

export interface PdfProgress {
  status: string;
  progress: number; // 0-1
  page?: number;
  pageCount?: number;
}

export interface PdfImportResult {
  text: string;
  transactions: ParsedTransaction[];
  pageCount: number;
  strategy: "text" | "ocr";
  durationMs: number;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function getPdfjs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async () => {
    const pdfjs = await import("pdfjs-dist");
    // The default worker uses a CDN. Configure it once so pdf.js knows where
    // to fetch the worker script. We point at the same-version ESM build that
    // ships with the package.
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    return pdfjs;
  })();
  return pdfjsPromise;
}

interface PageText {
  pageNumber: number;
  text: string;
}

/** Extracts text from every page in the PDF (digital text-layer extraction). */
export async function extractPdfText(
  file: File | Blob,
  onProgress?: (p: PdfProgress) => void,
): Promise<{ pages: PageText[]; pageCount: number }> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = doc.numPages;
  const pages: PageText[] = [];
  for (let i = 1; i <= pageCount; i++) {
    onProgress?.({
      status: `Extracting text from page ${i}/${pageCount}…`,
      progress: (i - 1) / pageCount,
      page: i,
      pageCount,
    });
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean);
    pages.push({ pageNumber: i, text: strings.join(" ") });
    page.cleanup();
  }
  onProgress?.({ status: "Text extraction complete.", progress: 1, pageCount });
  return { pages, pageCount };
}

/** Renders a single page to a PNG blob (used when we need to OCR a page). */
async function rasterizePage(
  file: File | Blob,
  pageNumber: number,
  scale = 2,
): Promise<Blob> {
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available.");
  // White background — some PDF viewers composite onto transparent
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  page.cleanup();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Failed to encode page image."));
    }, "image/png");
  });
}

/** Heuristic: if text extraction produced very few transactions, fall back to OCR. */
function looksLikeScannedPdf(text: string): boolean {
  const stripped = text.replace(/\s+/g, "").trim();
  return stripped.length < 80;
}

/**
 * Full PDF import pipeline.
 * - Extracts text from the PDF.
 * - If the text looks empty/scanned, rasterizes every page and runs OCR.
 * - Feeds the resulting text through the bank-statement transaction parser.
 */
export async function importPdf(
  file: File | Blob,
  onProgress?: (p: PdfProgress) => void,
): Promise<PdfImportResult> {
  const start = performance.now();

  onProgress?.({ status: "Reading PDF…", progress: 0 });
  const { pages, pageCount } = await extractPdfText(file, (p) =>
    onProgress?.({ ...p, status: p.status || "Reading PDF…" }),
  );
  const joinedText = pages.map((p) => p.text).join("\n");
  let fullText = joinedText;
  let strategy: "text" | "ocr" = "text";

  if (looksLikeScannedPdf(joinedText)) {
    strategy = "ocr";
    const ocrPages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      onProgress?.({
        status: `Rasterizing page ${i}/${pageCount}…`,
        progress: 0.1 + (0.2 * (i - 1)) / pageCount,
        page: i,
        pageCount,
      });
      const blob = await rasterizePage(file, i, 2);
      onProgress?.({
        status: `Recognising text on page ${i}/${pageCount}…`,
        progress: 0.3 + (0.7 * (i - 1)) / pageCount,
        page: i,
        pageCount,
      });
      const res = await ocrImage(blob, (p) =>
        onProgress?.({
          status: `Page ${i}: ${p.status}`,
          progress: 0.3 + (0.7 * (i - 1)) / pageCount + (0.7 / pageCount) * p.progress,
          page: i,
          pageCount,
        }),
      );
      ocrPages.push(res.text);
    }
    fullText = ocrPages.join("\n");
  }

  onProgress?.({ status: "Parsing transactions…", progress: 0.95 });
  const transactions = parseTransactions(fullText);
  onProgress?.({ status: "Done.", progress: 1, pageCount });
  return {
    text: fullText,
    transactions,
    pageCount,
    strategy,
    durationMs: performance.now() - start,
  };
}

export interface ParsedHolding {
  script: string;
  quantity: number | null;
  value: number | null;
  asOf: string | null; // YYYY-MM-DD
  raw: string;
}

const HOLDING_KEYWORDS =
  /\b(isin|scrip|script|security|holding|equity|share|quantity|qty|closing|balances?|statement of transaction|holdings as on|portfolio|valuation)\b/i;

/**
 * Lightweight depository-statement parser.
 *
 * Looks for lines that contain both a positive number (qty or value) and a
 * non-numeric token (script name).  A line that contains two or more
 * currency-formatted numbers is treated as a holding row.
 */
export function parseHoldings(text: string): ParsedHolding[] {
  if (!text) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const results: ParsedHolding[] = [];

  // Find an "as of" date near the top of the document
  let asOf: string | null = null;
  for (const line of lines.slice(0, 40)) {
    const m =
      line.match(/as\s*on\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i) ||
      line.match(/statement\s*for\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i) ||
      line.match(/on\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})/i);
    if (m) {
      asOf = parseDateLike(m[1]);
      if (asOf) break;
    }
  }

  for (const line of lines) {
    if (line.length < 8 || line.length > 220) continue;
    if (!HOLDING_KEYWORDS.test(line) && !/[A-Za-z]/.test(line)) continue;
    const amountMatches = Array.from(
      line.matchAll(/([\d,]+\.\d{2}|\b\d{2,}\b)/g),
    ).map((m) => parseFloat(m[1].replace(/,/g, "")));
    const numericCount = amountMatches.filter(
      (n) => !Number.isNaN(n) && n > 0,
    ).length;
    if (numericCount < 1) continue;

    // Pull out the script name: words that look like an issuer (capitalised
    // tokens, possibly with dots/ampersands). Anything before the first
    // numeric token on the line is the script name.
    const firstNumIdx = line.search(/[\d,]+/);
    const scriptCandidate = firstNumIdx > 0 ? line.slice(0, firstNumIdx).trim() : "";
    const cleanedScript = scriptCandidate
      .replace(/[^A-Za-z0-9 .&\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleanedScript.length < 3) continue;
    if (/^(total|grand|sub|net|page|date|statement|opening|closing|balance|c\d+)$/i.test(cleanedScript)) {
      continue;
    }

    const value =
      amountMatches.length > 0
        ? Math.max(...amountMatches.filter((n) => n < 1e10))
        : null;
    const quantity = amountMatches.length > 1 ? amountMatches[0] : null;

    results.push({
      script: cleanedScript.slice(0, 80),
      quantity,
      value,
      asOf,
      raw: line,
    });
  }

  // Deduplicate by script name, keeping the highest value seen
  const seen = new Map<string, ParsedHolding>();
  for (const h of results) {
    const key = h.script.toLowerCase();
    const prev = seen.get(key);
    if (!prev || (h.value ?? 0) > (prev.value ?? 0)) {
      seen.set(key, h);
    }
  }
  return Array.from(seen.values());
}

function parseDateLike(s: string): string | null {
  // Mirrors the helper in ocr.ts. Duplicated here to avoid a circular import
  // for the lightweight holdings parser.
  const isoMatch = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const slashMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const y = parseInt(slashMatch[3], 10) < 100
      ? 2000 + parseInt(slashMatch[3], 10)
      : parseInt(slashMatch[3], 10);
    return `${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }
  const textMatch = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (textMatch) {
    const day = parseInt(textMatch[1], 10);
    const monthMap: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
      sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const month = monthMap[textMatch[2].toLowerCase().slice(0, 3)];
    const y = parseInt(textMatch[3], 10) < 100
      ? 2000 + parseInt(textMatch[3], 10)
      : parseInt(textMatch[3], 10);
    if (month) return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}
