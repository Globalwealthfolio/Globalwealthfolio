import { loadData, updateData, addAudit, uid, nowISO, subscribe } from "../lib/store";
import type { BlogPost } from "../lib/types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || `post-${Date.now().toString(36)}`;
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

let filterStatus = "published";
let filterTag = "all";
let searchTerm = "";

const modal = document.getElementById("blog-modal") as HTMLDialogElement | null;
const form = document.getElementById("blog-form") as HTMLFormElement | null;
const titleEl = document.getElementById("blog-modal-title");

const readerModal = document.getElementById("reader-modal") as HTMLDialogElement | null;
const readerState = { postId: "" as string };

document.getElementById("add-blog")?.addEventListener("click", () => openModal());

document.querySelectorAll("[data-close-modal]").forEach((b) =>
  b.addEventListener("click", () => modal?.close()),
);
document.querySelectorAll("[data-close-reader]").forEach((b) =>
  b.addEventListener("click", () => readerModal?.close()),
);

document.querySelector<HTMLButtonElement>("[data-reader-edit]")?.addEventListener("click", () => {
  const post = loadData().blog.find((p) => p.id === readerState.postId);
  if (post) {
    readerModal?.close();
    openModal(post);
  }
});

function setStatusInForm(status: "draft" | "published") {
  document.querySelectorAll<HTMLInputElement>(".blog-status-radio").forEach((r) => {
    r.checked = r.value === status;
  });
}

function getStatusFromForm(): "draft" | "published" {
  const checked = document.querySelector<HTMLInputElement>(".blog-status-radio:checked");
  return (checked?.value as "draft" | "published") ?? "draft";
}

function openModal(post?: BlogPost) {
  if (!modal || !form) return;
  if (titleEl) titleEl.textContent = post ? "Edit post" : "Write a new post";
  form.reset();
  if (post) {
    (document.getElementById("blog-id") as HTMLInputElement).value = post.id;
    (document.getElementById("blog-title") as HTMLInputElement).value = post.title;
    (document.getElementById("blog-excerpt") as HTMLInputElement).value = post.excerpt;
    (document.getElementById("blog-author") as HTMLInputElement).value = post.authorName ?? "";
    (document.getElementById("blog-tags") as HTMLInputElement).value = post.tags.join(", ");
    (document.getElementById("blog-content") as HTMLTextAreaElement).value = post.content;
    setStatusInForm(post.status);
  } else {
    (document.getElementById("blog-id") as HTMLInputElement).value = "";
    setStatusInForm("published");
  }
  modal.showModal();
}

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
    description: id ? `Updated post: ${payload.title}` : `Added post: ${payload.title}`,
  });
  modal?.close();
});

document.querySelector<HTMLSelectElement>("[data-filter='status']")?.addEventListener("change", (e) => {
  filterStatus = (e.target as HTMLSelectElement).value;
  renderAll();
});
document.querySelector<HTMLSelectElement>("[data-filter='tag']")?.addEventListener("change", (e) => {
  filterTag = (e.target as HTMLSelectElement).value;
  renderAll();
});
document.querySelector<HTMLInputElement>("[data-search]")?.addEventListener("input", (e) => {
  searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
  renderAll();
});

function filteredPosts(): BlogPost[] {
  const data = loadData();
  let rows = data.blog;
  if (filterStatus !== "all") rows = rows.filter((p) => p.status === filterStatus);
  if (filterTag !== "all") rows = rows.filter((p) => p.tags.includes(filterTag));
  if (searchTerm) {
    const t = searchTerm.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.title.toLowerCase().includes(t) ||
        p.excerpt.toLowerCase().includes(t) ||
        p.content.toLowerCase().includes(t) ||
        p.tags.some((tag) => tag.toLowerCase().includes(t)),
    );
  }
  return rows.sort((a, b) => {
    const ad = a.publishedAt ?? a.updatedAt;
    const bd = b.publishedAt ?? b.updatedAt;
    return bd.localeCompare(ad);
  });
}

function refreshTagFilter() {
  const tagFilter = document.querySelector<HTMLSelectElement>("[data-filter='tag']");
  if (!tagFilter) return;
  const allTags = Array.from(
    new Set(loadData().blog.flatMap((p) => p.tags)),
  ).sort();
  const current = filterTag;
  tagFilter.innerHTML =
    `<option value="all">All Tags</option>` +
    allTags.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
  tagFilter.value = allTags.includes(current) || current === "all" ? current : "all";
  if (tagFilter.value !== current) filterTag = tagFilter.value;
}

function renderStats() {
  const data = loadData();
  const setText = (sel: string, text: string) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.textContent = text;
  };
  setText("[data-stat='total']", String(data.blog.length));
  setText(
    "[data-stat='published']",
    String(data.blog.filter((p) => p.status === "published").length),
  );
  setText(
    "[data-stat='drafts']",
    String(data.blog.filter((p) => p.status === "draft").length),
  );
}

