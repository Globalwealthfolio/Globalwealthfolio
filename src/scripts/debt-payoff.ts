/**
 * Debt Payoff Planner
 * - Computes snowball vs avalanche payoff schedules
 * - Renders comparison stats, progress bar, line chart, pie chart
 * - CSV/PDF export, localStorage persistence
 */

import { loadData, subscribe, updateData, addAudit } from "../lib/store";
import { type EMI } from "../lib/types";
import { formatCurrency, type CurrencyCode } from "../lib/currency";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
Chart.register(
  LineController, LineElement, PointElement, LinearScale, CategoryScale,
  DoughnutController, ArcElement, Tooltip, Legend,
);
import { applyChartDefaults, cssVar } from "./chart-defaults";
applyChartDefaults();

const STORAGE_PREFS = "gwp:debt-payoff-prefs";

interface DebtLoan {
  id: string;
  name: string;
  type: string;
  principal: number;
  balance: number;
  rate: number;
  emi: number;
}

interface PayoffSnapshot {
  month: number;
  date: string;
  balances: Record<string, number>;
  totalBalance: number;
  cumulativeInterest: number;
  targetLoanId: string | null;
  paidOffIds: string[];
}

interface PayoffSchedule {
  strategy: "snowball" | "avalanche";
  snapshots: PayoffSnapshot[];
  totalMonths: number;
  totalInterest: number;
  initialTotalBalance: number;
  debtFreeDate: string;
}

interface PayoffPrefs {
  strategy: "snowball" | "avalanche";
  extraPayment: number;
}

const CHART_COLORS = [
  "#10b981", "#7928ca", "#f5a623", "#0b5fff",
  "#ff0080", "#c9a961", "#50e3c2", "#f87171",
];

function getCurrency(): CurrencyCode {
  return (document.documentElement.dataset.currency ?? "INR") as CurrencyCode;
}

function fmt(n: number, compact = false): string {
  return formatCurrency(n, getCurrency(), { compact, decimals: compact ? 1 : 0 });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ── Core Payoff Computation ────────────────────────────────── */

function computePayoffSchedule(
  loans: DebtLoan[],
  extraPayment: number,
  strategy: "snowball" | "avalanche",
): PayoffSchedule | null {
  if (loans.length === 0) return null;

  let activeLoans = loans.map((l) => ({ ...l }));
  const initialTotalBalance = activeLoans.reduce((s, l) => s + l.balance, 0);
  const snapshots: PayoffSnapshot[] = [];
  const startDate = new Date();
  let month = 0;
  let cumulativeInterest = 0;
  let freedPool = 0;

  while (activeLoans.length > 0 && month < 1200) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + month);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    const totalExtra = extraPayment + freedPool;

    const sorted = [...activeLoans].sort((a, b) =>
      strategy === "snowball" ? a.balance - b.balance : b.rate - a.rate,
    );
    const targetId = sorted[0]?.id ?? null;

    const newActiveLoans: DebtLoan[] = [];
    const balances: Record<string, number> = {};
    const paidOffIds: string[] = [];
    let monthInterest = 0;
    let remainingExtra = totalExtra;

    for (const loan of activeLoans) {
      const monthlyRate = loan.rate / 12 / 100;
      const interest = loan.balance * monthlyRate;
      monthInterest += interest;

      let principalFromEMI = Math.max(0, loan.emi - interest);
      let newBalance = loan.balance - principalFromEMI;

      if (loan.id === targetId && remainingExtra > 0 && newBalance > 0) {
        const extra = Math.min(remainingExtra, newBalance);
        newBalance -= extra;
        remainingExtra -= extra;
      }

      newBalance = Math.max(0, newBalance);
      balances[loan.id] = newBalance;

      if (newBalance > 0) {
        newActiveLoans.push({ ...loan, balance: newBalance });
      } else {
        paidOffIds.push(loan.id);
        freedPool += loan.emi;
      }
    }

    cumulativeInterest += monthInterest;
    const totalBalance = newActiveLoans.reduce((s, l) => s + l.balance, 0);

    snapshots.push({
      month,
      date: dateStr,
      balances,
      totalBalance,
      cumulativeInterest,
      targetLoanId: targetId,
      paidOffIds,
    });

    activeLoans = newActiveLoans;
    month++;
  }

  const debtFreeDate = snapshots.length > 0
    ? snapshots[snapshots.length - 1].date
    : new Date().toISOString().slice(0, 7);

  return {
    strategy,
    snapshots,
    totalMonths: month,
    totalInterest: cumulativeInterest,
    initialTotalBalance,
    debtFreeDate,
  };
}

