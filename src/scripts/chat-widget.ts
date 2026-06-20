import { loadData, saveData, updateData, clearData as clearStore } from "../lib/store";
import type { AppData, Investment } from "../lib/types";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

let currentChart: any = null;
let open = false;
let webllmEngine: any = null;
let webllmLoading = false;
let useRuleBased = true;

const WIDGET_ID = "gwp-chat-widget";
const WEBLLM_MODEL = "TinyLlama-1.1B-Chat-q4f16_1-MLC";

function createWidget() {
  if (document.getElementById(WIDGET_ID)) return;
  const prefs = loadData().preferences;
  if (prefs.disableChatWidget) return;

  const style = document.createElement("style");
  style.textContent = `
#${WIDGET_ID} { all: initial; font-family: 'Inter', system-ui, sans-serif; }
#${WIDGET_ID} *, #${WIDGET_ID} *::before, #${WIDGET_ID} *::after { box-sizing: border-box; }

.gwp-cbubble {
  position: fixed; bottom: 120px; right: 24px; z-index: 9999;
  width: 56px; height: 56px; border-radius: 50%;
  background: linear-gradient(135deg, #0f1b2d 0%, #1a2d4a 100%);
  color: #c9a961; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 20px rgba(0,0,0,0.25);
  transition: transform 0.2s, box-shadow 0.2s;
}
.gwp-cbubble:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(0,0,0,0.35); }
.gwp-cbubble svg { width: 24px; height: 24px; }

.gwp-panel {
  position: fixed; bottom: 196px; right: 24px; z-index: 9998;
  width: 400px; max-height: 640px; height: 70vh;
  background: var(--color-canvas, #fdfbf7);
  border: 1px solid var(--color-hairline, #e3d8c1);
  border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.18);
  display: none; flex-direction: column; overflow: hidden;
  animation: gwp-slide-up 0.25s ease-out;
}
.gwp-panel.open { display: flex; }

@keyframes gwp-slide-up {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.gwp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--color-hairline, #e3d8c1);
  background: var(--color-canvas-soft, #f4ecde);
  flex-shrink: 0;
}
.gwp-header h3 {
  font-size: 14px; font-weight: 600; color: var(--color-ink, #0f1b2d);
  margin: 0; display: flex; align-items: center; gap: 8px;
}
.gwp-header h3 svg { width: 18px; height: 18px; color: var(--color-gold, #c9a961); }
.gwp-header-actions { display: flex; gap: 6px; align-items: center; }
.gwp-ai-toggle.active { background: var(--color-gain, #10b981) !important; color: #fff !important; border-color: var(--color-gain, #10b981) !important; }
.gwp-ai-toggle.inactive { background: var(--color-canvas-soft-2, #e8dfc9) !important; color: var(--color-mute, #8a94a6) !important; }
.gwp-header-actions button {
  background: none; border: 1px solid var(--color-hairline, #e3d8c1);
  border-radius: 6px; padding: 4px 8px; cursor: pointer;
  font-size: 11px; color: var(--color-body, #4a5568);
  transition: background 0.15s;
}
.gwp-header-actions button:hover { background: var(--color-canvas-soft-2, #e8dfc9); }
.gwp-clear-btn { color: var(--color-loss, #ef4444) !important; }

.gwp-status {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px; font-size: 12px; color: var(--color-body, #4a5568);
  border-bottom: 1px solid var(--color-hairline, #e3d8c1);
  flex-shrink: 0;
}
.gwp-status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.gwp-status-dot.loaded { background: #10b981; }
.gwp-status-dot.empty { background: #ef4444; }
.gwp-privacy {
  padding: 4px 16px; font-size: 10px; color: var(--color-mute, #8a94a6);
  border-bottom: 1px solid var(--color-hairline, #e3d8c1); line-height: 1.4;
}

.gwp-messages {
  flex: 1; overflow-y: scroll; padding: 12px 16px;
  display: flex; flex-direction: column; gap: 10px;
  scroll-behavior: smooth; min-height: 0;
  scrollbar-width: thin;
  scrollbar-color: var(--color-hairline-strong,#b8a47a) transparent;
}
.gwp-messages::-webkit-scrollbar { width: 5px; }
.gwp-messages::-webkit-scrollbar-track { background: transparent; }
.gwp-messages::-webkit-scrollbar-thumb { background: var(--color-hairline-strong,#b8a47a); border-radius: 3px; }
.gwp-messages > :first-child { margin-top: auto; }

.gwp-scroll-down {
  position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--color-ink, #0f1b2d); color: #c9a961;
  border: none; cursor: pointer; display: none; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10;
  font-size: 14px; transition: transform 0.2s;
}
.gwp-scroll-down:hover { transform: translateX(-50%) scale(1.1); }
.gwp-scroll-down.visible { display: flex; }

.gwp-msg { padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.5; max-width: 88%; }
.gwp-msg.user {
  background: #dbeafe; color: #1e3a5f;
  align-self: flex-end; border-radius: 12px 12px 3px 12px;
}
.dark .gwp-msg.user { background: #1e3a5f; color: #dbeafe; }
.gwp-msg.bot {
  background: var(--color-canvas-soft, #f4ecde);
  color: var(--color-ink, #0f1b2d);
  border: 1px solid var(--color-hairline, #e3d8c1);
  align-self: flex-start; border-radius: 12px 12px 12px 3px;
}
.dark .gwp-msg.bot { background: #1a1a18; border-color: #2a2a28; }
.gwp-msg .ts { font-size: 10px; opacity: 0.5; margin-top: 4px; }
.gwp-msg code { background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px; font-size: 12px; font-family: 'JetBrains Mono', monospace; }

.gwp-no-data {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 32px 24px; text-align: center; gap: 12px; flex: 1;
}
.gwp-no-data p { font-size: 14px; color: var(--color-body, #4a5568); margin: 0; }
.gwp-no-data .btn-primary, .gwp-upload-btn {
  background: var(--color-ink, #0f1b2d); color: #fff;
  border: none; padding: 8px 20px; border-radius: 8px;
  font-size: 13px; cursor: pointer; font-weight: 500;
  transition: background 0.15s;
}
.gwp-no-data .btn-primary:hover { background: #1a2d4a; }
.gwp-no-data .btn-ghost {
  background: transparent; border: 1px solid var(--color-hairline, #e3d8c1);
  color: var(--color-body, #4a5568); padding: 8px 20px; border-radius: 8px;
  font-size: 13px; cursor: pointer;
}
.gwp-no-data .btn-ghost:hover { background: var(--color-canvas-soft, #f4ecde); }
.gwp-upload-hint { font-size: 11px; color: var(--color-mute, #8a94a6); }

.gwp-input-area {
  display: flex; gap: 8px; padding: 12px 16px;
  border-top: 1px solid var(--color-hairline, #e3d8c1);
  flex-shrink: 0;
}
.gwp-input-area input {
  flex: 1; padding: 8px 12px; border: 1px solid var(--color-hairline, #e3d8c1);
  border-radius: 8px; font-size: 13px; outline: none;
  background: var(--color-canvas, #fdfbf7);
  color: var(--color-ink, #0f1b2d);
}
.gwp-input-area input:focus { border-color: var(--color-gold, #c9a961); }
.gwp-input-area input:disabled { opacity: 0.5; }
.gwp-input-area button {
  background: var(--color-ink, #0f1b2d); color: #c9a961;
  border: none; padding: 8px 16px; border-radius: 8px;
  font-size: 13px; cursor: pointer; font-weight: 500;
  white-space: nowrap; transition: background 0.15s;
}
.gwp-input-area button:hover { background: #1a2d4a; }
.gwp-input-area button:disabled { opacity: 0.4; cursor: not-allowed; }

.gwp-suggestions {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
}
.gwp-suggestions button {
  padding: 4px 10px; border: 1px solid var(--color-hairline, #e3d8c1);
  border-radius: 6px; background: var(--color-canvas, #fdfbf7);
  color: var(--color-body, #4a5568); font-size: 11px; cursor: pointer;
  transition: all 0.15s;
}
.gwp-suggestions button:hover { border-color: var(--color-gold, #c9a961); color: var(--color-gold, #c9a961); }

.gwp-chart-area {
  margin-top: 8px; padding: 8px; background: var(--color-canvas, #fdfbf7);
  border-radius: 8px; border: 1px solid var(--color-hairline, #e3d8c1);
}
.gwp-chart-area canvas { max-height: 180px; max-width: 100%; }
.gwp-chart-title { font-size: 11px; text-align: center; color: var(--color-mute, #8a94a6); margin-bottom: 4px; }

@media (max-width: 480px) {
  .gwp-panel {
    right: 8px; left: 8px; bottom: 80px; width: auto;
    max-height: calc(100vh - 100px); height: calc(100vh - 100px);
  }
  .gwp-cbubble { right: 16px; bottom: 120px; }
}
`;
  document.head.appendChild(style);

  const html = `
<div class="gwp-cbubble" id="gwp-bubble" aria-label="Open AI assistant">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
</div>

<div class="gwp-panel" id="gwp-panel">
  <div class="gwp-header">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
      Portfolio AI
    </h3>
    <div class="gwp-header-actions">
      <button id="gwp-upload-btn" title="Upload file">📁 Upload</button>
      <button id="gwp-clear-btn" class="gwp-clear-btn" title="Clear all data">🗑️ Clear</button>
      <button id="gwp-ai-toggle" class="gwp-ai-toggle" title="Toggle AI engine (WebLLM / Rule-based)">🧠</button>
      <button id="gwp-close-btn" title="Close">✕</button>
    </div>
  </div>

  <div class="gwp-status">
    <span class="gwp-status-dot" id="gwp-status-dot"></span>
    <span id="gwp-status-label">Checking data…</span>
    <span id="gwp-status-engine" style="margin-left:8px;font-size:10px;opacity:0.5;white-space:nowrap;"></span>
    <span id="gwp-status-count" style="margin-left:auto;opacity:0.6"></span>
  </div>

  <div class="gwp-privacy">🔒 <strong>100% private.</strong> AI runs entirely in your browser via WebLLM — <em>zero data leaves your device</em> and no internet calls are made with your portfolio info. Responses are powered from the file you upload. You can turn off WebLLM anytime in <a href="/settings" style="color:var(--color-gold,#c9a961);text-decoration:underline;">Settings</a>.</div>

  <div id="gwp-body" style="position:relative;flex:1;display:flex;flex-direction:column;min-height:0;">
    <div class="gwp-messages" id="gwp-messages"></div>
    <button class="gwp-scroll-down" id="gwp-scroll-down" title="Scroll to bottom">↓</button>
  </div>

  <div class="gwp-input-area" id="gwp-input-area">
    <input type="text" id="gwp-input" placeholder="Ask about your portfolio…" disabled>
    <button id="gwp-send-btn" disabled>Send</button>
  </div>
</div>

<input type="file" id="gwp-file-input" accept=".json,.csv" style="display:none">
`;

  const wrapper = document.createElement("div");
  wrapper.id = WIDGET_ID;
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);

  document.getElementById("gwp-bubble")!.addEventListener("click", togglePanel);
  document.getElementById("gwp-close-btn")!.addEventListener("click", togglePanel);
  document.getElementById("gwp-send-btn")!.addEventListener("click", handleSend);
  document.getElementById("gwp-clear-btn")!.addEventListener("click", handleClear);
  document.getElementById("gwp-ai-toggle")!.addEventListener("click", handleAIToggle);

  const fileInput = document.getElementById("gwp-file-input")!;
  document.getElementById("gwp-upload-btn")!.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileUpload);

  const input = document.getElementById("gwp-input") as HTMLInputElement;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  setupScrollButton();
  initWebLLM();
}