function openReader(post: BlogPost) {
  readerState.postId = post.id;
  const titleEl = document.querySelector("[data-reader-title]") as HTMLElement | null;
  const authorEl = document.querySelector("[data-reader-author]") as HTMLElement | null;
  const dateEl = document.querySelector("[data-reader-date]") as HTMLElement | null;
  const excerptEl = document.querySelector("[data-reader-excerpt]") as HTMLElement | null;
  const contentEl = document.querySelector("[data-reader-content]") as HTMLElement | null;
  const tagsEl = document.querySelector("[data-reader-tags]") as HTMLElement | null;
  const statusEl = document.querySelector("[data-reader-status]") as HTMLElement | null;
  if (titleEl) titleEl.textContent = post.title;
  if (authorEl) authorEl.textContent = post.authorName || "Anonymous";
  if (dateEl) dateEl.textContent = formatDate(post.publishedAt ?? post.updatedAt);
  if (excerptEl) {
    excerptEl.textContent = post.excerpt;
    excerptEl.style.display = post.excerpt ? "block" : "none";
  }
  if (contentEl) contentEl.textContent = post.content;
  if (tagsEl) {
    tagsEl.innerHTML = post.tags
      .map((t) => `<span class="badge">${esc(t)}</span>`)
      .join("");
  }
  if (statusEl) {
    statusEl.textContent = post.status === "published" ? "Published" : "Draft";
    statusEl.className = `badge ${post.status === "published" ? "badge-gain" : ""}`;
  }
  readerModal?.showModal();
}

function renderList() {
  const list = document.getElementById("blog-list");
  if (!list) return;
  const posts = filteredPosts();
  if (posts.length === 0) {
    const total = loadData().blog.length;
    list.innerHTML = `
      <div class="md:col-span-2 text-center py-5xl card-soft">
        <p class="text-display-sm text-ink mb-xs">${total === 0 ? "No posts yet" : "Nothing matches your filters"}</p>
        <p class="text-body-sm text-body mb-md">${
          total === 0
            ? "Capture an investment thesis, a monthly review, or a private note for future-you."
            : "Try clearing the search or changing the filters."
        }</p>
        ${total === 0 ? `<button class="btn-primary" type="button" data-add-first>Write your first post</button>` : ""}
      </div>`;
    list.querySelector("[data-add-first]")?.addEventListener("click", () => openModal());
    return;
  }
  list.innerHTML = posts
    .map(
      (p) => `
        <article class="card hover:shadow-level-3 transition-shadow flex flex-col gap-sm cursor-pointer" data-open="${p.id}">
          <div class="flex items-center justify-between">
            <span class="badge ${p.status === "published" ? "badge-gain" : ""}">${p.status === "published" ? "Published" : "Draft"}</span>
            <span class="text-caption text-mute">${formatDate(p.publishedAt ?? p.updatedAt)}</span>
          </div>
          <h3 class="text-display-sm text-ink">${esc(p.title)}</h3>
          ${
            p.excerpt
              ? `<p class="text-body-md text-body line-clamp-2">${esc(p.excerpt)}</p>`
              : `<p class="text-body-md text-body line-clamp-2">${esc(p.content.slice(0, 140))}${p.content.length > 140 ? "…" : ""}</p>`
          }
          ${
            p.tags.length > 0
              ? `<div class="flex flex-wrap gap-xs mt-xs">${p.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</div>`
              : ""
          }
          <div class="flex items-center justify-between mt-md pt-sm border-t border-hairline">
            <span class="text-caption text-mute">${p.authorName ? `By ${esc(p.authorName)} · ` : ""}${p.content.split(/\s+/).filter(Boolean).length} words</span>
            <div class="flex gap-1">
              <button class="btn-ghost" type="button" data-edit-inline="${p.id}">Edit</button>
              <button class="btn-ghost text-loss" type="button" data-delete-inline="${p.id}">Delete</button>
            </div>
          </div>
        </article>`,
    )
    .join("");

  list.querySelectorAll<HTMLElement>("[data-open]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-edit-inline]") || target.closest("[data-delete-inline]")) return;
      const id = el.dataset.open!;
      const post = loadData().blog.find((p) => p.id === id);
      if (post) openReader(post);
    });
  });
  list.querySelectorAll<HTMLButtonElement>("[data-edit-inline]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.editInline!;
      const post = loadData().blog.find((p) => p.id === id);
      if (post) openModal(post);
    });
  });
  list.querySelectorAll<HTMLButtonElement>("[data-delete-inline]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteInline!;
      const post = loadData().blog.find((p) => p.id === id);
      if (!post) return;
      if (!confirm(`Delete "${post.title}"?`)) return;
      updateData((data) => {
        data.blog = data.blog.filter((p) => p.id !== id);
      });
      addAudit({ action: "delete", entity: "blog", entityId: id, description: `Deleted post: ${post.title}` });
    });
  });
}

function renderAll() {
  refreshTagFilter();
  renderStats();
  renderList();
}

subscribe(renderAll);
renderAll();
