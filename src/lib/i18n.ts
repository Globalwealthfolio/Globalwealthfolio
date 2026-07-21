export const languages = {
  en: { name: "English", native: "English", flag: "🇬🇧", dir: "ltr" },
} as const;

export type LangCode = keyof typeof languages;

export const translations = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.investments": "Investments",
    "nav.expenses": "Expenses",
    "nav.goals": "Goals",
    "nav.benchmarks": "Benchmarks",
    "nav.emi": "EMI",
    "nav.audit": "Audit",
    "nav.settings": "Settings",
    "nav.import": "Import",
    "nav.signin": "Sign In",
    "nav.getstarted": "Get Started",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.close": "Close",
    "common.add": "Add",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.export": "Export",
    "common.import": "Import",
    "common.total": "Total",
    "common.amount": "Amount",
    "common.date": "Date",
    "common.name": "Name",
    "common.notes": "Notes",
    "common.all": "All",
    "common.loading": "Loading…",
    "common.empty": "No data yet",
    "common.confirm": "Confirm",
    "common.yes": "Yes",
    "common.no": "No",
  },
} as const;

export function t(lang: LangCode, key: keyof typeof translations.en): string {
  const dict = translations[lang] as Record<string, string> | undefined;
  if (dict && dict[key]) return dict[key];
  return translations.en[key] ?? key;
}

export function getBrowserLang(): LangCode {
  return "en";
}
