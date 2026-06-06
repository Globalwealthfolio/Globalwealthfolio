import { loadData, updateData, addAudit, uid, nowISO, subscribe } from "../lib/store";
import { type EMI, type LoanType, totalEMI, totalOutstanding } from "../lib/types";
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

let filterType = "all";
let searchTerm = "";

const modal = document.getElementById("emi-modal") as HTMLDialogElement | null;
const form = document.getElementById("emi-form") as HTMLFormElement | null;
const titleEl = document.getElementById("emi-modal-title");

function calcEMI(principal: number, rate: number, tenure: number) {
  if (principal <= 0 || tenure <= 0) return { emi: 0, interest: 0 };
  const r = rate / 100 / 12;
  if (r === 0) return { emi: principal / tenure, interest: 0 };
  const emi = (principal * r * Math.pow(1 + r, tenure)) / (Math.pow(1 + r, tenure) - 1);
  return { emi, interest: emi * tenure - principal };
}

function updateCalc() {
  const p = Number((document.getElementById("emi-principal") as HTMLInputElement).value || 0);
  const r = Number((document.getElementById("emi-rate") as HTMLInputElement).value || 0);
  const t = Number((document.getElementById("emi-tenure") as HTMLInputElement).value || 0);
  const { emi, interest } = calcEMI(p, r, t);
  const emiEl = document.querySelector("[data-calc-emi]");
  const intEl = document.querySelector("[data-calc-interest]");
  if (emiEl) emiEl.textContent = fmt(emi);
  if (intEl) intEl.textContent = fmt(interest);
}

["emi-principal", "emi-rate", "emi-tenure"].forEach((id) => {
  document.getElementById(id)?.addEventListener("input", updateCalc);
});

document.getElementById("add-emi")?.addEventListener("click", () => openModal());
document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", () => modal?.close()));

function openModal(emi?: EMI) {
  if (!modal || !form) return;
  if (titleEl) titleEl.textContent = emi ? "Edit EMI / Loan" : "Add EMI / Loan";
  form.reset();
  (document.getElementById("emi-start") as HTMLInputElement).value = new Date().toISOString().split("T")[0];
  if (emi) {
    (document.getElementById("emi-id") as HTMLInputElement).value = emi.id;
    (document.getElementById("emi-name") as HTMLInputElement).value = emi.name;
    (document.getElementById("emi-type") as HTMLSelectElement).value = emi.type;
    (document.getElementById("emi-start") as HTMLInputElement).value = emi.startDate;
    (document.getElementById("emi-principal") as HTMLInputElement).value = String(emi.principal);
    (document.getElementById("emi-emi") as HTMLInputElement).value = String(emi.emi);
    (document.getElementById("emi-rate") as HTMLInputElement).value = String(emi.rate);
    (document.getElementById("emi-tenure") as HTMLInputElement).value = String(emi.tenure);
    (document.getElementById("emi-outstanding") as HTMLInputElement).value = String(emi.outstanding);
    (document.getElementById("emi-notes") as HTMLInputElement).value = emi.notes ?? "";
  } else {
    (document.getElementById("emi-id") as HTMLInputElement).value = "";
  }
  updateCalc();
  modal.showModal();
}

