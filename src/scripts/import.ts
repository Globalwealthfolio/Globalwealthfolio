/**
 * Import page logic:
 * - Excel/CSV upload with column auto-mapping and live preview
 * - Bank-statement image upload + camera capture with on-device OCR
 * - JSON backup restore + export
 */

import { updateData, addAudit, uid, nowISO, type Investment } from "../lib/store";
import { parseSpreadsheet, autoMapColumns, buildEntities, importJSON, exportJSON, exportCSV, downloadFile, type ParsedSheet } from "../lib/import-export";
import { ocrImage, transactionsToExpenses, type ParsedTransaction } from "../lib/ocr";
import { importPdf, parseHoldings, type ParsedHolding, type PdfMode } from "../lib/pdf-import";

/* ── Tabs ──────────────────────────────────────────────────── */
const tabs = document.querySelectorAll<HTMLButtonElement>("[data-tab]");
const panels = document.querySelectorAll<HTMLElement>("[data-panel]");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab!;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
    panels.forEach((p) => p.classList.toggle("hidden", p.getAttribute("data-panel") !== target));
  });
});

/* ═════════════════════════════════════════════════════════════
   EXCEL / CSV TAB
   ═════════════════════════════════════════════════════════════ */
let currentSheets: ParsedSheet[] = [];
let currentSheetName = "";

const xlsxDrop = document.getElementById("xlsx-drop") as HTMLElement | null;
const xlsxInput = document.getElementById("xlsx-input") as HTMLInputElement | null;
const xlsxConfig = document.getElementById("xlsx-config") as HTMLElement | null;

xlsxDrop?.addEventListener("click", () => xlsxInput?.click());
xlsxDrop?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    xlsxInput?.click();
  }
});
xlsxDrop?.addEventListener("dragover", (e) => {
  e.preventDefault();
  xlsxDrop.classList.add("border-ink");
});
xlsxDrop?.addEventListener("dragleave", () => xlsxDrop.classList.remove("border-ink"));
xlsxDrop?.addEventListener("drop", async (e) => {
  e.preventDefault();
  xlsxDrop.classList.remove("border-ink");
  const file = e.dataTransfer?.files?.[0];
  if (file) await handleSpreadsheet(file);
});
xlsxInput?.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await handleSpreadsheet(file);
});

async function handleSpreadsheet(file: File) {
  try {
    currentSheets = await parseSpreadsheet(file);
    if (currentSheets.length === 0) {
      alert("No sheets found in this file.");
      return;
    }
    currentSheetName = currentSheets[0].sheetName;
    xlsxConfig?.classList.remove("hidden");
    populateSheetSelect();
    updateMappingAndPreview();
    addAudit({ action: "import", entity: "settings", description: `Imported spreadsheet: ${file.name}` });
  } catch (e) {
    console.error(e);
    alert("Failed to read the file. Make sure it is a valid Excel or CSV document.");
  }
}

const sheetSelect = document.getElementById("xlsx-sheet") as HTMLSelectElement | null;
sheetSelect?.addEventListener("change", () => {
  currentSheetName = sheetSelect.value;
  updateMappingAndPreview();
});

const entitySelect = document.getElementById("xlsx-entity") as HTMLSelectElement | null;
entitySelect?.addEventListener("change", updateMappingAndPreview);

const defaultTypeSelect = document.getElementById("xlsx-default-type") as HTMLSelectElement | null;
defaultTypeSelect?.addEventListener("change", updateMappingAndPreview);

function populateSheetSelect() {
  if (!sheetSelect) return;
  sheetSelect.innerHTML = currentSheets.map((s) => `<option value="${s.sheetName}">${s.sheetName}</option>`).join("");
  sheetSelect.value = currentSheetName;
}

function currentSheet(): ParsedSheet | undefined {
  return currentSheets.find((s) => s.sheetName === currentSheetName);
}

function currentEntity(): "investment" | "expense" | "emi" | "goal" {
  return (entitySelect?.value ?? "investment") as "investment" | "expense" | "emi" | "goal";
}

const mappingEl = document.getElementById("xlsx-mapping") as HTMLElement | null;

