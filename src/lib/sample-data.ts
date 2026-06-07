/**
 * Sample data seeder for first-time users.
 * Populates a realistic Indian-investor portfolio so the dashboard isn't empty.
 */

import { updateData, addAudit, uid, nowISO, loadData } from "../lib/store";
import type { Investment, Expense, EMI, Goal, AuditEntry } from "../lib/types";

export function hasAnyData(): boolean {
  const data = loadData();
  return data.investments.length + data.expenses.length + data.emis.length + data.goals.length > 0;
}

export function seedSampleData(): void {
  const now = new Date();
  const isoDate = (d: Date) => d.toISOString().split("T")[0];
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return isoDate(d);
  };

  const ts = nowISO();
  const investments: Investment[] = [
    { id: uid(), name: "Reliance Industries", type: "Equity", amount: 45000, currentValue: 58400, date: daysAgo(420), risk: 7, notes: "Long-term core holding", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "HDFC Bank", type: "Equity", amount: 32000, currentValue: 38900, date: daysAgo(380), risk: 5, notes: "", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Infosys", type: "Equity", amount: 28000, currentValue: 35200, date: daysAgo(280), risk: 6, notes: "IT sector", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Nippon India Liquid Fund", type: "Debt", amount: 120000, currentValue: 127500, date: daysAgo(180), risk: 2, notes: "Emergency buffer", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "SGB 2024-25", type: "Gold", amount: 60000, currentValue: 67800, date: daysAgo(220), risk: 3, notes: "Sovereign Gold Bond", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Physical Gold", type: "Gold", amount: 85000, currentValue: 102000, date: daysAgo(720), risk: 3, notes: "Jewellery + coins", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Bitcoin", type: "Crypto", amount: 48000, currentValue: 72200, date: daysAgo(150), risk: 9, notes: "Cold wallet", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Apple Inc (AAPL)", type: "International", amount: 35000, currentValue: 42800, date: daysAgo(300), risk: 6, notes: "US equity", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "NIFTY 50 ETF", type: "ETF", amount: 50000, currentValue: 57200, date: daysAgo(250), risk: 5, notes: "Index fund", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "EPF Balance", type: "EPF", amount: 280000, currentValue: 318000, date: daysAgo(60), risk: 1, notes: "Employer contribution", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "PPF Account", type: "PPF", amount: 150000, currentValue: 168000, date: daysAgo(30), risk: 1, notes: "Tax-saving", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "HDFC Flexi Cap Fund", type: "Equity", amount: 75000, currentValue: 92400, date: daysAgo(200), risk: 6, notes: "SIP", createdAt: ts, updatedAt: ts },
  ];

  const goals: Goal[] = [
    { id: uid(), name: "Retirement at 60", type: "Retirement", target: 50000000, current: 1582000, deadline: isoDate(new Date(now.getFullYear() + 25, now.getMonth(), 1)), notes: "Inflation-adjusted", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Home Down Payment", type: "House", target: 3000000, current: 950000, deadline: isoDate(new Date(now.getFullYear() + 3, now.getMonth(), 1)), notes: "Target 2028", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Child's Education", type: "Education", target: 5000000, current: 420000, deadline: isoDate(new Date(now.getFullYear() + 12, now.getMonth(), 1)), notes: "Higher education corpus", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Emergency Fund", type: "Emergency Fund", target: 600000, current: 525000, deadline: isoDate(new Date(now.getFullYear() + 0, now.getMonth() + 6, 1)), notes: "6 months expenses", createdAt: ts, updatedAt: ts },
  ];

  // Link some investments to goals
  investments[3].goalId = goals[3].id; // Liquid fund → emergency
  investments[9].goalId = goals[0].id; // EPF → retirement
  investments[10].goalId = goals[0].id; // PPF → retirement
  investments[1].goalId = goals[1].id; // HDFC Bank → home
  investments[4].goalId = goals[1].id; // SGB → home

  const emis: EMI[] = [
    { id: uid(), name: "Home Loan - HDFC", type: "Home Loan", principal: 4500000, emi: 38500, rate: 8.5, tenure: 240, startDate: daysAgo(420), outstanding: 4180000, notes: "20-year tenure", createdAt: ts, updatedAt: ts },
    { id: uid(), name: "Car Loan - SBI", type: "Car Loan", principal: 800000, emi: 14200, rate: 9.2, tenure: 60, startDate: daysAgo(380), outstanding: 320000, notes: "Hyundai Creta", createdAt: ts, updatedAt: ts },
  ];

  const expenseCategories = [
    ["Housing", 1, 18000, "Home loan EMI + maintenance", "expense"],
    ["Food & Dining", 2, 8500, "Groceries + eating out", "expense"],
    ["Transport", 3, 6500, "Petrol + cabs", "expense"],
    ["Utilities", 1, 3200, "Electricity, water, internet", "expense"],
    ["Healthcare", 1, 2400, "Health insurance premium", "expense"],
    ["Education", 1, 5000, "Child's tuition", "expense"],
    ["Shopping", 2, 4200, "Clothing + misc", "expense"],
    ["Entertainment", 3, 1500, "Netflix + dining", "expense"],
    ["Salary", 1, 145000, "Monthly take-home salary", "income"],
    ["Dividend", 1, 3200, "Mutual fund dividends", "income"],
    ["Interest", 1, 1800, "Savings account interest", "income"],
  ] as const;

  const expenses: Expense[] = [];
  expenseCategories.forEach(([cat, per, amt, note, type]) => {
    for (let m = 0; m < 6; m++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - m);
      d.setDate(Math.min(15, 28));
      const date = isoDate(d);
      // Add a small random variation
      const variance = 1 + (Math.sin(m * 13 + cat.length) * 0.15);
      expenses.push({
        id: uid(),
        description: note as string,
        category: cat as Expense["category"],
        amount: Math.round((amt as number) * variance),
        date,
        type: type as Expense["type"],
        recurring: "monthly",
        notes: "",
        createdAt: ts,
        updatedAt: ts,
      });
    }
  });
  // Add a one-off expense
  expenses.push({
    id: uid(),
    description: "Annual insurance premium",
    category: "Insurance",
    amount: 24000,
    date: daysAgo(45),
    type: "expense",
    recurring: "yearly",
    notes: "LIC + health",
    createdAt: ts,
    updatedAt: ts,
  });

  const auditEntries: AuditEntry[] = [
    { id: uid(), action: "import", entity: "settings", description: "Seeded sample portfolio data", timestamp: ts },
  ];

  updateData((data) => {
    data.investments = investments;
    data.goals = goals;
    data.emis = emis;
    data.expenses = expenses;
    data.auditLog = [...auditEntries, ...data.auditLog];
    data.preferences.monthlyIncome = 145000;
    data.preferences.portfolioBaseDate = daysAgo(720);
  });
}
