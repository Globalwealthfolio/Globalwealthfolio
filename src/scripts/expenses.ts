import { loadData, updateData, addAudit, uid, nowISO, subscribe } from "../lib/store";
import {
  expensesByCategory,
  monthlyExpenses,
  monthlyIncomeFromTransactions,
  isIncomeCategory,
  type Expense,
  type ExpenseCategory,
} from "../lib/types";
import { formatCurrency, type CurrencyCode } from "../lib/currency";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  LineController,
  LineElement,
  PointElement,
  Filler,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  LineController,
  LineElement,
  PointElement,
  Filler,
);

function getCurrency(): CurrencyCode {
  return (document.documentElement.dataset.currency ?? "INR") as CurrencyCode;
}
function fmt(n: number, compact = false): string {
  return formatCurrency(n, getCurrency(), { compact, decimals: compact ? 1 : 0 });
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let filterType = "all";
let filterCategory = "all";
let filterRecurring = "all";
let searchTerm = "";

let catChart: Chart | null = null;
let trendChart: Chart | null = null;

const modal = document.getElementById("expense-modal") as HTMLDialogElement | null;
const form = document.getElementById("expense-form") as HTMLFormElement | null;
const titleEl = document.getElementById("exp-modal-title");

document.getElementById("add-expense")?.addEventListener("click", () => openModal());
document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => modal?.close()));

function setTypeInForm(type: "income" | "expense") {
  const radios = document.querySelectorAll<HTMLInputElement>(".exp-type-radio");
  radios.forEach((r) => {
    r.checked = r.value === type;
  });
}

function getTypeFromForm(): "income" | "expense" {
  const checked = document.querySelector<HTMLInputElement>(".exp-type-radio:checked");
  return (checked?.value as "income" | "expense") ?? "expense";
}

function openModal(exp?: Expense) {
  if (!modal || !form) return;
  if (titleEl) titleEl.textContent = exp ? "Edit Transaction" : "Add Transaction";
  form.reset();
  (document.getElementById("exp-date") as HTMLInputElement).value = new Date().toISOString().split("T")[0];
  if (exp) {
    (document.getElementById("exp-id") as HTMLInputElement).value = exp.id;
    (document.getElementById("exp-desc") as HTMLInputElement).value = exp.description;
    (document.getElementById("exp-category") as HTMLSelectElement).value = exp.category;
    (document.getElementById("exp-date") as HTMLInputElement).value = exp.date;
    (document.getElementById("exp-amount") as HTMLInputElement).value = String(exp.amount);
    (document.getElementById("exp-recurring") as HTMLSelectElement).value = exp.recurring;
    (document.getElementById("exp-from") as HTMLInputElement).value = exp.recurringFrom ?? "";
    (document.getElementById("exp-to") as HTMLInputElement).value = exp.recurringTo ?? "";
    (document.getElementById("exp-notes") as HTMLInputElement).value = exp.notes ?? "";
    setTypeInForm(exp.type);
  } else {
    (document.getElementById("exp-id") as HTMLInputElement).value = "";
    setTypeInForm("expense");
  }
  modal.showModal();
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form) return;
  const fd = new FormData(form);
  const id = String(fd.get("id") ?? "");
  const ts = nowISO();
  const type = (fd.get("type") as Expense["type"]) ?? "expense";
  const category = (fd.get("category") as ExpenseCategory) ?? "Other";
  const payload: Expense = {
    id: id || uid(),
    description: String(fd.get("description") ?? "").trim(),
    category,
    amount: Number(fd.get("amount") ?? 0),
    date: String(fd.get("date") ?? ts.split("T")[0]),
    type,
    recurring: (fd.get("recurring") as Expense["recurring"]) ?? "one-time",
    recurringFrom: (String(fd.get("recurringFrom") ?? "") || undefined) as string | undefined,
    recurringTo: (String(fd.get("recurringTo") ?? "") || undefined) as string | undefined,
    notes: String(fd.get("notes") ?? ""),
    createdAt: id ? loadData().expenses.find((e) => e.id === id)?.createdAt ?? ts : ts,
    updatedAt: ts,
  };
  if (!payload.description || payload.amount <= 0) {
    alert("Please enter a description and a positive amount.");
    return;
  }
  // Auto-correct the type if the category is income-flavored
  if (type === "expense" && isIncomeCategory(category)) {
    payload.type = "income";
  } else if (type === "income" && !isIncomeCategory(category) && category !== "Other") {
    payload.type = "expense";
  }
  updateData((data) => {
    if (id) {
      const idx = data.expenses.findIndex((e) => e.id === id);
      if (idx >= 0) data.expenses[idx] = payload;
    } else {
      data.expenses.push(payload);
    }
  });
  addAudit({
    action: id ? "update" : "create",
    entity: "expense",
    entityId: payload.id,
    description: id
      ? `Updated ${payload.type}: ${payload.description}`
      : `Added ${payload.type}: ${payload.description}`,
  });
  modal?.close();
});

