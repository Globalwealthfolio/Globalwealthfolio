import { DEFAULT_DATA, isIncomeCategory, type AppData, type Expense } from "./types";
import { encryptData, decryptData, isEncrypted } from "./crypto";

const STORAGE_KEY = "gwp:data:v1";
const SESSION_KEY = "gwp:session:unlocked";
const SCHEMA_VERSION = "1.1.0";

type Listener = (data: AppData) => void;
const listeners = new Set<Listener>();
let cache: AppData | null = null;
let encryptKey: string | null = null;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

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
  merged.expenses = merged.expenses.map((e: Partial<Expense> & { type?: "income" | "expense"; category?: string }) => ({
    ...(e as Expense),
    type: e.type ?? (e.category && isIncomeCategory(e.category as never) ? "income" : "expense"),
  }));
  merged.version = SCHEMA_VERSION;
  return merged;
}

async function persistEncrypted(): Promise<void> {
  if (!isBrowser() || !cache || !encryptKey) return;
  try {
    const encrypted = await encryptData(JSON.stringify(cache), encryptKey);
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch {}
}

function tryDecryptCache(): boolean {
  if (!isBrowser()) return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || !isEncrypted(raw)) return false;
    const sk = sessionStorage.getItem(SESSION_KEY);
    if (!sk) return false;
    encryptKey = sk;
    return true;
  } catch {
    return false;
  }
}

export function needsPassphrase(): boolean {
  if (!isBrowser()) return false;
  const raw = localStorage.getItem(STORAGE_KEY);
  return isEncrypted(raw);
}

export function isUnlocked(): boolean {
  return cache !== null || encryptKey !== null;
}

export async function unlock(passphrase: string): Promise<boolean> {
  if (!isBrowser()) return false;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw || !isEncrypted(raw)) {
    encryptKey = passphrase;
    return true;
  }
  try {
    const decrypted = await decryptData(raw, passphrase);
    const parsed = JSON.parse(decrypted);
    cache = migrate(parsed);
    encryptKey = passphrase;
    sessionStorage.setItem(SESSION_KEY, passphrase);
    return true;
  } catch {
    return false;
  }
}

export async function setupEncryption(passphrase: string): Promise<void> {
  const data = loadData();
  encryptKey = passphrase;
  sessionStorage.setItem(SESSION_KEY, passphrase);
  const encrypted = await encryptData(JSON.stringify(data), passphrase);
  localStorage.setItem(STORAGE_KEY, encrypted);
}

export function lock(): void {
  cache = null;
  encryptKey = null;
  if (isBrowser()) {
    sessionStorage.removeItem(SESSION_KEY);
  }
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
    if (isEncrypted(raw)) {
      if (tryDecryptCache()) return loadData();
      cache = structuredClone(DEFAULT_DATA);
      return cache;
    }
    const parsed = JSON.parse(raw) as Partial<AppData>;
    cache = migrate(parsed);
    return cache;
  } catch {
    cache = structuredClone(DEFAULT_DATA);
    return cache;
  }
}

export function saveData(data: AppData): void {
  cache = data;
  if (isBrowser()) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
    if (encryptKey) {
      setTimeout(() => persistEncrypted(), 0);
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

if (isBrowser()) {
  window.addEventListener("storage", (e) => {
    if (!e.key || e.key === STORAGE_KEY) {
      cache = null;
      emit(loadData());
    }
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      cache = null;
      emit(loadData());
    }
  });
  window.addEventListener("beforeunload", () => {
    if (cache && encryptKey) {
      persistEncrypted();
    }
  });
}

export function addAudit(entry: Omit<AppData["auditLog"][number], "id" | "timestamp">): void {
  updateData((data) => {
    data.auditLog.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    });
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
