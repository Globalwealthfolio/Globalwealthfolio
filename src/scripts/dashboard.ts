/**
 * Dashboard page interactivity
 * - Reactive stats, charts, top holdings, goal progress, EMI summary, cashflow
 * - Listens to the data store and re-renders on change
 */

import {
  loadData,
  updateData,
  addAudit,
  uid,
  nowISO,
  subscribe,
} from "../lib/store";
import {
  totalCurrent,
  totalGain,
  allocationByType,
  totalEMI,
  totalOutstanding,
  monthlyIncomeFromTransactions,
  timeToGoalCompletion,
  monthKey,
  formatMonthLabel,
  type Investment,
  type AssetType,
} from "../lib/types";
import { formatCurrency, type CurrencyCode } from "../lib/currency";
import { hasAnyData, seedSampleData } from "../lib/sample-data";
import { getDateRange, isInRange, type DateRange } from "./date-range-filter";

// Chart.js — register only what we need
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
  Filler,
  BarController,
  BarElement,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  BarController,
  BarElement,
);
import { applyChartDefaults, CHART_FONT_FAMILY } from "./chart-defaults";
applyChartDefaults();

/* ── Greeting based on time of day ─────────────────────────── */
function setGreeting(prefs: { language: string; currency: string }) {
  const el = document.querySelector("[data-greeting]") as HTMLElement | null;
  if (!el) return;
  const hour = new Date().getHours();
  const greetings: Record<string, { morning: string; afternoon: string; evening: string }> = {
    en: { morning: "Good morning.", afternoon: "Good afternoon.", evening: "Good evening." },
    hi: { morning: "सुप्रभात।", afternoon: "शुभ दोपहर।", evening: "शुभ संध्या।" },
    es: { morning: "Buenos días.", afternoon: "Buenas tardes.", evening: "Buenas tardes." },
    fr: { morning: "Bonjour.", afternoon: "Bon après-midi.", evening: "Bonsoir." },
    de: { morning: "Guten Morgen.", afternoon: "Guten Tag.", evening: "Guten Abend." },
    ja: { morning: "おはようございます。", afternoon: "こんにちは。", evening: "こんばんは。" },
    zh: { morning: "早上好。", afternoon: "下午好。", evening: "晚上好。" },
    pt: { morning: "Bom dia.", afternoon: "Boa tarde.", evening: "Boa noite." },
    ru: { morning: "Доброе утро.", afternoon: "Добрый день.", evening: "Добрый вечер." },
    ar: { morning: "صباح الخير.", afternoon: "مساء الخير.", evening: "مساء الخير." },
  };
  const g = greetings[prefs.language] ?? greetings.en;
  const text =
    hour < 12 ? g.morning : hour < 18 ? g.afternoon : g.evening;
  el.textContent = text;
}

/* ── Format helpers ────────────────────────────────────────── */
function fmt(value: number, currency: CurrencyCode, compact = false): string {
  return formatCurrency(value, currency, { compact, decimals: compact ? 1 : 0 });
}

/* ── Charts ────────────────────────────────────────────────── */
let growthChart: Chart | null = null;
let allocChart: Chart | null = null;
let cashChart: Chart | null = null;

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#171717";
}

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

function chartTooltip() {
  return {
    backgroundColor: "rgba(10, 10, 10, 0.94)",
    titleColor: "#ffffff",
    bodyColor: "#ffffff",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    padding: 10,
    cornerRadius: 6,
    displayColors: false,
    titleFont: { weight: 600 },
    bodyFont: { weight: 500 },
  };
}

function chartAxisColors() {
  const dark = isDark();
  return {
    tick: dark ? "rgba(220,220,220,0.75)" : "rgba(80,80,80,0.75)",
    grid: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
  };
}

function getCurrency(): CurrencyCode {
  const stored = (document.documentElement.dataset.currency ?? "INR") as CurrencyCode;
  return stored;
}

function getRangeMonths(): number | "all" {
  const active = document.querySelector("[data-range].bg-canvas-soft-2") as HTMLElement | null;
  const r = active?.dataset.range ?? "1Y";
  if (r === "1M") return 1;
  if (r === "6M") return 6;
  if (r === "1Y") return 12;
  return "all";
}

let selectedMonth = monthKey(new Date());

function getSelectedMonth(): string {
  return selectedMonth;
}