/* ── WebLLM Engine ─────────────────────────────────────────── */

function updateEngineIndicator() {
  const el = document.getElementById("gwp-status-engine");
  const btn = document.getElementById("gwp-ai-toggle");
  const prefs = loadData().preferences;
  if (!el) return;

  const webllmOn = prefs.useWebLLM;
  if (btn) btn.className = `gwp-ai-toggle ${webllmOn ? "active" : "inactive"}`;

  if (webllmLoading) { el.textContent = "⏳ loading AI…"; el.style.opacity = "0.7"; return; }
  if (!useRuleBased && webllmEngine) {
    el.textContent = "⚡ WebLLM";
    el.style.opacity = "0.7";
  } else {
    el.textContent = "⚙️ Rule Engine";
    el.style.opacity = "0.5";
  }
}

async function initWebLLM() {
  const prefs = loadData().preferences;
  if (!prefs.useWebLLM) { useRuleBased = true; updateEngineIndicator(); return; }

  if (typeof navigator === "undefined" || !navigator.gpu) {
    useRuleBased = true;
    updateEngineIndicator();
    return;
  }

  webllmLoading = true;
  updateEngineIndicator();
  const label = document.getElementById("gwp-status-label");
  if (label) label.textContent = "Loading AI model…";

  try {
    const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
    webllmEngine = await CreateMLCEngine(WEBLLM_MODEL, {
      initProgressCallback: (progress: any) => {
        const pct = progress.progress !== undefined ? ` (${(progress.progress * 100).toFixed(0)}%)` : "";
        if (label) label.textContent = `Loading AI model${pct}`;
      },
    });
    webllmLoading = false;
    useRuleBased = false;
    if (label) label.textContent = "AI model ready";
  } catch (err) {
    console.error("WebLLM init failed:", err);
    webllmEngine = null;
    webllmLoading = false;
    useRuleBased = true;
    if (label) label.textContent = "Rule-based engine (fallback)";
  }
  updateEngineIndicator();
}

