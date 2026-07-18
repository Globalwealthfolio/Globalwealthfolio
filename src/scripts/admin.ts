import emailjs from "@emailjs/browser";
import { loadData, updateData, addAudit, uid, nowISO } from "../lib/store";
import type { BlogPost } from "../lib/types";

// EmailJS config — set these in your EmailJS dashboard
const EMAILJS_PUBLIC_KEY = "rvTqHL_4iAM_yuGAG";
const EMAILJS_SERVICE_ID = "service_csuyz5u";
const EMAILJS_TEMPLATE_ID = "template_7mmdpca";
const ADMIN_EMAIL_KEY = "gwp:admin:email";

function getAdminEmail(): string {
  return localStorage.getItem(ADMIN_EMAIL_KEY) || "";
}

function setAdminEmail(email: string) {
  localStorage.setItem(ADMIN_EMAIL_KEY, email);
}

// Password storage
const PASSWORD_KEY = "gwp:admin:password";
const AUTH_KEY = "gwp:admin:auth";
const API_TOKEN_KEY = "gwp:admin:api-token";

function getStoredPassword(): string {
  return localStorage.getItem(PASSWORD_KEY) || "sourabh@007";
}

function setStoredPassword(pwd: string) {
  localStorage.setItem(PASSWORD_KEY, pwd);
}

function checkAuth(): boolean {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

function setAuth(val: boolean) {
  if (val) sessionStorage.setItem(AUTH_KEY, "1");
  else sessionStorage.removeItem(AUTH_KEY);
}

// --- UI refs ---
const loginScreen = document.getElementById("login-screen")!;
const forgotScreen = document.getElementById("forgot-screen")!;
const adminPanel = document.getElementById("admin-panel")!;
const passwordInput = document.getElementById("admin-password") as HTMLInputElement;
const loginBtn = document.getElementById("admin-login-btn")!;
const loginError = document.getElementById("login-error")!;
const forgotLink = document.getElementById("forgot-link")!;
const backToLogin = document.getElementById("back-to-login")!;
const forgotEmail = document.getElementById("forgot-email") as HTMLInputElement;
const sendOtpBtn = document.getElementById("send-otp-btn") as HTMLButtonElement;
const otpGroup = document.getElementById("otp-group")!;
const otpInput = document.getElementById("otp-input") as HTMLInputElement;
const verifyOtpBtn = document.getElementById("verify-otp-btn") as HTMLButtonElement;
const forgotStatus = document.getElementById("forgot-status")!;
const resetPasswordModal = document.getElementById("reset-password-modal") as HTMLDialogElement;
const newPasswordInput = document.getElementById("new-password") as HTMLInputElement;
const confirmPasswordInput = document.getElementById("confirm-password") as HTMLInputElement;
const savePasswordBtn = document.getElementById("save-password-btn")!;
const cancelResetBtn = document.getElementById("cancel-reset-btn")!;
const resetPasswordError = document.getElementById("reset-password-error")!;
const logoutBtn = document.getElementById("admin-logout-btn")!;
const addBtn = document.getElementById("add-blog")!;
const list = document.getElementById("admin-blog-list")!;
const modal = document.getElementById("blog-modal") as HTMLDialogElement;
const form = document.getElementById("blog-form") as HTMLFormElement;
const modalTitle = document.getElementById("blog-modal-title");
const apiTokenInput = document.getElementById("api-token") as HTMLInputElement;
const apiSyncStatus = document.getElementById("api-sync-status")!;

// --- Auth state ---
let currentOTP = "";
let otpExpiry = 0;

function showLogin() {
  loginScreen.style.display = "block";
  forgotScreen.style.display = "none";
  adminPanel.style.display = "none";
}

function showPanel() {
  loginScreen.style.display = "none";
  forgotScreen.style.display = "none";
  adminPanel.style.display = "block";
  renderAll();
  if (getApiToken()) {
    fetchPostsFromServer(true);
  }
}

if (checkAuth()) {
  showPanel();
} else {
  showLogin();
}

// --- API sync ---
function getApiToken(): string {
  return localStorage.getItem(API_TOKEN_KEY) || "";
}

function setApiToken(token: string) {
  localStorage.setItem(API_TOKEN_KEY, token);
}

async function syncPost(post: import("../lib/types").BlogPost, statusEl: HTMLElement): Promise<boolean> {
  const token = getApiToken();
  if (!token) {
    statusEl.textContent = "⚠ Set Admin Token first";
    statusEl.className = "text-caption text-loss";
    return false;
  }
  statusEl.textContent = "Syncing…";
  statusEl.className = "text-caption text-mute";
  try {
    const res = await fetch("/api/add-post", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: post.id, title: post.title, slug: post.slug, content: post.content, excerpt: post.excerpt, tags: post.tags, status: post.status, authorName: post.authorName, scheduledAt: post.scheduledAt }),
    });
    if (res.ok) {
      statusEl.textContent = "✓ Synced";
      statusEl.className = "text-caption text-gain";
      return true;
    }
    const data = await res.json().catch(() => ({}));
    statusEl.textContent = `✗ ${data.error || res.status}`;
    statusEl.className = "text-caption text-loss";
    return false;
  } catch {
    statusEl.textContent = "✗ Network error";
    statusEl.className = "text-caption text-loss";
    return false;
  }
}

