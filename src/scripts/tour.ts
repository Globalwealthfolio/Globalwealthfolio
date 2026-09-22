type Step = {
  id: string;
  title: string;
  body: string;
  icon: string;
};

const STEPS: Step[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    body: "Your home base. Net worth, allocation, and recent activity — start every visit here.",
    icon: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  },
  {
    id: "investments",
    title: "Investments",
    body: "Add stocks, funds, gold, or crypto. Values and returns update instantly.",
    icon: '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
  },
  {
    id: "expenses",
    title: "Expenses",
    body: "Log spending and see where money goes each month — categories stay simple.",
    icon: '<path d="M4 7h16v12H4z"/><path d="M4 7l1.5-3h13L20 7"/><circle cx="12" cy="13" r="2"/>',
  },
  {
    id: "goals",
    title: "Goals",
    body: "Set a target like retirement or a home. We show whether you are on track.",
    icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  },
  {
    id: "calculators",
    title: "Calculators",
    body: "SIP, retirement, and compound-interest tools. Pick a card, get an answer.",
    icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="4" rx="1"/><circle cx="9" cy="14" r="1"/><circle cx="12" cy="14" r="1"/><circle cx="15" cy="14" r="1"/><circle cx="9" cy="17.5" r="1"/><circle cx="12" cy="17.5" r="1"/><circle cx="15" cy="17.5" r="1"/>',
  },
  {
    id: "blog",
    title: "Blog",
    body: "Short, practical guides on investing, budgeting, and planning.",
    icon: '<path d="M5 4h14v16H5z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
  },
  {
    id: "emi",
    title: "EMI",
    body: "Plan loan payments and see how extra instalments finish debt sooner.",
    icon: '<path d="M3 10l9-6 9 6"/><path d="M5 10v9"/><path d="M9.5 10v9"/><path d="M14.5 10v9"/><path d="M19 10v9"/><path d="M3 19h18"/>',
  },
  {
    id: "import",
    title: "Import",
    body: "Drop a CSV or Excel file — or scan a statement — and you are set in a minute.",
    icon: '<path d="M12 3v11"/><polyline points="7 9 12 14 17 9"/><path d="M4 20h16"/>',
  },
  {
    id: "benchmarks",
    title: "Benchmark your portfolio",
    body: "Compare your returns against NIFTY 50, S&P 500, Gold, and more.",
    icon: '<line x1="4" y1="20" x2="20" y2="20"/><rect x="5" y="12" width="3.5" height="6" rx="1"/><rect x="10.25" y="8" width="3.5" height="10" rx="1"/><rect x="15.5" y="4" width="3.5" height="14" rx="1"/>',
  },
];

const STORE_KEY = "gwp:tour:v1";

const APP_PREFIXES = [
  "/dashboard",
  "/investments",
  "/expenses",
  "/goals",
  "/calculators",
  "/blog",
  "/emi",
  "/import",
  "/benchmarks",
];

const root = document.getElementById("gwp-tour");
const spot = root?.querySelector<HTMLElement>("[data-tour-spot]");
const card = root?.querySelector<HTMLElement>("[data-tour-card]");
const progressEl = root?.querySelector<HTMLElement>("[data-tour-progress]");
const titleEl = root?.querySelector<HTMLElement>("[data-tour-title]");
const bodyEl = root?.querySelector<HTMLElement>("[data-tour-body]");
const iconEl = root?.querySelector<HTMLElement>("[data-tour-icon]");
const dotsEl = root?.querySelector<HTMLElement>("[data-tour-dots]");
const nextBtn = root?.querySelector<HTMLButtonElement>("[data-tour-next]");
const backBtn = root?.querySelector<HTMLButtonElement>("[data-tour-back]");
const skipBtn = root?.querySelector<HTMLButtonElement>("[data-tour-skip]");

let index = 0;
let active = false;
let raf = 0;

function isDone(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === "1";
  } catch {
    return false;
  }
}

function setDone(): void {
  try {
    localStorage.setItem(STORE_KEY, "1");
  } catch {}
}

function visible(el: Element | null): el is HTMLElement {
  if (!el || (el as HTMLElement).getClientRects().length === 0) return false;
  const cs = getComputedStyle(el as HTMLElement);
  if (cs.visibility !== "visible") return false;
  if (parseFloat(cs.opacity) === 0) return false;
  return true;
}

const MORE_DROPDOWN = "[data-nav-more-dropdown]";

function inMoreDropdown(step: Step): boolean {
  return !!document.querySelector(`${MORE_DROPDOWN} [data-tour="${step.id}"]`);
}

function setMoreOpen(open: boolean): void {
  const dd = document.querySelector<HTMLElement>(MORE_DROPDOWN);
  if (!dd) return;
  const btn = dd.previousElementSibling as HTMLButtonElement | null;
  if (open) {
    dd.style.visibility = "visible";
    dd.style.opacity = "1";
    btn?.setAttribute("aria-expanded", "true");
  } else {
    dd.style.removeProperty("visibility");
    dd.style.removeProperty("opacity");
    btn?.setAttribute("aria-expanded", "false");
  }
}