const FIELD_LABELS: Record<string, string> = {
  name: "Name / Description *",
  type: "Type / Category",
  amount: "Amount / Invested *",
  currentValue: "Current Value (for investments)",
  date: "Date",
  risk: "Risk score",
  notes: "Notes",
  goal: "Goal name (lookup)",
  emi: "EMI amount",
  rate: "Rate %",
  tenure: "Tenure (months)",
  outstanding: "Outstanding",
  target: "Target",
  current: "Current",
  principal: "Principal",
};

function getTargetFields(): string[] {
  const ent = currentEntity();
  if (ent === "investment") return ["name", "type", "amount", "currentValue", "date", "risk", "notes"];
  if (ent === "expense") return ["name", "amount", "date", "notes"];
  if (ent === "emi") return ["name", "type", "principal", "emi", "rate", "tenure", "startDate" as never, "outstanding", "notes"];
  return ["name", "type", "target", "current", "deadline" as never, "notes"];
}

function buildMapping(): Record<string, string> {
  const sheet = currentSheet();
  if (!sheet || !mappingEl) return {};
  const out: Record<string, string> = {};
  mappingEl.querySelectorAll<HTMLSelectElement>("[data-target]").forEach((sel) => {
    if (sel.value) out[sel.dataset.target!] = sel.value;
  });
  return out;
}

function updateMappingAndPreview() {
  const sheet = currentSheet();
  if (!sheet || !mappingEl) return;
  const fields = getTargetFields();
  const auto = autoMapColumns(sheet.headers, fields as never);

  mappingEl.innerHTML = fields
    .map((f) => {
      const opts = [`<option value="">— Skip —</option>`, ...sheet.headers.map((h) => `<option value="${h}">${h}</option>`)];
      const sel = auto[f] ?? "";
      return `
        <div>
          <label class="label" for="map-${f}">${FIELD_LABELS[f] ?? f}</label>
          <select class="select" data-target="${f}" id="map-${f}">
            ${opts.join("")}
          </select>
        </div>`;
    })
    .join("");

  // Apply auto-mapped values
  mappingEl.querySelectorAll<HTMLSelectElement>("[data-target]").forEach((sel) => {
    if (auto[sel.dataset.target!]) sel.value = auto[sel.dataset.target!];
  });

  // Add change listeners
  mappingEl.querySelectorAll<HTMLSelectElement>("[data-target]").forEach((sel) => {
    sel.addEventListener("change", updatePreview);
  });

  updatePreview();
}

function updatePreview() {
  const sheet = currentSheet();
  if (!sheet) return;
  const mapping = buildMapping();
  const defaultType = (defaultTypeSelect?.value) || undefined;
  const entities = buildEntities(sheet.rows.slice(0, 5), {
    entity: currentEntity(),
    columnMap: mapping,
    defaultType,
  });

  const head = document.getElementById("xlsx-preview-head") as HTMLElement | null;
  const body = document.getElementById("xlsx-preview-body") as HTMLElement | null;
  if (head && body) {
    const cols = ["name", "type", "amount", "currentValue", "date", "risk"];
    head.innerHTML = `<tr>${cols.map((c) => `<th class="py-xs px-md font-medium">${c}</th>`).join("")}</tr>`;
    body.innerHTML = entities
      .map(
        (e: Record<string, unknown>) =>
          `<tr>${cols.map((c) => `<td class="py-xs px-md">${String((e as Record<string, unknown>)[c] ?? "")}</td>`).join("")}</tr>`,
      )
      .join("");
  }

  const allEntities = buildEntities(sheet.rows, {
    entity: currentEntity(),
    columnMap: mapping,
    defaultType,
  });
  const count = allEntities.length;
  const countEl = document.getElementById("xlsx-count");
  const countEl2 = document.getElementById("xlsx-count-2");
  if (countEl) countEl.textContent = String(count);
  if (countEl2) countEl2.textContent = String(count);
}

