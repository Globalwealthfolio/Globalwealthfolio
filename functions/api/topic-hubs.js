const KV_KEY = "blog:topic-hubs";

function error(status, msg) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
      const hubs = raw ? JSON.parse(raw) : [];
      return new Response(JSON.stringify({ topicHubs: hubs }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (e) {
      return error(500, "Failed to fetch topic hubs");
    }
  }

  const adminToken = request.headers.get("X-Admin-Token") || "";
  if (adminToken !== env.ADMIN_TOKEN) {
    return error(401, "Unauthorized");
  }

  if (method === "POST") {
    try {
      const body = await request.json();
      const hubs = body.topicHubs;
      if (!Array.isArray(hubs)) {
        return error(400, "topicHubs must be an array");
      }
      await env.BLOG_KV.put(KV_KEY, JSON.stringify(hubs));
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (e) {
      return error(500, "Failed to save topic hubs");
    }
  }

  return error(405, "Method not allowed");
}
