/**
 * Date range filter helper
 * - Reads/writes the from/to date inputs and the preset selector
 * - Computes preset date ranges (this month, last 30 days, YTD, etc.)
 * - Falls back gracefully when the component isn't present on a page
 * - Dispatches `gwp:daterange` events on change so page scripts can react
 * - Persists state in the URL query string for shareable filters
 */

export type DateRangePreset =
  | "thisMonth"
  | "last30"
  | "last3Months"
  | "last12Months"
  | "ytd"
  | "all"
  | "custom";

export interface DateRange {
  preset: DateRangePreset;
  from: string; // ISO YYYY-MM-DD or "" for unbounded
  to: string;   // ISO YYYY-MM-DD or "" for unbounded
  active: boolean; // true when from/to should be used to filter rows
}

const QUERY_KEY = "range";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function rangesOverlap(a: string, b: string, x: string, y: string): boolean {
  // Treat empty strings as unbounded. Two ranges [a,b] and [x,y] overlap if
  // a <= y and x <= b.
  const lo = (v: string, fallback: number) => (v ? new Date(v).getTime() : fallback);
  return lo(a, -Infinity) <= lo(y, Infinity) && lo(x, Infinity) >= lo(b, -Infinity);
}

export function rangeForPreset(preset: DateRangePreset, today: Date = new Date()): { from: string; to: string } {
  switch (preset) {
    case "thisMonth":
      return { from: isoDate(firstOfMonth(today)), to: isoDate(today) };
    case "last30":
      return { from: isoDate(addDays(today, -29)), to: isoDate(today) };
    case "last3Months":
      return { from: isoDate(firstOfMonth(addMonths(today, -2))), to: isoDate(today) };
    case "last12Months":
      return { from: isoDate(firstOfMonth(addMonths(today, -11))), to: isoDate(today) };
    case "ytd":
      return { from: `${today.getFullYear()}-01-01`, to: isoDate(today) };
    case "all":
      return { from: "", to: "" };
    case "custom":
    default:
      return { from: "", to: "" };
  }
}

function findWrap(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-date-range]");
}

function readInputs(): DateRange | null {
  const wrap = findWrap();
  if (!wrap) return null;
  const preset = (wrap.querySelector<HTMLSelectElement>("[data-date-preset]")?.value ?? "all") as DateRangePreset;
  const from = wrap.querySelector<HTMLInputElement>("[data-date-from]")?.value ?? "";
  const to = wrap.querySelector<HTMLInputElement>("[data-date-to]")?.value ?? "";
  const active = preset !== "all";
  return { preset, from, to, active };
}

function writeInputs(preset: DateRangePreset, from: string, to: string) {
  const wrap = findWrap();
  if (!wrap) return;
  const presetEl = wrap.querySelector<HTMLSelectElement>("[data-date-preset]");
  const fromEl = wrap.querySelector<HTMLInputElement>("[data-date-from]");
  const toEl = wrap.querySelector<HTMLInputElement>("[data-date-to]");
  if (presetEl) presetEl.value = preset;
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
  syncURL(preset, from, to);
}

function syncURL(preset: DateRangePreset, from: string, to: string) {
  try {
    const url = new URL(window.location.href);
    if (preset === "thisMonth" || preset === "all") {
      url.searchParams.delete(QUERY_KEY);
    } else {
      const compact = `${from || ""}__${to || ""}__${preset}`;
      url.searchParams.set(QUERY_KEY, compact);
    }
    window.history.replaceState({}, "", url.toString());
  } catch (_) {
    // ignore
  }
}

function readURLPreset(): { preset: DateRangePreset; from: string; to: string } | null {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(QUERY_KEY);
    if (!raw) return null;
    const [from, to, preset] = raw.split("__");
    const validPresets: DateRangePreset[] = ["thisMonth", "last30", "last3Months", "last12Months", "ytd", "all", "custom"];
    if (preset && validPresets.includes(preset as DateRangePreset)) {
      return { preset: preset as DateRangePreset, from: from ?? "", to: to ?? "" };
    }
    if (from === "all" || to === "all") {
      return { preset: "all", from: "", to: "" };
    }
    if (from || to) {
      return { preset: "custom", from: from ?? "", to: to ?? "" };
    }
  } catch (_) {
    // ignore
  }
  return null;
}

let initialized = false;

export function initDateRangeFilter(): void {
  if (initialized) return;
  const wrap = findWrap();
  if (!wrap) return;
  initialized = true;

  const presetEl = wrap.querySelector<HTMLSelectElement>("[data-date-preset]");
  const fromEl = wrap.querySelector<HTMLInputElement>("[data-date-from]");
  const toEl = wrap.querySelector<HTMLInputElement>("[data-date-to]");
  const clearBtn = wrap.querySelector<HTMLButtonElement>("[data-date-clear]");

  if (!presetEl || !fromEl || !toEl) return;

  // Hydrate from URL or component default.
  const fromURL = readURLPreset();
  const defaultPreset = (wrap.dataset.defaultPreset ?? "thisMonth") as DateRangePreset;
  if (fromURL) {
    writeInputs(fromURL.preset, fromURL.from, fromURL.to);
  } else {
    const { from, to } = rangeForPreset(defaultPreset);
    writeInputs(defaultPreset, from, to);
  }

  presetEl.addEventListener("change", () => {
    const preset = presetEl.value as DateRangePreset;
    if (preset === "custom") {
      // Keep current from/to as-is, just flip to custom mode.
      writeInputs("custom", fromEl.value, toEl.value);
    } else {
      const { from, to } = rangeForPreset(preset);
      writeInputs(preset, from, to);
    }
    dispatch();
  });

  const onManualChange = () => {
    // If the user edits a date manually, switch to custom preset.
    if (presetEl.value !== "custom") {
      presetEl.value = "custom";
    }
    writeInputs("custom", fromEl.value, toEl.value);
    dispatch();
  };
  fromEl.addEventListener("change", onManualChange);
  toEl.addEventListener("change", onManualChange);

  clearBtn?.addEventListener("click", () => {
    const { from, to } = rangeForPreset("all");
    writeInputs("all", from, to);
    dispatch();
  });

  // Dispatch once so page scripts pick up the hydrated preset.
  dispatch();
}

function dispatch() {
  const detail = readInputs();
  window.dispatchEvent(new CustomEvent("gwp:daterange", { detail }));
}

export function getDateRange(): DateRange {
  return (
    readInputs() ?? {
      preset: "all",
      from: "",
      to: "",
      active: false,
    }
  );
}

/** True when the given ISO date (YYYY-MM-DD or full ISO) falls within the supplied range. */
export function isInRange(isoDate: string, range: DateRange): boolean {
  if (!range.active) return true;
  const ts = new Date(isoDate).getTime();
  if (Number.isNaN(ts)) return true;
  if (range.from) {
    const fromTs = new Date(range.from).getTime();
    if (ts < fromTs) return false;
  }
  if (range.to) {
    // Include the entire "to" day
    const toTs = new Date(range.to).getTime() + 24 * 60 * 60 * 1000 - 1;
    if (ts > toTs) return false;
  }
  return true;
}

/** Whether two ranges overlap; useful for chart "include a row in this month" logic. */
export const _internal = { rangesOverlap };
