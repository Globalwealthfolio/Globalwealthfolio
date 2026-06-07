import { loadData, updateData, addAudit, uid, nowISO, subscribe } from "../lib/store";
import {
  totalCurrent,
  totalGain,
  totalInvested,
  gainPercent,
  timeToGoalCompletion,
  type Investment,
  type AssetType,
  type Goal,
} from "../lib/types";
import { formatCurrency, type CurrencyCode } from "../lib/currency";

function getCurrency(): CurrencyCode {
  return (document.documentElement.dataset.currency ?? "INR") as CurrencyCode;
}
function fmt(n: number, compact = false): string {
  return formatCurrency(n, getCurrency(), { compact, decimals: compact ? 1 : 0 });
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function riskLevelLabel(score: number): string {
  if (score <= 3) return "Low";
  if (score <= 6) return "Medium";
  return "High";
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

const modal = document.getElementById("investment-modal") as HTMLDialogElement | null;
const form = document.getElementById("investment-form") as HTMLFormElement | null;
const title = document.getElementById("inv-modal-title");
const riskInput = document.getElementById("inv-risk") as HTMLInputElement | null;
const riskLabel = document.getElementById("inv-risk-val");

riskInput?.addEventListener("input", () => {
  if (riskLabel && riskInput) riskLabel.textContent = riskInput.value;
});

document.getElementById("add-investment")?.addEventListener("click", () => openModal());
document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => modal?.close()));

function openModal(inv?: Investment) {
  if (!modal || !form) return;
  if (title) title.textContent = inv ? "Edit Investment" : "Add Investment";
  form.reset();
  populateGoalSelect();
  (document.getElementById("inv-date") as HTMLInputElement).value = new Date().toISOString().split("T")[0];
  if (inv) {
    (document.getElementById("inv-id") as HTMLInputElement).value = inv.id;
    (document.getElementById("inv-name") as HTMLInputElement).value = inv.name;
    (document.getElementById("inv-type") as HTMLSelectElement).value = inv.type;
    (document.getElementById("inv-date") as HTMLInputElement).value = inv.date;
    (document.getElementById("inv-amount") as HTMLInputElement).value = String(inv.amount);
    (document.getElementById("inv-current") as HTMLInputElement).value = String(inv.currentValue);
    (document.getElementById("inv-goal") as HTMLSelectElement).value = inv.goalId ?? "";
    (document.getElementById("inv-risk") as HTMLInputElement).value = String(inv.risk);
    (document.getElementById("inv-notes") as HTMLInputElement).value = inv.notes ?? "";
    if (riskLabel) riskLabel.textContent = String(inv.risk);
  } else {
    (document.getElementById("inv-id") as HTMLInputElement).value = "";
    (document.getElementById("inv-risk") as HTMLInputElement).value = "5";
    if (riskLabel) riskLabel.textContent = "5";
  }
  modal.showModal();
}

function populateGoalSelect() {
  const sel = document.getElementById("inv-goal") as HTMLSelectElement | null;
  if (!sel) return;
  const goals = loadData().goals;
  sel.innerHTML = `<option value="">— None —</option>` + goals.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("");
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form) return;
  const fd = new FormData(form);
  const id = String(fd.get("id") ?? "");
  const ts = nowISO();
  const payload: Investment = {
    id: id || uid(),
    name: String(fd.get("name") ?? "").trim(),
    type: (fd.get("type") as AssetType) ?? "Equity",
    amount: Number(fd.get("amount") ?? 0),
    currentValue: Number(fd.get("currentValue") ?? fd.get("amount") ?? 0),
    date: String(fd.get("date") ?? ts.split("T")[0]),
    goalId: (String(fd.get("goalId") ?? "") || undefined) as string | undefined,
    risk: Number(fd.get("risk") ?? 5),
    notes: String(fd.get("notes") ?? ""),
    createdAt: id ? loadData().investments.find((i) => i.id === id)?.createdAt ?? ts : ts,
    updatedAt: ts,
  };
  if (!payload.name || payload.amount <= 0) {
    alert("Please provide a name and a positive amount.");
    return;
  }
  updateData((data) => {
    if (id) {
      const idx = data.investments.findIndex((i) => i.id === id);
      if (idx >= 0) data.investments[idx] = payload;
    } else {
      data.investments.push(payload);
    }
  });
  addAudit({
    action: id ? "update" : "create",
    entity: "investment",
    entityId: payload.id,
    description: id ? `Updated investment: ${payload.name}` : `Added investment: ${payload.name}`,
  });
  modal?.close();
});

let filterType = "all";
let filterGoal = "all";
let filterRisk = "all";
let searchTerm = "";

document.querySelector<HTMLSelectElement>("[data-filter='type']")?.addEventListener("change", (e) => {
  filterType = (e.target as HTMLSelectElement).value;
  renderTable();
});
document.querySelector<HTMLSelectElement>("[data-filter='goal']")?.addEventListener("change", (e) => {
  filterGoal = (e.target as HTMLSelectElement).value;
  renderTable();
});
document.querySelector<HTMLSelectElement>("[data-filter='risk']")?.addEventListener("change", (e) => {
  filterRisk = (e.target as HTMLSelectElement).value;
  renderTable();
});
document.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (e) => {
  searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
  renderTable();
});

