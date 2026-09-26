function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

export function authorizationCompletePage(redirectTo: string): Response {
  const url = new URL(redirectTo);
  if (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Invalid OAuth callback URL");
  }
  const callback = escapeHtml(url.href);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${callback}"><title>Email connected</title><style>body{font:16px system-ui;max-width:680px;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#17212f}a{display:inline-block;background:#155eef;color:#fff;padding:.75rem 1.2rem;text-decoration:none}</style></head><body><main><h1>Email connected</h1><p>Returning you to the app to finish connecting.</p><p>If you are not redirected, <a href="${callback}" rel="noreferrer">return to the app</a>.</p></main></body></html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}
