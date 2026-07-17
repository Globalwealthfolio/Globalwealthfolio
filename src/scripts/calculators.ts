import { Chart, registerables } from "chart.js";
import { applyChartDefaults, cssVar, axisOptions } from "./chart-defaults";

Chart.register(...registerables);
applyChartDefaults();

type CalcId = "emi" | "sip" | "xirr" | "swp" | "ppf" | "fd" | "retirement" | "tax";

interface CalcTab { id: CalcId; label: string; }

const CALC_TABS: CalcTab[] = [
  { id: "emi", label: "Advance EMI" },
  { id: "sip", label: "SIP" },
  { id: "xirr", label: "XIRR" },
  { id: "swp", label: "SWP" },
  { id: "ppf", label: "PPF" },
  { id: "fd", label: "FD" },
  { id: "retirement", label: "Retirement" },
  { id: "tax", label: "Tax Estimator" },
];

const CALC_LABELS: Record<CalcId, { title: string; description: string; ogTitle: string; ogDesc: string }> = {
  emi: {
    title: "Advance EMI Calculator with Prepayment — Global Wealth Portfolio",
    description: "Calculate monthly EMI, total interest, and total payment with extra monthly payments and lumpsum prepayments. See interest saved and amortization schedule.",
    ogTitle: "Advance EMI Calculator — Plan Your Loan Repayment",
    ogDesc: "Advanced EMI calculator with prepayment options. Calculate interest saved, amortization schedule, and loan term reduction.",
  },
  sip: {
    title: "SIP + Lumpsum Investment Calculator — Global Wealth Portfolio",
    description: "Calculate future value of SIP with optional lump-sum investment. See combined wealth from systematic and one-time investments.",
    ogTitle: "SIP + Lumpsum Calculator — Grow Your Wealth",
    ogDesc: "Plan your investments with SIP and lump-sum. Calculate future value with compound interest and wealth growth chart.",
  },
  xirr: {
    title: "XIRR Calculator — Global Wealth Portfolio",
    description: "Calculate the extended internal rate of return for irregular cash flows. Evaluate returns on investments with multiple transactions.",
    ogTitle: "XIRR Calculator — Return on Irregular Investments",
    ogDesc: "Calculate XIRR for irregular cash flows. Evaluate true returns on investments with multiple buy/sell transactions.",
  },
  swp: {
    title: "SWP / Systematic Withdrawal Plan Calculator — Global Wealth Portfolio",
    description: "Calculate how much you can withdraw monthly from your investment corpus. Plan your retirement income with SWP.",
    ogTitle: "SWP Calculator — Plan Your Regular Income",
    ogDesc: "Calculate monthly withdrawal amount from your investment corpus. Plan systematic withdrawals for retirement income.",
  },
  ppf: {
    title: "PPF / Public Provident Fund Calculator — Global Wealth Portfolio",
    description: "Calculate your PPF maturity amount. Plan your annual contributions and see how your PPF investment grows over 15 years.",
    ogTitle: "PPF Calculator — Public Provident Fund Growth",
    ogDesc: "Calculate PPF maturity amount. See annual contributions, interest earned, and total corpus at maturity.",
  },
  fd: {
    title: "FD / Fixed Deposit Calculator — Global Wealth Portfolio",
    description: "Calculate fixed deposit maturity amount and interest earned. Compare cumulative and quarterly payout options.",
    ogTitle: "FD Calculator — Fixed Deposit Returns",
    ogDesc: "Calculate fixed deposit maturity amount and interest. Compare different tenures and payout options for your FD investment.",
  },
  retirement: {
    title: "Retirement Planner — Global Wealth Portfolio",
    description: "Plan your retirement with our free calculator. Estimate the corpus you need and how much to save monthly.",
    ogTitle: "Retirement Planner — Calculate Your Retirement Corpus",
    ogDesc: "Plan your retirement. Estimate required corpus, monthly savings needed, and see your wealth grow over time.",
  },
  tax: {
    title: "India Tax Estimator — Global Wealth Portfolio",
    description: "Estimate your Indian income tax for the current financial year. Supports both old and new tax regimes.",
    ogTitle: "India Tax Estimator — Calculate Your Income Tax",
    ogDesc: "Estimate your Indian income tax liability instantly. Compare old vs new tax regimes for FY 2025-26.",
  },
};

const FY_YEAR = 2025;
const TAX_SLABS_NEW: { min: number; max: number; rate: number }[] = [
  { min: 0, max: 400000, rate: 0 },
  { min: 400000, max: 800000, rate: 5 },
  { min: 800000, max: 1200000, rate: 10 },
  { min: 1200000, max: 1600000, rate: 15 },
  { min: 1600000, max: 2000000, rate: 20 },
  { min: 2000000, max: 2400000, rate: 25 },
  { min: 2400000, max: Infinity, rate: 30 },
];

const TAX_SLABS_OLD: { min: number; max: number; rate: number }[] = [
  { min: 0, max: 250000, rate: 0 },
  { min: 250000, max: 500000, rate: 5 },
  { min: 500000, max: 1000000, rate: 20 },
  { min: 1000000, max: Infinity, rate: 30 },
];

const STANDARD_DEDUCTION_NEW = 75000;
const STANDARD_DEDUCTION_OLD = 50000;

const PPF_RATE = 7.1;
const PPF_MAX_YEARS = 15;