function renderTable() {
  const data = loadData();
  const tbody = document.getElementById("investments-tbody");
  if (!tbody) return;
  const goalMap = new Map(data.goals.map((g) => [g.id, g.name] as const));
  let rows = data.investments;
  if (filterType !== "all") rows = rows.filter((r) => r.type === filterType);
  if (filterGoal !== "all") rows = rows.filter((r) => r.goalId === filterGoal);
  if (filterRisk !== "all") {
    rows = rows.filter((r) => {
      if (filterRisk === "low") return r.risk <= 3;
      if (filterRisk === "medium") return r.risk >= 4 && r.risk <= 6;
      return r.risk >= 7;
    });
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(term) || r.notes?.toLowerCase().includes(term));
  }

  // Refresh goal filter options dynamically
  const goalFilter = document.querySelector<HTMLSelectElement>("[data-filter='goal']");
  if (goalFilter) {
    const current = filterGoal;
    goalFilter.innerHTML = `<option value="all">All Goals</option>` +
      data.goals.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join("");
    goalFilter.value = current;
  }

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-5xl">
          <div class="text-body-md text-body">${data.investments.length === 0 ? "No investments yet. Click <strong>+ Add</strong> to get started." : "No investments match your filters."}</div>
        </td>
      </tr>`;
    return;
  }

  // Pre-compute time-to-goal per linked goal so the table render is fast.
  const goalEtaCache = new Map<string, ReturnType<typeof timeToGoalCompletion>>();
  data.goals.forEach((g) => {
    goalEtaCache.set(g.id, timeToGoalCompletion(g, data.investments));
  });

  tbody.innerHTML = rows
    .map((i, idx) => {
      const gain = i.currentValue - i.amount;
      const pct = i.amount > 0 ? (gain / i.amount) * 100 : 0;
      const goalName = i.goalId ? goalMap.get(i.goalId) ?? "—" : "—";
      const eta = i.goalId ? goalEtaCache.get(i.goalId) : null;
      const per = eta?.perInvestment.find((p) => p.id === i.id);
      const months = per?.months ?? null;
      let etaCell: string;
      if (!i.goalId) {
        etaCell = `<span class="text-caption text-mute">Not linked</span>`;
      } else if (months == null) {
        etaCell = `<span class="text-caption text-mute">Need more history</span>`;
      } else {
        const cls = months <= 0 ? "text-gain" : "text-gold";
        etaCell = `<span class="text-body-sm-strong ${cls}">${formatMonthsHuman(months)}</span>`;
      }
      return `
        <tr class="border-t border-hairline hover:bg-canvas-soft">
          <td class="py-sm px-md text-mute">${idx + 1}</td>
          <td class="py-sm px-md">
            <div class="text-body-sm-strong text-ink">${esc(i.name)}</div>
          </td>
          <td class="py-sm px-md"><span class="badge">${i.type}</span></td>
          <td class="py-sm px-md text-body">${esc(goalName)}</td>
          <td class="py-sm px-md text-body">${i.date}</td>
          <td class="py-sm px-md text-right">${fmt(i.amount)}</td>
          <td class="py-sm px-md text-right">${fmt(i.currentValue)}</td>
          <td class="py-sm px-md text-right ${gain >= 0 ? "text-gain" : "text-loss"}">${gain >= 0 ? "+" : ""}${fmt(gain)} (${pct.toFixed(1)}%)</td>
          <td class="py-sm px-md">
            <span class="badge ${i.risk <= 3 ? "badge-gain" : i.risk >= 7 ? "badge-loss" : ""}">${riskLevelLabel(i.risk)} ${i.risk}</span>
          </td>
          <td class="py-sm px-md">${etaCell}</td>
          <td class="py-sm px-md text-body max-w-[12ch] truncate" title="${esc(i.notes ?? "")}">${esc(i.notes ?? "")}</td>
          <td class="py-sm px-md text-right">
            <button class="btn-ghost" data-edit="${i.id}" type="button" aria-label="Edit">Edit</button>
            <button class="btn-ghost text-loss" data-delete="${i.id}" type="button" aria-label="Delete">Delete</button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.edit!;
      const inv = loadData().investments.find((i) => i.id === id);
      if (inv) openModal(inv);
    });
  });
  tbody.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delete!;
      const inv = loadData().investments.find((i) => i.id === id);
      if (!inv) return;
      if (!confirm(`Delete "${inv.name}"?`)) return;
      updateData((data) => {
        data.investments = data.investments.filter((i) => i.id !== id);
      });
      addAudit({
        action: "delete",
        entity: "investment",
        entityId: id,
        description: `Deleted investment: ${inv.name}`,
      });
    });
  });
}

function renderStats() {
  const data = loadData();
  let rows = data.investments;
  if (filterType !== "all") rows = rows.filter((r) => r.type === filterType);
  if (filterGoal !== "all") rows = rows.filter((r) => r.goalId === filterGoal);
  if (filterRisk !== "all") {
    rows = rows.filter((r) => {
      if (filterRisk === "low") return r.risk <= 3;
      if (filterRisk === "medium") return r.risk >= 4 && r.risk <= 6;
      return r.risk >= 7;
    });
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(term) || r.notes?.toLowerCase().includes(term));
  }
  const invested = totalInvested(rows);
  const current = totalCurrent(rows);
  const gain = current - invested;
  const pct = invested > 0 ? (gain / invested) * 100 : 0;
  const setText = (sel: string, text: string, color?: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    el.textContent = text;
    el.classList.remove("text-gain", "text-loss");
    if (color) el.classList.add(color);
  };
  setText("[data-stat='invested']", fmt(invested, true));
  setText("[data-stat='current']", fmt(current, true));
  setText("[data-stat='gain']", `${gain >= 0 ? "+" : ""}${fmt(gain, true)}`, gain >= 0 ? "text-gain" : "text-loss");
  setText("[data-stat='return']", `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, gain >= 0 ? "text-gain" : "text-loss");
}

function renderAll() {
  populateGoalSelect();
  renderStats();
  renderTable();
}

subscribe(renderAll);
renderAll();
