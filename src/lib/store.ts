/**
 * Persistent data store using localStorage.
 * Provides reactive subscriptions for client-side UI updates.
 */

import { DEFAULT_DATA, isIncomeCategory, type AppData, type Expense } from "./types";

const STORAGE_KEY = "gwp:data:v1";
const SCHEMA_VERSION = "1.1.0";

type Listener = (data: AppData) => void;
const listeners = new Set<Listener>();
let cache: AppData | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Backfill newer fields on data that was saved by an older build. */
function migrate(parsed: Partial<AppData> | null): AppData {
  const base = structuredClone(DEFAULT_DATA);
  if (!parsed) return base;
  const merged: AppData = {
    ...base,
    ...parsed,
    investments: Array.isArray(parsed.investments) ? parsed.investments : [],
    goals: Array.isArray(parsed.goals) ? parsed.goals : [],
    emis: Array.isArray(parsed.emis) ? parsed.emis : [],
    expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
    blog: Array.isArray(parsed.blog) ? parsed.blog : [],
    auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
    preferences: { ...base.preferences, ...(parsed.preferences ?? {}) },
  };
  // Ensure every expense has a valid type field
  merged.expenses = merged.expenses.map((e: Partial<Expense> & { type?: "income" | "expense"; category?: string }) => ({
    ...(e as Expense),
    type: e.type ?? (e.category && isIncomeCategory(e.category as never) ? "income" : "expense"),
  }));
  merged.version = SCHEMA_VERSION;
  return merged;
}

export function loadData(): AppData {
  if (cache) return cache;
  if (!isBrowser()) return structuredClone(DEFAULT_DATA);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = structuredClone(DEFAULT_DATA);
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<AppData>;
    cache = migrate(parsed);
    return cache;
  } catch (e) {
    console.warn("Failed to load data from localStorage, using defaults.", e);
    cache = structuredClone(DEFAULT_DATA);
    return cache;
  }
}

export function saveData(data: AppData): void {
  cache = data;
  if (isBrowser()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Failed to save data to localStorage.", e);
    }
  }
  emit(data);
}

export function updateData(mutator: (data: AppData) => AppData | void): AppData {
  const current = loadData();
  const draft = structuredClone(current);
  const result = mutator(draft);
  const next = (result as AppData | undefined) ?? draft;
  saveData(next);
  return next;
}

export function clearData(): void {
  saveData(structuredClone(DEFAULT_DATA));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(data: AppData) {
  listeners.forEach((l) => l(data));
}

export function addAudit(
  entry: Omit<AppData["auditLog"][number], "id" | "timestamp">,
): void {
  updateData((data) => {
    data.auditLog.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    });
    // Cap log at 500 entries
    if (data.auditLog.length > 500) {
      data.auditLog.length = 500;
    }
  });
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