async function syncPostToApi(post: import("../lib/types").BlogPost) {
  await syncPost(post, apiSyncStatus);
}

// --- Admin Token input ---
if (apiTokenInput) {
  apiTokenInput.value = getApiToken();
  apiTokenInput.addEventListener("input", () => {
    setApiToken(apiTokenInput.value.trim());
  });
}

// --- Resync button ---
const resyncBtn = document.getElementById("resync-btn");
resyncBtn?.addEventListener("click", async () => {
  const posts = loadData().blog;
  if (posts.length === 0) {
    apiSyncStatus.textContent = "No posts to sync";
    apiSyncStatus.className = "text-caption text-mute";
    return;
  }
  apiSyncStatus.textContent = `Resyncing ${posts.length} posts…`;
  apiSyncStatus.className = "text-caption text-mute";
  let ok = 0, fail = 0;
  for (const post of posts) {
    const temp = document.createElement("span");
    const success = await syncPost(post, temp);
    if (success) ok++; else fail++;
  }
  if (fail === 0) {
    apiSyncStatus.textContent = `✓ All ${ok} posts synced`;
    apiSyncStatus.className = "text-caption text-gain";
  } else {
    apiSyncStatus.textContent = `✓ ${ok} synced, ✗ ${fail} failed`;
    apiSyncStatus.className = "text-caption text-loss";
  }
});

// --- Login ---
loginBtn.addEventListener("click", () => {
  if (passwordInput.value === getStoredPassword()) {
    setAuth(true);
    showPanel();
    loginError.style.display = "none";
    passwordInput.value = "";
  } else {
    loginError.style.display = "block";
  }
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

logoutBtn.addEventListener("click", () => {
  setAuth(false);
  showLogin();
});

// --- Forgot password ---
forgotLink.addEventListener("click", () => {
  loginScreen.style.display = "none";
  forgotScreen.style.display = "block";
  otpGroup.style.display = "none";
  forgotEmail.value = getAdminEmail();
  forgotEmail.readOnly = false;
  forgotStatus.textContent = "";
  forgotStatus.className = "text-body-sm mt-sm";
  otpInput.value = "";
});

backToLogin.addEventListener("click", () => {
  forgotScreen.style.display = "none";
  loginScreen.style.display = "block";
});

sendOtpBtn.addEventListener("click", async () => {
  const email = forgotEmail.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    forgotStatus.textContent = "Enter a valid email address.";
    forgotStatus.className = "text-body-sm text-loss mt-sm";
    return;
  }
  setAdminEmail(email);
  currentOTP = crypto.randomUUID().replace(/\D/g, "").slice(0, 6);
  otpExpiry = Date.now() + 5 * 60 * 1000;
  sendOtpBtn.disabled = true;
  sendOtpBtn.textContent = "Sending...";
  forgotStatus.textContent = "";
  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      { otp: currentOTP, email, expiry: "5 minutes" },
      EMAILJS_PUBLIC_KEY,
    );
    forgotStatus.textContent = "OTP sent to your email.";
    forgotStatus.className = "text-body-sm text-gain mt-sm";
    otpGroup.style.display = "block";
    forgotEmail.readOnly = true;
  } catch {
    forgotStatus.textContent = "Failed to send OTP. Try again.";
    forgotStatus.className = "text-body-sm text-loss mt-sm";
  } finally {
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
  }
});