const DEFAULT_VALUES: Record<CalcId, Record<string, number>> = {
  emi: { amount: 3000000, rate: 9, tenure: 240, extra: 0 },
  sip: { monthly: 10000, lumpsum: 0, rate: 12, years: 10 },
  xirr: { investment: 120000, years: 3, finalValue: 180000 },
  swp: { investment: 10000000, rate: 8, years: 10, monthlyNeeded: 0 },
  ppf: { annual: 150000, rate: PPF_RATE },
  fd: { amount: 100000, rate: 7, years: 3 },
  retirement: { age: 30, retireAge: 60, currentCorpus: 500000, monthlySip: 10000, expectedReturn: 12, inflation: 6, lifeExpectancy: 85 },
  tax: { annualIncome: 1200000, regime: 80, hra: 0, lta: 0, sec80c: 150000, sec80d: 25000, nps: 50000, homeLoanInterest: 200000 },
};

let chartInstances: Record<string, Chart | null> = {};
let currentCalc: CalcId = "emi";

function getParams(): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

function setParams(params: Record<string, string>, replace = false) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== "") sp.set(k, v); });
  const url = `${window.location.pathname}${sp.toString() ? "?" + sp.toString() : ""}`;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
}

function getVal(id: string): number {
  const el = document.getElementById(id) as HTMLInputElement;
  if (!el) return 0;
  const v = parseFloat(el.value.replace(/,/g, ""));
  return isNaN(v) ? 0 : v;
}

function fmtInput(v: number): string {
  if (!isFinite(v)) return "0";
  const locale = (document.documentElement.lang || "en").replace("hi", "en-IN");
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
  } catch {
    return String(v);
  }
}

function setVal(id: string, v: number) {
  const el = document.getElementById(id) as HTMLInputElement;
  if (el) {
    el.value = fmtInput(v);
  }
}

function stripCommas(el: HTMLInputElement) {
  if (el.value.includes(",")) {
    el.value = el.value.replace(/,/g, "");
  }
}

function getCalcCurrency(): string {
  return document.documentElement.dataset.currency ?? "INR";
}

function fmt(v: number, useCurrency = true): string {
  if (!isFinite(v)) return "—";
  const locale = (document.documentElement.lang || "en").replace("hi", "en-IN");
  try {
    return useCurrency
      ? new Intl.NumberFormat(locale, { style: "currency", currency: getCalcCurrency(), maximumFractionDigits: 0 }).format(v)
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(v);
  } catch {
    return String(Math.round(v));
  }
}

function fmtPct(v: number): string {
  return `${v.toFixed(2)}%`;
}

function showToast(msg: string) {
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--color-ink);color:var(--color-on-primary);padding:12px 24px;border-radius:100px;font-size:14px;z-index:999;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:fade-in 300ms ease-out;";
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; toast.style.transition = "opacity 300ms"; setTimeout(() => toast.remove(), 300); }, 2500);
}

function updateSEO(calcId: CalcId, params: Record<string, string>) {
  const info = CALC_LABELS[calcId];
  let title = info.title;
  let desc = info.description;

  if (calcId === "emi" && params.amount) {
    const amt = Number(params.amount);
    if (amt > 0) {
      title = `EMI Calculator: ${fmt(amt, true)} Loan — Global Wealth Portfolio`;
      desc = `Calculate monthly EMI for a ${fmt(amt, true)} loan. Total interest, payment schedule, and amortization chart.`;
    }
  } else if (calcId === "sip" && params.monthly) {
    const m = Number(params.monthly);
    if (m > 0) {
      title = `SIP Calculator: ${fmt(m, true)}/month — Global Wealth Portfolio`;
      desc = `See how ${fmt(m, true)} monthly SIP grows over time with compound interest. Future value and wealth chart.`;
    }
  }

  document.title = title;
  setMeta("description", desc);
  setMeta("og:title", info.ogTitle);
  setMeta("og:description", info.ogDesc);
  setMeta("og:url", window.location.href);
  setMeta("twitter:title", info.ogTitle);
  setMeta("twitter:description", info.ogDesc);
  setMeta("twitter:url", window.location.href);
}

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    if (name.startsWith("og:") || name.startsWith("twitter:")) el.setAttribute("property", name);
    else el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function formatUrlParam(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function switchTab(calcId: CalcId) {
  currentCalc = calcId;
  document.querySelectorAll("[data-calc-tab]").forEach((t) => {
    t.classList.toggle("active", (t as HTMLElement).dataset.calcTab === calcId);
    t.setAttribute("aria-selected", String((t as HTMLElement).dataset.calcTab === calcId));
  });
  document.querySelectorAll("[data-calc-panel]").forEach((p) => {
    p.classList.toggle("hidden", (p as HTMLElement).dataset.calcPanel !== calcId);
  });

  const params = getParams();
  Object.keys(DEFAULT_VALUES[calcId]).forEach((k) => {
    if (params[k]) setVal(`${calcId}-${k}`, Number(params[k]));
  });

  setParams({ calc: calcId }, true);
  updateSEO(calcId, params);
  destroyCharts();
  calculate(calcId);
}

function destroyCharts() {
  Object.values(chartInstances).forEach((c) => c?.destroy());
  chartInstances = {};
}

function getThemeColors() {
  const dark = document.documentElement.classList.contains("dark");
  return {
    grid: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    tick: dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)",
    primary: dark ? "rgba(255,255,255,0.85)" : "rgba(15,27,45,0.85)",
    green: dark ? "#34d399" : "#10b981",
    blue: dark ? "#60a5fa" : "#0b5fff",
    gold: "#c9a961",
    canvas: dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
  };
}