document.querySelector<HTMLSelectElement>("[data-filter='type']")?.addEventListener("change", (e) => {
  filterType = (e.target as HTMLSelectElement).value;
  renderAll();
});
document.querySelector<HTMLSelectElement>("[data-filter='category']")?.addEventListener("change", (e) => {
  filterCategory = (e.target as HTMLSelectElement).value;
  renderAll();
});
document.querySelector<HTMLSelectElement>("[data-filter='recurring']")?.addEventListener("change", (e) => {
  filterRecurring = (e.target as HTMLSelectElement).value;
  renderAll();
});
document.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (e) => {
  searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
  renderAll();
});

function filteredExpenses() {
  const data = loadData();
  let rows = data.expenses;
  if (filterType !== "all") rows = rows.filter((r) => r.type === filterType);
  if (filterCategory !== "all") rows = rows.filter((r) => r.category === filterCategory);
  if (filterRecurring !== "all") rows = rows.filter((r) => r.recurring === filterRecurring);
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) => r.description.toLowerCase().includes(term) || r.notes?.toLowerCase().includes(term));
  }
  return rows;
}

function renderTable() {
  const rows = filteredExpenses();
  const tbody = document.getElementById("expenses-tbody");
  if (!tbody) return;
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-5xl text-body text-body">${loadData().expenses.length === 0 ? "No transactions yet. Click <strong>+ Add</strong> to get started." : "No transactions match your filters."}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((e, idx) => {
      const recurringLabel = e.recurring === "one-time" ? "—" : e.recurring[0].toUpperCase() + e.recurring.slice(1);
      const recurringCls = e.recurring !== "one-time" ? (e.type === "income" ? "badge-gain" : "badge-link") : "";
      const typeBadgeCls = e.type === "income" ? "badge-gain" : "badge-loss";
      const amountCls = e.type === "income" ? "text-gain" : "text-loss";
      const amountPrefix = e.type === "income" ? "+" : "−";
      return `
        <tr class="border-t border-hairline hover:bg-canvas-soft">
          <td class="py-sm px-md text-mute">${idx + 1}</td>
          <td class="py-sm px-md"><span class="badge ${typeBadgeCls}">${e.type === "income" ? "Income" : "Expense"}</span></td>
          <td class="py-sm px-md"><div class="text-body-sm-strong text-ink">${esc(e.description)}</div></td>
          <td class="py-sm px-md"><span class="badge">${e.category}</span></td>
          <td class="py-sm px-md text-body">${e.date}</td>
          <td class="py-sm px-md text-right text-body-sm-strong ${amountCls}">${amountPrefix}${fmt(e.amount)}</td>
          <td class="py-sm px-md"><span class="badge ${recurringCls}">${recurringLabel}</span></td>
          <td class="py-sm px-md text-body max-w-[14ch] truncate" title="${esc(e.notes ?? "")}">${esc(e.notes ?? "")}</td>
          <td class="py-sm px-md text-right">
            <button class="btn-ghost" data-edit="${e.id}" type="button">Edit</button>
            <button class="btn-ghost text-loss" data-delete="${e.id}" type="button">Delete</button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.edit!;
      const exp = loadData().expenses.find((e) => e.id === id);
      if (exp) openModal(exp);
    });
  });
  tbody.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delete!;
      const exp = loadData().expenses.find((e) => e.id === id);
      if (!exp) return;
      if (!confirm(`Delete "${exp.description}"?`)) return;
      updateData((data) => {
        data.expenses = data.expenses.filter((e) => e.id !== id);
      });
      addAudit({
        action: "delete",
        entity: "expense",
        entityId: id,
        description: `Deleted ${exp.type}: ${exp.description}`,
      });
    });
  });
}

function renderStats() {
  const data = loadData();
  const rows = filteredExpenses();
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const expensesThisMonth = rows.filter((e) => e.type !== "income" && e.date.startsWith(monthKey));
  const incomeThisMonth = rows.filter((e) => e.type === "income" && e.date.startsWith(monthKey));
  const thisMonth = expensesThisMonth.reduce((s, e) => s + e.amount, 0);
  const incomeThisMonthTotal = incomeThisMonth.reduce((s, e) => s + e.amount, 0);
  const last3: string[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    last3.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const last3Sum = rows.filter((e) => e.type !== "income" && last3.includes(e.date.slice(0, 7))).reduce((s, e) => s + e.amount, 0);
  const avg = last3Sum / 3;
  const setText = (sel: string, text: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.textContent = text;
  };
  setText("[data-stat='thismonth']", fmt(thisMonth, true));
  setText("[data-stat='income-month']", fmt(incomeThisMonthTotal, true));
  setText("[data-stat='avg']", fmt(avg, true));
  // Savings rate uses monthly income transactions (recurring) + preferences monthly income
  const recurringIncome = monthlyIncomeFromTransactions(data.expenses.filter((e) => e.type === "income"));
  const baseIncome = data.preferences.monthlyIncome || 0;
  const monthlyIncome = recurringIncome + baseIncome;
  if (monthlyIncome > 0) {
    const rate = ((monthlyIncome - thisMonth) / monthlyIncome) * 100;
    setText("[data-stat='savings']", `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`);
  } else {
    setText("[data-stat='savings']", "—");
  }
}

function renderCharts() {
  const rows = filteredExpenses();
  const inkColor = getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim() || "#171717";
  const byCat = expensesByCategory(rows.filter((e) => e.type !== "income"));
  const catCanvas = document.getElementById("categoryChart") as HTMLCanvasElement | null;
  const trendCanvas = document.getElementById("trendChart") as HTMLCanvasElement | null;
  if (catCanvas) {
    const ctx = catCanvas.getContext("2d");
    if (ctx) {
      if (catChart) catChart.destroy();
      catChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: byCat.length > 0 ? byCat.map((c) => c.category) : ["No data"],
          datasets: [
            {
              label: "Amount",
              data: byCat.length > 0 ? byCat.map((c) => c.amount) : [0],
              backgroundColor: ["#0070f3", "#7928ca", "#ff0080", "#f9cb28", "#10b981", "#50e3c2", "#f5a623", "#a1a1a1", "#ee0000", "#0761d1", "#ff4d4d", "#50e3c2", "#0761d1", "#a1a1a1"],
              borderRadius: 4,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { backgroundColor: inkColor, titleColor: "#fff", bodyColor: "#fff", callbacks: { label: (item) => fmt(item.parsed.x) } } },
          scales: {
            x: { grid: { color: "rgba(120,120,120,0.1)" }, ticks: { color: "rgba(120,120,120,0.7)", callback: (v) => fmt(Number(v), true) } },
            y: { grid: { display: false }, ticks: { color: "rgba(120,120,120,0.7)" } },
          },
        },
      });
    }
  }
  if (trendCanvas) {
    const ctx = trendCanvas.getContext("2d");
    if (ctx) {
      // Build last 6 months of income vs expense from all data
      const now = new Date();
      const monthKeys: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      const labels = monthKeys.map((mk) => {
        const [y, m] = mk.split("-");
        return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en", { month: "short" });
      });
      const incData = monthKeys.map((mk) =>
        loadData().expenses.filter((e) => e.type === "income" && e.date.startsWith(mk)).reduce((s, e) => s + e.amount, 0),
      );
      const expData = monthKeys.map((mk) =>
        loadData().expenses.filter((e) => e.type !== "income" && e.date.startsWith(mk)).reduce((s, e) => s + e.amount, 0),
      );
      if (trendChart) trendChart.destroy();
      trendChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Income",
              data: incData,
              borderColor: "#10b981",
              backgroundColor: "rgba(16,185,129,0.15)",
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointBackgroundColor: "#10b981",
            },
            {
              label: "Expenses",
              data: expData,
              borderColor: "#ef4444",
              backgroundColor: "rgba(239,68,68,0.12)",
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointBackgroundColor: "#ef4444",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "bottom", labels: { color: inkColor, boxWidth: 8, font: { size: 11 } } },
            tooltip: { backgroundColor: inkColor, titleColor: "#fff", bodyColor: "#fff", callbacks: { label: (item) => `${item.dataset.label}: ${fmt(item.parsed.y)}` } },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: "rgba(120,120,120,0.7)" } },
            y: { grid: { color: "rgba(120,120,120,0.1)" }, ticks: { color: "rgba(120,120,120,0.7)", callback: (v) => fmt(Number(v), true) } },
          },
        },
      });
    }
  }
}

function renderAll() {
  renderTable();
  renderStats();
  renderCharts();
}

subscribe(renderAll);
renderAll();