function computeBothSchedules(
  loans: DebtLoan[],
  extraPayment: number,
): { avalanche: PayoffSchedule | null; snowball: PayoffSchedule | null } {
  return {
    avalanche: computePayoffSchedule(loans, extraPayment, "avalanche"),
    snowball: computePayoffSchedule(loans, extraPayment, "snowball"),
  };
}

function emisToDebtLoans(emis: EMI[]): DebtLoan[] {
  return emis
    .filter((e) => e.outstanding > 0 && e.emi > 0)
    .map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      principal: e.principal,
      balance: e.outstanding,
      rate: e.rate,
      emi: e.emi,
    }));
}

/* ── Chart Management ───────────────────────────────────────── */

let lineChart: Chart | null = null;
let pieChart: Chart | null = null;

function destroyCharts() {
  if (lineChart) { lineChart.destroy(); lineChart = null; }
  if (pieChart) { pieChart.destroy(); pieChart = null; }
}

function renderLineChart(
  avalanche: PayoffSchedule | null,
  snowball: PayoffSchedule | null,
  _selectedStrategy: "snowball" | "avalanche",
  loans: DebtLoan[],
) {
  const canvas = document.getElementById("balance-chart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (lineChart) { lineChart.destroy(); lineChart = null; }

  const activeSchedule = _selectedStrategy === "avalanche" ? avalanche : snowball;
  if (!activeSchedule || activeSchedule.snapshots.length === 0) {
    const parent = canvas.parentElement;
    if (parent) parent.innerHTML = '<p class="text-body text-body text-center py-xl">Add loans to see balance reduction timeline.</p>';
    return;
  }

  const avaColor = cssVar("--color-gain", "#10b981");
  const snowColor = cssVar("--color-violet", "#7928ca");

  // Build snapshots for both strategies on the same timeline
  const avaSnaps = avalanche?.snapshots ?? [];
  const snowSnaps = snowball?.snapshots ?? [];
  const maxLen = Math.max(avaSnaps.length, snowSnaps.length, 1);

  const labels: string[] = [];
  const avaData: (number | null)[] = [];
  const snowData: (number | null)[] = [];

  for (let i = 0; i < maxLen; i++) {
    const avaSnap = avaSnaps[i];
    const snowSnap = snowSnaps[i];
    const snap = avaSnap ?? snowSnap!;
    labels.push(maxLen > 36 && i % 12 !== 0 ? "" : snap.date);
    avaData.push(avaSnap ? Math.round(avaSnap.totalBalance) : null);
    snowData.push(snowSnap ? Math.round(snowSnap.totalBalance) : null);
  }

  const isActiveAva = _selectedStrategy === "avalanche";

  lineChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Avalanche",
          data: avaData,
          borderColor: avaColor,
          backgroundColor: "transparent",
          borderWidth: isActiveAva ? 3 : 2,
          borderDash: isActiveAva ? [] : [5, 5],
          tension: 0.3,
          pointRadius: 0,
          fill: false,
        },
        {
          label: "Snowball",
          data: snowData,
          borderColor: snowColor,
          backgroundColor: "transparent",
          borderWidth: isActiveAva ? 2 : 3,
          borderDash: isActiveAva ? [5, 5] : [],
          tension: 0.3,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "top" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw as number;
              return `${ctx.dataset.label}: ${fmt(val)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxTicksLimit: 15,
            font: { size: 10 },
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: cssVar("--color-hairline", "#e3d8c1") },
          ticks: {
            font: { size: 10 },
            callback: (val) => fmt(val as number, true),
          },
        },
      },
    },
  });
}

function renderPieChart(loans: DebtLoan[]) {
  const canvas = document.getElementById("debt-pie-chart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (pieChart) { pieChart.destroy(); pieChart = null; }

  if (loans.length === 0) {
    const parent = canvas.parentElement;
    if (parent) parent.innerHTML = '<p class="text-body text-body text-center py-xl">No active loans to display.</p>';
    return;
  }

  const active = loans.filter((l) => l.balance > 0);
  if (active.length === 0) {
    const parent = canvas.parentElement;
    if (parent) parent.innerHTML = '<p class="text-body text-body text-center py-xl">All loans paid off!</p>';
    return;
  }

  const labels = active.map((l) => l.name);
  const data = active.map((l) => Math.round(l.balance));
  const colors = active.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  pieChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: cssVar("--color-canvas", "#fdfbf7"),
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
              const val = ctx.raw as number;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
              return `${ctx.label}: ${fmt(val)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* ── UI Rendering ───────────────────────────────────────────── */

function renderComparison(avalanche: PayoffSchedule | null, snowball: PayoffSchedule | null) {
  const container = document.getElementById("payoff-comparison");
  if (!container) return;

  const noDataHtml = `
    <div class="card text-center py-2xl col-span-full">
      <p class="text-body text-body">No active loans. Add loans on the EMI tracker above to see payoff strategies.</p>
    </div>`;

  if (!avalanche && !snowball) {
    container.innerHTML = noDataHtml;
    return;
  }

  const ava = avalanche || { totalMonths: 0, totalInterest: 0, initialTotalBalance: 0, debtFreeDate: "—" };
  const snow = snowball || { totalMonths: 0, totalInterest: 0, initialTotalBalance: 0, debtFreeDate: "—" };

  const interestSaved = ava.totalInterest > 0 && snow.totalInterest > 0
    ? snow.totalInterest - ava.totalInterest
    : 0;
  const monthsSaved = snow.totalMonths > 0 && ava.totalMonths > 0
    ? snow.totalMonths - ava.totalMonths
    : 0;

  const bestStrategy = interestSaved > 0 ? "Avalanche" : interestSaved < 0 ? "Snowball" : "Tie";
  const bestInterestSaved = Math.abs(interestSaved);

  container.innerHTML = `
    <div class="card">
      <div class="flex items-center gap-xs mb-sm">
        <span class="w-2.5 h-2.5 rounded-full ${avalanche ? 'bg-gain' : 'bg-canvas-soft-2'}"></span>
        <h3 class="text-display-sm">Avalanche</h3>
        ${interestSaved > 0 ? '<span class="badge badge-gain text-xs">Recommended</span>' : ''}
      </div>
      <div class="space-y-xs">
        <p class="flex justify-between"><span class="text-body">Debt-Free Date</span><span class="font-medium">${ava.debtFreeDate}</span></p>
        <p class="flex justify-between"><span class="text-body">Time to Payoff</span><span class="font-medium">${ava.totalMonths} months (${(ava.totalMonths / 12).toFixed(1)} yr)</span></p>
        <p class="flex justify-between"><span class="text-body">Total Interest</span><span class="font-medium">${fmt(ava.totalInterest)}</span></p>
        <p class="flex justify-between"><span class="text-body">Total Paid</span><span class="font-medium">${fmt(ava.totalInterest + ava.initialTotalBalance)}</span></p>
      </div>
    </div>
    <div class="card">
      <div class="flex items-center gap-xs mb-sm">
        <span class="w-2.5 h-2.5 rounded-full ${snowball ? 'bg-violet' : 'bg-canvas-soft-2'}"></span>
        <h3 class="text-display-sm">Snowball</h3>
        ${interestSaved < 0 ? '<span class="badge badge-gain text-xs">Recommended</span>' : ''}
      </div>
      <div class="space-y-xs">
        <p class="flex justify-between"><span class="text-body">Debt-Free Date</span><span class="font-medium">${snow.debtFreeDate}</span></p>
        <p class="flex justify-between"><span class="text-body">Time to Payoff</span><span class="font-medium">${snow.totalMonths} months (${(snow.totalMonths / 12).toFixed(1)} yr)</span></p>
        <p class="flex justify-between"><span class="text-body">Total Interest</span><span class="font-medium">${fmt(snow.totalInterest)}</span></p>
        <p class="flex justify-between"><span class="text-body">Total Paid</span><span class="font-medium">${fmt(snow.totalInterest + snow.initialTotalBalance)}</span></p>
      </div>
    </div>
    ${interestSaved !== 0 ? `
    <div class="card col-span-full md:col-span-2 bg-canvas-soft border border-gold/30">
      <p class="text-body-sm text-center">
        <span class="font-semibold text-ink">${bestStrategy}</span> saves you
        <span class="font-semibold text-gain">${fmt(bestInterestSaved)}</span> in interest
        ${monthsSaved !== 0 ? `and gets you debt-free <span class="font-semibold">${Math.abs(monthsSaved)} months</span> earlier.` : '.'}
      </p>
    </div>` : ''}`;
}

function getPayoffOrder(schedule: PayoffSchedule, loans: DebtLoan[]): { name: string; month: number; date: string }[] {
  const loanMap = new Map(loans.map((l) => [l.id, l.name]));
  const order: { id: string; month: number; date: string }[] = [];
  for (const snap of schedule.snapshots) {
    for (const id of snap.paidOffIds) {
      if (!order.find((o) => o.id === id)) {
        order.push({ id, month: snap.month, date: snap.date });
      }
    }
  }
  return order.map((o) => ({ name: loanMap.get(o.id) ?? o.id, month: o.month + 1, date: o.date }));
}

function renderPayoffOrder(avalanche: PayoffSchedule | null, snowball: PayoffSchedule | null, loans: DebtLoan[]) {
  const container = document.getElementById("payoff-order");
  if (!container) return;
  if (!avalanche && !snowball) { container.innerHTML = ""; return; }
  if (loans.length === 0) { container.innerHTML = ""; return; }

  const avaOrder = avalanche ? getPayoffOrder(avalanche, loans) : [];
  const snowOrder = snowball ? getPayoffOrder(snowball, loans) : [];

  container.innerHTML = `
    <h3 class="text-display-sm mb-md">Payoff Sequence</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-md">
      <div>
        <p class="text-caption-mono text-body mb-sm">Avalanche</p>
        ${avaOrder.length > 0 ? `
        <ol class="space-y-xs">
          ${avaOrder.map((item, i) => `
          <li class="flex items-center gap-sm">
            <span class="w-5 h-5 rounded-full bg-gain text-on-primary text-xs font-semibold flex items-center justify-center shrink-0">${i + 1}</span>
            <span class="text-sm"><strong>${esc(item.name)}</strong> <span class="text-body">— paid off month ${item.month} (${item.date})</span></span>
          </li>`).join("")}
        </ol>` : '<p class="text-body text-sm text-body">No loans paid off in simulation.</p>'}
      </div>
      <div>
        <p class="text-caption-mono text-body mb-sm">Snowball</p>
        ${snowOrder.length > 0 ? `
        <ol class="space-y-xs">
          ${snowOrder.map((item, i) => `
          <li class="flex items-center gap-sm">
            <span class="w-5 h-5 rounded-full bg-violet text-on-primary text-xs font-semibold flex items-center justify-center shrink-0">${i + 1}</span>
            <span class="text-sm"><strong>${esc(item.name)}</strong> <span class="text-body">— paid off month ${item.month} (${item.date})</span></span>
          </li>`).join("")}
        </ol>` : '<p class="text-body text-sm text-body">No loans paid off in simulation.</p>'}
      </div>
    </div>`;
}

function renderProgressBar(loans: DebtLoan[]) {
  const progressEl = document.getElementById("progress-bar");
  const pctEl = document.getElementById("progress-pct");
  const ariaEl = document.getElementById("progress-aria");
  if (!progressEl || !pctEl) return;

  if (loans.length === 0) {
    progressEl.style.width = "0%";
    pctEl.textContent = "0%";
    if (ariaEl) ariaEl.setAttribute("aria-valuenow", "0");
    return;
  }

  const totalPrincipal = loans.reduce((s, l) => s + l.principal, 0);
  const totalOutstanding = loans.reduce((s, l) => s + l.balance, 0);
  const totalPaid = Math.max(0, totalPrincipal - totalOutstanding);

  if (totalPrincipal === 0) {
    progressEl.style.width = "100%";
    pctEl.textContent = "100%";
    if (ariaEl) ariaEl.setAttribute("aria-valuenow", "100");
    return;
  }

  const pct = Math.min(100, Math.max(0, (totalPaid / totalPrincipal) * 100));
  progressEl.style.width = `${pct.toFixed(1)}%`;
  pctEl.textContent = `${pct.toFixed(0)}%`;
  if (ariaEl) ariaEl.setAttribute("aria-valuenow", String(Math.round(pct)));
}

function renderWarning(loans: DebtLoan[]) {
  const container = document.getElementById("payoff-warning");
  if (!container) return;

  const problematic = loans.filter((l) => l.balance > 0 && l.emi <= l.balance * l.rate / 12 / 100);
  if (problematic.length > 0) {
    container.innerHTML = `
      <div class="card-soft border border-loss/30 mb-2xl" role="alert">
        <p class="text-caption-mono text-loss mb-xs">⚠ Warning</p>
        <p class="text-body-sm text-body">The following loans have EMIs that don't cover monthly interest.
        The balance will not reduce with current payments. Consider increasing EMI or reducing interest rate:</p>
        <ul class="list-disc list-inside text-body-sm text-body mt-xs">
          ${problematic.map((l) => `<li>${esc(l.name)} — EMI ${fmt(l.emi)} vs interest ${fmt(l.balance * l.rate / 12 / 100)}/mo</li>`).join("")}
        </ul>
      </div>`;
    container.style.display = "";
  } else {
    container.style.display = "none";
  }
}

/* ── Persistence ────────────────────────────────────────────── */

function loadPrefs(): PayoffPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_PREFS);
    if (raw) return JSON.parse(raw) as PayoffPrefs;
  } catch { /* ignore */ }
  return { strategy: "avalanche", extraPayment: 5000 };
}