function darkModeWatcher() {
  const observer = new MutationObserver(() => {
    destroyCharts();
    calculate(currentCalc);
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    destroyCharts();
    calculate(currentCalc);
  });
}

function renderLineChart(id: string, labels: string[], data: number[], label: string, color: string, fillColor?: string) {
  const canvas = document.getElementById(id) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cols = getThemeColors();
  chartInstances[id] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: fillColor || color + "20",
        borderWidth: 2,
        pointRadius: labels.length > 60 ? 0 : 3,
        pointHoverRadius: 5,
        fill: !!fillColor,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: axisOptions({ tickColor: cols.tick, gridColor: cols.grid }),
    },
  });
}

function renderDoughnut(id: string, labels: string[], data: number[], colors: string[]) {
  const canvas = document.getElementById(id) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  chartInstances[id] = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "65%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { boxWidth: 10, boxHeight: 10, padding: 8, font: { size: 11 } },
        },
      },
    },
  });
}

function renderStackedBar(id: string, labels: string[], principal: number[], interest: number[], extra: number[], lumpsum: number[]) {
  const canvas = document.getElementById(id) as HTMLCanvasElement;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cols = getThemeColors();
  const hasExtra = extra.some(v => v > 0);
  const hasLumpsum = lumpsum.some(v => v > 0);
  const datasets: any[] = [
    { label: "Interest", data: interest, backgroundColor: cols.gold, borderWidth: 0 },
    { label: "Principal", data: principal, backgroundColor: cols.blue, borderWidth: 0 },
  ];
  if (hasExtra) datasets.push({ label: "Extra", data: extra, backgroundColor: cols.green, borderWidth: 0 });
  if (hasLumpsum) datasets.push({ label: "Lumpsum", data: lumpsum, backgroundColor: "#8b5cf6", borderWidth: 0 });
  chartInstances[id] = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, ticks: { color: cols.tick, font: { size: 10 } }, grid: { display: false } },
        y: { stacked: true, ticks: { color: cols.tick, font: { size: 10 } }, grid: { color: cols.grid } },
      },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, padding: 8, font: { size: 11 } } },
      },
    },
  });
}

function calculate(calcId: CalcId) {
  switch (calcId) {
    case "emi": calculateEMI(); break;
    case "sip": calculateSIP(); break;
    case "xirr": calculateXIRR(); break;
    case "swp": calculateSWP(); break;
    case "ppf": calculatePPF(); break;
    case "fd": calculateFD(); break;
    case "retirement": calculateRetirement(); break;
    case "tax": calculateTax(); break;
  }
}

