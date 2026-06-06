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
  entity: "investment" | "goal" | "emi" | "expense" | "settings";
  entityId?: string;
  description: string;
  timestamp: string;
}

export interface UserPreferences {
  currency: string; // CurrencyCode
  language: string; // LangCode
  theme: "light" | "dark" | "system";
  monthlyIncome: number;
  portfolioBaseDate: string;
  riskTolerance: RiskLevel;
  notifications: boolean;
}

export interface AppData {
  investments: Investment[];
  goals: Goal[];
  emis: EMI[];
  expenses: Expense[];
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
};

export const DEFAULT_DATA: AppData = {
  investments: [],
  goals: [],
  emis: [],
  expenses: [],
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
  const assets = totalCurrent(data.investments) + totalInvested(data.investments) * 0.2; // approx cash buffer
  const liabilities = totalOutstanding(data.emis);
  return { assets, liabilities, net: assets - liabilities };
}