function getSelectedRange(): DateRange {
  return getDateRange();
}

/** Returns the month key used to anchor the growth chart. Prefers the range's
 * "to" date, falling back to the legacy month selector. */
function getRangeAnchorMonth(): string {
  const r = getSelectedRange();
  if (r.active && r.to) return r.to.slice(0, 7);
  return selectedMonth;
}

function getInvestmentsAsOf(cutoffISO: string, investments: Investment[]): Investment[] {
  return investments.filter((i) => i.date <= cutoffISO);
}

function getRangeEndISO(): string {
  const r = getSelectedRange();
  if (r.active && r.to) return r.to;
  // Fall back to the last day of the selected month.
  const [y, m] = selectedMonth.split("-").map(Number);
  return new Date(y, m, 0).toISOString().split("T")[0];
}

function buildGrowthSeries(investments: Investment[], rangeMonths: number | "all") {
  const r = getSelectedRange();
  if (investments.length === 0) {
    const now = new Date();
    const months = 12;
    const labels: string[] = [];
    const data: number[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString("en", { month: "short" }));
      data.push(0);
    }
    return { labels, data, isEmpty: true as const };
  }
  const now = new Date();
  const earliest = investments.reduce(
    (min, i) => (new Date(i.date) < new Date(min) ? i.date : min),
    investments[0].date,
  );
  // If a custom date range is active, use it as the chart bounds. Otherwise
  // honor the legacy 1M / 6M / 1Y / All buttons.
  let start: Date;
  let end: Date;
  if (r.active && r.from && r.to) {
    start = new Date(r.from);
    end = new Date(r.to);
    // Don't extend before the earliest investment
    if (start < new Date(earliest)) start = new Date(earliest);
  } else {
    start = new Date(earliest);
    if (rangeMonths !== "all") {
      start = new Date(now);
      start.setMonth(now.getMonth() - rangeMonths);
      if (start < new Date(earliest)) start = new Date(earliest);
    }
    end = now;
  }
  // Build month buckets
  const labels: string[] = [];
  const data: number[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endCursor) {
    labels.push(cursor.toLocaleString("en", { month: "short" }));
    const point = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const pointValue = investments
      .filter((i) => new Date(i.date) <= point)
      .reduce((sum, i) => sum + i.currentValue, 0);
    data.push(pointValue);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (data.length === 0) data.push(0);
  return { labels, data, isEmpty: false as const };
}

function renderGrowthChart() {
  const data = loadData();
  const range = getRangeMonths();
  const series = buildGrowthSeries(data.investments, range);
  const canvas = document.getElementById("growthChart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const inkColor = getCssVar("--color-ink");
  const goldColor = "#c9a961";
  const goldColorDark = "#d4b16a";
  const lineColor = isDark() ? goldColorDark : goldColor;
  const axis = chartAxisColors();
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, isDark() ? "rgba(212,177,106,0.32)" : "rgba(201,169,97,0.30)");
  gradient.addColorStop(1, "rgba(201,169,97,0)");

  if (growthChart) {
    growthChart.data.labels = series.labels;
    growthChart.data.datasets[0].data = series.data;
    growthChart.update();
    return;
  }
  growthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: series.labels,
      datasets: [
        {
          label: "Portfolio value",
          data: series.data,
          borderColor: series.isEmpty ? (isDark() ? "rgba(180,180,180,0.45)" : "rgba(120,120,120,0.4)") : lineColor,
          backgroundColor: series.isEmpty ? "transparent" : gradient,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: lineColor,
          tension: 0.3,
          fill: !series.isEmpty,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...chartTooltip(),
          callbacks: {
            label: (item) => fmt(item.parsed.y, getCurrency()),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: axis.tick, font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 } },
        },
        y: {
          grid: { color: axis.grid },
          ticks: {
            color: axis.tick,
            font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 },
            callback: (v) => fmt(Number(v), getCurrency(), true),
          },
        },
      },
    },
  });
}