document.getElementById("xlsx-import")?.addEventListener("click", () => {
  const sheet = currentSheet();
  if (!sheet) return;
  const mapping = buildMapping();
  const defaultType = (defaultTypeSelect?.value) || undefined;
  const entities = buildEntities(sheet.rows, {
    entity: currentEntity(),
    columnMap: mapping,
    defaultType,
  });
  if (entities.length === 0) {
    alert("No rows to import. Check your column mapping.");
    return;
  }
  if (!confirm(`Import ${entities.length} ${currentEntity()}(s) into your portfolio?`)) return;
  updateData((data) => {
    if (currentEntity() === "investment") data.investments.push(...(entities as never[]));
    if (currentEntity() === "expense") data.expenses.push(...(entities as never[]));
    if (currentEntity() === "emi") data.emis.push(...(entities as never[]));
    if (currentEntity() === "goal") data.goals.push(...(entities as never[]));
  });
  addAudit({
    action: "import",
    entity: currentEntity(),
    description: `Imported ${entities.length} ${currentEntity()}(s) from spreadsheet`,
  });
  alert(`Successfully imported ${entities.length} ${currentEntity()}(s).`);
  // Reset UI
  xlsxConfig?.classList.add("hidden");
  if (xlsxInput) xlsxInput.value = "";
  currentSheets = [];
});

/* ═════════════════════════════════════════════════════════════
   IMAGE / OCR TAB
   ═════════════════════════════════════════════════════════════ */

const imgInput = document.getElementById("img-input") as HTMLInputElement | null;
const imgDrop = document.getElementById("img-drop") as HTMLElement | null;
const imgCamera = document.getElementById("img-camera") as HTMLElement | null;
const imgPreviewWrap = document.getElementById("img-preview-wrap") as HTMLElement | null;
const imgPreview = document.getElementById("img-preview") as HTMLImageElement | null;
const ocrStatusEl = document.getElementById("ocr-status") as HTMLElement | null;
const ocrPercentEl = document.getElementById("ocr-percent") as HTMLElement | null;
const ocrBar = document.getElementById("ocr-progress-bar") as HTMLElement | null;
const ocrResult = document.getElementById("ocr-result") as HTMLElement | null;
const ocrTbody = document.getElementById("ocr-tbody") as HTMLElement | null;

let currentImage: File | Blob | null = null;
let currentTransactions: ParsedTransaction[] = [];
let cameraStream: MediaStream | null = null;

imgDrop?.addEventListener("click", () => imgInput?.click());
imgDrop?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    imgInput?.click();
  }
});
imgDrop?.addEventListener("dragover", (e) => {
  e.preventDefault();
  imgDrop.classList.add("border-ink");
});
imgDrop?.addEventListener("dragleave", () => imgDrop.classList.remove("border-ink"));
imgDrop?.addEventListener("drop", async (e) => {
  e.preventDefault();
  imgDrop.classList.remove("border-ink");
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith("image/")) await prepareImage(file);
});
imgInput?.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await prepareImage(file);
});

async function prepareImage(file: File | Blob) {
  currentImage = file;
  if (imgPreview) {
    imgPreview.src = URL.createObjectURL(file);
  }
  imgPreviewWrap?.classList.remove("hidden");
  ocrResult?.classList.add("hidden");
  await runOCR();
}

/* ── Camera capture ────────────────────────────────────────── */
const viewfinder = document.getElementById("camera-viewfinder") as HTMLElement | null;
const video = document.getElementById("camera-video") as HTMLVideoElement | null;
const cameraCancel = document.getElementById("camera-cancel") as HTMLButtonElement | null;
const cameraCapture = document.getElementById("camera-capture") as HTMLButtonElement | null;

imgCamera?.addEventListener("click", async () => {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    alert("Camera is not supported in this browser.");
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    if (video) {
      video.srcObject = cameraStream;
      await video.play();
    }
    viewfinder?.classList.remove("hidden");
  } catch (err) {
    console.error(err);
    alert("Could not access the camera. Please grant permission, or upload an image instead.");
  }
});

cameraCancel?.addEventListener("click", () => stopCamera());

function stopCamera() {
  cameraStream?.getTracks().forEach((t) => t.stop());
  cameraStream = null;
  if (video) video.srcObject = null;
  viewfinder?.classList.add("hidden");
}

cameraCapture?.addEventListener("click", async () => {
  if (!video) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(video, 0, 0);
  const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.92));
  stopCamera();
  await prepareImage(blob);
});