function savePrefs(prefs: PayoffPrefs) {
  try {
    localStorage.setItem(STORAGE_PREFS, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

/* ── Export ─────────────────────────────────────────────────── */

function exportCSV(avalanche: PayoffSchedule | null, snowball: PayoffSchedule | null, strategy: string) {
  const schedule = strategy === "avalanche" ? avalanche : snowball;
  if (!schedule || schedule.snapshots.length === 0) {
    alert("No payoff data to export.");
    return;
  }

  const loans = schedule.snapshots[0].balances;
  const loanIds = Object.keys(loans);
  const loanNames: Record<string, string> = {};

  const data = loadData();
  for (const id of loanIds) {
    const loan = data.emis.find((e) => e.id === id);
    if (loan) loanNames[id] = loan.name;
  }

  const headers = ["Month", "Date", ...loanIds.map((id) => loanNames[id] || id), "Total Balance", "Cumulative Interest"];

  const rows = schedule.snapshots.map((s) => {
    const row: Record<string, unknown> = {
      Month: s.month,
      Date: s.date,
    };
    for (const id of loanIds) {
      row[loanNames[id] || id] = Math.round(s.balances[id] ?? 0);
    }
    row["Total Balance"] = Math.round(s.totalBalance);
    row["Cumulative Interest"] = Math.round(s.cumulativeInterest);
    return row;
  });

  const csv = headers.join(",") + "\n" + rows.map((r) =>
    headers.map((h) => {
      const v = r[h];
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","),
  ).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `debt-payoff-${strategy}-${schedule.debtFreeDate}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  addAudit({ action: "export", entity: "emi", description: "Exported debt payoff plan as CSV" });
}

function exportPDF() {
  window.print();
  addAudit({ action: "export", entity: "emi", description: "Printed debt payoff plan" });
}

/* ── Main Render ────────────────────────────────────────────── */

function renderDebtPayoff() {
  const data = loadData();
  const loans = emisToDebtLoans(data.emis);
  const prefs = loadPrefs();

  const radios = document.querySelectorAll<HTMLInputElement>("input[name='strategy']");
  const extraInput = document.getElementById("extra-payment") as HTMLInputElement | null;

  // Sync UI with prefs
  radios.forEach((r) => { r.checked = r.value === prefs.strategy; });
  if (extraInput) extraInput.value = String(prefs.extraPayment);

  // Show section
  const section = document.getElementById("debt-payoff-section");
  if (section) section.style.display = "";

  if (loans.length === 0) {
    const container = document.getElementById("payoff-comparison");
    if (container) container.innerHTML = `
      <div class="card text-center py-2xl col-span-full">
        <p class="text-body text-body">No active loans. Add loans on the EMI tracker above to see payoff strategies.</p>
      </div>`;
    const orderContainer = document.getElementById("payoff-order");
    if (orderContainer) orderContainer.innerHTML = "";
    const progressEl = document.getElementById("progress-bar");
    const pctEl = document.getElementById("progress-pct");
    if (progressEl) progressEl.style.width = "0%";
    if (pctEl) pctEl.textContent = "0%";
    destroyCharts();
    renderWarning([]);
    return;
  }

  const extraPayment = Number(extraInput?.value ?? 0);
  savePrefs({ strategy: prefs.strategy, extraPayment });

  const { avalanche, snowball } = computeBothSchedules(loans, extraPayment);
  const schedule = prefs.strategy === "avalanche" ? avalanche : snowball;

  renderComparison(avalanche, snowball);
  renderPayoffOrder(avalanche, snowball, loans);
  renderProgressBar(loans);
  renderLineChart(avalanche, snowball, prefs.strategy, loans);
  renderPieChart(loans);
  renderWarning(loans);
}

/* ── Init ───────────────────────────────────────────────────── */


export function initDebtPayoff() {
  const section = document.getElementById("debt-payoff-section");
  if (!section) return;

  const radios = document.querySelectorAll<HTMLInputElement>("input[name='strategy']");
  const extraInput = document.getElementById("extra-payment") as HTMLInputElement | null;

  radios.forEach((r) => {
    r.addEventListener("change", () => {
      if (r.checked) {
        savePrefs({ ...loadPrefs(), strategy: r.value as "snowball" | "avalanche" });
        renderDebtPayoff();
      }
    });
  });

  extraInput?.addEventListener("input", () => {
    const val = Math.max(0, Number(extraInput.value) || 0);
    extraInput.value = String(val);
    savePrefs({ ...loadPrefs(), extraPayment: val });
    renderDebtPayoff();
  });

  document.getElementById("export-csv")?.addEventListener("click", () => {
    const loans = emisToDebtLoans(loadData().emis);
    const prefs = loadPrefs();
    const extra = Number((document.getElementById("extra-payment") as HTMLInputElement)?.value ?? 0);
    const { avalanche, snowball } = computeBothSchedules(loans, extra);
    exportCSV(avalanche, snowball, prefs.strategy);
  });

  document.getElementById("export-pdf")?.addEventListener("click", exportPDF);

  // React to store changes
  subscribe(() => renderDebtPayoff());

  // Initial render
  renderDebtPayoff();
}