form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form) return;
  const fd = new FormData(form);
  const id = String(fd.get("id") ?? "");
  const ts = nowISO();
  const payload: EMI = {
    id: id || uid(),
    name: String(fd.get("name") ?? "").trim(),
    type: (fd.get("type") as LoanType) ?? "Other",
    principal: Number(fd.get("principal") ?? 0),
    emi: Number(fd.get("emi") ?? 0),
    rate: Number(fd.get("rate") ?? 0),
    tenure: Number(fd.get("tenure") ?? 0),
    startDate: String(fd.get("startDate") ?? ts.split("T")[0]),
    outstanding: Number(fd.get("outstanding") ?? fd.get("principal") ?? 0),
    notes: String(fd.get("notes") ?? ""),
    createdAt: id ? loadData().emis.find((e) => e.id === id)?.createdAt ?? ts : ts,
    updatedAt: ts,
  };
  if (!payload.name || payload.principal <= 0) {
    alert("Please provide a name and principal.");
    return;
  }
  updateData((data) => {
    if (id) {
      const idx = data.emis.findIndex((e) => e.id === id);
      if (idx >= 0) data.emis[idx] = payload;
    } else {
      data.emis.push(payload);
    }
  });
  addAudit({
    action: id ? "update" : "create",
    entity: "emi",
    entityId: payload.id,
    description: id ? `Updated loan: ${payload.name}` : `Added loan: ${payload.name}`,
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

function filteredEMIs() {
  const data = loadData();
  let rows = data.emis;
  if (filterType !== "all") rows = rows.filter((r) => r.type === filterType);
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(term) || r.notes?.toLowerCase().includes(term));
  }
  return rows;
}

function renderTable() {
  const rows = filteredEMIs();
  const tbody = document.getElementById("emi-tbody");
  if (!tbody) return;
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-5xl text-body text-body">${loadData().emis.length === 0 ? "No EMIs yet. Click <strong>+ Add EMI</strong> to get started." : "No loans match your filters."}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows
    .map((e, idx) => {
      const paidPrincipal = e.principal - e.outstanding;
      const pct = e.principal > 0 ? (paidPrincipal / e.principal) * 100 : 0;
      return `
        <tr class="border-t border-hairline hover:bg-canvas-soft">
          <td class="py-sm px-md text-mute">${idx + 1}</td>
          <td class="py-sm px-md text-body-sm-strong text-ink">${esc(e.name)}</td>
          <td class="py-sm px-md"><span class="badge">${e.type}</span></td>
          <td class="py-sm px-md text-right">${fmt(e.principal)}</td>
          <td class="py-sm px-md text-right">${fmt(e.emi)}</td>
          <td class="py-sm px-md text-right">${e.rate.toFixed(2)}%</td>
          <td class="py-sm px-md text-right">${e.tenure} mo</td>
          <td class="py-sm px-md text-body">${e.startDate}</td>
          <td class="py-sm px-md text-right">${fmt(e.outstanding)}</td>
          <td class="py-sm px-md">
            <div class="flex items-center gap-xs">
              <div class="flex-1 h-1.5 bg-canvas-soft-2 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-gain" style="width: ${pct.toFixed(1)}%"></div>
              </div>
              <span class="text-caption text-body whitespace-nowrap">${pct.toFixed(0)}%</span>
            </div>
          </td>
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
      const e = loadData().emis.find((e) => e.id === id);
      if (e) openModal(e);
    });
  });
  tbody.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delete!;
      const e = loadData().emis.find((e) => e.id === id);
      if (!e) return;
      if (!confirm(`Delete "${e.name}"?`)) return;
      updateData((data) => {
        data.emis = data.emis.filter((e) => e.id !== id);
      });
      addAudit({ action: "delete", entity: "emi", entityId: id, description: `Deleted loan: ${e.name}` });
    });
  });
}

function renderStats() {
  const rows = filteredEMIs();
  const total = totalEMI(rows);
  const outstanding = totalOutstanding(rows);
  const interest = rows.reduce((s, e) => {
    const { interest } = calcEMI(e.principal, e.rate, e.tenure);
    return s + Math.max(0, interest);
  }, 0);
  const closing = rows.filter((e) => {
    const start = new Date(e.startDate);
    const monthsElapsed = (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return e.tenure - monthsElapsed <= 6 && e.outstanding > 0;
  }).length;
  const setText = (sel: string, text: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.textContent = text;
  };
  setText("[data-stat='monthly']", fmt(total, true));
  setText("[data-stat='active']", String(rows.length));
  setText("[data-stat='outstanding']", fmt(outstanding, true));
  setText("[data-stat='interest']", fmt(interest, true));
  setText("[data-stat='closing']", String(closing));
}

function renderAll() {
  renderTable();
  renderStats();
}

subscribe(renderAll);
renderAll();
