import { loadData, updateData, addAudit, uid, nowISO, subscribe } from "../lib/store";
import { timeToGoalCompletion, type Goal, type GoalType } from "../lib/types";
import { formatCurrency, getCurrencySymbol, type CurrencyCode } from "../lib/currency";
import { getDateRange, isInRange } from "./date-range-filter";

function getCurrency(): CurrencyCode {
  return (document.documentElement.dataset.currency ?? "INR") as CurrencyCode;
}
function fmt(n: number, compact = false): string {
  return formatCurrency(n, getCurrency(), { compact, decimals: compact ? 1 : 0 });
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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

let filterType = "all";
let searchTerm = "";

const modal = document.getElementById("goal-modal") as HTMLDialogElement | null;
const form = document.getElementById("goal-form") as HTMLFormElement | null;
const titleEl = document.getElementById("goal-modal-title");

document.getElementById("add-goal")?.addEventListener("click", () => openModal());
document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => modal?.close()));

function openModal(goal?: Goal) {
  if (!modal || !form) return;
  if (titleEl) titleEl.textContent = goal ? "Edit Goal" : "Add Goal";
  form.reset();
  if (goal) {
    (document.getElementById("goal-id") as HTMLInputElement).value = goal.id;
    (document.getElementById("goal-name") as HTMLInputElement).value = goal.name;
    (document.getElementById("goal-type") as HTMLSelectElement).value = goal.type;
    (document.getElementById("goal-custom") as HTMLInputElement).value = goal.customLabel ?? "";
    (document.getElementById("goal-target") as HTMLInputElement).value = String(goal.target);
    (document.getElementById("goal-current") as HTMLInputElement).value = String(goal.current);
    (document.getElementById("goal-deadline") as HTMLInputElement).value = goal.deadline ?? "";
    (document.getElementById("goal-notes") as HTMLInputElement).value = goal.notes ?? "";
  } else {
    (document.getElementById("goal-id") as HTMLInputElement).value = "";
  }
  modal.showModal();
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form) return;
  const fd = new FormData(form);
  const id = String(fd.get("id") ?? "");
  const ts = nowISO();
  const payload: Goal = {
    id: id || uid(),
    name: String(fd.get("name") ?? "").trim() || String(fd.get("customLabel") ?? "Goal"),
    type: (fd.get("type") as GoalType) ?? "Other",
    customLabel: String(fd.get("customLabel") ?? "") || undefined,
    target: Number(fd.get("target") ?? 0),
    current: Number(fd.get("current") ?? 0),
    deadline: (String(fd.get("deadline") ?? "") || undefined) as string | undefined,
    notes: String(fd.get("notes") ?? ""),
    createdAt: id ? loadData().goals.find((g) => g.id === id)?.createdAt ?? ts : ts,
    updatedAt: ts,
  };
  if (payload.target <= 0) {
    alert("Please provide a positive target amount.");
    return;
  }
  updateData((data) => {
    if (id) {
      const idx = data.goals.findIndex((g) => g.id === id);
      if (idx >= 0) data.goals[idx] = payload;
    } else {
      data.goals.push(payload);
    }
  });
  addAudit({
    action: id ? "update" : "create",
    entity: "goal",
    entityId: payload.id,
    description: id ? `Updated goal: ${payload.name}` : `Added goal: ${payload.name}`,
  });
  modal?.close();
});

document.querySelector<HTMLSelectElement>("[data-filter='type']")?.addEventListener("change", (e) => {
  filterType = (e.target as HTMLSelectElement).value;
  renderAll();
});
document.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (e) => {
  searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
  renderAll();
});

function filteredGoals() {
  const data = loadData();
  let rows = data.goals;
  if (filterType !== "all") rows = rows.filter((r) => r.type === filterType);
  const range = getDateRange();
  if (range.active) {
    // Show goals whose deadline falls in the active range, or any goal with
    // no deadline (we keep it visible so users can still see active work).
    rows = rows.filter((r) => !r.deadline || isInRange(r.deadline, range));
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(term) || r.notes?.toLowerCase().includes(term));
  }
  return rows;
}

function formatRangeLabel(range: ReturnType<typeof getDateRange>): string {
  if (!range.active) return "";
  if (range.preset === "thisMonth") return " due this month";
  if (range.preset === "last30") return " due in the last 30 days";
  if (range.preset === "last3Months") return " due in the last 3 months";
  if (range.preset === "last12Months") return " due in the last 12 months";
  if (range.preset === "ytd") return " due year to date";
  if (range.preset === "custom" && range.from && range.to) {
    const fmtShort = (s: string) => new Date(s).toLocaleString("en", { month: "short", day: "numeric", year: "numeric" });
    return ` due between ${fmtShort(range.from)} – ${fmtShort(range.to)}`;
  }
  return "";
}

