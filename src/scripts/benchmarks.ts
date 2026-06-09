import { loadData, subscribe } from "../lib/store";
import { BENCHMARKS, type Benchmark } from "../lib/types";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { fetchLiveBenchmarks, clearBenchmarkCache } from "../lib/benchmarks-api";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
import { applyChartDefaults, CHART_FONT_FAMILY } from "./chart-defaults";
applyChartDefaults();

interface PerfStats {
  oneMonth: number;
  sixMonth: number;
  oneYear: number;
  threeYear: number;
  fiveYear: number;
}

/** Compute your portfolio's approximate CAGR by year bucket. */
function computePortfolioStats(): PerfStats | null {
  const data = loadData();
  if (data.investments.length === 0) return null;
  const now = new Date();
  const baseDate = new Date(data.preferences.portfolioBaseDate || now.toISOString().split("T")[0]);
  const yearsSince = (now.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (yearsSince <= 0) return null;
  const invested = data.investments.reduce((s, i) => s + i.amount, 0);
  const current = data.investments.reduce((s, i) => s + i.currentValue, 0);
  if (invested <= 0) return null;
  const totalReturn = (current - invested) / invested;
  const annualized = Math.pow(1 + totalReturn, 1 / yearsSince) - 1;
  const annualizedPct = annualized * 100;
  return {
    oneMonth: annualizedPct / 12,
    sixMonth: annualizedPct / 2,
    oneYear: yearsSince >= 1 ? annualizedPct : annualizedPct * yearsSince,
    threeYear: yearsSince >= 3 ? annualizedPct : annualizedPct * Math.min(yearsSince / 3, 1),
    fiveYear: yearsSince >= 5 ? annualizedPct : annualizedPct * Math.min(yearsSince / 5, 1),
  };
}

let chart: Chart | null = null;
let benchmarks: Benchmark[] = [];
let isLive = false;
let fetchedAt: number | null = null;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

function fmtTs(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderTable() {
  const stats = computePortfolioStats();
  const tbody = document.getElementById("bench-tbody");
  if (!tbody) return;
  const baseDate = loadData().preferences.portfolioBaseDate || new Date().toISOString().split("T")[0];
  const baseDateEl = document.querySelector("[data-base-date]");
  if (baseDateEl) baseDateEl.textContent = baseDate;

  const yours = stats
    ? `
      <tr class="border-t-2 border-ink bg-canvas-soft-2">
        <td class="py-sm px-md text-body-sm-strong text-ink">Your Portfolio</td>
        <td class="py-sm px-md text-right ${stats.oneMonth >= 0 ? "text-gain" : "text-loss"}">${stats.oneMonth >= 0 ? "+" : ""}${stats.oneMonth.toFixed(1)}%</td>
        <td class="py-sm px-md text-right ${stats.sixMonth >= 0 ? "text-gain" : "text-loss"}">${stats.sixMonth >= 0 ? "+" : ""}${stats.sixMonth.toFixed(1)}%</td>
        <td class="py-sm px-md text-right ${stats.oneYear >= 0 ? "text-gain" : "text-loss"}">${stats.oneYear >= 0 ? "+" : ""}${stats.oneYear.toFixed(1)}%</td>
        <td class="py-sm px-md text-right ${stats.threeYear >= 0 ? "text-gain" : "text-loss"}">${stats.threeYear >= 0 ? "+" : ""}${stats.threeYear.toFixed(1)}%</td>
        <td class="py-sm px-md text-right ${stats.fiveYear >= 0 ? "text-gain" : "text-loss"}">${stats.fiveYear >= 0 ? "+" : ""}${stats.fiveYear.toFixed(1)}%</td>
      </tr>`
    : "";

  const rows = benchmarks
    .map(
      (b) => `
      <tr class="border-t border-hairline hover:bg-canvas-soft">
        <td class="py-sm px-md text-body">
          <span class="text-ink font-medium">${esc(b.name)}</span>
          <span class="ml-1 text-caption text-mute">${b.region}</span>
        </td>
        <td class="py-sm px-md text-right ${b.oneMonth >= 0 ? "text-gain" : "text-loss"}">${b.oneMonth >= 0 ? "+" : ""}${b.oneMonth.toFixed(1)}%</td>
        <td class="py-sm px-md text-right ${b.sixMonth >= 0 ? "text-gain" : "text-loss"}">${b.sixMonth >= 0 ? "+" : ""}${b.sixMonth.toFixed(1)}%</td>
        <td class="py-sm px-md text-right ${b.oneYear >= 0 ? "text-gain" : "text-loss"}">${b.oneYear >= 0 ? "+" : ""}${b.oneYear.toFixed(1)}%</td>
        <td class="py-sm px-md text-right ${b.threeYear >= 0 ? "text-gain" : "text-loss"}">${b.threeYear >= 0 ? "+" : ""}${b.threeYear.toFixed(1)}%</td>
        <td class="py-sm px-md text-right ${b.fiveYear >= 0 ? "text-gain" : "text-loss"}">${b.fiveYear >= 0 ? "+" : ""}${b.fiveYear.toFixed(1)}%</td>
      </tr>`,
    )
    .join("");
  tbody.innerHTML = yours + rows;

  const liveBadge = document.querySelector("[data-source-badge]");
  if (liveBadge) {
    if (isLive) {
      liveBadge.classList.remove("hidden");
      liveBadge.textContent = "● Live";
      liveBadge.classList.add("badge-gain");
    } else {
      liveBadge.classList.remove("hidden");
      liveBadge.textContent = "● Cached";
      liveBadge.classList.remove("badge-gain");
    }
  }
  const tsEl = document.querySelector("[data-fetched-at]");
  if (tsEl) tsEl.textContent = fmtTs(fetchedAt);
}

function renderChart() {
  const stats = computePortfolioStats();
  const canvas = document.getElementById("benchChart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (chart) chart.destroy();
  const labels = ["1M", "6M", "1Y", "3Y CAGR", "5Y CAGR"];
  const datasets = benchmarks.slice(0, 4).map((b, i) => {
    const colors = ["#0b5fff", "#7928ca", "#ff0080", "#f9cb28", "#10b981"];
    return {
      label: b.name,
      data: [b.oneMonth, b.sixMonth, b.oneYear, b.threeYear, b.fiveYear],
      backgroundColor: colors[i],
      borderRadius: 4,
    };
  });
  if (stats) {
    datasets.unshift({
      label: "Your Portfolio",
      data: [stats.oneMonth, stats.sixMonth, stats.oneYear, stats.threeYear, stats.fiveYear],
      backgroundColor: "#0f1b2d",
      borderRadius: 4,
    });
  }
  const axis = chartAxisColors();
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 8, font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 } },
        },
        tooltip: {
          enabled: true,
          ...chartTooltip(),
          titleFont: { family: CHART_FONT_FAMILY, size: 12, weight: 600 },
          bodyFont: { family: CHART_FONT_FAMILY, size: 12, weight: 500 },
          callbacks: { label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(1)}%` },
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
            callback: (v) => `${v}%`,
          },
        },
      },
    },
  });
}

function renderAll() {
  renderTable();
  try {
    renderChart();
  } catch (e) {
    console.warn("[benchmarks] Chart render failed, table still available.", e);
  }
}

async function loadBenchmarks(force = false) {
  try {
    if (force) clearBenchmarkCache();
    const { benchmarks: data, live, fetchedAt: ts } = await fetchLiveBenchmarks();
    if (data && data.length > 0) {
      benchmarks = data;
      isLive = live;
      fetchedAt = ts;
    }
  } catch (e) {
    console.warn("[benchmarks] Failed to fetch live data, using static fallback.", e);
    isLive = false;
    fetchedAt = null;
  }
  renderAll();
}

document.getElementById("refresh-benchmarks")?.addEventListener("click", () => {
  loadBenchmarks(true);
});

subscribe(renderAll);

function loadInitialData() {
  try {
    const win = window as unknown as { __BENCHMARK_INITIAL_DATA__?: { benchmarks: Benchmark[]; live: boolean; fetchedAt: number } };
    if (win.__BENCHMARK_INITIAL_DATA__?.benchmarks?.length > 0) {
      benchmarks = win.__BENCHMARK_INITIAL_DATA__.benchmarks;
      isLive = win.__BENCHMARK_INITIAL_DATA__.live === true;
      fetchedAt = win.__BENCHMARK_INITIAL_DATA__.fetchedAt ?? null;
      renderAll();
      return;
    }
  } catch (e) {
    console.warn("[benchmarks] Failed to parse server data, using fallback.", e);
  }
  benchmarks = [...BENCHMARKS];
  renderAll();
}

loadInitialData();
loadBenchmarks();