function calculateEMI() {
  const P = getVal("emi-amount");
  const annualRate = getVal("emi-rate");
  const r = annualRate / 12 / 100;
  const n = getVal("emi-tenure");
  const extraMonthly = getVal("emi-extra");

  const lumpsums: { month: number; amount: number }[] = [];
  document.querySelectorAll("[data-emi-lumpsum-row]").forEach((row) => {
    const monthInput = row.querySelector("[data-emi-lumpsum-month]") as HTMLInputElement;
    const amountInput = row.querySelector("[data-emi-lumpsum-amount]") as HTMLInputElement;
    if (monthInput && amountInput) {
      const m = parseInt(monthInput.value);
      const a = parseFloat(amountInput.value);
      if (m > 0 && a > 0) lumpsums.push({ month: m, amount: a });
    }
  });
  lumpsums.sort((a, b) => a.month - b.month);

  const emi = P > 0 && r > 0 ? P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1) : n > 0 ? P / n : 0;

  let baseMonths = 0;
  let baseInterest = 0;
  let baseBal = P;
  for (let i = 1; i <= n; i++) {
    if (baseBal <= 0) break;
    const intPart = baseBal * r;
    baseBal -= emi - intPart;
    baseInterest += intPart;
    baseMonths++;
  }

  let bal = P;
  let totalInterest = 0;
  let totalExtra = 0;
  let totalLumpsum = 0;
  let actualMonths = 0;
  let lumpsumIdx = 0;

  interface AmortRow { month: number; emi: number; principal: number; interest: number; extra: number; lumpsum: number; balance: number; }
  const amortization: AmortRow[] = [];

  for (let i = 1; i <= n; i++) {
    if (bal <= 0) break;
    let lumpsumAmt = 0;
    while (lumpsumIdx < lumpsums.length && lumpsums[lumpsumIdx].month <= i) {
      lumpsumAmt += lumpsums[lumpsumIdx].amount;
      lumpsumIdx++;
    }
    const intPart = bal * r;
    let prinPart = emi - intPart;
    totalInterest += intPart;
    totalExtra += extraMonthly;
    totalLumpsum += lumpsumAmt;
    let totalPrincipalPaid = prinPart + extraMonthly + lumpsumAmt;
    bal -= totalPrincipalPaid;
    if (bal < 0) { totalPrincipalPaid += bal; bal = 0; }
    actualMonths++;
    amortization.push({ month: i, emi: prinPart + intPart, principal: prinPart, interest: intPart, extra: extraMonthly, lumpsum: lumpsumAmt, balance: Math.max(0, bal) });
    if (bal <= 0) break;
  }

  const totalPayment = emi * actualMonths + totalExtra + totalLumpsum;
  const interestSaved = baseInterest - totalInterest;
  const termSaved = baseMonths - actualMonths;

  document.getElementById("emi-result-emi")!.textContent = fmt(emi);
  document.getElementById("emi-result-interest")!.textContent = fmt(totalInterest);
  document.getElementById("emi-result-total")!.textContent = fmt(totalPayment);
  document.getElementById("emi-result-principal")!.textContent = fmt(P);
  document.getElementById("emi-result-interest-saved")!.textContent = fmt(interestSaved);
  const termStr = actualMonths >= 12 ? `${(actualMonths / 12).toFixed(1)} yrs` : `${actualMonths} mo`;
  document.getElementById("emi-result-actual-term")!.textContent = termStr;
  const termSavedStr = termSaved >= 12 ? `${(termSaved / 12).toFixed(1)} yrs` : `${termSaved} mo`;
  document.getElementById("emi-result-term-saved")!.textContent = termSavedStr;
  document.getElementById("emi-result-total-extra")!.textContent = fmt(totalExtra + totalLumpsum);

  setParams({
    calc: "emi", amount: formatUrlParam(P), rate: formatUrlParam(annualRate), tenure: formatUrlParam(n),
    extra: formatUrlParam(extraMonthly),
    lumpsums: lumpsums.map(l => `${l.month}:${l.amount}`).join(","),
  });

  const labels: string[] = [];
  const balanceData: number[] = [];
  for (const row of amortization) {
    if (row.month % 12 === 0 || row.month === actualMonths) {
      labels.push(row.month <= 12 ? `Year ${Math.ceil(row.month / 12)}` : `Yr ${Math.ceil(row.month / 12)}`);
      balanceData.push(Math.round(row.balance));
    }
  }
  renderLineChart("emi-line-chart", labels, balanceData, "Balance", getThemeColors().blue, "rgba(11,95,255,0.08)");

  const yearlyLabels: string[] = [];
  const principalData: number[] = [];
  const interestData: number[] = [];
  const extraData: number[] = [];
  const lumpsumData: number[] = [];
  let yp = 0, yi = 0, ye = 0, yl = 0;
  for (const row of amortization) {
    yp += row.principal; yi += row.interest; ye += row.extra; yl += row.lumpsum;
    if (row.month % 12 === 0 || row.month === actualMonths) {
      yearlyLabels.push(`Yr ${Math.ceil(row.month / 12)}`);
      principalData.push(Math.round(yp)); interestData.push(Math.round(yi));
      extraData.push(Math.round(ye)); lumpsumData.push(Math.round(yl));
      yp = 0; yi = 0; ye = 0; yl = 0;
    }
  }
  renderStackedBar("emi-stacked-chart", yearlyLabels, principalData, interestData, extraData, lumpsumData);

  const cols = getThemeColors();
  const hasExtraPay = totalExtra + totalLumpsum > 0;
  renderDoughnut("emi-donut-chart",
    hasExtraPay ? ["Principal", "Interest", "Extra / Lumpsum"] : ["Principal", "Interest"],
    hasExtraPay ? [P, totalInterest, totalExtra + totalLumpsum] : [P, totalInterest],
    hasExtraPay ? [cols.blue, cols.gold, cols.green] : [cols.blue, cols.gold],
  );

  const tbody = document.getElementById("emi-amortization-body");
  if (tbody) {
    const maxRows = 120;
    const showAll = amortization.length <= maxRows;
    let html = "";
    for (let i = 0; i < amortization.length; i++) {
      const row = amortization[i];
      if (!showAll && i >= 60 && i < amortization.length - 60) {
        if (i === 60) html += `<tr><td class="p-xs text-mute text-center" colspan="7">&middot;&middot;&middot;</td></tr>`;
        continue;
      }
      const isLast = i === amortization.length - 1;
      html += `<tr${isLast ? '' : ' style="border-bottom:1px solid var(--color-hairline, #f0f0f0);"'}>
        <td class="p-xs">${row.month}</td>
        <td class="p-xs">${fmt(row.emi)}</td>
        <td class="p-xs">${fmt(row.principal)}</td>
        <td class="p-xs">${fmt(row.interest)}</td>
        <td class="p-xs">${row.extra > 0 ? fmt(row.extra) : '\u2014'}</td>
        <td class="p-xs">${row.lumpsum > 0 ? fmt(row.lumpsum) : '\u2014'}</td>
        <td class="p-xs">${fmt(row.balance)}</td>
      </tr>`;
    }
    tbody.innerHTML = html;
  }
}