function renderTable() {
  const data = loadData();
  const rows = filteredGoals();
  const tbody = document.getElementById("goals-tbody");
  if (!tbody) return;
  const periodLabel = formatRangeLabel(getDateRange());
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5xl text-body text-body">${loadData().goals.length === 0 ? "No goals yet. Click <strong>+ Add</strong> to get started." : `No goals match your filters${periodLabel}.`}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((g) => {
      const pct = g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0;
      const onTrack = pct >= 100;
      const { months } = timeToGoalCompletion(g, data.investments);
      const remaining = Math.max(0, g.target - g.current);
      const linked = data.investments.filter((i) => i.goalId === g.id);
      let etaLabel: string;
      let etaCls: string;
      if (months == null) {
        etaLabel = linked.length === 0
          ? "No linked investments"
          : remaining > 0
            ? "Project later"
            : "Reached";
        etaCls = "text-mute";
      } else {
        etaLabel = formatMonthsHuman(months);
        etaCls = months === 0 ? "text-gain" : "text-gold";
      }
      return `
        <tr class="border-t border-hairline hover:bg-canvas-soft">
          <td class="py-sm px-md">
            <div class="text-body-sm-strong text-ink">${esc(g.name)}</div>
            ${g.customLabel ? `<div class="text-caption text-mute">${esc(g.customLabel)}</div>` : ""}
          </td>
          <td class="py-sm px-md hide-tablet"><span class="badge">${g.type}</span></td>
          <td class="py-sm px-md text-right text-body-sm-strong">${fmt(g.target)}</td>
          <td class="py-sm px-md text-body hide-mobile">${g.deadline ?? "—"}</td>
          <td class="py-sm px-md text-right">${fmt(g.current)}</td>
          <td class="py-sm px-md max-sm:px-1">
            <div class="flex items-center gap-xs">
              <div class="flex-1 h-1.5 bg-canvas-soft-2 rounded-full overflow-hidden">
                <div class="h-full ${onTrack ? "bg-gain" : "bg-gradient-gain"}" style="width: ${pct.toFixed(1)}%"></div>
              </div>
              <span class="text-caption text-body whitespace-nowrap">${pct.toFixed(0)}%</span>
            </div>
          </td>
          <td class="py-sm px-md hide-mobile">
            <div class="text-body-sm-strong ${etaCls}">${etaLabel}</div>
            ${linked.length > 0 ? `<div class="text-caption text-mute">${linked.length} linked</div>` : ""}
          </td>
          <td class="py-sm px-md text-right">
            <button class="btn-ghost" data-edit="${g.id}" type="button">Edit</button>
            <button class="btn-ghost text-loss" data-delete="${g.id}" type="button">Delete</button>
          </td>
        </tr>`;
    })
    .join("");

  tbody.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.edit!;
      const g = loadData().goals.find((g) => g.id === id);
      if (g) openModal(g);
    });
  });
  tbody.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delete!;
      const g = loadData().goals.find((g) => g.id === id);
      if (!g) return;
      if (!confirm(`Delete "${g.name}"?`)) return;
      updateData((data) => {
        data.goals = data.goals.filter((g) => g.id !== id);
      });
      addAudit({ action: "delete", entity: "goal", entityId: id, description: `Deleted goal: ${g.name}` });
    });
  });
}

function renderStats() {
  const data = loadData();
  const rows = filteredGoals();
  const ontrack = rows.filter((g) => g.target > 0 && g.current >= g.target).length;
  const target = rows.reduce((s, g) => s + g.target, 0);
  const saved = rows.reduce((s, g) => s + g.current, 0);
  const setText = (sel: string, text: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.textContent = text;
  };
  setText("[data-stat='total']", String(rows.length));
  setText("[data-stat='ontrack']", String(ontrack));
  setText("[data-stat='target']", fmt(target, true));
  setText("[data-stat='saved']", fmt(saved, true));
}

function renderProjections() {
  const sym = getCurrencySymbol(getCurrency());
  const symEl = document.querySelector("[data-currency-sym]");
  if (symEl) symEl.textContent = sym;
  const age = Number((document.getElementById("proj-age") as HTMLInputElement).value || 30);
  const retire = Number((document.getElementById("proj-retire") as HTMLInputElement).value || 60);
  const sip = Number((document.getElementById("proj-sip") as HTMLInputElement).value || 0);
  const inflation = Number((document.getElementById("proj-inflation") as HTMLInputElement).value || 6);
  const years = Math.max(0, retire - age);
  const months = years * 12;
  const calcFV = (annualRate: number) => {
    const r = annualRate / 100 / 12;
    if (r === 0) return sip * months;
    return sip * ((Math.pow(1 + r, months) - 1) / r) * (1 + r);
  };
  // Adjust target for inflation over years
  const realMultiplier = Math.pow(1 + inflation / 100, years);
  const low = calcFV(8) / realMultiplier;
  const mid = calcFV(12) / realMultiplier;
  const high = calcFV(15) / realMultiplier;
  const setText = (sel: string, text: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.textContent = text;
  };
  setText("[data-proj='low']", fmt(low, true));
  setText("[data-proj='mid']", fmt(mid, true));
  setText("[data-proj='high']", fmt(high, true));
}

document.getElementById("projection-form")?.addEventListener("input", renderProjections);

function renderAll() {
  renderTable();
  renderStats();
  renderProjections();
}

subscribe(renderAll);
window.addEventListener("gwp:daterange", renderAll);
renderAll();
