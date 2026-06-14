import emailjs from "@emailjs/browser";
import { loadData, updateData, addAudit, uid, nowISO } from "../lib/store";
import type { BlogPost } from "../lib/types";

// EmailJS config — set these in your EmailJS dashboard
const EMAILJS_PUBLIC_KEY = "rvTqHL_4iAM_yuGAG";
const EMAILJS_SERVICE_ID = "service_csuyz5u";
const EMAILJS_TEMPLATE_ID = "template_7mmdpca";
const ADMIN_EMAIL = "sourabh6303@gmail.com";

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
      body: JSON.stringify({ id: post.id, title: post.title, content: post.content, excerpt: post.excerpt, tags: post.tags, authorName: post.authorName }),
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
  forgotEmail.value = ADMIN_EMAIL;
  forgotStatus.textContent = "";
  forgotStatus.className = "text-body-sm mt-sm";
  otpInput.value = "";
});

backToLogin.addEventListener("click", () => {
  forgotScreen.style.display = "none";
  loginScreen.style.display = "block";
});

sendOtpBtn.addEventListener("click", async () => {
  currentOTP = Math.floor(100000 + Math.random() * 900000).toString();
  otpExpiry = Date.now() + 5 * 60 * 1000;
  sendOtpBtn.disabled = true;
  sendOtpBtn.textContent = "Sending...";
  forgotStatus.textContent = "";
  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      { otp: currentOTP, email: ADMIN_EMAIL, expiry: "5 minutes" },
      EMAILJS_PUBLIC_KEY,
    );
    forgotStatus.textContent = "OTP sent to your email.";
    forgotStatus.className = "text-body-sm text-gain mt-sm";
    otpGroup.style.display = "block";
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

// --- Modal ---
function openModal(post?: BlogPost) {
  if (!modal || !form) return;
  if (modalTitle) modalTitle.textContent = post ? "Edit post" : "Write a new post";
  form.reset();
  if (post) {
    (document.getElementById("blog-id") as HTMLInputElement).value = post.id;
    (document.getElementById("blog-title") as HTMLInputElement).value = post.title;
    (document.getElementById("blog-excerpt") as HTMLInputElement).value = post.excerpt;
    (document.getElementById("blog-author") as HTMLInputElement).value = post.authorName ?? "";
    (document.getElementById("blog-tags") as HTMLInputElement).value = post.tags.join(", ");
    (document.getElementById("blog-content") as HTMLTextAreaElement).value = post.content;
    document.querySelectorAll<HTMLInputElement>(".blog-status-radio").forEach((r) => {
      r.checked = r.value === post.status;
    });
  } else {
    (document.getElementById("blog-id") as HTMLInputElement).value = "";
    document.querySelectorAll<HTMLInputElement>(".blog-status-radio").forEach((r) => {
      r.checked = r.value === "published";
    });
  }
  modal.showModal();
}

document.querySelectorAll("[data-close-modal]").forEach((b) =>
  b.addEventListener("click", () => modal?.close()),
);

addBtn.addEventListener("click", () => openModal());

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
  const status = (fd.get("status") as BlogPost["status"]) ?? "draft";
  const title = String(fd.get("title") ?? "").trim();
  if (!title) {
    alert("Please enter a title.");
    return;
  }
  const content = String(fd.get("content") ?? "").trim();
  if (!content) {
    alert("Please write some content.");
    return;
  }
  const existing = id ? loadData().blog.find((p) => p.id === id) : undefined;
  const payload: BlogPost = {
    id: id || uid(),
    title,
    slug: existing?.slug ?? slugify(title),
    excerpt: String(fd.get("excerpt") ?? "").trim(),
    content,
    tags,
    status,
    authorName: String(fd.get("authorName") ?? "").trim() || undefined,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
    publishedAt:
      status === "published"
        ? existing?.publishedAt ?? ts
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
  const posts = loadData().blog.sort((a, b) => {
    return (a.publishedAt ?? a.updatedAt) < (b.publishedAt ?? b.updatedAt)
      ? 1
      : -1;
  });

  if (posts.length === 0) {
    list.innerHTML = `
      <div class="text-center py-5xl card-soft">
        <p class="text-display-sm text-ink mb-xs">No posts yet</p>
        <p class="text-body-sm text-body mb-md">Create your first blog post.</p>
        <button class="btn-primary" type="button" data-add-first>Write your first post</button>
      </div>`;
    list
      .querySelector("[data-add-first]")
      ?.addEventListener("click", () => openModal());
    return;
  }

  list.innerHTML = posts
    .map(
      (p) => `
    <div class="card">
      <div class="flex items-center justify-between mb-sm">
        <span class="badge ${p.status === "published" ? "badge-gain" : ""}">${p.status === "published" ? "Published" : "Draft"}</span>
        <span class="text-caption text-mute">${formatDate(p.publishedAt ?? p.updatedAt)}</span>
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
    </div>`,
    )
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