/* ── OCR ────────────────────────────────────────────────────── */
async function runOCR() {
  if (!currentImage) return;
  try {
    if (ocrStatusEl) ocrStatusEl.textContent = "Loading model…";
    if (ocrPercentEl) ocrPercentEl.textContent = "0%";
    if (ocrBar) ocrBar.style.width = "0%";
    const result = await ocrImage(currentImage, (p) => {
      if (ocrStatusEl) ocrStatusEl.textContent = p.status;
      if (ocrPercentEl) ocrPercentEl.textContent = `${Math.round(p.progress * 100)}%`;
      if (ocrBar) ocrBar.style.width = `${p.progress * 100}%`;
    });
    currentTransactions = result.transactions;
    if (ocrStatusEl) ocrStatusEl.textContent = `Done in ${(result.durationMs / 1000).toFixed(1)}s`;
    if (ocrBar) ocrBar.style.width = "100%";
    renderTransactions();
    ocrResult?.classList.remove("hidden");
  } catch (e) {
    console.error(e);
    if (ocrStatusEl) ocrStatusEl.textContent = "OCR failed. Please try again.";
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTransactions() {
  if (!ocrTbody) return;
  if (currentTransactions.length === 0) {
    ocrTbody.innerHTML = `<tr><td colspan="5" class="text-center py-3xl text-body text-body">No transactions detected. Try a clearer image or a different statement.</td></tr>`;
    const sc = document.getElementById("ocr-selected-count");
    const tc = document.getElementById("ocr-total-count");
    if (sc) sc.textContent = "0";
    if (tc) tc.textContent = "0";
    return;
  }
  ocrTbody.innerHTML = currentTransactions
    .map(
      (t, i) => `
    <tr class="border-t border-hairline">
      <td class="py-sm px-md"><input type="checkbox" data-tx="${i}" checked class="w-4 h-4 accent-current" aria-label="Select transaction" /></td>
      <td class="py-sm px-md text-body">${t.date}</td>
      <td class="py-sm px-md">${esc(t.description)}</td>
      <td class="py-sm px-md"><span class="badge ${t.type === "credit" ? "badge-gain" : ""}">${t.type}</span></td>
      <td class="py-sm px-md text-right text-body-sm-strong">${t.amount.toFixed(2)}</td>
    </tr>`,
    )
    .join("");
  const sc = document.getElementById("ocr-selected-count");
  const tc = document.getElementById("ocr-total-count");
  if (sc) sc.textContent = String(currentTransactions.length);
  if (tc) tc.textContent = String(currentTransactions.length);
}

document.getElementById("ocr-select-all")?.addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>("[data-tx]").forEach((c) => (c.checked = true));
  updateSelectedCount();
});
document.getElementById("ocr-deselect-all")?.addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>("[data-tx]").forEach((c) => (c.checked = false));
  updateSelectedCount();
});
ocrTbody?.addEventListener("change", updateSelectedCount);

function updateSelectedCount() {
  const checked = document.querySelectorAll<HTMLInputElement>("[data-tx]:checked").length;
  const sc = document.getElementById("ocr-selected-count");
  if (sc) sc.textContent = String(checked);
}

document.getElementById("ocr-discard")?.addEventListener("click", () => {
  currentTransactions = [];
  currentImage = null;
  imgPreviewWrap?.classList.add("hidden");
  ocrResult?.classList.add("hidden");
  if (imgInput) imgInput.value = "";
});

document.getElementById("ocr-import")?.addEventListener("click", () => {
  const checked = Array.from(document.querySelectorAll<HTMLInputElement>("[data-tx]:checked")).map((c) => Number(c.dataset.tx));
  const selected = checked.map((i) => currentTransactions[i]).filter(Boolean);
  if (selected.length === 0) {
    alert("Select at least one transaction to import.");
    return;
  }
  const expenses = transactionsToExpenses(selected);
  updateData((data) => {
    data.expenses.push(...expenses);
  });
  addAudit({
    action: "import",
    entity: "expense",
    description: `Imported ${expenses.length} expense(s) from bank statement (OCR)`,
  });
  alert(`Successfully imported ${expenses.length} expense(s) from the statement.`);
  currentTransactions = [];
  currentImage = null;
  imgPreviewWrap?.classList.add("hidden");
  ocrResult?.classList.add("hidden");
  if (imgInput) imgInput.value = "";
});

/* ═════════════════════════════════════════════════════════════
   PDF TAB
   ═════════════════════════════════════════════════════════════ */

