const KV_KEY = "subscribers:list";

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

function buildHtml(post_title, post_excerpt, author_name, post_url, unsubscribe_url) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:1.5rem;margin-bottom:8px;color:#0f1b2d;">${post_title.replace(/</g,"&lt;")}</h1>
  ${post_excerpt ? `<p style="color:#4a5568;line-height:1.6;margin-bottom:16px;">${post_excerpt.replace(/</g,"&lt;")}</p>` : ""}
  ${author_name ? `<p style="color:#8a94a6;font-size:0.875rem;margin-bottom:16px;">By ${author_name.replace(/</g,"&lt;")}</p>` : ""}
  <p style="margin:24px 0;">
    <a href="${post_url.replace(/"/g,"&quot;")}" style="display:inline-block;background:#0f1b2d;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:500;">Read Full Article</a>
  </p>
  <hr style="border:none;border-top:1px solid #e3d8c1;margin:24px 0;">
  <p style="color:#8a94a6;font-size:0.75rem;">
    You are receiving this because you subscribed to the Global Wealth Portfolio newsletter.
    <br><a href="${unsubscribe_url.replace(/"/g,"&quot;")}" style="color:#8a94a6;">Unsubscribe</a>
  </p>
</body>
</html>`;
}

async function sendEmailViaResend(apiKey, from, to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  return res.ok;
}

async function sendEmailViaSendGrid(apiKey, from, to, subject, html) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  return res.ok;
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
    const { post_title, post_url, post_excerpt, author_name } = body;
    if (!post_title || !post_url) {
      return error(400, "Missing required fields: post_title, post_url");
    }

    const raw = await env.SUBSCRIBERS.get(KV_KEY);
    const subscribers = raw ? JSON.parse(raw) : [];

    if (subscribers.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, failed: 0 }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const emailFrom = env.EMAIL_FROM || "noreply@globalwealthfolio.com";
    const siteUrl = new URL(request.url).origin;

    if (!env.RESEND_API_KEY && !env.SENDGRID_API_KEY) {
      return error(500, "No email API configured. Set RESEND_API_KEY or SENDGRID_API_KEY.");
    }

    const sent = [];
    const failed = [];

    for (const email of subscribers) {
      const unsubscribeUrl = `${siteUrl}/api/subscribe?email=${encodeURIComponent(email)}`;
      const html = buildHtml(post_title, post_excerpt || "", author_name || "", post_url, unsubscribeUrl);
      const subject = `New post: ${post_title}`;

      try {
        let ok = false;
        if (env.RESEND_API_KEY) {
          ok = await sendEmailViaResend(env.RESEND_API_KEY, emailFrom, email, subject, html);
        } else if (env.SENDGRID_API_KEY) {
          ok = await sendEmailViaSendGrid(env.SENDGRID_API_KEY, emailFrom, email, subject, html);
        }
        if (ok) { sent.push(email); } else { failed.push(email); }
      } catch {
        failed.push(email);
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sent.length, failed: failed.length }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    return error(500, "Failed to send notifications");
  }
}