verifyOtpBtn.addEventListener("click", () => {
  const entered = otpInput.value.trim();
  if (!entered) {
    forgotStatus.textContent = "Please enter the OTP.";
    forgotStatus.className = "text-body-sm text-loss mt-sm";
    return;
  }
  if (Date.now() > otpExpiry) {
    forgotStatus.textContent = "OTP expired. Request a new one.";
    forgotStatus.className = "text-body-sm text-loss mt-sm";
    return;
  }
  if (entered !== currentOTP) {
    forgotStatus.textContent = "Incorrect OTP.";
    forgotStatus.className = "text-body-sm text-loss mt-sm";
    return;
  }
  forgotScreen.style.display = "none";
  resetPasswordModal.showModal();
  resetPasswordError.style.display = "none";
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";
});

cancelResetBtn.addEventListener("click", () => {
  resetPasswordModal.close();
  showLogin();
});

newPasswordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") savePasswordBtn.click();
});

confirmPasswordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") savePasswordBtn.click();
});

savePasswordBtn.addEventListener("click", () => {
  const pwd = newPasswordInput.value;
  const confirm = confirmPasswordInput.value;
  if (!pwd || pwd.length < 6) {
    resetPasswordError.textContent = "Password must be at least 6 characters.";
    resetPasswordError.style.display = "block";
    return;
  }
  if (pwd !== confirm) {
    resetPasswordError.textContent = "Passwords do not match.";
    resetPasswordError.style.display = "block";
    return;
  }
  setStoredPassword(pwd);
  resetPasswordModal.close();
  resetPasswordError.style.display = "none";
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";
  setAuth(true);
  showPanel();
});

// --- Helpers ---
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || `post-${Date.now().toString(36)}`
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDatetimeLocal(iso: string): string {
  try {
    const d = new Date(iso);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function autoPublishScheduled(): boolean {
  const now = new Date().toISOString();
  let changed = false;
  const data = loadData();
  data.blog.forEach((p) => {
    if (p.status === "scheduled" && p.scheduledAt && p.scheduledAt <= now) {
      p.status = "published";
      p.publishedAt = p.scheduledAt;
      p.updatedAt = now;
      changed = true;
    }
  });
  if (changed) {
    updateData((d) => {
      d.blog = data.blog;
    });
  }
  return changed;
}

// --- Modal ---
function openModal(post?: BlogPost) {
  if (!modal || !form) return;
  if (modalTitle) modalTitle.textContent = post ? "Edit post" : "Write a new post";
  form.reset();
  const contentEl = document.getElementById("blog-content") as HTMLElement;
  contentEl.innerHTML = "";
  const scheduledAtInput = document.getElementById("blog-scheduled-at") as HTMLInputElement;
  const scheduledAtGroup = document.getElementById("scheduled-at-group");
  if (post) {
    (document.getElementById("blog-id") as HTMLInputElement).value = post.id;
    (document.getElementById("blog-title") as HTMLInputElement).value = post.title;
    (document.getElementById("blog-excerpt") as HTMLInputElement).value = post.excerpt;
    (document.getElementById("blog-author") as HTMLInputElement).value = post.authorName ?? "";
    (document.getElementById("blog-tags") as HTMLInputElement).value = post.tags.join(", ");
    contentEl.innerHTML = post.content;
    document.querySelectorAll<HTMLInputElement>(".blog-status-radio").forEach((r) => {
      r.checked = r.value === post.status;
    });
    if (post.scheduledAt && scheduledAtInput) {
      scheduledAtInput.value = formatDatetimeLocal(post.scheduledAt);
    }
    if (scheduledAtGroup) {
      scheduledAtGroup.style.display = post.status === "scheduled" ? "block" : "none";
    }
  } else {
    (document.getElementById("blog-id") as HTMLInputElement).value = "";
    document.querySelectorAll<HTMLInputElement>(".blog-status-radio").forEach((r) => {
      r.checked = r.value === "published";
    });
    if (scheduledAtGroup) scheduledAtGroup.style.display = "none";
  }
  modal.showModal();
}

document.querySelectorAll("[data-close-modal]").forEach((b) =>
  b.addEventListener("click", () => modal?.close()),
);

addBtn.addEventListener("click", () => openModal());

document.querySelectorAll<HTMLInputElement>(".blog-status-radio").forEach((r) => {
  r.addEventListener("change", () => {
    const group = document.getElementById("scheduled-at-group");
    if (group) {
      group.style.display = r.value === "scheduled" && r.checked ? "block" : "none";
    }
  });
});

// --- Form submit ---
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form) return;
  const fd = new FormData(form);
  const id = String(fd.get("id") ?? "");
  const ts = nowISO();
  const tagsRaw = String(fd.get("tags") ?? "").trim();
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  let status = (fd.get("status") as BlogPost["status"]) ?? "draft";
  const title = String(fd.get("title") ?? "").trim();
  if (!title) {
    alert("Please enter a title.");
    return;
  }
  const contentEl = document.getElementById("blog-content") as HTMLElement;
  const content = contentEl.innerHTML.trim();
  if (!content || content === "<br>") {
    alert("Please write some content.");
    return;
  }
  const existing = id ? loadData().blog.find((p) => p.id === id) : undefined;
  const scheduledAtRaw = String(fd.get("scheduledAt") ?? "").trim();
  let scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : undefined;
  if (status === "scheduled" && !scheduledAt) {
    alert("Please select a date & time for the scheduled post.");
    return;
  }
  if (status === "scheduled" && scheduledAt && scheduledAt <= ts) {
    status = "published";
  }
  const payload: BlogPost = {
    id: id || uid(),
    title,
    slug: existing?.slug ?? slugify(title),
    excerpt: String(fd.get("excerpt") ?? "").trim(),
    content,
    tags,
    status,
    scheduledAt,
    authorName: String(fd.get("authorName") ?? "").trim() || undefined,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
    publishedAt:
      status === "published"
        ? existing?.publishedAt ?? scheduledAt ?? ts
        : status === "scheduled"
          ? undefined
          : existing?.publishedAt,
  };
  updateData((data) => {
    if (id) {
      const idx = data.blog.findIndex((p) => p.id === id);
      if (idx >= 0) data.blog[idx] = payload;
    } else {
      data.blog.unshift(payload);
    }
  });
  addAudit({
    action: id ? "update" : "create",
    entity: "blog",
    entityId: payload.id,
    description: id
      ? `Updated post: ${payload.title}`
      : `Added post: ${payload.title}`,
  });
  modal?.close();
  syncPostToApi(payload);
});