function calculateSIP() {
  const monthly = getVal("sip-monthly");
  const lumpsum = getVal("sip-lumpsum");
  const r = getVal("sip-rate") / 12 / 100;
  const years = getVal("sip-years");
  const n = Math.round(years * 12);

  const sipInvested = monthly * n;
  const sipFutureValue = monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  const lumpsumFutureValue = lumpsum * Math.pow(1 + r, n);
  const totalFutureValue = sipFutureValue + lumpsumFutureValue;
  const totalInvested = sipInvested + lumpsum;
  const totalReturns = totalFutureValue - totalInvested;

  document.getElementById("sip-result-invested")!.textContent = fmt(sipInvested);
  document.getElementById("sip-result-lumpsum")!.textContent = fmt(lumpsum);
  document.getElementById("sip-result-lumpsum-growth")!.textContent = fmt(lumpsumFutureValue);
  document.getElementById("sip-result-sip-growth")!.textContent = fmt(sipFutureValue);
  document.getElementById("sip-result-total")!.textContent = fmt(totalFutureValue);
  document.getElementById("sip-result-returns")!.textContent = fmt(totalReturns);

  setParams({
    calc: "sip", monthly: formatUrlParam(monthly), lumpsum: formatUrlParam(lumpsum),
    rate: formatUrlParam(getVal("sip-rate")), years: formatUrlParam(years),
  });

  const labels: string[] = [];
  const sipData: number[] = [];
  const lsData: number[] = [];
  const totalData: number[] = [];
  let corpus = 0;
  for (let i = 1; i <= n; i++) {
    corpus = (corpus + monthly) * (1 + r);
    if (i % 12 === 0 || i === n) {
      const y = i / 12;
      labels.push(`Yr ${y}`);
      const sipV = Math.round(corpus);
      const lsV = Math.round(lumpsum * Math.pow(1 + getVal("sip-rate") / 12 / 100, i));
      sipData.push(sipV);
      lsData.push(lsV);
      totalData.push(sipV + lsV);
    }
  }

  const cols = getThemeColors();
  const canvas = document.getElementById("sip-line-chart") as HTMLCanvasElement;
  if (canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    chartInstances["sip-line"] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "SIP Corpus", data: sipData, borderColor: cols.green, borderWidth: 2, pointRadius: 3, fill: true, backgroundColor: cols.green + "20", tension: 0.3 },
          ...(lumpsum > 0 ? [{ label: "Lumpsum Growth", data: lsData, borderColor: cols.gold, borderWidth: 2, pointRadius: 3, fill: false, tension: 0.3 }] : []),
          { label: "Total", data: totalData, borderColor: cols.blue, borderWidth: 2, pointRadius: 0, fill: false, borderDash: [5, 5] },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, padding: 8, font: { size: 11 } } } },
        scales: axisOptions({ tickColor: cols.tick, gridColor: cols.grid }),
      },
    });
  }

  renderDoughnut("sip-donut-chart",
    lumpsum > 0 ? ["SIP Invested", "Lumpsum", "Returns"] : ["Invested", "Returns"],
    lumpsum > 0 ? [sipInvested, lumpsum, totalReturns] : [sipInvested, totalReturns],
    lumpsum > 0 ? [cols.green, cols.gold, cols.blue] : [cols.green, cols.blue],
  );
}

function calculateXIRR() {
  const investment = getVal("xirr-investment");
  const years = getVal("xirr-years");
  const finalValue = getVal("xirr-finalValue");

  const n = Math.round(years);

  const cashFlows: number[] = [];
  for (let i = 0; i < n; i++) {
    cashFlows.push(-investment);
  }
  cashFlows.push(finalValue);

  const xirr = computeXIRR(cashFlows);
  const totalInvested = investment * n;
  const totalReturns = finalValue - totalInvested;
  const absReturn = totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;

  document.getElementById("xirr-result-rate")!.textContent = xirr !== null ? fmtPct(xirr) : "—";
  document.getElementById("xirr-result-invested")!.textContent = fmt(totalInvested);
  document.getElementById("xirr-result-returns")!.textContent = fmt(totalReturns);
  document.getElementById("xirr-result-final")!.textContent = fmt(finalValue);
  document.getElementById("xirr-result-abs")!.textContent = fmtPct(absReturn);

  setParams({
    calc: "xirr", investment: formatUrlParam(investment),
    years: formatUrlParam(years), finalValue: formatUrlParam(finalValue),
  });

  const cols = getThemeColors();
  renderDoughnut("xirr-donut-chart", ["Invested", "Returns"], [totalInvested, Math.max(0, totalReturns)], [cols.blue, cols.gold]);
}

function computeXIRR(cashFlows: number[], guess = 0.1): number | null {
  const maxIter = 1000;
  const tolerance = 1e-7;
  let rate = guess;

  for (let iter = 0; iter < maxIter; iter++) {
    let fx = 0;
    let fpx = 0;
    for (let i = 0; i < cashFlows.length; i++) {
      const t = i;
      const denom = Math.pow(1 + rate, t);
      if (denom === 0 || !isFinite(denom)) continue;
      fx += cashFlows[i] / denom;
      fpx -= t * cashFlows[i] / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(fx) < tolerance) return rate * 100;
    if (fpx === 0) return null;
    const nextRate = rate - fx / fpx;
    if (!isFinite(nextRate)) return null;
    rate = Math.max(-0.99, Math.min(10, nextRate));
  }
  return null;
}

function calculateSWP() {
  const investment = getVal("swp-investment");
  const r = getVal("swp-rate") / 12 / 100;
  const years = getVal("swp-years");
  const n = Math.round(years * 12);
  const monthlyNeeded = getVal("swp-monthlyNeeded");

  let mode = "withdrawal";
  let monthlyWithdrawal = 0;
  let totalWithdrawn = 0;
  let remaining = investment;

  if (monthlyNeeded > 0) {
    mode = "needed";
    let bal = investment;
    for (let i = 0; i < n; i++) {
      bal = bal * (1 + r) - monthlyNeeded;
      if (bal <= 0) break;
    }
    remaining = Math.max(0, bal);
    totalWithdrawn = monthlyNeeded * n;
  } else {
    if (r > 0) {
      monthlyWithdrawal = investment * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    } else {
      monthlyWithdrawal = investment / n;
    }
    totalWithdrawn = monthlyWithdrawal * n;
    remaining = 0;
  }

  document.getElementById("swp-result-monthly")!.textContent = mode === "needed" ? fmt(monthlyNeeded) : fmt(monthlyWithdrawal);
  document.getElementById("swp-result-total")!.textContent = fmt(totalWithdrawn);
  document.getElementById("swp-result-remaining")!.textContent = fmt(remaining);

  setParams({
    calc: "swp", investment: formatUrlParam(investment), rate: formatUrlParam(getVal("swp-rate")),
    years: formatUrlParam(years), monthlyNeeded: formatUrlParam(monthlyNeeded),
  });

  const labels: string[] = [];
  const data: number[] = [];
  let bal = investment;
  const withdrawAmt = monthlyNeeded > 0 ? monthlyNeeded : monthlyWithdrawal;
  for (let i = 1; i <= n; i++) {
    bal = bal * (1 + r) - withdrawAmt;
    if (i % 12 === 0 || i === n) {
      labels.push(`Yr ${i / 12}`);
      data.push(Math.round(Math.max(0, bal)));
    }
  }

  renderLineChart("swp-line-chart", labels, data, "Corpus", getThemeColors().blue, "rgba(11,95,255,0.08)");
  renderDoughnut("swp-donut-chart", ["Investment", "Withdrawn"], [investment, totalWithdrawn], [getThemeColors().blue, getThemeColors().gold]);
}

