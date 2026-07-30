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
      let allPosts = (JSON.parse(raw) || []).filter((p, i, arr) => arr.findIndex(x => x.id === p.id || x.slug === p.slug) === i);

      // Auto-publish scheduled posts whose scheduled time has arrived
      const now = new Date().toISOString();
      let autoPublished = false;
      allPosts.forEach((p) => {
        if (p.status === "scheduled" && p.scheduledAt && p.scheduledAt <= now) {
          p.status = "published";
          p.publishedAt = p.scheduledAt;
          p.updatedAt = now;
          autoPublished = true;
        }
      });
      if (autoPublished) {
        await env.BLOG_KV.put(KV_KEY, JSON.stringify(allPosts));
      }

      // Topic hubs summary: return all unique hubs with post counts
      if (url.searchParams.get("topicHubs") === "true") {
        const published = allPosts.filter((p) => p.status === "published");
        const hubMap = {};
        published.forEach((p) => {
          if (p.topicHub) {
            if (!hubMap[p.topicHub]) {
              hubMap[p.topicHub] = { slug: p.topicHub, name: p.topicHub, count: 0 };
            }
            hubMap[p.topicHub].count++;
          }
        });
        // Try to merge in proper names from topic hub definitions in KV
        try {
          const hubsRaw = await env.BLOG_KV.get("blog:topic-hubs");
          if (hubsRaw) {
            const hubs = JSON.parse(hubsRaw) || [];
            hubs.forEach((h) => {
              if (hubMap[h.slug]) {
                hubMap[h.slug].name = h.name;
              }
            });
          }
        } catch (_) {}
        return new Response(JSON.stringify({ topicHubs: Object.values(hubMap).sort((a, b) => b.count - a.count) }), {
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      const showAll = url.searchParams.get("all") === "true";
      const adminToken = request.headers.get("X-Admin-Token") || "";
      if (showAll && adminToken === env.ADMIN_TOKEN) {
        allPosts.sort((a, b) => ((a.publishedAt ?? a.updatedAt) < (b.publishedAt ?? b.updatedAt) ? 1 : -1));
        const slug = url.searchParams.get("slug");
        if (slug) {
          const post = allPosts.find((p) => p.slug === slug);
          if (!post) return error(404, "Post not found");
          return new Response(JSON.stringify(post), { headers: { ...headers, "Content-Type": "application/json" } });
        }
        // Optional topic hub filter for admin view
        const topicHub = url.searchParams.get("topicHub");
        if (topicHub) {
          return new Response(JSON.stringify({ posts: allPosts.filter((p) => p.topicHub === topicHub) }), {
            headers: { ...headers, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ posts: allPosts }), { headers: { ...headers, "Content-Type": "application/json" } });
      }
      let published = allPosts.filter((p) => p.status === "published").sort((a, b) => {
        return (a.publishedAt ?? a.updatedAt) < (b.publishedAt ?? b.updatedAt) ? 1 : -1;
      });

      // Filter by topic hub for public view
      const topicHub = url.searchParams.get("topicHub");
      if (topicHub) {
        published = published.filter((p) => p.topicHub === topicHub);
      }

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