function renderAllocChart() {
  const data = loadData();
  const allocs = allocationByType(data.investments);
  const canvas = document.getElementById("allocationChart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (allocChart) {
    allocChart.destroy();
    allocChart = null;
  }
  const palette = ["#0070f3", "#7928ca", "#ff0080", "#f9cb28", "#10b981", "#50e3c2", "#f5a623", "#a1a1a1", "#ee0000", "#0761d1"];
  const colors = allocs.map((_, i) => palette[i % palette.length]);
  if (allocs.length === 0) {
    colors.length = 0;
    colors.push("#ebebeb");
    allocs.push({ type: "Empty" as AssetType, value: 1, pct: 100 });
  }

  allocChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: allocs.map((a) => a.type),
      datasets: [
        {
          data: allocs.map((a) => a.value),
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: getCssVar("--color-canvas"),
          hoverOffset: 6,
        },
      ],
    },
    options: {
      cutout: "70%",
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...chartTooltip(),
          titleFont: { family: CHART_FONT_FAMILY, size: 12, weight: 600 },
          bodyFont: { family: CHART_FONT_FAMILY, size: 12, weight: 500 },
          callbacks: {
            label: (item) => `${item.label}: ${(item.parsed / totalCurrent(data.investments) * 100).toFixed(1)}%`,
          },
        },
      },
    },
  });

  // Legend
  const legend = document.getElementById("allocation-legend");
  if (legend) {
    legend.innerHTML =
      allocs.length === 1 && allocs[0].type === ("Empty" as AssetType)
        ? `<p class="text-body-sm text-body text-center py-md">Add investments to see your allocation.</p>`
        : allocs
            .map(
              (a, i) => `
                <div class="flex items-center justify-between text-body-sm">
                  <span class="flex items-center gap-xs">
                    <span class="w-2 h-2 rounded-full" style="background:${colors[i]}"></span>
                    <span>${a.type}</span>
                  </span>
                  <span class="text-body">${a.pct.toFixed(1)}%</span>
                </div>`,
            )
            .join("");
  }
  const totalEl = document.querySelector("[data-stat='alloc-total']") as HTMLElement | null;
  if (totalEl) totalEl.textContent = fmt(totalCurrent(data.investments), getCurrency(), true);
}

function renderCashflowChart() {
  const data = loadData();
  const canvas = document.getElementById("cashflowChart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Aggregate income and expenses by month for the months covered by the
  // selected range (or the 6 months centered on the selected month when no
  // range is active). For recurring transactions, project the recurring
  // amount into each month they cover so the chart reflects true monthly
  // cash flow, not just entries. If the user has not logged any income
  // transactions yet, fall back to the baseline value from Preferences →
  // Monthly Income.
  const hasIncomeTx = data.expenses.some((e) => e.type === "income");
  const baselineIncome = !hasIncomeTx ? data.preferences.monthlyIncome || 0 : 0;
  const range = getSelectedRange();
  const centerMonth = getRangeAnchorMonth();
  const [sy, sm] = centerMonth.split("-").map(Number);
  const center = new Date(sy, sm - 1, 1);
  // Decide the month window for the chart
  let monthsBack: number;
  let monthsForward: number;
  if (range.active && range.from && range.to) {
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    monthsBack = Math.max(
      0,
      (center.getFullYear() - fromDate.getFullYear()) * 12 +
        (center.getMonth() - fromDate.getMonth()),
    );
    monthsForward = Math.max(
      0,
      (toDate.getFullYear() - center.getFullYear()) * 12 +
        (toDate.getMonth() - center.getMonth()),
    );
    // Cap the chart at 18 months so it stays readable for long ranges
    if (monthsBack + monthsForward > 18) {
      const trim = monthsBack + monthsForward - 18;
      monthsBack = Math.max(0, monthsBack - trim);
    }
  } else {
    monthsBack = 5;
    monthsForward = 0;
  }
  const labels: string[] = [];
  const expData: number[] = [];
  const incData: number[] = [];
  for (let i = monthsBack; i >= -monthsForward; i--) {
    const d = new Date(center.getFullYear(), center.getMonth() - i, 1);
    labels.push(d.toLocaleString("en", { month: "short" }));
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let exp = 0;
    let inc = 0;
    data.expenses.forEach((e) => {
      const from = e.recurringFrom ? new Date(e.recurringFrom) : new Date(e.date);
      const to = e.recurringTo ? new Date(e.recurringTo) : null;
      if (e.recurring === "one-time") {
        if (e.date.startsWith(mk)) {
          if (e.type === "income") inc += e.amount;
          else exp += e.amount;
        }
        return;
      }
      if (d < from) return;
      if (to && d > to) return;
      const matches =
        (e.recurring === "monthly") ||
        (e.recurring === "quarterly" && d.getMonth() % 3 === new Date(e.date).getMonth() % 3) ||
        (e.recurring === "yearly" && d.getMonth() === new Date(e.date).getMonth());
      if (matches) {
        if (e.type === "income") inc += e.amount;
        else exp += e.amount;
      }
    });
    expData.push(exp);
    incData.push(inc + baselineIncome);
  }

  if (cashChart) {
    cashChart.data.labels = labels;
    cashChart.data.datasets[0].data = expData;
    cashChart.data.datasets[1].data = incData;
    cashChart.update();
    return;
  }
  const axisCash = chartAxisColors();
  cashChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Income",
          data: incData,
          backgroundColor: "#10b981",
          borderRadius: 4,
        },
        {
          label: "Expenses",
          data: expData,
          backgroundColor: "#ef4444",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { color: getCssVar("--color-body"), boxWidth: 8, font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 } },
        },
        tooltip: {
          ...chartTooltip(),
          titleFont: { family: CHART_FONT_FAMILY, size: 12, weight: 600 },
          bodyFont: { family: CHART_FONT_FAMILY, size: 12, weight: 500 },
          callbacks: { label: (item) => `${item.dataset.label}: ${fmt(item.parsed.y, getCurrency())}` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: axisCash.tick, font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 } },
        },
        y: {
          grid: { color: axisCash.grid },
          ticks: {
            color: axisCash.tick,
            font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 },
            callback: (v) => fmt(Number(v), getCurrency(), true),
          },
        },
      },
    },
  });
}

