/**
 * Excel / CSV / JSON import + export helpers
 * Uses SheetJS (xlsx) for spreadsheet parsing in the browser.
 */

import { type AppData, type Investment, type Expense, type EMI, type Goal, DEFAULT_DATA } from "./types";
import { uid, nowISO } from "./store";

/* ── Export ─────────────────────────────────────────────────── */
export function exportJSON(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function exportCSV(rows: Record<string, unknown>[], filename: string): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  );
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  });
  return lines.join("\n");
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── JSON Import ────────────────────────────────────────────── */
export function importJSON(text: string): AppData {
  const parsed = JSON.parse(text) as Partial<AppData>;
  return {
    ...structuredClone(DEFAULT_DATA),
    ...parsed,
    preferences: { ...DEFAULT_DATA.preferences, ...(parsed.preferences ?? {}) },
  } as AppData;
}

/* ── Excel / CSV Import ─────────────────────────────────────── */
export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
  sheetName: string;
}

export async function parseSpreadsheet(file: File): Promise<ParsedSheet[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => {
    const sheet = wb.Sheets[name];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
      dateNF: "yyyy-mm-dd",
    });
    const headers = json.length > 0 ? Object.keys(json[0]) : [];
    const rows = json.map((row) => {
      const out: Record<string, string> = {};
      for (const k of Object.keys(row)) {
        const v = row[k];
        out[k] = v instanceof Date
          ? v.toISOString().split("T")[0]
          : v === null || v === undefined
          ? ""
          : String(v);
      }
      return out;
    });
    return { sheetName: name, headers, rows };
  });
}

/* ── Auto-detect column mapping ─────────────────────────────── */
const FIELD_SYNONYMS: Record<string, string[]> = {
  name: ["name", "asset", "asset name", "description", "title", "label"],
  type: ["type", "category", "asset type", "kind", "classification"],
  amount: ["amount", "invested", "amount invested", "principal", "value", "cost"],
  currentValue: ["current", "current value", "current price", "market value", "value"],
  date: ["date", "purchase date", "invested on", "buy date", "transaction date"],
  risk: ["risk", "risk score", "risk level"],
  notes: ["notes", "tags", "comment", "remarks"],
  goal: ["goal", "goal name", "target"],
};

export function autoMapColumns(
  headers: string[],
  targetFields: (keyof typeof FIELD_SYNONYMS)[],
): Record<string, string> {
  const map: Record<string, string> = {};
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const field of targetFields) {
    const syns = FIELD_SYNONYMS[field] ?? [];
    for (let i = 0; i < lower.length; i++) {
      if (syns.includes(lower[i])) {
        map[field] = headers[i];
        break;
      }
    }
  }
  return map;
}

const NUMERIC_KEYS = new Set([
  "amount", "currentValue", "risk", "principal", "emi", "rate", "tenure", "outstanding", "target", "current",
]);

function coerce(field: string, value: string): string | number {
  if (NUMERIC_KEYS.has(field)) {
    if (!value) return 0;
    const cleaned = String(value).replace(/[^\d.\-]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return value;
}

export interface ImportMapping {
  entity: "investment" | "expense" | "emi" | "goal";
  columnMap: Record<string, string>; // target field -> source header
  defaultType?: string;
  defaultCategory?: string;
  defaultDate?: string;
}

export function buildEntities(
  rows: Record<string, string>[],
  mapping: ImportMapping,
): Array<Investment | Expense | EMI | Goal> {
  return rows
    .filter((row) => {
      const nameVal = row[mapping.columnMap.name ?? ""];
      return nameVal && String(nameVal).trim().length > 0;
    })
    .map((row) => {
      const get = (field: string): string | number => {
        const src = mapping.columnMap[field];
        if (!src) return "";
        return coerce(field, row[src] ?? "");
      };
      const baseId = uid();
      const ts = nowISO();
      const date = String(get("date")) || mapping.defaultDate || ts.split("T")[0];

      if (mapping.entity === "investment") {
        const inv: Investment = {
          id: baseId,
          name: String(get("name") || "Untitled"),
          type: (mapping.defaultType as Investment["type"]) ?? "Equity",
          amount: Number(get("amount") || 0),
          currentValue: Number(get("currentValue") || get("amount") || 0),
          date,
          risk: Number(get("risk") || 5),
          notes: String(get("notes") || ""),
          createdAt: ts,
          updatedAt: ts,
        };
        return inv;
      }
      if (mapping.entity === "expense") {
        const exp: Expense = {
          id: baseId,
          description: String(get("name") || "Untitled"),
          category: (mapping.defaultCategory as Expense["category"]) ?? "Other",
          amount: Number(get("amount") || 0),
          date,
          recurring: "one-time",
          notes: String(get("notes") || ""),
          createdAt: ts,
          updatedAt: ts,
        };
        return exp;
      }
      if (mapping.entity === "emi") {
        const e: EMI = {
          id: baseId,
          name: String(get("name") || "Untitled"),
          type: (mapping.defaultType as EMI["type"]) ?? "Personal Loan",
          principal: Number(get("amount") || get("principal") || 0),
          emi: Number(get("emi") || 0),
          rate: Number(get("rate") || 0),
          tenure: Number(get("tenure") || 12),
          startDate: date,
          outstanding: Number(get("outstanding") || get("amount") || 0),
          notes: String(get("notes") || ""),
          createdAt: ts,
          updatedAt: ts,
        };
        return e;
      }
      const g: Goal = {
        id: baseId,
        name: String(get("name") || "Untitled"),
        type: (mapping.defaultType as Goal["type"]) ?? "Other",
        target: Number(get("amount") || get("target") || 0),
        deadline: mapping.defaultDate,
        current: Number(get("current") || 0),
        notes: String(get("notes") || ""),
        createdAt: ts,
        updatedAt: ts,
      };
      return g;
    });
}
