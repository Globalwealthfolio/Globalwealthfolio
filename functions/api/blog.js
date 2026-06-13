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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;
  const headers = corsHeaders();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (method === "GET") {
    try {
      const raw = await env.BLOG_KV.get(KV_KEY);
      if (!raw) {
        return new Response(JSON.stringify({ posts: [] }), { headers: { ...headers, "Content-Type": "application/json" } });
      }
      const allPosts = JSON.parse(raw);
      const published = allPosts.filter((p) => p.status === "published").sort((a, b) => {
        return (a.publishedAt ?? a.updatedAt) < (b.publishedAt ?? b.updatedAt) ? 1 : -1;
      });
      const slug = url.searchParams.get("slug");
      if (slug) {
        const post = published.find((p) => p.slug === slug);
        if (!post) return error(404, "Post not found");
        return new Response(JSON.stringify(post), { headers: { ...headers, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ posts: published }), { headers: { ...headers, "Content-Type": "application/json" } });
    } catch (e) {
      return error(500, "Failed to fetch posts");
    }
  }

  const adminToken = request.headers.get("X-Admin-Token") || "";
  if (adminToken !== env.ADMIN_TOKEN) {
    return error(401, "Unauthorized");
  }

  if (method === "POST") {
    try {
      const body = await request.json();
      const post = body.post;
      if (!post || !post.id || !post.title || !post.content) {
        return error(400, "Invalid post data");
      }
      const raw = await env.BLOG_KV.get(KV_KEY);
      let allPosts = raw ? JSON.parse(raw) : [];
      const idx = allPosts.findIndex((p) => p.id === post.id);
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

  if (method === "DELETE") {
    try {
      const id = url.searchParams.get("id");
      if (!id) return error(400, "Missing post id");
      const raw = await env.BLOG_KV.get(KV_KEY);
      if (!raw) return error(404, "No posts found");
      let allPosts = JSON.parse(raw);
      allPosts = allPosts.filter((p) => p.id !== id);
      await env.BLOG_KV.put(KV_KEY, JSON.stringify(allPosts));
      return new Response(JSON.stringify({ success: true }), { headers: { ...headers, "Content-Type": "application/json" } });
    } catch (e) {
      return error(500, "Failed to delete post");
    }
  }

  return error(405, "Method not allowed");
}