// --- Render ---
function renderAll() {
  autoPublishScheduled();
  const posts = loadData().blog.sort((a, b) => {
    return (a.publishedAt ?? a.scheduledAt ?? a.updatedAt) < (b.publishedAt ?? b.scheduledAt ?? b.updatedAt)
      ? 1
      : -1;
  });

  if (posts.length === 0) {
    const hasToken = getApiToken();
    list.innerHTML = `
      <div class="text-center py-5xl card-soft">
        <p class="text-display-sm text-ink mb-xs">No posts yet</p>
        <p class="text-body-sm text-body mb-md">Create your first blog post or load older posts from the server.</p>
        <div class="flex items-center justify-center gap-sm flex-wrap">
          <button class="btn-primary" type="button" data-add-first>Write your first post</button>
          ${hasToken ? `<button class="btn-secondary" type="button" data-fetch-first>Load from server</button>` : ""}
        </div>
        ${!hasToken ? `<p class="text-body-sm text-mute mt-md">Set your Admin Token in the Server Sync section below to fetch older published posts.</p>` : ""}
      </div>`;
    list
      .querySelector("[data-add-first]")
      ?.addEventListener("click", () => openModal());
    const fetchFirst = list.querySelector("[data-fetch-first]");
    if (fetchFirst) {
      fetchFirst.addEventListener("click", () => fetchPostsFromServer(false));
    }
    return;
  }

  list.innerHTML = posts
    .map(
      (p) => {
      const statusLabel = p.status === "published" ? "Published" : p.status === "scheduled" ? "Scheduled" : "Draft";
      const statusClass = p.status === "published" ? "badge-gain" : p.status === "scheduled" ? "badge" : "";
      const dateLabel = p.status === "scheduled" && p.scheduledAt
        ? `Scheduled: ${formatDate(p.scheduledAt)}`
        : formatDate(p.publishedAt ?? p.updatedAt);
      return `
    <div class="card">
      <div class="flex items-center justify-between mb-sm">
        <span class="badge ${statusClass}">${statusLabel}</span>
        <span class="text-caption text-mute">${dateLabel}</span>
      </div>
      <h3 class="text-display-sm text-ink mb-xs">${esc(p.title)}</h3>
      ${
        p.excerpt
          ? `<p class="text-body-md text-body line-clamp-2 mb-sm">${esc(p.excerpt)}</p>`
          : ""
      }
      ${
        p.tags.length > 0
          ? `<div class="flex flex-wrap gap-xs mb-sm">${p.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</div>`
          : ""
      }
      <div class="flex items-center justify-between pt-sm border-t border-hairline">
        <span class="text-caption text-mute">${p.content.split(/\s+/).filter(Boolean).length} words</span>
        <div class="flex gap-1">
          <button class="btn-ghost" type="button" data-edit="${p.id}">Edit</button>
          <button class="btn-ghost text-loss" type="button" data-delete="${p.id}">Delete</button>
        </div>
      </div>
    </div>`;
    })
    .join("");

  list.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const post = loadData().blog.find((p) => p.id === btn.dataset.edit);
      if (post) openModal(post);
    });
  });

  list.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delete!;
      const post = loadData().blog.find((p) => p.id === id);
      if (!post) return;
      if (!confirm(`Delete "${post.title}"?`)) return;
      updateData((data) => {
        data.blog = data.blog.filter((p) => p.id !== id);
      });
      addAudit({
        action: "delete",
        entity: "blog",
        entityId: id,
        description: `Deleted post: ${post.title}`,
      });
      renderAll();
    });
  });
}

