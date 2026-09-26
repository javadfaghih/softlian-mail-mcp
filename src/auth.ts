import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { Env } from "./env";
import { encryptPassword } from "./crypto";
import { verifyMailbox, verifySender } from "./mail";
import { connectionFailureMessage } from "./connection-errors";

const stateCookie = "__Host-softlian-mail-state";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function page(title: string, content: string): Response {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:16px system-ui;max-width:680px;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#17212f}label{display:block;margin:1rem 0}input{display:block;width:100%;padding:.65rem;box-sizing:border-box}button{background:#155eef;color:#fff;border:0;padding:.75rem 1.2rem;cursor:pointer}small{color:#4b5563}.error{color:#a40000}</style><main>${content}</main></html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      // Keep the Origin on same-origin form POSTs; no-referrer makes it null.
      // Referrers are still omitted when navigating to another origin.
      "referrer-policy": "same-origin",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

function stateFromCookie(request: Request): string | null {
  const entry = request.headers.get("cookie")?.split(";").map((item) => item.trim())
    .find((item) => item.startsWith(`${stateCookie}=`));
  return entry ? entry.slice(stateCookie.length + 1) : null;
}

function validHost(host: string): boolean {
  return host.length <= 253 && host.includes(".") && !host.endsWith(".") &&
    host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    !/^\d+(?:\.\d+){3}$/.test(host) && !host.endsWith(".local");
}

function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function userIdFor(email: string, imapHost: string): Promise<string> {
  const data = new TextEncoder().encode(`${email.toLowerCase()}|${imapHost}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function connectPage(token: string, clientName: string, error?: string): Response {
  return page("Connect your email", `<h1>Connect your email</h1><p>${escapeHtml(clientName)} is requesting access to read, search, and send mail through your email provider.</p><p>Enter your mailbox details here. Your app password is never sent to the AI chat.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="/authorize"><input type="hidden" name="state" value="${token}">
    <label>Email address<input name="email" type="email" autocomplete="username" required></label>
    <label>IMAP host (TLS, port 993)<input name="imap_host" placeholder="imap.example.com" required></label>
    <label>SMTP host (TLS, port 465)<input name="smtp_host" placeholder="smtp.example.com" required></label>
    <label>App password<input name="password" type="password" autocomplete="current-password" required></label>
    <small>Use an app password supplied by your email provider. Both IMAP and SMTP must accept the same credential. For Gmail, use imap.gmail.com and smtp.gmail.com.</small>
    <p><button type="submit">Connect email</button></p></form><p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>`);
}

async function beginAuthorization(request: Request, env: Env): Promise<Response> {
  const authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId);
  if (!client) return new Response("Unknown MCP client", { status: 400 });
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  await env.OAUTH_KV.put(`state:${token}`, JSON.stringify(authRequest), { expirationTtl: 600 });
  const response = connectPage(token, client.clientName ?? "An MCP client");
  response.headers.set("set-cookie", `${stateCookie}=${token}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
  return response;
}

async function withinAttemptLimit(request: Request, env: Env): Promise<boolean> {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const hour = new Date().toISOString().slice(0, 13);
  const key = `attempts:${ip}:${hour}`;
  const count = Number(await env.OAUTH_KV.get(key) ?? "0");
  if (count >= 10) return false;
  await env.OAUTH_KV.put(key, String(count + 1), { expirationTtl: 3600 });
  return true;
}

async function finishAuthorization(request: Request, env: Env): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Invalid origin", { status: 403 });
  const form = await request.formData();
  const token = String(form.get("state") ?? "");
  if (!token || token !== stateFromCookie(request)) return new Response("Invalid authorization state", { status: 403 });
  const authRequest = await env.OAUTH_KV.get<AuthRequest>(`state:${token}`, "json");
  if (!authRequest) return new Response("Authorization expired. Reconnect the plugin.", { status: 400 });
  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId);
  if (!client) return new Response("Unknown MCP client", { status: 400 });
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const imapHost = String(form.get("imap_host") ?? "").trim().toLowerCase();
  const smtpHost = String(form.get("smtp_host") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!validEmail(email) || !validHost(imapHost) || !validHost(smtpHost) || !password || password.length > 1024) {
    return connectPage(token, client.clientName ?? "An MCP client", "Check the email address, hostnames, and app password.");
  }
  if (!await withinAttemptLimit(request, env)) return new Response("Too many attempts. Try again later.", { status: 429 });
  const checks = await Promise.allSettled([
    verifyMailbox({ email, imap_host: imapHost }, password),
    verifySender({ email, smtp_host: smtpHost }, password),
  ]);
  const failures = checks.flatMap((result, index) => result.status === "rejected"
    ? [connectionFailureMessage(index === 0 ? "IMAP" : "SMTP", result.reason)]
    : []);
  if (failures.length) {
    return connectPage(token, client.clientName ?? "An MCP client", failures.join(" "));
  }
  const userId = await userIdFor(email, imapHost);
  const encrypted = await encryptPassword(password, userId, env.CREDENTIAL_KEY);
  await env.DB.prepare("INSERT INTO mail_accounts (user_id,email,imap_host,smtp_host,encrypted_password,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email, imap_host=excluded.imap_host, smtp_host=excluded.smtp_host, encrypted_password=excluded.encrypted_password, updated_at=CURRENT_TIMESTAMP")
    .bind(userId, email, imapHost, smtpHost, encrypted).run();
  await env.OAUTH_KV.delete(`state:${token}`);
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId,
    metadata: { label: email },
    scope: authRequest.scope,
    props: { userId, scopes: authRequest.scope },
  });
  const headers = new Headers({ location: redirectTo, "cache-control": "no-store" });
  headers.set("set-cookie", `${stateCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}

export async function handlePublic(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/.well-known/openai-apps-challenge") {
    return env.OPENAI_CHALLENGE ? new Response(env.OPENAI_CHALLENGE, { headers: { "content-type": "text/plain" } }) : new Response("Not configured", { status: 404 });
  }
  if (path === "/authorize" && request.method === "GET") return beginAuthorization(request, env);
  if (path === "/authorize" && request.method === "POST") return finishAuthorization(request, env);
  if (path === "/" && request.method === "GET") return page("Bussines Mail SMTP/IMAP", "<h1>Bussines Mail SMTP/IMAP</h1><p>Use your own IMAP and SMTP mailbox in ChatGPT and Codex. Connect the plugin, then enter your email address, IMAP and SMTP hosts, and an app password on this site.</p><p>The MCP endpoint is <code>/mail</code>.</p><p>Published by Ahmad Faghih (Softlian).</p><p><a href='/privacy'>Privacy</a> · <a href='/terms'>Terms</a> · <a href='/support'>Support</a></p>");
  if (path === "/privacy") return page("Privacy", "<h1>Privacy</h1><p>Effective September 26, 2026. Bussines Mail SMTP/IMAP is operated by Ahmad Faghih (Softlian).</p><p>We store your mailbox address, IMAP and SMTP hostnames, and an AES-GCM encrypted app password in Cloudflare D1 until you remove the connection. The encryption key is stored separately as a Cloudflare Worker secret. We use this data to authenticate with your email provider and perform the mail actions you request.</p><p>Mail headers and message content are fetched on demand, returned to your MCP client, and not saved in our database. Cloudflare processes service and connection data as our hosting provider. Your email provider processes mailbox connections and outgoing messages. Your MCP client, including OpenAI when used in ChatGPT or Codex, processes returned mail content under its own privacy policy. We do not sell this data.</p><p>OAuth grants are stored in Cloudflare KV until expiry or revocation. Authorization state expires after 10 minutes, IP-based connection attempt counters after one hour, and daily send counters after 30 days. The <code>remove_mailbox</code> tool deletes saved mailbox details, the encrypted password, and send counters. Disconnect the MCP client separately to revoke its OAuth token.</p><p>For support or a privacy request, see <a href='/support'>Support</a>. Never put a password, mailbox address, or message content in chat or a public issue.</p>");
  if (path === "/terms") return page("Terms", "<h1>Terms</h1><p>Effective September 26, 2026. Bussines Mail SMTP/IMAP is operated by Ahmad Faghih (Softlian).</p><p>Use the service only with a mailbox you control. You are responsible for messages you choose to send and for following your email provider's rules. Spam, unlawful use, and attempts to access another person's mailbox are prohibited. The service is provided as-is without a delivery guarantee. You may disconnect your mailbox at any time using the <code>remove_mailbox</code> tool.</p><h2>Source code license</h2><p>The source code is available under the Bussines Mail Source-Available License 1.0. Cloning, learning, modification, and use are permitted subject to that license. Submitting copies, derivatives, or hosted integrations to an AI company for review, listing, or distribution requires Ahmad Faghih's separate written permission. This restriction does not prevent users from connecting their own instance to an AI client for their own use.</p><p>Read the <a href='https://github.com/javadfaghih/bussines-mail-plugin-for-ai-agent/blob/main/LICENSE'>full source code license</a>. Earlier MIT releases retain their original license.</p><p>See <a href='/privacy'>Privacy</a> and <a href='/support'>Support</a>.</p>");
  if (path === "/support") return page("Support", "<h1>Support</h1><p>For help, report a bug, or request data deletion support, open an issue in the <a href='https://github.com/javadfaghih/bussines-mail-plugin-for-ai-agent/issues'>Bussines Mail SMTP/IMAP repository</a>. Never put a mailbox address, app password, or message content in a public issue.</p>");
  return new Response("Not found", { status: 404 });
}