const pdfDrop = document.getElementById("pdf-drop") as HTMLElement | null;
const pdfInput = document.getElementById("pdf-input") as HTMLInputElement | null;
const pdfProgressWrap = document.getElementById("pdf-progress-wrap");
const pdfStatusEl = document.getElementById("pdf-status");
const pdfPercentEl = document.getElementById("pdf-percent");
const pdfBar = document.getElementById("pdf-progress-bar");
const pdfStrategyEl = document.getElementById("pdf-strategy");
const pdfResult = document.getElementById("pdf-result");
const pdfTbody = document.getElementById("pdf-tbody");
const pdfHoldingsPanel = document.getElementById("pdf-holdings");
const pdfHoldingsTbody = document.getElementById("pdf-holdings-tbody");

let currentPdfFile: File | null = null;
let currentPdfTransactions: ParsedTransaction[] = [];
let currentPdfHoldings: ParsedHolding[] = [];
let currentPdfMode: PdfMode = "bank";

document.querySelectorAll<HTMLInputElement>("[data-pdf-mode]").forEach((r) => {
  r.addEventListener("change", () => {
    if (r.checked) currentPdfMode = r.value as PdfMode;
  });
});

pdfDrop?.addEventListener("click", () => pdfInput?.click());
pdfDrop?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    pdfInput?.click();
  }
});
pdfDrop?.addEventListener("dragover", (e) => {
  e.preventDefault();
  pdfDrop.classList.add("border-ink");
});
pdfDrop?.addEventListener("dragleave", () => pdfDrop.classList.remove("border-ink"));
pdfDrop?.addEventListener("drop", async (e) => {
  e.preventDefault();
  pdfDrop.classList.remove("border-ink");
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type === "application/pdf") await handlePdf(file);
});
pdfInput?.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await handlePdf(file);
});

async function handlePdf(file: File) {
  currentPdfFile = file;
  pdfProgressWrap?.classList.remove("hidden");
  pdfResult?.classList.add("hidden");
  pdfHoldingsPanel?.classList.add("hidden");
  if (pdfStatusEl) pdfStatusEl.textContent = "Reading PDF…";
  if (pdfPercentEl) pdfPercentEl.textContent = "0%";
  if (pdfBar) pdfBar.style.width = "0%";
  try {
    const result = await importPdf(file, (p) => {
      if (pdfStatusEl) pdfStatusEl.textContent = p.status;
      if (pdfPercentEl) pdfPercentEl.textContent = `${Math.round(p.progress * 100)}%`;
      if (pdfBar) pdfBar.style.width = `${Math.round(p.progress * 100)}%`;
    });
    if (pdfStrategyEl) {
      pdfStrategyEl.textContent =
        result.strategy === "text"
          ? `Extracted from ${result.pageCount} page(s) using the PDF text layer in ${(result.durationMs / 1000).toFixed(1)}s.`
          : `Scanned PDF — rendered ${result.pageCount} page(s) to images and ran OCR in ${(result.durationMs / 1000).toFixed(1)}s.`;
    }
    if (currentPdfMode === "bank") {
      currentPdfTransactions = result.transactions;
      renderPdfTransactions();
      pdfResult?.classList.remove("hidden");
    } else {
      currentPdfHoldings = parseHoldings(result.text);
      renderPdfHoldings();
      pdfHoldingsPanel?.classList.remove("hidden");
    }
    addAudit({ action: "import", entity: "settings", description: `Imported PDF: ${file.name}` });
  } catch (e) {
    console.error(e);
    if (pdfStatusEl) pdfStatusEl.textContent = "Failed to read the PDF. Please try a different file.";
  }
}

function renderPdfTransactions() {
  if (!pdfTbody) return;
  if (currentPdfTransactions.length === 0) {
    pdfTbody.innerHTML = `<tr><td colspan="5" class="text-center py-3xl text-body">No transactions detected. Try the other statement type or a clearer scan.</td></tr>`;
    const sc = document.getElementById("pdf-selected-count");
    const tc = document.getElementById("pdf-total-count");
    if (sc) sc.textContent = "0";
    if (tc) tc.textContent = "0";
    return;
  }
  pdfTbody.innerHTML = currentPdfTransactions
    .map(
      (t, i) => `
    <tr class="border-t border-hairline">
      <td class="py-sm px-md"><input type="checkbox" data-pdf-tx="${i}" checked class="w-4 h-4 accent-current" aria-label="Select transaction" /></td>
      <td class="py-sm px-md text-body">${t.date}</td>
      <td class="py-sm px-md">${esc(t.description)}</td>
      <td class="py-sm px-md"><span class="badge ${t.type === "credit" ? "badge-gain" : ""}">${t.type}</span></td>
      <td class="py-sm px-md text-right text-body-sm-strong">${t.amount.toFixed(2)}</td>
    </tr>`,
    )
    .join("");
  const sc = document.getElementById("pdf-selected-count");
  const tc = document.getElementById("pdf-total-count");
  if (sc) sc.textContent = String(currentPdfTransactions.length);
  if (tc) tc.textContent = String(currentPdfTransactions.length);
}