/* ── Panel Toggle ──────────────────────────────────────────── */

function togglePanel() {
  open = !open;
  document.getElementById("gwp-panel")!.classList.toggle("open", open);
  if (open) initPanel();
}

function hasData(d: AppData | null): boolean {
  if (!d) return false;
  return !!(d.investments?.length || d.expenses?.length || d.goals?.length || d.emis?.length);
}

function totalCount(d: AppData): number {
  return (d.investments?.length || 0) + (d.expenses?.length || 0) +
         (d.goals?.length || 0) + (d.emis?.length || 0);
}

function updateStatus(): boolean {
  const d = loadData();
  const dot = document.getElementById("gwp-status-dot")!;
  const label = document.getElementById("gwp-status-label")!;
  const count = document.getElementById("gwp-status-count")!;
  updateEngineIndicator();
  if (!hasData(d)) {
    dot.className = "gwp-status-dot empty";
    label.textContent = "No data loaded";
    count.textContent = "";
    return false;
  }
  dot.className = "gwp-status-dot loaded";
  label.textContent = "Portfolio data loaded";
  count.textContent = `${totalCount(d)} records`;
  return true;
}

function initPanel() {
  const loaded = updateStatus();
  const body = document.getElementById("gwp-body")!;
  const msgArea = document.getElementById("gwp-messages")!;
  const inputArea = document.getElementById("gwp-input-area")!;

  if (!loaded) {
    msgArea.innerHTML = `
      <div class="gwp-no-data">
        <p>No portfolio data available.</p>
        <p style="font-size:12px">Upload a JSON or CSV file to get started, or add data via the Dashboard.</p>
        <button class="btn-primary" onclick="document.getElementById('gwp-file-input').click()">Upload File</button>
        <span class="gwp-upload-hint">Supports .json (AppData format) and .csv (name,type,amount,currentValue)</span>
      </div>`;
    inputArea.style.display = "none";
    setupScrollButton();
    return;
  }
  inputArea.style.display = "flex";
  msgArea.innerHTML = `
    <div class="gwp-msg bot">
      <strong>Portfolio Assistant</strong> — I can analyze your investments, expenses, goals, and more. Try one of these:
      <div class="gwp-suggestions">
        <button data-q="What's my total portfolio value?">Total value</button>
        <button data-q="Show my asset allocation">Allocation</button>
        <button data-q="What are my top holdings?">Top holdings</button>
        <button data-q="How are my investments performing?">Performance</button>
        <button data-q="Show my expenses by category">Expenses</button>
      </div>
      <div class="ts">ready</div>
    </div>`;
  setupScrollButton();
  msgArea.querySelectorAll("[data-q]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById("gwp-input") as HTMLInputElement;
      if (input) { input.value = (btn as HTMLElement).dataset.q || ""; handleSend(); }
    });
  });
  setInputEnabled(true);
}