function formatMonthsHuman(months: number | null): string {
  if (months == null) return "—";
  if (months <= 0) return "Reached";
  if (months < 1) return "< 1 mo";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

function renderGoalTiming() {
  const data = loadData();
  const currency = getCurrency();
  const root = document.getElementById("goal-timing");
  if (!root) return;
  if (data.goals.length === 0) {
    root.innerHTML = `
      <div class="text-center py-3xl card-soft">
        <p class="text-body-sm text-body">No goals yet. Add a goal and link investments to estimate completion timing.</p>
        <a href="/goals" class="btn-secondary mt-md inline-flex" style="height: 32px; padding: 0 12px; font-size: 13px;">Add a goal</a>
      </div>`;
    return;
  }
  root.innerHTML = data.goals
    .map((g) => {
      const linked = data.investments.filter((i) => i.goalId === g.id);
      const { months, perInvestment } = timeToGoalCompletion(g, data.investments);
      const remaining = Math.max(0, g.target - g.current);
      const pct = g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0;
      const eta = months == null
        ? (linked.length === 0
            ? "No investments linked"
            : remaining > 0
              ? "Need higher growth to project"
              : "Goal reached")
        : formatMonthsHuman(months);
      const etaClass = months == null
        ? "text-mute"
        : months === 0
          ? "text-gain"
          : "text-gold";
      return `
        <div class="card-soft p-md">
          <div class="flex items-start justify-between gap-md mb-sm">
            <div class="min-w-0 flex-1">
              <p class="text-body-sm-strong text-ink">${escapeHtml(g.name)}</p>
              <p class="text-caption text-mute">${fmt(g.current, currency)} of ${fmt(g.target, currency)} (${pct.toFixed(0)}%)</p>
            </div>
            <div class="text-right shrink-0">
              <p class="text-caption-mono text-body">ETA</p>
              <p class="text-body-sm-strong ${etaClass}">${eta}</p>
            </div>
          </div>
          <div class="h-1.5 bg-canvas-soft-2 rounded-full overflow-hidden mb-sm">
            <div class="h-full ${pct >= 100 ? "bg-gain" : "bg-gradient-gain"}" style="width: ${pct.toFixed(1)}%"></div>
          </div>
          ${
            linked.length > 0
              ? `<div class="flex flex-wrap gap-xs">
                  ${linked
                    .map((i) => {
                      const per = perInvestment.find((p) => p.id === i.id);
                      return `<span class="badge" title="${escapeHtml(i.name)}">${escapeHtml(i.name)} · ${formatMonthsHuman(per?.months ?? null)}</span>`;
                    })
                    .join("")}
                </div>`
              : `<p class="text-caption text-mute">Link an investment to this goal to see completion timing.</p>`
          }
        </div>`;
    })
    .join("");
}

function renderStats() {
  const data = loadData();
  const currency = getCurrency();
  const range = getSelectedRange();
  const rangeEndISO = getRangeEndISO();
  const invsAsOf = getInvestmentsAsOf(rangeEndISO, data.investments);
  const total = totalCurrent(invsAsOf);
  const gain = totalGain(invsAsOf);
  const nw = {
    assets: total,
    liabilities: totalOutstanding(data.emis),
    net: total - totalOutstanding(data.emis),
  };

  // Period net = income (preferences + recurring + recorded in range) - expenses in range
  const monthExpenses = data.expenses.filter((e) => e.type !== "income" && isInRange(e.date, range));
  const monthIncome = data.expenses.filter((e) => e.type === "income" && isInRange(e.date, range));
  const expensesTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const incomeRecorded = monthIncome.reduce((s, e) => s + e.amount, 0);
  // For pre-selected periods, still layer in the recurring/baseline income so a net estimate
  // is meaningful when the user hasn't logged monthly income transactions yet.
  const recurringIncome = monthlyIncomeFromTransactions(data.expenses);
  const baseIncome = data.preferences.monthlyIncome || 0;
  const monthlyIncomeEstimate = recurringIncome + baseIncome;
  const netMonth = incomeRecorded + monthlyIncomeEstimate - expensesTotal;

  const goalsTotal = data.goals.length;
  const goalsOnTrack = data.goals.filter((g) => g.target > 0 && g.current >= g.target).length;
  const now = new Date();
  const activeGoals = data.goals.filter((g) => {
    if (!g.deadline) return true;
    return new Date(g.deadline) >= now;
  }).length;

  setText("[data-stat='total']", fmt(total, currency, true));
  const totalEl = document.querySelector("[data-stat='total']") as HTMLElement | null;
  if (totalEl) totalEl.classList.add("text-gradient-gold");

  // Update the stat label to reflect the selected period
  const periodLabel = formatRangeLabel(range);
  const monthLabelEls = document.querySelectorAll<HTMLElement>("[data-stat-label='net-month']");
  monthLabelEls.forEach((el) => {
    el.textContent = `${periodLabel} · Net`;
  });
  const dashLabel = document.getElementById("dash-net-month-label");
  if (dashLabel) {
    dashLabel.textContent = `${periodLabel} · Net`;
  }

  const netMonthEl = document.querySelector("[data-stat='net-month']") as HTMLElement | null;
  if (netMonthEl) {
    netMonthEl.textContent = `${netMonth >= 0 ? "+" : "−"}${fmt(Math.abs(netMonth), currency, true)}`;
    netMonthEl.classList.toggle("text-gain", netMonth >= 0);
    netMonthEl.classList.toggle("text-loss", netMonth < 0);
  }
  setText("[data-stat='networth']", fmt(nw.net, currency, true));
  const goalsEl = document.querySelector("[data-stat='goals']") as HTMLElement | null;
  if (goalsEl) {
    goalsEl.textContent = `${goalsOnTrack} / ${goalsTotal}`;
    goalsEl.setAttribute("title", `${activeGoals} active · ${goalsTotal - activeGoals} past deadline`);
  }
  setText("[data-stat='alloc-total']", fmt(total, currency, true));
}

function formatRangeLabel(range: DateRange): string {
  if (!range.active) return "This Month";
  if (range.preset === "thisMonth") return "This Month";
  if (range.preset === "last30") return "Last 30 days";
  if (range.preset === "last3Months") return "Last 3 months";
  if (range.preset === "last12Months") return "Last 12 months";
  if (range.preset === "ytd") return "Year to date";
  if (range.preset === "custom" && range.from && range.to) {
    const fmtShort = (s: string) => {
      const d = new Date(s);
      return d.toLocaleString("en", { month: "short", day: "numeric" });
    };
    return `${fmtShort(range.from)} – ${fmtShort(range.to)}`;
  }
  return "Period";
}

function setText(sel: string, text: string) {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (el) el.textContent = text;
}

function renderTopHoldings() {
  const data = loadData();
  const currency = getCurrency();
  const root = document.getElementById("top-holdings");
  if (!root) return;
  const invs = getInvestmentsAsOf(getRangeEndISO(), data.investments);
  if (invs.length === 0) {
    root.innerHTML = `
      <div class="card-soft text-center py-4xl">
        <p class="text-display-sm text-ink mb-xs">No investments yet</p>
        <p class="text-body-sm text-body mb-lg">Add your first investment to see your holdings here.</p>
        <button class="btn-primary" data-open-quick-add>Add investment</button>
      </div>`;
    root.querySelector("[data-open-quick-add]")?.addEventListener("click", openQuickAdd);
    return;
  }
  const top = [...invs]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 5);
  root.innerHTML = `
    <ul class="divide-y divide-hairline">
      ${top
        .map((i) => {
          const gain = i.currentValue - i.amount;
          const pct = i.amount > 0 ? (gain / i.amount) * 100 : 0;
          return `
            <li class="flex items-center justify-between py-sm">
              <div>
                <p class="text-body-sm-strong text-ink">${escapeHtml(i.name)}</p>
                <p class="text-caption text-mute">${i.type} · ${fmt(i.amount, currency)}</p>
              </div>
              <div class="text-right">
                <p class="text-body-sm-strong text-ink">${fmt(i.currentValue, currency)}</p>
                <p class="text-caption ${gain >= 0 ? "text-gain" : "text-loss"}">${gain >= 0 ? "+" : ""}${pct.toFixed(1)}%</p>
              </div>
            </li>`;
        })
        .join("")}
    </ul>`;
}