function renderPdfHoldings() {
  if (!pdfHoldingsTbody) return;
  if (currentPdfHoldings.length === 0) {
    pdfHoldingsTbody.innerHTML = `<tr><td colspan="5" class="text-center py-3xl text-body">No holdings detected. The script/quantity/value columns could not be matched automatically.</td></tr>`;
    const sc = document.getElementById("pdf-holdings-selected-count");
    const tc = document.getElementById("pdf-holdings-total-count");
    if (sc) sc.textContent = "0";
    if (tc) tc.textContent = "0";
    return;
  }
  pdfHoldingsTbody.innerHTML = currentPdfHoldings
    .map(
      (h, i) => `
    <tr class="border-t border-hairline">
      <td class="py-sm px-md"><input type="checkbox" data-pdf-h="${i}" checked class="w-4 h-4 accent-current" aria-label="Select holding" /></td>
      <td class="py-sm px-md text-body-sm-strong">${esc(h.script)}</td>
      <td class="py-sm px-md text-right">${h.quantity != null ? h.quantity.toLocaleString() : "—"}</td>
      <td class="py-sm px-md text-right">${h.value != null ? h.value.toLocaleString() : "—"}</td>
      <td class="py-sm px-md text-body">${h.asOf ?? "—"}</td>
    </tr>`,
    )
    .join("");
  const sc = document.getElementById("pdf-holdings-selected-count");
  const tc = document.getElementById("pdf-holdings-total-count");
  if (sc) sc.textContent = String(currentPdfHoldings.length);
  if (tc) tc.textContent = String(currentPdfHoldings.length);
}

document.getElementById("pdf-select-all")?.addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>("[data-pdf-tx]").forEach((c) => (c.checked = true));
  updatePdfSelectedCount();
});
document.getElementById("pdf-deselect-all")?.addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>("[data-pdf-tx]").forEach((c) => (c.checked = false));
  updatePdfSelectedCount();
});
pdfTbody?.addEventListener("change", updatePdfSelectedCount);

function updatePdfSelectedCount() {
  const checked = document.querySelectorAll<HTMLInputElement>("[data-pdf-tx]:checked").length;
  const sc = document.getElementById("pdf-selected-count");
  if (sc) sc.textContent = String(checked);
}

document.getElementById("pdf-holdings-select-all")?.addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>("[data-pdf-h]").forEach((c) => (c.checked = true));
  updatePdfHoldingsCount();
});
document.getElementById("pdf-holdings-deselect-all")?.addEventListener("click", () => {
  document.querySelectorAll<HTMLInputElement>("[data-pdf-h]").forEach((c) => (c.checked = false));
  updatePdfHoldingsCount();
});
pdfHoldingsTbody?.addEventListener("change", updatePdfHoldingsCount);

function updatePdfHoldingsCount() {
  const checked = document.querySelectorAll<HTMLInputElement>("[data-pdf-h]:checked").length;
  const sc = document.getElementById("pdf-holdings-selected-count");
  if (sc) sc.textContent = String(checked);
}

document.getElementById("pdf-discard")?.addEventListener("click", () => {
  currentPdfTransactions = [];
  currentPdfFile = null;
  pdfResult?.classList.add("hidden");
  pdfProgressWrap?.classList.add("hidden");
  if (pdfInput) pdfInput.value = "";
});

document.getElementById("pdf-holdings-discard")?.addEventListener("click", () => {
  currentPdfHoldings = [];
  currentPdfFile = null;
  pdfHoldingsPanel?.classList.add("hidden");
  pdfProgressWrap?.classList.add("hidden");
  if (pdfInput) pdfInput.value = "";
});