let _scrollWired = false;

function setupScrollButton() {
  const msgArea = document.getElementById("gwp-messages")!;
  const btn = document.getElementById("gwp-scroll-down") as HTMLButtonElement;
  if (!btn) return;

  if (!_scrollWired) {
    _scrollWired = true;
    msgArea.addEventListener("scroll", () => {
      const isNearBottom = msgArea.scrollHeight - msgArea.scrollTop - msgArea.clientHeight < 100;
      btn.classList.toggle("visible", !isNearBottom);
    });
  }
  btn.addEventListener("click", () => {
    msgArea.scrollTo({ top: msgArea.scrollHeight, behavior: "smooth" });
    btn.classList.remove("visible");
  });
}

function setInputEnabled(enabled: boolean) {
  const input = document.getElementById("gwp-input") as HTMLInputElement;
  const btn = document.getElementById("gwp-send-btn") as HTMLButtonElement;
  if (input) input.disabled = !enabled;
  if (btn) btn.disabled = !enabled;
  if (enabled && input) input.focus();
}

let msgId = 0;

function addMessage(role: "user" | "bot", html: string) {
  const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const div = document.createElement("div");
  div.className = `gwp-msg ${role}`;
  div.dataset.msgId = String(++msgId);
  div.innerHTML = `${html}<div class="ts">${ts}</div>`;
  const msgArea = document.getElementById("gwp-messages")!;
  msgArea.appendChild(div);
  const isNearBottom = msgArea.scrollHeight - msgArea.scrollTop - msgArea.clientHeight < 100;
  if (isNearBottom) div.scrollIntoView({ behavior: "smooth" });
  return div;
}

