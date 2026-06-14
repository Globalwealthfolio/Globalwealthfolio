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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function sendWelcomeEmail(env, email) {
  const apiKey = env.RESEND_API_KEY || env.SENDGRID_API_KEY;
  if (!apiKey) return;
  const from = env.EMAIL_FROM || "noreply@globalwealthfolio.com";
  const subject = "Welcome to Global Wealth Portfolio!";
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
  <h1 style="font-size:1.5rem;color:#0f1b2d;margin-bottom:8px;">Welcome to Global Wealth Portfolio!</h1>
  <p style="color:#4a5568;line-height:1.6;">Thank you for subscribing. You'll now receive notifications when new articles are published — including investment guides, portfolio management tips, and financial planning insights.</p>
  <p style="margin:24px 0;">
    <a href="https://globalwealthfolio.com/blog" style="display:inline-block;background:#0f1b2d;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:500;">Browse Articles</a>
  </p>
  <hr style="border:none;border-top:1px solid #e3d8c1;margin:24px 0;">
  <p style="color:#8a94a6;font-size:0.75rem;">
    You are receiving this because you subscribed to the Global Wealth Portfolio newsletter.
    <br><a href="https://globalwealthfolio.com/api/subscribe?email=${encodeURIComponent(email)}" style="color:#8a94a6;">Unsubscribe</a>
  </p>
</body>
</html>`;
  try {
    if (env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: email, subject, html }),
      });
    } else if (env.SENDGRID_API_KEY) {
      await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ personalizations: [{ to: [{ email }] }], from: { email: from }, subject, content: [{ type: "text/html", value: html }] }),
      });
    }
  } catch (_) {}
}

function htmlPage(title, bodyContent) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Global Wealth Portfolio</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fdfbf7; color: #0f1b2d; max-width: 520px; margin: 4rem auto; padding: 0 1rem; text-align: center; line-height: 1.6; }
    h1 { font-size: 1.75rem; margin-bottom: 0.75rem; }
    p { color: #4a5568; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 2rem; margin-top: 1.5rem; }
    .btn { display: inline-block; padding: 0.75rem 2rem; border-radius: 999px; text-decoration: none; font-weight: 500; cursor: pointer; border: 0; font-size: 0.9rem; transition: opacity 150ms; }
    .btn-danger { background: #ee0000; color: #fff; }
    .btn-danger:hover { opacity: 0.85; }
    .btn-primary { background: #0f1b2d; color: #fff; }
    .btn-primary:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .success { color: #10b981; font-weight: 500; }
    .error { color: #ee0000; font-weight: 500; }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;
  const headers = corsHeaders();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (method === "POST") {
    try {
      const body = await request.json();
      const email = (body.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error(400, "Invalid email address");
      }

      const raw = await env.SUBSCRIBERS.get(KV_KEY);
      let subscribers = raw ? JSON.parse(raw) : [];

      if (subscribers.includes(email)) {
        return new Response(JSON.stringify({ success: true, message: "Already subscribed" }), {
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      subscribers.push(email);
      await env.SUBSCRIBERS.put(KV_KEY, JSON.stringify(subscribers));

      context.waitUntil(sendWelcomeEmail(env, email));

      return new Response(JSON.stringify({ success: true, message: "Subscribed successfully" }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (e) {
      return error(500, "Failed to subscribe");
    }
  }

  if (method === "DELETE") {
    try {
      const email = (url.searchParams.get("email") || "").trim().toLowerCase();
      if (!email) return error(400, "Missing email parameter");

      const raw = await env.SUBSCRIBERS.get(KV_KEY);
      let subscribers = raw ? JSON.parse(raw) : [];
      const filtered = subscribers.filter((e) => e !== email);

      if (filtered.length === subscribers.length) {
        return new Response(JSON.stringify({ success: true, message: "Email not found" }), {
          headers: { ...headers, "Content-Type": "application/json" },
        });
      }

      await env.SUBSCRIBERS.put(KV_KEY, JSON.stringify(filtered));
      return new Response(JSON.stringify({ success: true, message: "Unsubscribed successfully" }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (e) {
      return error(500, "Failed to unsubscribe");
    }
  }

  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  if (!email) {
    return new Response(htmlPage("Subscribe", `
      <div class="card">
        <h1>Newsletter Subscription</h1>
        <p>Use the subscription form on our blog to sign up for updates.</p>
        <p style="margin-top:1.5rem;"><a href="/blog" class="btn btn-primary">Back to Blog</a></p>
      </div>
    `), { headers: { "Content-Type": "text/html" } });
  }

  return new Response(htmlPage("Unsubscribe", `
    <div class="card">
      <h1>Unsubscribe</h1>
      <p>Are you sure you want to unsubscribe <strong>${email}</strong> from the Global Wealth Portfolio newsletter?</p>
      <button id="unsub-btn" class="btn btn-danger" style="margin-top:1.5rem;">Confirm Unsubscribe</button>
      <p id="unsub-msg" style="margin-top:1rem;display:none;"></p>
      <p style="margin-top:1.5rem;"><a href="/blog" style="color:#0b5fff;">Back to Blog</a></p>
    </div>
    <script>
      document.getElementById('unsub-btn').addEventListener('click', async function(){
        this.disabled=true; this.textContent='Processing\u2026';
        try {
          const r = await fetch('/api/subscribe?email=${encodeURIComponent(email)}', {method:'DELETE'});
          const d = await r.json();
          const m = document.getElementById('unsub-msg');
          if(r.ok) { m.className='success'; m.textContent=d.message||'Unsubscribed.'; }
          else { m.className='error'; m.textContent=d.error||'Failed.'; }
          m.style.display='block'; this.style.display='none';
        } catch(e) {
          const m = document.getElementById('unsub-msg');
          m.className='error'; m.textContent='Network error. Try again.';
          m.style.display='block'; this.disabled=false; this.textContent='Confirm Unsubscribe';
        }
      });
    </script>
  `), { headers: { "Content-Type": "text/html" } });
}