function calculatePPF() {
  const annual = getVal("ppf-annual");
  const rate = getVal("ppf-rate") / 100;
  const years = PPF_MAX_YEARS;

  let totalInvested = 0;
  let maturity = 0;
  const labels: string[] = [];
  const corpusData: number[] = [];
  const investedData: number[] = [];

  for (let y = 1; y <= years; y++) {
    maturity = (maturity + annual) * (1 + rate);
    totalInvested += annual;
    if (y % 5 === 0 || y === years) {
      labels.push(`Yr ${y}`);
      corpusData.push(Math.round(maturity));
      investedData.push(totalInvested);
    }
  }

  const totalInterest = maturity - totalInvested;

  document.getElementById("ppf-result-maturity")!.textContent = fmt(maturity);
  document.getElementById("ppf-result-invested")!.textContent = fmt(totalInvested);
  document.getElementById("ppf-result-interest")!.textContent = fmt(totalInterest);

  setParams({ calc: "ppf", annual: formatUrlParam(annual), rate: formatUrlParam(getVal("ppf-rate")) });

  renderLineChart("ppf-line-chart", labels, corpusData, "Corpus", getThemeColors().green, "rgba(16,185,129,0.08)");
  renderDoughnut("ppf-donut-chart", ["Invested", "Interest"], [totalInvested, totalInterest], [getThemeColors().blue, getThemeColors().gold]);
}

function calculateFD() {
  const P = getVal("fd-amount");
  const r = getVal("fd-rate") / 100;
  const years = getVal("fd-years");

  let maturity = 0;
  let totalInterest = 0;

  if (r > 0) {
    maturity = P * Math.pow(1 + r, years);
    totalInterest = maturity - P;
  } else {
    maturity = P;
  }

  document.getElementById("fd-result-maturity")!.textContent = fmt(maturity);
  document.getElementById("fd-result-interest")!.textContent = fmt(totalInterest);

  setParams({ calc: "fd", amount: formatUrlParam(P), rate: formatUrlParam(getVal("fd-rate")), years: formatUrlParam(years) });

  const labels: string[] = [];
  const data: number[] = [];
  for (let y = 0; y <= years; y++) {
    labels.push(`Yr ${y}`);
    data.push(Math.round(P * Math.pow(1 + r, y)));
  }

  renderLineChart("fd-line-chart", labels, data, "Maturity Value", getThemeColors().gold, "rgba(201,169,97,0.08)");
  renderDoughnut("fd-donut-chart", ["Principal", "Interest"], [P, totalInterest], [getThemeColors().blue, getThemeColors().gold]);
}

function calculateRetirement() {
  const age = getVal("retirement-age");
  const retireAge = getVal("retirement-retireAge");
  const currentCorpus = getVal("retirement-currentCorpus");
  const monthlySip = getVal("retirement-monthlySip");
  const expectedReturn = getVal("retirement-expectedReturn") / 100;
  const inflation = getVal("retirement-inflation") / 100;
  const lifeExpectancy = getVal("retirement-lifeExpectancy");
  const yearsToRetire = retireAge - age;
  const yearsInRetirement = lifeExpectancy - retireAge;

  const rMo = expectedReturn / 12;

  let corpusAtRetire = currentCorpus * Math.pow(1 + expectedReturn, yearsToRetire);
  const sipMonths = yearsToRetire * 12;
  if (monthlySip > 0 && rMo > 0) {
    corpusAtRetire += monthlySip * ((Math.pow(1 + rMo, sipMonths) - 1) / rMo) * (1 + rMo);
  }

  const withdrawalMonths = yearsInRetirement * 12;
  let monthlyWithdrawal = 0;
  if (withdrawalMonths > 0 && rMo > 0) {
    const rAdj = (1 + expectedReturn) / (1 + inflation) - 1;
    const rAdjMo = rAdj / 12;
    if (rAdjMo > 0) {
      monthlyWithdrawal = corpusAtRetire * rAdjMo * Math.pow(1 + rAdjMo, withdrawalMonths) / (Math.pow(1 + rAdjMo, withdrawalMonths) - 1);
    } else {
      monthlyWithdrawal = corpusAtRetire / withdrawalMonths;
    }
  }
  const annualWithdrawal = monthlyWithdrawal * 12;
  const currentValueMonthly = monthlyWithdrawal / Math.pow(1 + inflation, yearsToRetire);

  document.getElementById("retirement-result-corpus")!.textContent = fmt(corpusAtRetire);
  document.getElementById("retirement-result-monthly")!.textContent = fmt(monthlyWithdrawal);
  document.getElementById("retirement-result-annual")!.textContent = fmt(annualWithdrawal);
  document.getElementById("retirement-result-current")!.textContent = fmt(currentValueMonthly);

  setParams({
    calc: "retirement", age: formatUrlParam(age), retireAge: formatUrlParam(retireAge),
    currentCorpus: formatUrlParam(currentCorpus), monthlySip: formatUrlParam(monthlySip),
    expectedReturn: formatUrlParam(getVal("retirement-expectedReturn")),
    inflation: formatUrlParam(getVal("retirement-inflation")),
    lifeExpectancy: formatUrlParam(lifeExpectancy),
  });

  const labels: string[] = [];
  const data: number[] = [];
  const totalYears = yearsToRetire + yearsInRetirement;
  for (let y = 0; y <= totalYears; y++) {
    labels.push(y === 0 ? "Now" : `Yr ${y}`);
    const isBeforeRetire = y <= yearsToRetire;
    let val: number;
    if (isBeforeRetire) {
      val = currentCorpus * Math.pow(1 + expectedReturn, y);
      if (monthlySip > 0 && rMo > 0) {
        const m = y * 12;
        val += monthlySip * ((Math.pow(1 + rMo, m) - 1) / rMo) * (1 + rMo);
      }
    } else {
      const yearsAfter = y - yearsToRetire;
      val = corpusAtRetire * Math.pow(1 + expectedReturn - inflation, yearsAfter) - monthlyWithdrawal * 12 * yearsAfter;
      val = Math.max(0, val);
    }
    data.push(Math.round(val));
  }

  renderLineChart("retirement-line-chart", labels, data, "Corpus", getThemeColors().green, "rgba(16,185,129,0.08)");
}

