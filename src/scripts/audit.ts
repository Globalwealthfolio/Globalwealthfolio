import { loadData, updateData, subscribe } from "../lib/store";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function actionColor(action: string): string {
  if (action === "delete") return "text-loss";
  if (action === "create") return "text-gain";
  if (action === "import") return "text-link";
  if (action === "export") return "text-mute";
  return "text-body";
}

function render() {
  const data = loadData();
  const tbody = document.getElementById("audit-tbody");
  if (!tbody) return;
  if (data.auditLog.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5xl text-body text-body">No activity recorded yet. As you use the app, every change will show up here.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.auditLog
    .map((e) => {
      const d = new Date(e.timestamp);
      const dateStr = `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      return `
        <tr class="border-t border-hairline hover:bg-canvas-soft">
          <td class="py-sm px-md text-caption text-mute font-mono whitespace-nowrap max-sm:text-[10px]">${dateStr}</td>
          <td class="py-sm px-md"><span class="badge max-sm:text-[10px] ${actionColor(e.action)}">${e.action}</span></td>
          <td class="py-sm px-md hide-mobile"><span class="badge">${e.entity}</span></td>
          <td class="py-sm px-md text-body max-sm:text-xs">${esc(e.description)}</td>
        </tr>`;
    })
    .join("");
}

document.getElementById("clear-log")?.addEventListener("click", () => {
  if (!confirm("Clear the entire activity log? This cannot be undone.")) return;
  updateData((data) => {
    data.auditLog = [];
  });
});

subscribe(render);
render();