function renderGoalProgress() {
  const data = loadData();
  const currency = getCurrency();
  const root = document.getElementById("goal-progress");
  if (!root) return;
  if (data.goals.length === 0) {
    root.innerHTML = `
      <div class="text-center py-3xl">
        <p class="text-body-sm text-body mb-md">No goals yet. Set your first one to start tracking.</p>
        <a href="/goals" class="btn-secondary" style="height: 32px; padding: 0 12px; font-size: 13px;">Add a goal</a>
      </div>`;
    return;
  }
  root.innerHTML = data.goals
    .slice(0, 4)
    .map((g) => {
      const pct = g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0;
      return `
        <div>
          <div class="flex items-center justify-between mb-xs">
            <span class="text-body-sm-strong text-ink">${escapeHtml(g.name)}</span>
            <span class="text-caption text-body">${pct.toFixed(0)}%</span>
          </div>
          <div class="h-2 bg-canvas-soft-2 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-gain" style="width: ${pct.toFixed(1)}%"></div>
          </div>
          <p class="text-caption text-mute mt-xs">${fmt(g.current, currency)} of ${fmt(g.target, currency)}</p>
        </div>`;
    })
    .join("");
}

function renderEMISummary() {
  const data = loadData();
  const currency = getCurrency();
  const root = document.getElementById("emi-summary");
  if (!root) return;
  // Show loans that were active up to the end of the selected range (or current
  // month when no range is set), and have outstanding > 0.
  const cutoffISO = getRangeEndISO();
  const activeEmis = data.emis.filter((e) => e.startDate <= cutoffISO && e.outstanding > 0);
  if (activeEmis.length === 0) {
    root.innerHTML = `
      <div class="text-center py-3xl">
        <p class="text-body-sm text-body mb-md">${data.emis.length === 0 ? "No active loans." : "No loans were active in this month."}</p>
        <a href="/emi" class="btn-secondary" style="height: 32px; padding: 0 12px; font-size: 13px;">Add an EMI</a>
      </div>`;
    return;
  }
  const totalEmi = totalEMI(activeEmis);
  const outstanding = totalOutstanding(activeEmis);
  const interest = outstanding * 0.12; // rough estimate
  root.innerHTML = `
    <div class="grid grid-cols-3 gap-md text-center mb-md">
      <div>
        <p class="text-caption-mono text-body">Monthly</p>
        <p class="text-display-sm text-ink">${fmt(totalEmi, currency, true)}</p>
      </div>
      <div>
        <p class="text-caption-mono text-body">Outstanding</p>
        <p class="text-display-sm text-ink">${fmt(outstanding, currency, true)}</p>
      </div>
      <div>
        <p class="text-caption-mono text-body">Active</p>
        <p class="text-display-sm text-ink">${activeEmis.length}</p>
      </div>
    </div>
    <ul class="space-y-xs">
      ${activeEmis
        .slice(0, 3)
        .map(
          (e) => `
        <li class="flex items-center justify-between text-body-sm">
          <span class="text-ink">${escapeHtml(e.name)}</span>
          <span class="text-body">${fmt(e.emi, currency)}/mo</span>
        </li>`,
        )
        .join("")}
    </ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── Quick add modal ───────────────────────────────────────── */
const modal = document.getElementById("quick-add-modal") as HTMLDialogElement | null;
const quickAddBtn = document.getElementById("quick-add-investment");

function openQuickAdd() {
  if (!modal) return;
  const form = modal.querySelector("form");
  if (form) form.reset();
  (modal.querySelector("#qa-date") as HTMLInputElement | null)?.setAttribute(
    "value",
    new Date().toISOString().split("T")[0],
  );
  (modal.querySelector("#qa-risk") as HTMLInputElement | null)?.setAttribute("value", "5");
  updateRiskLabel();
  modal.showModal();
}
quickAddBtn?.addEventListener("click", openQuickAdd);

document.querySelectorAll("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => modal?.close());
});

const riskInput = document.getElementById("qa-risk") as HTMLInputElement | null;
function updateRiskLabel() {
  if (!riskInput) return;
  const val = document.getElementById("qa-risk-val");
  if (val) val.textContent = riskInput.value;
}
riskInput?.addEventListener("input", updateRiskLabel);

const form = document.getElementById("quick-add-form") as HTMLFormElement | null;
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form) return;
  const fd = new FormData(form);
  const ts = nowISO();
  const inv: Investment = {
    id: uid(),
    name: String(fd.get("name") ?? "").trim(),
    type: (fd.get("type") as Investment["type"]) ?? "Equity",
    amount: Number(fd.get("amount") ?? 0),
    currentValue: Number(fd.get("currentValue") ?? fd.get("amount") ?? 0),
    date: String(fd.get("date") ?? ts.split("T")[0]),
    risk: Number(fd.get("risk") ?? 5),
    notes: String(fd.get("notes") ?? ""),
    createdAt: ts,
    updatedAt: ts,
  };
  if (!inv.name || inv.amount <= 0) {
    alert("Please enter a name and a positive amount.");
    return;
  }
  updateData((data) => {
    data.investments.push(inv);
  });
  addAudit({
    action: "create",
    entity: "investment",
    entityId: inv.id,
    description: `Added investment: ${inv.name}`,
  });
  modal?.close();
});

/* ── Range buttons ─────────────────────────────────────────── */
document.querySelectorAll<HTMLButtonElement>("[data-range]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-range]").forEach((b) =>
      b.classList.remove("bg-canvas-soft-2", "text-ink"),
    );
    btn.classList.add("bg-canvas-soft-2", "text-ink");
    renderGrowthChart();
  });
});

/* ── Date range filter ────────────────────────────────────── */
window.addEventListener("gwp:daterange", () => {
  renderAll();
});

// Sync the legacy month selector so the rest of the app behaves consistently
// when the user has no custom range set.
function syncLegacyMonthFromRange() {
  const r = getSelectedRange();
  if (!r.active && r.to) {
    selectedMonth = r.to.slice(0, 7);
  }
}
syncLegacyMonthFromRange();
window.addEventListener("gwp:daterange", syncLegacyMonthFromRange);

/* ── First-run banner ─────────────────────────────────────── */
const firstRunBanner = document.getElementById("first-run-banner") as HTMLElement | null;
document.getElementById("seed-sample")?.addEventListener("click", () => {
  if (confirm("Load sample data? This will replace anything you've already entered.")) {
    seedSampleData();
  }
});
function renderFirstRun() {
  if (!firstRunBanner) return;
  firstRunBanner.classList.toggle("hidden", hasAnyData());
}

/* ── Reactive renders ──────────────────────────────────────── */
function renderAll() {
  const prefs = loadData().preferences;
  setGreeting({ language: prefs.language, currency: prefs.currency });
  renderFirstRun();
  renderStats();
  renderGrowthChart();
  renderAllocChart();
  renderCashflowChart();
  renderTopHoldings();
  renderGoalProgress();
  renderGoalTiming();
  renderEMISummary();
}

subscribe(() => renderAll());
renderAll();

// Re-render charts on theme change so colors update
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (growthChart) growthChart.destroy();
  if (allocChart) allocChart.destroy();
  if (cashChart) cashChart.destroy();
  growthChart = null;
  allocChart = null;
  cashChart = null;
  renderAll();
});

// Public hook to refresh from outside
declare global {
  interface Window {
    gwpRefresh: () => void;
  }
}
window.gwpRefresh = renderAll;