function calculateTax() {
  const income = getVal("tax-annualIncome");
  const regime = getVal("tax-regime");
  const hra = getVal("tax-hra");
  const lta = getVal("tax-lta");
  const sec80c = Math.min(getVal("tax-sec80c"), 150000);
  const sec80d = Math.min(getVal("tax-sec80d"), 25000);
  const nps = Math.min(getVal("tax-nps"), 50000);
  const homeLoanInterest = Math.min(getVal("tax-homeLoanInterest"), 200000);

  const isNewRegime = regime >= 80;

  let taxableIncome: number;
  let tax: number;
  let slaps: { label: string; amount: number; tax: number }[] = [];

  if (isNewRegime) {
    taxableIncome = Math.max(0, income - STANDARD_DEDUCTION_NEW);
    let remaining = taxableIncome;
    tax = 0;
    for (const s of TAX_SLABS_NEW) {
      const slabAmt = Math.min(Math.max(0, remaining), s.max - s.min);
      if (slabAmt <= 0) continue;
      const slabTax = slabAmt * s.rate / 100;
      const label = s.max === Infinity ? `Above ₹${(s.min / 100000).toFixed(0)}L` : `₹${(s.min / 100000).toFixed(0)}L–${(s.max / 100000).toFixed(0)}L`;
      slaps.push({ label, amount: slabAmt, tax: slabTax });
      tax += slabTax;
      remaining -= slabAmt;
    }
  } else {
    const deductions = sec80c + sec80d + nps + homeLoanInterest;
    const hraExempt = Math.min(hra, income * 0.5);
    const ltaExempt = Math.min(lta, 100000);
    taxableIncome = Math.max(0, income - STANDARD_DEDUCTION_OLD - deductions - hraExempt - ltaExempt);
    let remaining = taxableIncome;
    tax = 0;
    for (const s of TAX_SLABS_OLD) {
      const slabAmt = Math.min(Math.max(0, remaining), s.max - s.min);
      if (slabAmt <= 0) continue;
      const slabTax = slabAmt * s.rate / 100;
      const label = s.max === Infinity ? `Above ₹${(s.min / 100000).toFixed(0)}L` : `₹${(s.min / 100000).toFixed(0)}L–${(s.max / 100000).toFixed(0)}L`;
      slaps.push({ label, amount: slabAmt, tax: slabTax });
      tax += slabTax;
      remaining -= slabAmt;
    }
  }

  const cess = tax * 0.04;
  const totalTax = tax + cess;
  const effectiveRate = income > 0 ? (totalTax / income) * 100 : 0;

  document.getElementById("tax-result-taxable")!.textContent = fmt(taxableIncome);
  document.getElementById("tax-result-tax")!.textContent = fmt(tax);
  document.getElementById("tax-result-cess")!.textContent = fmt(cess);
  document.getElementById("tax-result-total")!.textContent = fmt(totalTax);
  document.getElementById("tax-result-effective")!.textContent = `${effectiveRate.toFixed(2)}%`;

  setParams({
    calc: "tax", annualIncome: formatUrlParam(income), regime: formatUrlParam(regime),
    hra: formatUrlParam(hra), lta: formatUrlParam(lta),
    sec80c: formatUrlParam(getVal("tax-sec80c")), sec80d: formatUrlParam(getVal("tax-sec80d")),
    nps: formatUrlParam(getVal("tax-nps")), homeLoanInterest: formatUrlParam(getVal("tax-homeLoanInterest")),
  });

  renderDoughnut("tax-donut-chart", slaps.map(s => s.label), slaps.map(s => Math.round(s.tax)), [
    getThemeColors().blue, getThemeColors().green, getThemeColors().gold, "#7928ca", "#f5a623", "#ef4444", "#50e3c2",
  ]);
}