function marked(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^- (.+)/gm, "• $1");
}

/* ── Analysis Engine ───────────────────────────────────────── */

type PortfolioData = ReturnType<typeof buildData>;

function buildData() {
  const d = loadData();
  const invs = d.investments || [];
  const exps = d.expenses || [];
  const goals = d.goals || [];
  const emis = d.emis || [];

  const totalInv = invs.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCur = invs.reduce((s, i) => s + (i.currentValue || 0), 0);
  const totalGain = totalCur - totalInv;
  const gainPct = totalInv > 0 ? Number(((totalGain / totalInv) * 100).toFixed(1)) : 0;

  const byType: Record<string, { inv: number; cur: number }> = {};
  invs.forEach(i => {
    if (!byType[i.type]) byType[i.type] = { inv: 0, cur: 0 };
    byType[i.type].inv += i.amount || 0;
    byType[i.type].cur += i.currentValue || 0;
  });

  const topHoldings = [...invs].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0)).slice(0, 5);

  const income = exps.filter(e => e.type === "income").reduce((s, e) => s + (e.amount || 0), 0);
  const expense = exps.filter(e => e.type !== "income").reduce((s, e) => s + (e.amount || 0), 0);
  const byCat: Record<string, number> = {};
  exps.filter(e => e.type !== "income").forEach(e => {
    byCat[e.category] = (byCat[e.category] || 0) + (e.amount || 0);
  });

  const totalEMI = emis.reduce((s, e) => s + (e.emi || 0), 0);
  const totalOut = emis.reduce((s, e) => s + (e.outstanding || 0), 0);

  return { totalInv, totalCur, totalGain, gainPct, byType, topHoldings, income, expense, byCat, totalEMI, totalOut, goals, invs, exps, emis };
}

