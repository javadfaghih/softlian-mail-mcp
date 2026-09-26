/** Return an actionable message without exposing provider responses or credentials. */
export function connectionFailureMessage(protocol: "IMAP" | "SMTP", error: unknown): string {
  const details = typeof error === "object" && error !== null ? error : {};
  const code = "code" in details && typeof details.code === "string" ? details.code : "";
  const message = "message" in details && typeof details.message === "string" ? details.message : "";
  const port = protocol === "IMAP" ? 993 : 465;
  if (("authenticationFailed" in details && details.authenticationFailed === true) || code === "EAUTH") {
    return `${protocol} rejected the email address or app password. Check that this mailbox allows ${protocol} access.`;
  }
  if (/CERT|TLS|SSL/.test(code) || /certificate|tls handshake|ssl/i.test(message)) {
    return `${protocol} could not verify the mail server's TLS certificate. Ask your email provider to check its certificate and hostname.`;
  }
  if (["EDNS", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return `${protocol} could not find the mail server. Check its hostname.`;
  }
  if (["ETIMEDOUT", "CONNECT_TIMEOUT", "GREETING_TIMEOUT", "ECONNREFUSED", "ECONNRESET", "ESOCKET"].includes(code)) {
    return `${protocol} could not connect on TLS port ${port}. Ask your email provider to check the port and firewall access from Cloudflare.`;
  }
  return `${protocol} connection could not be completed. Try again; if it continues, contact plugin support.`;
}