function resetCalc(calcId: CalcId) {
  const defaults = DEFAULT_VALUES[calcId];
  Object.entries(defaults).forEach(([k, v]) => setVal(`${calcId}-${k}`, v));
  destroyCharts();
  calculate(calcId);
}

function copyValues(calcId: CalcId) {
  const panel = document.querySelector(`[data-calc-panel="${calcId}"]`);
  if (!panel) return;
  const resultItems = panel.querySelectorAll("[data-result]");
  const lines: string[] = [];
  resultItems.forEach((el) => {
    const label = (el as HTMLElement).dataset.result || "";
    const value = el.textContent || "";
    lines.push(`${label}: ${value}`);
  });
  if (lines.length === 0) return;
  navigator.clipboard.writeText(lines.join("\n")).then(() => showToast("Values copied!"));
}

function shareLink() {
  navigator.clipboard.writeText(window.location.href).then(() => showToast("Link copied!"));
}

function savePDF() {
  window.print();
}

function addLumpsumRow(container: HTMLElement, month = "", amount = "") {
  const row = document.createElement("div");
  row.dataset.emiLumpsumRow = "";
  row.className = "flex gap-xs items-end mt-xs";
  row.innerHTML = `
    <div style="flex:1;">
      <label class="label" style="font-size:11px;">Month</label>
      <input class="input" type="text" inputmode="numeric" data-calc-input data-emi-lumpsum-month value="${month}" min="1" placeholder="mo" style="height:32px;font-size:13px;" />
    </div>
    <div style="flex:2;">
      <label class="label" style="font-size:11px;">Amount</label>
      <input class="input" type="text" inputmode="numeric" data-calc-input data-emi-lumpsum-amount value="${amount}" min="0" step="10000" placeholder="Amount" style="height:32px;font-size:13px;" />
    </div>
    <button type="button" class="btn-ghost" data-emi-remove-lumpsum style="height:32px;padding:0 8px;font-size:14px;flex-shrink:0;line-height:1;">&times;</button>
  `;
  container.appendChild(row);
  row.querySelectorAll("[data-calc-input]").forEach((input) => {
    input.addEventListener("input", () => { destroyCharts(); calculate(currentCalc); });
    input.addEventListener("focus", () => stripCommas(input as HTMLInputElement));
    input.addEventListener("blur", () => {
      const el = input as HTMLInputElement;
      const raw = el.value.replace(/,/g, "");
      if (raw) setVal(el.id, parseFloat(raw));
    });
  });
  row.querySelector("[data-emi-remove-lumpsum]")?.addEventListener("click", () => {
    row.remove();
    destroyCharts();
    calculate(currentCalc);
  });
}

function initCalculator() {
  const params = getParams();
  const calcParam = (params.calc || "emi") as CalcId;
  if (!CALC_TABS.find((t) => t.id === calcParam)) currentCalc = "emi";
  else currentCalc = calcParam;

  switchTab(currentCalc);

  document.querySelectorAll("[data-calc-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = (tab as HTMLElement).dataset.calcTab as CalcId;
      if (id && id !== currentCalc) switchTab(id);
    });
    tab.addEventListener("keydown", (e) => {
      const t = e.currentTarget as HTMLElement;
      const siblings = Array.from(document.querySelectorAll("[data-calc-tab]"));
      const idx = siblings.indexOf(t);
      let nextIdx = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") nextIdx = (idx + 1) % siblings.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") nextIdx = (idx - 1 + siblings.length) % siblings.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = siblings.length - 1;
      if (nextIdx !== idx) {
        e.preventDefault();
        (siblings[nextIdx] as HTMLElement).focus();
        (siblings[nextIdx] as HTMLElement).click();
      }
    });
  });

  document.querySelectorAll("[data-calc-input]").forEach((input) => {
    input.addEventListener("input", () => {
      destroyCharts();
      calculate(currentCalc);
    });
    input.addEventListener("focus", () => stripCommas(input as HTMLInputElement));
    input.addEventListener("blur", () => {
      const el = input as HTMLInputElement;
      const raw = el.value.replace(/,/g, "");
      if (raw) setVal(el.id, parseFloat(raw));
    });
  });

  document.querySelectorAll("[data-calc-reset]").forEach((btn) => {
    btn.addEventListener("click", () => resetCalc(currentCalc));
  });

  document.querySelectorAll("[data-calc-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyValues(currentCalc));
  });

  document.querySelectorAll("[data-calc-share]").forEach((btn) => {
    btn.addEventListener("click", shareLink);
  });

  document.querySelectorAll("[data-calc-pdf]").forEach((btn) => {
    btn.addEventListener("click", savePDF);
  });

  window.addEventListener("popstate", () => {
    const p = getParams();
    const id = (p.calc || "emi") as CalcId;
    if (id !== currentCalc) switchTab(id);
  });

  const lumpsumContainer = document.getElementById("emi-lumpsum-rows");
  if (lumpsumContainer) {
    const params = getParams();
    const lumpsumStr = params.lumpsums || "";
    if (lumpsumStr) {
      lumpsumStr.split(",").forEach((pair) => {
        const [m, a] = pair.split(":");
        if (m && a) addLumpsumRow(lumpsumContainer, m, a);
      });
    }
    document.querySelectorAll("[data-emi-add-lumpsum]").forEach((btn) => {
      btn.addEventListener("click", () => { addLumpsumRow(lumpsumContainer); });
    });
  }

  darkModeWatcher();
}

document.addEventListener("DOMContentLoaded", initCalculator);