function analyze(q: string): string {
  const d = buildData();
  const lq = q.toLowerCase();

  if (/total|value|worth|portfolio/.test(lq)) {
    return `<strong>Portfolio Summary</strong>
<p>Total Invested: <strong>₹${d.totalInv.toLocaleString("en-IN")}</strong></p>
<p>Current Value: <strong>₹${d.totalCur.toLocaleString("en-IN")}</strong></p>
<p>Gain/Loss: <strong style="color:${d.totalGain >= 0 ? "var(--color-gain,#10b981)" : "var(--color-loss,#ef4444)"}">${d.totalGain >= 0 ? "+" : ""}₹${d.totalGain.toLocaleString("en-IN")} (${d.gainPct}%)</strong></p>
${d.income > 0 || d.expense > 0 ? `<p>Monthly Income: ₹${d.income.toLocaleString("en-IN")} | Expenses: ₹${d.expense.toLocaleString("en-IN")}</p>` : ""}
${d.totalOut > 0 ? `<p>Total EMI Outstanding: <strong>₹${d.totalOut.toLocaleString("en-IN")}</strong> (₹${d.totalEMI.toLocaleString("en-IN")}/mo)</p>` : ""}`;
  }

  if (/allocat|diversif|pie|breakdown|sector|type/.test(lq)) {
    const entries = Object.entries(d.byType).sort((a, b) => b[1].cur - a[1].cur);
    if (entries.length === 0) return "No investments found.";
    const html = entries.map(([type, v]) => {
      const pct = d.totalCur > 0 ? ((v.cur / d.totalCur) * 100).toFixed(1) : "0";
      return `• <strong>${type}</strong>: ₹${v.cur.toLocaleString("en-IN")} (${pct}%)`;
    }).join("<br>");
    setTimeout(() => renderChart({
      type: "doughnut",
      title: "Asset Allocation",
      labels: entries.map(([t]) => t),
      data: entries.map(([, v]) => v.cur),
    }), 50);
    return `<strong>Asset Allocation</strong><p>${html}</p>`;
  }

  if (/top|holding|largest|biggest|concentrat/.test(lq)) {
    if (d.topHoldings.length === 0) return "No investments found.";
    const html = d.topHoldings.map((i, idx) => {
      const pct = d.totalCur > 0 ? (((i.currentValue || 0) / d.totalCur) * 100).toFixed(1) : "0";
      const gain = (i.currentValue || 0) - (i.amount || 0);
      return `${idx + 1}. <strong>${i.name}</strong> — ₹${(i.currentValue || 0).toLocaleString("en-IN")} (${pct}%) — ${gain >= 0 ? "+" : ""}₹${gain.toLocaleString("en-IN")}`;
    }).join("<br>");
    return `<strong>Top Holdings</strong><p>${html}</p>`;
  }

  if (/perform|return|gain|profit|pnl|growth/.test(lq)) {
    if (d.invs.length === 0) return "No investments found.";
    const winners = d.invs.filter(i => (i.currentValue || 0) > (i.amount || 0)).length;
    const losers = d.invs.filter(i => (i.currentValue || 0) < (i.amount || 0)).length;
    const best = [...d.invs].sort((a, b) => ((b.currentValue || 0) - (b.amount || 0)) - ((a.currentValue || 0) - (a.amount || 0)))[0];
    const worst = [...d.invs].sort((a, b) => ((a.currentValue || 0) - (a.amount || 0)) - ((b.currentValue || 0) - (b.amount || 0)))[0];
    const bestGain = best ? (best.currentValue || 0) - (best.amount || 0) : 0;
    const worstGain = worst ? (worst.currentValue || 0) - (worst.amount || 0) : 0;
    return `<strong>Performance Summary</strong>
<p>Overall: <strong style="color:${d.totalGain >= 0 ? "var(--color-gain,#10b981)" : "var(--color-loss,#ef4444)"}">${d.totalGain >= 0 ? "+" : ""}${d.gainPct}%</strong></p>
<p>Winners: <strong style="color:var(--color-gain,#10b981)">${winners}</strong> | Losers: <strong style="color:var(--color-loss,#ef4444)">${losers}</strong></p>
${best ? `<p>Best: <strong>${best.name}</strong> ${bestGain >= 0 ? "+" : ""}₹${bestGain.toLocaleString("en-IN")}</p>` : ""}
${worst ? `<p>Worst: <strong>${worst.name}</strong> ${worstGain >= 0 ? "+" : ""}₹${worstGain.toLocaleString("en-IN")}</p>` : ""}`;
  }

  if (/expense|spend|categor|budget|income/.test(lq)) {
    const entries = Object.entries(d.byCat).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return "No expenses recorded.";
    const html = entries.map(([cat, amt]) => `• <strong>${cat}</strong>: ₹${amt.toLocaleString("en-IN")}`).join("<br>");
    setTimeout(() => renderChart({
      type: "bar",
      title: "Expenses by Category",
      labels: entries.map(([c]) => c),
      data: entries.map(([, a]) => a),
    }), 50);
    return `<strong>Expenses by Category</strong><p>Total: <strong>₹${d.expense.toLocaleString("en-IN")}</strong></p><p>${html}</p>`;
  }

  if (/goal|target|savings|future/.test(lq)) {
    if (d.goals.length === 0) return "No goals set. Use the Goals page to add financial goals.";
    const html = d.goals.map(g => {
      const pct = g.target > 0 ? Math.min(100, ((g.current || 0) / g.target) * 100).toFixed(1) : "0";
      return `• <strong>${g.name}</strong>: ₹${(g.current || 0).toLocaleString("en-IN")} / ₹${g.target.toLocaleString("en-IN")} (${pct}%)`;
    }).join("<br>");
    return `<strong>Goal Progress</strong><p>${html}</p>`;
  }

  if (/emi|loan|debt|outstanding|borrow/.test(lq)) {
    if (d.emis.length === 0) return "No active loans or EMIs.";
    const html = d.emis.map(e => `• <strong>${e.name}</strong>: ₹${(e.outstanding || 0).toLocaleString("en-IN")} outstanding — ₹${(e.emi || 0).toLocaleString("en-IN")}/mo`).join("<br>");
    return `<strong>Loans & EMIs</strong><p>Total Outstanding: <strong>₹${d.totalOut.toLocaleString("en-IN")}</strong></p><p>${html}</p>`;
  }

  if (/currency|forex|multi|foreign|usd|eur/.test(lq)) {
    const foreign = d.invs.filter(i => i.currency && i.currency !== "INR");
    if (foreign.length === 0) return "No foreign currency investments found. You can add currency info when editing an investment.";
    const html = foreign.map(i => `• <strong>${i.name}</strong>: ${i.currency} ${(i.currentValue || 0).toLocaleString("en")}`).join("<br>");
    return `<strong>Foreign Currency Investments</strong><p>${html}</p>`;
  }

  if (/networth|net worth|wealth/.test(lq)) {
    const assets = d.totalCur;
    const liabilities = d.totalOut;
    const networth = assets - liabilities;
    return `<strong>Net Worth</strong>
<p>Total Assets: <strong>₹${assets.toLocaleString("en-IN")}</strong></p>
<p>Total Liabilities: <strong>₹${liabilities.toLocaleString("en-IN")}</strong></p>
<p>Net Worth: <strong style="color:${networth >= 0 ? "var(--color-gain,#10b981)" : "var(--color-loss,#ef4444)"}">₹${networth.toLocaleString("en-IN")}</strong></p>`;
  }

  if (/risk|volatile|safe|conservative|aggressive/.test(lq)) {
    if (d.invs.length === 0) return "No investments found.";
    const high = d.invs.filter(i => (i.risk || 5) >= 7);
    const low = d.invs.filter(i => (i.risk || 5) <= 3);
    return `<strong>Risk Assessment</strong>
<p>High Risk (7-10): <strong>${high.length}</strong> investments</p>
<p>Low Risk (1-3): <strong>${low.length}</strong> investments</p>
<p>Average Risk Score: <strong>${(d.invs.reduce((s, i) => s + (i.risk || 5), 0) / d.invs.length).toFixed(1)}</strong>/10</p>`;
  }

  if (/chart|graph|visualize|plot/.test(lq)) {
    const entries = Object.entries(d.byType).sort((a, b) => b[1].cur - a[1].cur);
    if (entries.length > 0) {
      setTimeout(() => renderChart({
        type: "doughnut",
        title: "Asset Allocation",
        labels: entries.map(([t]) => t),
        data: entries.map(([, v]) => v.cur),
      }), 50);
      return `<strong>Asset Allocation Chart</strong>`;
    }
    return "No data available for charting.";
  }

  return `<p>I can help with:</p>
<div class="gwp-suggestions">
  <button data-q="What's my total portfolio value?">Total value</button>
  <button data-q="Show my asset allocation">Allocation</button>
  <button data-q="What are my top holdings?">Top holdings</button>
  <button data-q="How are my investments performing?">Performance</button>
  <button data-q="Show my expenses by category">Expenses</button>
  <button data-q="What are my goals?">Goals</button>
  <button data-q="Show my EMI summary">EMI</button>
  <button data-q="What's my net worth?">Net worth</button>
</div>
<p style="margin-top:8px;font-size:11px;opacity:0.7">Or type your own question above.</p>`;
}