document.getElementById("pdf-import")?.addEventListener("click", () => {
  const checked = Array.from(document.querySelectorAll<HTMLInputElement>("[data-pdf-tx]:checked")).map((c) => Number(c.dataset.pdfTx));
  const selected = checked.map((i) => currentPdfTransactions[i]).filter(Boolean);
  if (selected.length === 0) {
    alert("Select at least one transaction to import.");
    return;
  }
  const expenses = transactionsToExpenses(selected);
  updateData((data) => {
    data.expenses.push(...expenses);
  });
  addAudit({
    action: "import",
    entity: "expense",
    description: `Imported ${expenses.length} expense(s) from PDF`,
  });
  alert(`Successfully imported ${expenses.length} expense(s) from the PDF.`);
  currentPdfTransactions = [];
  currentPdfFile = null;
  pdfResult?.classList.add("hidden");
  pdfProgressWrap?.classList.add("hidden");
  if (pdfInput) pdfInput.value = "";
});

document.getElementById("pdf-holdings-import")?.addEventListener("click", () => {
  const checked = Array.from(document.querySelectorAll<HTMLInputElement>("[data-pdf-h]:checked")).map((c) => Number(c.dataset.pdfH));
  const selected = checked.map((i) => currentPdfHoldings[i]).filter(Boolean);
  if (selected.length === 0) {
    alert("Select at least one holding to import.");
    return;
  }
  const ts = nowISO();
  const investments: Investment[] = selected
    .filter((h) => h.value != null && h.value > 0)
    .map((h) => ({
      id: uid(),
      name: h.script,
      type: "Equity",
      amount: h.value ?? 0,
      currentValue: h.value ?? 0,
      date: h.asOf ?? ts.split("T")[0],
      risk: 6,
      notes: "Imported from PDF depository statement",
      createdAt: ts,
      updatedAt: ts,
    }));
  if (investments.length === 0) {
    alert("None of the selected holdings had a recognisable value. Try a different statement.");
    return;
  }
  updateData((data) => {
    data.investments.push(...investments);
  });
  addAudit({
    action: "import",
    entity: "investment",
    description: `Imported ${investments.length} holding(s) from PDF depository statement`,
  });
  alert(`Successfully imported ${investments.length} holding(s) from the PDF.`);
  currentPdfHoldings = [];
  currentPdfFile = null;
  pdfHoldingsPanel?.classList.add("hidden");
  pdfProgressWrap?.classList.add("hidden");
  if (pdfInput) pdfInput.value = "";
});

/* ═════════════════════════════════════════════════════════════
   JSON BACKUP TAB
   ═════════════════════════════════════════════════════════════ */

const jsonInput = document.getElementById("json-input") as HTMLInputElement | null;
const jsonDrop = document.getElementById("json-drop") as HTMLElement | null;

jsonDrop?.addEventListener("click", () => jsonInput?.click());
jsonDrop?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    jsonInput?.click();
  }
});
jsonInput?.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    if (!confirm("This will replace your current data. Continue?")) return;
    const data = importJSON(text);
    updateData(() => data);
    addAudit({ action: "import", entity: "settings", description: "Imported JSON backup" });
    alert("Backup restored successfully.");
  } catch (err) {
    console.error(err);
    alert("Could not parse the JSON file.");
  }
});

document.getElementById("export-json")?.addEventListener("click", () => {
  const data = window.gwp?.getData() ?? JSON.parse(localStorage.getItem("gwp:data:v1") ?? "{}");
  const json = exportJSON(data);
  downloadFile(json, `gwp-backup-${new Date().toISOString().split("T")[0]}.json`, "application/json");
  addAudit({ action: "export", entity: "settings", description: "Exported JSON backup" });
});

document.getElementById("export-csv")?.addEventListener("click", () => {
  const data = window.gwp?.getData() ?? JSON.parse(localStorage.getItem("gwp:data:v1") ?? "{}");
  const entity = prompt("Export which entity? Type: investments, expenses, emis, goals", "investments");
  if (!entity) return;
  const rows = data[entity] ?? [];
  if (rows.length === 0) {
    alert("Nothing to export.");
    return;
  }
  const csv = exportCSV(rows, Object.keys(rows[0]));
  downloadFile(csv, `${entity}-${new Date().toISOString().split("T")[0]}.csv`, "text/csv");
  addAudit({ action: "export", entity: entity as never, description: `Exported ${rows.length} ${entity} as CSV` });
});