function findTarget(step: Step): HTMLElement | null {
  const section = document.querySelector<HTMLElement>(`main [data-tour="${step.id}"]`);
  if (visible(section)) return section;

  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${step.id}"]`);
  for (const el of candidates) {
    if (visible(el)) return el;
  }

  const fallback = document.querySelector<HTMLElement>("[data-tour-nav-fallback]");
  return visible(fallback) ? fallback : null;
}

function placeCard(target: DOMRect | null, avoid: DOMRect | null = null): void {
  if (!card) return;
  const gap = 14;
  const margin = 12;
  const cr = card.getBoundingClientRect();
  const maxTop = Math.max(margin, window.innerHeight - cr.height - margin);
  const maxLeft = Math.max(margin, window.innerWidth - cr.width - margin);

  if (!target || target.width === 0) {
    card.style.top = `${Math.max(margin, (window.innerHeight - cr.height) / 2)}px`;
    card.style.left = `${Math.max(margin, (window.innerWidth - cr.width) / 2)}px`;
    return;
  }

  let top = target.bottom + gap;
  if (top + cr.height > window.innerHeight - margin) {
    const above = target.top - gap - cr.height;
    top = above >= margin ? above : maxTop;
  }

  let left = target.left + target.width / 2 - cr.width / 2;

  if (avoid && avoid.width > 0) {
    const overlaps =
      left < avoid.right + gap &&
      left + cr.width > avoid.left - gap &&
      top < avoid.bottom + gap &&
      top + cr.height > avoid.top - gap;
    if (overlaps) {
      const toLeft = avoid.left - gap - cr.width;
      const toRight = avoid.right + gap;
      if (toLeft >= margin) {
        left = toLeft;
      } else if (toRight + cr.width <= window.innerWidth - margin) {
        left = toRight;
      } else {
        top = avoid.bottom + gap;
        left = avoid.left + avoid.width / 2 - cr.width / 2;
      }
    }
  }

  top = Math.min(Math.max(margin, top), maxTop);
  left = Math.min(Math.max(margin, left), maxLeft);

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

function layout(): void {
  const step = STEPS[index];
  if (!step || !card || !spot) return;

  const target = findTarget(step);

  if (!target) {
    spot.hidden = true;
    placeCard(null);
    return;
  }

  const r = target.getBoundingClientRect();
  const pad = 6;
  spot.hidden = false;
  spot.style.top = `${r.top - pad}px`;
  spot.style.left = `${r.left - pad}px`;
  spot.style.width = `${r.width + pad * 2}px`;
  spot.style.height = `${r.height + pad * 2}px`;

  let anchor = r;
  let avoid: DOMRect | null = null;

  if (inMoreDropdown(step)) {
    const more = document.querySelector<HTMLElement>("[data-nav-more]");
    const dd = document.querySelector<HTMLElement>(MORE_DROPDOWN);
    const mr = more?.getBoundingClientRect();
    if (more && mr && mr.width > 0) {
      anchor = mr;
      const dr = dd?.getBoundingClientRect();
      if (dd && dr && dr.width > 0) avoid = dr;
    }
  }

  placeCard(anchor, avoid);
}

function render(): void {
  const step = STEPS[index];
  if (!step || !card) return;

  if (progressEl) progressEl.textContent = `Step ${index + 1} of ${STEPS.length}`;
  if (titleEl) titleEl.textContent = step.title;
  if (bodyEl) bodyEl.textContent = step.body;
  if (iconEl) {
    iconEl.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
      step.icon +
      "</svg>";
  }
  if (dotsEl) {
    dotsEl.innerHTML = STEPS.map((_, i) =>
      i === index ? '<span class="is-active"></span>' : "<span></span>"
    ).join("");
  }
  if (backBtn) backBtn.hidden = index === 0;
  if (nextBtn) nextBtn.textContent = index === STEPS.length - 1 ? "Get started" : "Next";

  setMoreOpen(inMoreDropdown(step));
  layout();
  card.focus();
}

function scheduleLayout(): void {
  if (!active || raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    layout();
  });
}

function show(): void {
  if (!root || !card) return;
  active = true;
  index = 0;
  root.hidden = false;
  render();
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", scheduleLayout, { passive: true });
  window.addEventListener("resize", scheduleLayout);
}

function hide(markDone: boolean): void {
  if (!root) return;
  active = false;
  root.hidden = true;
  if (spot) spot.hidden = true;
  setMoreOpen(false);
  if (markDone) setDone();
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("scroll", scheduleLayout);
  window.removeEventListener("resize", scheduleLayout);
}

function next(): void {
  if (index >= STEPS.length - 1) {
    hide(true);
    return;
  }
  index += 1;
  render();
}

function back(): void {
  if (index === 0) return;
  index -= 1;
  render();
}

function onKey(e: KeyboardEvent): void {
  if (!active) return;
  if (e.key === "Escape") {
    e.preventDefault();
    hide(true);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    next();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    back();
  }
}

function shouldStart(): boolean {
  if (new URLSearchParams(location.search).has("tour")) return true;
  if (document.documentElement.dataset.locked === "1") return false;
  if (isDone()) return false;
  return APP_PREFIXES.some((p) => location.pathname.startsWith(p));
}

nextBtn?.addEventListener("click", next);
backBtn?.addEventListener("click", back);
skipBtn?.addEventListener("click", () => hide(true));

document.addEventListener("gwp:start-tour", () => show());

function boot(): void {
  setTimeout(() => {
    if (shouldStart()) show();
  }, 700);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