function renderChart(config: any) {
  if (currentChart) { currentChart.destroy(); currentChart = null; }

  const lastMsg = document.querySelector("#gwp-messages .gwp-msg.bot:last-child") as HTMLElement;
  if (!lastMsg) return;

  const wrapper = document.createElement("div");
  wrapper.className = "gwp-chart-area";
  wrapper.innerHTML = `<div class="gwp-chart-title">${config.title || ""}</div><canvas></canvas>`;

  const existing = lastMsg.querySelector(".gwp-chart-area");
  if (existing) existing.remove();
  lastMsg.appendChild(wrapper);

  const canvas = wrapper.querySelector("canvas")!;
  const colors = config.colors || ["#c9a961","#0070f3","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4"];
  const isDark = document.documentElement.classList.contains("dark");
  const borderColor = isDark ? "#1a1a18" : "#ffffff";

  const chartConfig: any = {
    type: config.type || "doughnut",
    data: {
      labels: config.labels || [],
      datasets: [{
        data: config.data || [],
        backgroundColor: colors.slice(0, (config.data || []).length),
        borderWidth: 2, borderColor,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: { display: config.type !== "bar", position: "bottom", labels: { boxWidth: 10, padding: 8, font: { size: 11, color: isDark ? "#a0a09a" : "#5c5a55" } } },
        tooltip: { enabled: true },
      },
    },
  };

  if (config.type === "bar" || config.type === "line") {
    chartConfig.options.scales = {
      y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.06)" }, ticks: { font: { size: 10 }, color: isDark ? "#a0a09a" : "#5c5a55" } },
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: isDark ? "#a0a09a" : "#5c5a55" } },
    };
  }
  if (config.type === "line") {
    chartConfig.data.datasets[0].borderColor = colors[0];
    chartConfig.data.datasets[0].backgroundColor = colors[0] + "22";
    chartConfig.data.datasets[0].fill = true;
    chartConfig.data.datasets[0].tension = 0.3;
    chartConfig.data.datasets[0].pointRadius = 3;
  }

  try {
    currentChart = new (Chart as any)(canvas.getContext("2d"), chartConfig);
  } catch {}
}

