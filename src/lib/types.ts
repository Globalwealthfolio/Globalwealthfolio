/**
 * Type definitions for Global Wealth Portfolio data model.
 * Mirrors the original HTML site (SamrudhiPath) and extends it.
 */

export type AssetType =
  | "Equity"
  | "Debt"
  | "Gold"
  | "Real Estate"
  | "Crypto"
  | "International"
  | "ETF"
  | "Cash"
  | "PPF"
  | "EPF"
  | "Fixed Deposit"
  | "Bonds";

export type GoalType =
  | "Retirement"
  | "House"
  | "Education"
  | "Emergency Fund"
  | "Wealth Building"
  | "Other";

export type LoanType =
  | "Home Loan"
  | "Car Loan"
  | "Personal Loan"
  | "Education Loan"
  | "Gold Loan"
  | "Two-Wheeler Loan"
  | "Business Loan"
  | "Other";

export type ExpenseCategory =
  | "Housing"
  | "Food & Dining"
  | "Transport"
  | "Utilities"
  | "Healthcare"
  | "Education"
  | "Shopping"
  | "Entertainment"
  | "Insurance"
  | "Investment"
  | "Travel"
  | "Personal Care"
  | "Gifts"
  | "Salary"
  | "Freelance"
  | "Dividend"
  | "Interest"
  | "Rental Income"
  | "Bonus"
  | "Refund"
  | "Other Income"
  | "Other";

export type RiskLevel = "Low" | "Medium" | "High";

