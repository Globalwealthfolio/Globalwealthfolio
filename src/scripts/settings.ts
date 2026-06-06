import { loadData, updateData, clearData, addAudit, subscribe } from "../lib/store";
import type { LangCode } from "../lib/i18n";
import { getBrowserCurrency, type CurrencyCode } from "../lib/currency";

function populateUI() {
  const data = loadData();
  const prefs = data.preferences;
  (document.getElementById("set-currency") as HTMLSelectElement).value = prefs.currency;
  (document.getElementById("set-language") as HTMLSelectElement).value = prefs.language;
  (document.getElementById("set-income") as HTMLInputElement).value = String(prefs.monthlyIncome);
  (document.getElementById("set-base-date") as HTMLInputElement).value = prefs.portfolioBaseDate;
  (document.getElementById("set-notifications") as HTMLInputElement).checked = prefs.notifications;
  // Set active theme button
  document.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.theme === prefs.theme));
  });
  document.documentElement.lang = prefs.language;
  document.documentElement.dir = prefs.language === "ar" ? "rtl" : "ltr";
}

document.getElementById("set-currency")?.addEventListener("change", (e) => {
  const code = (e.target as HTMLSelectElement).value as CurrencyCode;
  window.gwp?.setCurrency(code);
  addAudit({ action: "update", entity: "settings", description: `Set currency to ${code}` });
});

document.getElementById("set-language")?.addEventListener("change", (e) => {
  const code = (e.target as HTMLSelectElement).value as LangCode;
  window.gwp?.setLanguage(code);
  addAudit({ action: "update", entity: "settings", description: `Set language to ${code}` });
});

document.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const theme = btn.dataset.theme as "light" | "dark" | "system";
    window.gwp?.setTheme(theme);
    addAudit({ action: "update", entity: "settings", description: `Set theme to ${theme}` });
    document.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach((b) => {
      b.setAttribute("aria-selected", String(b === btn));
    });
  });
});

document.getElementById("set-income")?.addEventListener("change", (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  updateData((data) => {
    data.preferences.monthlyIncome = isNaN(v) ? 0 : v;
  });
  addAudit({ action: "update", entity: "settings", description: `Set monthly income` });
});

document.getElementById("set-base-date")?.addEventListener("change", (e) => {
  const v = (e.target as HTMLInputElement).value;
  updateData((data) => {
    data.preferences.portfolioBaseDate = v;
  });
  addAudit({ action: "update", entity: "settings", description: `Set portfolio base date` });
});

document.getElementById("set-notifications")?.addEventListener("change", (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  updateData((data) => {
    data.preferences.notifications = checked;
  });
});

document.getElementById("reset-data")?.addEventListener("click", () => {
  if (!confirm("This will permanently delete all your data on this device. Are you sure?")) return;
  if (!confirm("Really sure? This cannot be undone.")) return;
  clearData();
  // Re-detect currency + language
  const currency = getBrowserCurrency();
  const lang = (navigator.language?.split("-")[0] ?? "en") as LangCode;
  updateData((data) => {
    data.preferences.currency = currency;
    data.preferences.language = lang === "ar" || ["en","hi","es","fr","de","ja","zh","pt","ru"].includes(lang) ? lang : "en";
  });
  populateUI();
  alert("All data cleared.");
});

subscribe(populateUI);
populateUI();
