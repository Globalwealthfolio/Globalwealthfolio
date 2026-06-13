const KV_KEY = "blog:posts";

function error(status, msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;
  const headers = corsHeaders();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (method !== "POST") {
    return error(405, "Method not allowed");
  }

  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== env.ADMIN_TOKEN) {
    return error(401, "Unauthorized");
  }

  try {
    const body = await request.json();
    const { id, title, content } = body;
    if (!id || !title || !content) {
      return error(400, "Missing required fields: id, title, content");
    }

    const raw = await env.BLOG_KV.get(KV_KEY);
    let allPosts = raw ? JSON.parse(raw) : [];
    const idx = allPosts.findIndex((p) => p.id === id);
    const ts = new Date().toISOString();
    const slug = title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80) || `post-${Date.now().toString(36)}`;

    const post = {
      id,
      title,
      slug,
      content,
      excerpt: body.excerpt || "",
      tags: Array.isArray(body.tags) ? body.tags : [],
      status: "published",
      authorName: body.authorName || "",
      createdAt: idx >= 0 ? allPosts[idx].createdAt : ts,
      updatedAt: ts,
      publishedAt: idx >= 0 ? allPosts[idx].publishedAt : ts,
    };

    if (idx >= 0) {
      allPosts[idx] = post;
    } else {
      allPosts.unshift(post);
    }

    await env.BLOG_KV.put(KV_KEY, JSON.stringify(allPosts));
    return new Response(JSON.stringify({ success: true }), { headers: { ...headers, "Content-Type": "application/json" } });
  } catch (e) {
    return error(500, "Failed to save post");
  }
}