export interface Investment {
  id: string;
  name: string;
  type: AssetType;
  amount: number;
  currentValue: number;
  date: string; // ISO date
  goalId?: string;
  risk: number; // 1-10
  notes?: string;
  quantity?: number;
  symbol?: string;
  currency?: string; // CurrencyCode for foreign assets (e.g. "USD")
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  name: string;
  type: GoalType;
  customLabel?: string;
  target: number;
  deadline?: string;
  current: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EMI {
  id: string;
  name: string;
  type: LoanType;
  principal: number;
  emi: number;
  rate: number;
  tenure: number; // months
  startDate: string;
  outstanding: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  type: "income" | "expense";
  recurring: "one-time" | "monthly" | "quarterly" | "yearly";
  recurringFrom?: string;
  recurringTo?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  action: "create" | "update" | "delete" | "import" | "export";
  entity: "investment" | "goal" | "emi" | "expense" | "blog" | "settings";
  entityId?: string;
  description: string;
  timestamp: string;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  status: "draft" | "published" | "scheduled";
  authorName?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  scheduledAt?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
}

export interface UserPreferences {
  currency: string; // CurrencyCode
  language: string; // LangCode
  theme: "light" | "dark" | "system";
  monthlyIncome: number;
  portfolioBaseDate: string;
  riskTolerance: RiskLevel;
  notifications: boolean;
  useWebLLM: boolean;
  disableChatWidget: boolean;
}

export interface AppData {
  investments: Investment[];
  goals: Goal[];
  emis: EMI[];
  expenses: Expense[];
  blog: BlogPost[];
  auditLog: AuditEntry[];
  preferences: UserPreferences;
  version: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  currency: "INR",
  language: "en",
  theme: "system",
  monthlyIncome: 0,
  portfolioBaseDate: new Date().toISOString().split("T")[0],
  riskTolerance: "Medium",
  notifications: true,
  useWebLLM: true,
  disableChatWidget: true,
};

export const DEFAULT_DATA: AppData = {
  investments: [],
  goals: [],
  emis: [],
  expenses: [],
  blog: [],
  auditLog: [],
  preferences: DEFAULT_PREFERENCES,
  version: "1.0.0",
};

/* ── Reference benchmark data (illustrative) ───────────────── */
export interface Benchmark {
  id: string;
  name: string;
  region: "India" | "US" | "Global" | "Crypto";
  oneMonth: number;
  sixMonth: number;
  oneYear: number;
  threeYear: number;
  fiveYear: number;
}

export const BENCHMARKS: Benchmark[] = [
  { id: "nifty50", name: "NIFTY 50", region: "India", oneMonth: 1.8, sixMonth: 7.4, oneYear: 14.2, threeYear: 16.1, fiveYear: 15.3 },
  { id: "sensex", name: "BSE Sensex", region: "India", oneMonth: 1.6, sixMonth: 6.8, oneYear: 13.4, threeYear: 15.6, fiveYear: 14.9 },
  { id: "niftymidcap", name: "NIFTY Midcap 150", region: "India", oneMonth: -2.1, sixMonth: 5.9, oneYear: 22.3, threeYear: 19.8, fiveYear: 17.6 },
  { id: "sp500", name: "S&P 500", region: "US", oneMonth: -0.6, sixMonth: 4.2, oneYear: 10.8, threeYear: 12.4, fiveYear: 13.1 },
  { id: "nasdaq", name: "NASDAQ 100", region: "US", oneMonth: 1.2, sixMonth: 5.6, oneYear: 15.4, threeYear: 14.2, fiveYear: 16.8 },
  { id: "goldmcx", name: "Gold (MCX)", region: "India", oneMonth: 3.1, sixMonth: 9.8, oneYear: 18.7, threeYear: 14.5, fiveYear: 12.9 },
  { id: "goldintl", name: "Gold (Global)", region: "Global", oneMonth: 2.6, sixMonth: 8.4, oneYear: 16.1, threeYear: 12.8, fiveYear: 11.4 },
  { id: "btc", name: "Bitcoin (USD)", region: "Crypto", oneMonth: 8.2, sixMonth: -11.4, oneYear: 34.1, threeYear: 42.7, fiveYear: 61.3 },
  { id: "eth", name: "Ethereum (USD)", region: "Crypto", oneMonth: 5.1, sixMonth: -8.2, oneYear: 22.4, threeYear: 18.2, fiveYear: 47.6 },
  { id: "crisil", name: "Crisil Debt Index", region: "India", oneMonth: 0.5, sixMonth: 3.1, oneYear: 6.4, threeYear: 6.8, fiveYear: 7.1 },
];

/* ── Categorization helpers ─────────────────────────────────── */
export function riskLevel(score: number): RiskLevel {
  if (score <= 3) return "Low";
  if (score <= 6) return "Medium";
  return "High";
}

export function totalInvested(investments: Investment[]): number {
  return investments.reduce((sum, i) => sum + i.amount, 0);
}

export function totalCurrent(investments: Investment[]): number {
  return investments.reduce((sum, i) => sum + i.currentValue, 0);
}

export function totalGain(investments: Investment[]): number {
  return totalCurrent(investments) - totalInvested(investments);
}

export function gainPercent(investments: Investment[]): number {
  const invested = totalInvested(investments);
  if (invested === 0) return 0;
  return (totalGain(investments) / invested) * 100;
}

export function totalEMI(emis: EMI[]): number {
  return emis.reduce((sum, e) => sum + e.emi, 0);
}

export function totalOutstanding(emis: EMI[]): number {
  return emis.reduce((sum, e) => sum + e.outstanding, 0);
}

export function allocationByType(investments: Investment[]): { type: AssetType; value: number; pct: number }[] {
  const total = totalCurrent(investments);
  if (total === 0) return [];
  const map = new Map<AssetType, number>();
  investments.forEach((i) => {
    map.set(i.type, (map.get(i.type) ?? 0) + i.currentValue);
  });
  return Array.from(map.entries())
    .map(([type, value]) => ({ type, value, pct: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

export function expensesByCategory(expenses: Expense[], year?: number) {
  const filtered = year
    ? expenses.filter((e) => new Date(e.date).getFullYear() === year)
    : expenses;
  const total = filtered.reduce((sum, e) => sum + e.amount, 0);
  const map = new Map<ExpenseCategory, number>();
  filtered.forEach((e) => {
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  });
  return Array.from(map.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      pct: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function monthlyExpenses(expenses: Expense[]) {
  const map = new Map<string, number>();
  expenses.forEach((e) => {
    const month = e.date.slice(0, 7); // YYYY-MM
    map.set(month, (map.get(month) ?? 0) + e.amount);
  });
  return Array.from(map.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function netWorth(data: AppData): {
  assets: number;
  liabilities: number;
  net: number;
} {
  const assets = totalCurrent(data.investments);
  const liabilities = totalOutstanding(data.emis);
  return { assets, liabilities, net: assets - liabilities };
}

export function isIncomeCategory(category: ExpenseCategory): boolean {
  return [
    "Salary",
    "Freelance",
    "Dividend",
    "Interest",
    "Rental Income",
    "Bonus",
    "Refund",
    "Other Income",
  ].includes(category);
}

export function monthlyIncomeFromTransactions(expenses: Expense[]): number {
  return expenses
    .filter((e) => e.type === "income")
    .reduce((sum, e) => {
      const factor = e.recurring === "monthly" ? 1 : e.recurring === "quarterly" ? 1 / 3 : e.recurring === "yearly" ? 1 / 12 : 0;
      return sum + e.amount * factor;
    }, 0);
}

export function monthlyExpenseTotal(expenses: Expense[]): number {
  return expenses
    .filter((e) => e.type !== "income")
    .reduce((sum, e) => {
      const factor = e.recurring === "monthly" ? 1 : e.recurring === "quarterly" ? 1 / 3 : e.recurring === "yearly" ? 1 / 12 : 1;
      return sum + e.amount * factor;
    }, 0);
}

export function timeToGoalCompletion(
  goal: Goal,
  investments: Investment[],
  now: Date = new Date(),
): { months: number | null; perInvestment: { id: string; name: string; months: number | null }[] } {
  const linked = investments.filter((i) => i.goalId === goal.id);
  const remaining = goal.target - goal.current;
  if (remaining <= 0) {
    return {
      months: 0,
      perInvestment: linked.map((i) => ({ id: i.id, name: i.name, months: 0 })),
    };
  }
  if (linked.length === 0) {
    return { months: null, perInvestment: [] };
  }
  const perInvestment = linked.map((i) => {
    const monthsElapsed = Math.max(
      0.5,
      (now.getTime() - new Date(i.date).getTime()) / (1000 * 60 * 60 * 24 * 30.44),
    );
    const growth = i.currentValue - i.amount;
    const monthlyGrowth = growth / monthsElapsed;
    if (monthlyGrowth <= 0) {
      // Fall back to the goal's remaining amount proportionally across all linked investments
      const totalCurrent = linked.reduce((s, x) => s + x.currentValue, 0) || 1;
      const share = (i.currentValue / totalCurrent) * remaining;
      // If we assume a baseline 8% annual growth on the invested amount as a conservative estimate
      const baselineMonthly = (i.amount * 0.08) / 12;
      if (baselineMonthly <= 0) return { id: i.id, name: i.name, months: null };
      return { id: i.id, name: i.name, months: Math.ceil(share / baselineMonthly) };
    }
    const share = (i.currentValue / (linked.reduce((s, x) => s + x.currentValue, 0) || 1)) * remaining;
    return { id: i.id, name: i.name, months: Math.ceil(share / monthlyGrowth) };
  });
  // The goal is reached when all linked contributions collectively cover the remaining
  const longest = perInvestment.reduce((m, p) => (p.months == null ? m : Math.max(m, p.months)), 0);
  return { months: longest || null, perInvestment };
}

/* ── Month filter helpers ──────────────────────────────────── */
/** Returns the "YYYY-MM" key for a given Date object. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Parses a "YYYY-MM" string into a Date set to the first of that month. */
export function parseMonthKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** True when the given ISO date string falls in the "YYYY-MM" month. */
export function isInMonth(isoDate: string, ymKey: string): boolean {
  return isoDate.startsWith(ymKey);
}

/** Returns the YYYY-MM key for the previous month of the given key. */
export function addMonths(ymKey: string, delta: number): string {
  const d = parseMonthKey(ymKey);
  if (!d) return ymKey;
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}

/** Human label like "June 2026" for a "YYYY-MM" key. */
export function formatMonthLabel(ymKey: string): string {
  const d = parseMonthKey(ymKey);
  if (!d) return ymKey;
  return d.toLocaleString("en", { month: "long", year: "numeric" });
}