modal?.addEventListener("close", () => {
  renderAll();
});

// --- Link dialog ---
const linkDialog = document.getElementById("link-dialog") as HTMLDialogElement;
const linkUrlInput = document.getElementById("link-url") as HTMLInputElement;
const linkTextInput = document.getElementById("link-text") as HTMLInputElement;
const linkInsertBtn = document.getElementById("link-insert")!;
const linkCancelBtn = document.getElementById("link-cancel")!;

function openLinkDialog() {
  if (!linkDialog || !contentArea) return;
  const sel = window.getSelection();
  let selectedText = "";
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    selectedText = sel.toString();
  }
  linkUrlInput.value = "";
  linkTextInput.value = selectedText;
  linkDialog.showModal();
  linkUrlInput.focus();
}

linkCancelBtn?.addEventListener("click", () => linkDialog?.close());

linkInsertBtn?.addEventListener("click", () => {
  const url = linkUrlInput.value.trim();
  if (!url) {
    linkUrlInput.focus();
    return;
  }
  contentArea?.focus();
  const displayText = linkTextInput.value.trim();
  if (displayText && window.getSelection()?.isCollapsed !== false) {
    document.execCommand("insertHTML", false, `<a href="${url.replace(/"/g, "&quot;")}">${esc(displayText)}</a>`);
  } else {
    document.execCommand("createLink", false, url);
  }
  linkDialog?.close();
});

linkUrlInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") linkInsertBtn?.click();
});

// --- Table dialog ---
const tableDialog = document.getElementById("table-dialog") as HTMLDialogElement;
const tableRowsInput = document.getElementById("table-rows") as HTMLInputElement;
const tableColsInput = document.getElementById("table-cols") as HTMLInputElement;
const tableInsertBtn = document.getElementById("table-insert")!;
const tableCancelBtn = document.getElementById("table-cancel")!;
let savedTableRange: Range | null = null;

function openTableDialog() {
  if (!tableDialog) return;
  const sel = window.getSelection();
  if (sel && sel.rangeCount && contentArea?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    savedTableRange = sel.getRangeAt(0).cloneRange();
  } else {
    savedTableRange = null;
  }
  tableRowsInput.value = "3";
  tableColsInput.value = "3";
  tableDialog.showModal();
  tableRowsInput.focus();
}

tableCancelBtn?.addEventListener("click", () => tableDialog?.close());

tableInsertBtn?.addEventListener("click", () => {
  const rows = Math.max(1, parseInt(tableRowsInput.value) || 3);
  const cols = Math.max(1, parseInt(tableColsInput.value) || 3);
  contentArea?.focus();

  const sel = window.getSelection();
  if (!sel) { tableDialog?.close(); return; }

  let range: Range;
  if (savedTableRange) {
    range = savedTableRange;
    sel.removeAllRanges();
    sel.addRange(range);
  } else if (sel.rangeCount) {
    range = sel.getRangeAt(0);
  } else {
    tableDialog?.close();
    return;
  }

  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse;table-layout:auto;margin:0.5rem 0;";
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const td = document.createElement("td");
      td.style.cssText = "border:1px solid #ccc;padding:8px;min-width:60px;vertical-align:top;";
      td.innerHTML = "&nbsp;";
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  range.deleteContents();
  range.insertNode(table);

  const br = document.createElement("br");
  range.setStartAfter(table);
  range.collapse(true);
  range.insertNode(br);
  range.setStartAfter(br);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);

  contentArea?.focus();
  tableDialog?.close();
});

tableRowsInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tableInsertBtn?.click();
});
tableColsInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") tableInsertBtn?.click();
});

// --- Formatting toolbar (WYSIWYG) ---
const toolbar = document.getElementById("editor-toolbar");
const contentArea = document.getElementById("blog-content") as HTMLElement;

toolbar?.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest("[data-fmt]") as HTMLButtonElement;
  if (!btn || !contentArea) return;
  e.preventDefault();
  const fmt = btn.dataset.fmt!;
  contentArea.focus();

  switch (fmt) {
    case "bold": document.execCommand("bold"); break;
    case "italic": document.execCommand("italic"); break;
    case "underline": document.execCommand("underline"); break;
    case "blockquote": document.execCommand("formatBlock", false, "<blockquote>"); break;
    case "ul": document.execCommand("insertUnorderedList"); break;
    case "ol": document.execCommand("insertOrderedList"); break;
    case "link":
      openLinkDialog();
      break;
    case "table":
      openTableDialog();
      break;
    case "font-sans": document.execCommand("fontName", false, "sans-serif"); break;
    case "font-serif": document.execCommand("fontName", false, "serif"); break;
    case "font-mono": document.execCommand("fontName", false, "monospace"); break;
    case "font-arial": document.execCommand("fontName", false, "Arial"); break;
    case "size-up":
    case "size-down": {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) break;
      let cur = 3;
      let el = sel.getRangeAt(0).startContainer;
      while (el && el !== contentArea) {
        if (el.nodeType === 1 && (el as HTMLElement).hasAttribute?.("size")) {
          cur = parseInt((el as HTMLElement).getAttribute("size")!) || 3;
          break;
        }
        el = el.parentNode as Node;
      }
      const next = fmt === "size-up" ? Math.min(7, cur + 1) : Math.max(1, cur - 1);
      document.execCommand("fontSize", false, String(next));
      break;
    }
  }

  if (fmt.startsWith("color-")) {
    document.execCommand("foreColor", false, fmt.replace("color-", ""));
  }
});

// --- Fetch posts from server ---
const fetchPostsBtn = document.getElementById("fetch-posts-btn");

async function fetchPostsFromServer(silent = false) {
  const token = getApiToken();
  if (!token) {
    if (!silent) {
      apiSyncStatus.textContent = "⚠ Set Admin Token first to fetch server posts";
      apiSyncStatus.className = "text-caption text-loss";
    }
    return;
  }
  if (!silent) {
    apiSyncStatus.textContent = "Fetching posts…";
    apiSyncStatus.className = "text-caption text-mute";
  }
  try {
    const res = await fetch("/api/blog?all=true", {
      headers: { "X-Admin-Token": token },
    });
    if (!res.ok) {
      if (!silent) {
        const data = await res.json().catch(() => ({}));
        apiSyncStatus.textContent = `✗ ${data.error || res.status}`;
        apiSyncStatus.className = "text-caption text-loss";
      }
      return;
    }
    const data = await res.json();
    const serverPosts: BlogPost[] = data.posts || [];
    if (serverPosts.length === 0) {
      if (!silent) {
        apiSyncStatus.textContent = "No posts found on server";
        apiSyncStatus.className = "text-caption text-mute";
      }
      return;
    }
    updateData((appData) => {
      for (const sp of serverPosts) {
        const idx = appData.blog.findIndex((lp) => lp.id === sp.id);
        if (idx >= 0) {
          appData.blog[idx] = sp;
        } else {
          appData.blog.unshift(sp);
        }
      }
    });
    apiSyncStatus.textContent = `✓ Fetched ${serverPosts.length} post(s) from server`;
    apiSyncStatus.className = "text-caption text-gain";
    renderAll();
  } catch {
    if (!silent) {
      apiSyncStatus.textContent = "✗ Network error";
      apiSyncStatus.className = "text-caption text-loss";
    }
  }
}

fetchPostsBtn?.addEventListener("click", () => fetchPostsFromServer(false));