async function handleSend() {
  const input = document.getElementById("gwp-input") as HTMLInputElement;
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  addMessage("user", marked(text));
  input.value = "";
  setInputEnabled(false);

  const loaded = updateStatus();
  if (!loaded) {
    addMessage("bot", "No portfolio data available. Please upload a file to continue.");
    setInputEnabled(true);
    return;
  }

  if (!useRuleBased && webllmEngine) {
    try {
      const d = loadData();
      const context = `You are a portfolio analysis assistant. Here is the user's portfolio data in JSON:\n${JSON.stringify(d, null, 2)}\n\nAnswer the user's question based on this data. Keep responses concise and use Indian Rupee (₹) formatting. If the question is not about the portfolio data, politely decline.`;
      const reply = await webllmEngine.chat.completions.create({
        messages: [
          { role: "system", content: context },
          { role: "user", content: text },
        ],
      });
      const answer = reply.choices[0]?.message?.content || "I couldn't generate a response.";
      addMessage("bot", marked(answer));
    } catch (err) {
      console.error("WebLLM inference failed:", err);
      addMessage("bot", analyze(text));
    }
    setInputEnabled(true);
    return;
  }

  setTimeout(() => {
    const answer = analyze(text);
    addMessage("bot", answer);
    setInputEnabled(true);

    setTimeout(() => {
      document.querySelectorAll("#gwp-messages .gwp-suggestions button[data-q]").forEach(btn => {
        btn.addEventListener("click", () => {
          const inp = document.getElementById("gwp-input") as HTMLInputElement;
          if (inp) { inp.value = (btn as HTMLElement).dataset.q || ""; handleSend(); }
        });
      });
    }, 50);
  }, 300);
}

function handleClear() {
  if (!confirm("Clear all portfolio data? This cannot be undone.")) return;
  clearStore();
  updateStatus();

  const msgArea = document.getElementById("gwp-messages")!;
  const inputArea = document.getElementById("gwp-input-area")!;
  msgArea.innerHTML = `
    <div class="gwp-no-data">
      <p>Data cleared. Upload a file to get started.</p>
      <button class="btn-primary" onclick="document.getElementById('gwp-file-input').click()">Upload File</button>
    </div>`;
  inputArea.style.display = "none";
}

function handleAIToggle() {
  const btn = document.getElementById("gwp-ai-toggle")!;
  const label = document.getElementById("gwp-status-label");
  const prefs = loadData().preferences;
  const newVal = !prefs.useWebLLM;
  updateData((d) => { d.preferences.useWebLLM = newVal; });

  if (newVal) {
    useRuleBased = true;
    webllmEngine = null;
    btn.className = "gwp-ai-toggle active";
    if (label) label.textContent = "Enabling AI model…";
    initWebLLM();
  } else {
    useRuleBased = true;
    webllmEngine = null;
    webllmLoading = false;
    btn.className = "gwp-ai-toggle inactive";
    if (label) label.textContent = "Rule-based engine";
    updateEngineIndicator();
  }
}

async function handleFileUpload(this: HTMLInputElement) {
  const file = this.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (file.name.endsWith(".json")) {
      const data = JSON.parse(text) as AppData;
      saveData(data);
    } else if (file.name.endsWith(".csv")) {
      const rows = parseCSV(text);
      const investments: Investment[] = rows.map((r: any) => ({
        id: crypto.randomUUID(),
        name: r.name || r.Name || "Unknown",
        type: r.type || r.Type || "Equity",
        amount: parseFloat(r.amount || r.Amount || 0),
        currentValue: parseFloat(r.currentValue || r["Current Value"] || r.CurrentValue || 0),
        currency: r.currency || r.Currency || "INR",
        risk: parseInt(r.risk || r.Risk || 5),
        date: new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      const existing = loadData();
      existing.investments = investments;
      saveData(existing);
    }
    updateStatus();
    initPanel();
    addMessage("bot", `✅ File "${file.name}" imported with portfolio data. Ask me anything!`);
  } catch (err) {
    console.error("Import error:", err);
    addMessage("bot", "⚠️ Failed to parse file. Use valid JSON or CSV format.");
  }
  this.value = "";
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  });
}

document.addEventListener("DOMContentLoaded", createWidget);
