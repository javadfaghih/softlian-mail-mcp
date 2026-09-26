# Bussines Mail SMTP/IMAP

Bussines Mail SMTP/IMAP by Ahmad Faghih (Softlian) is a remote Model Context Protocol (MCP) server and Codex plugin for an email account you control. It reads and searches an IMAP inbox and sends plain-text email through SMTP. The public endpoint is `https://mcp.softlian.com/mail`.

## Connect a mailbox

Add the remote MCP URL in Codex or install the plugin from this repository. The OAuth connection opens a page on `mcp.softlian.com` where you enter:

- Your email address
- Your provider's IMAP hostname, with implicit TLS on port 993
- Your provider's SMTP hostname, with implicit TLS on port 465
- An app password accepted by both servers

There is no separate Softlian account. Enter the app password only on the HTTPS connection page, never in a chat or tool argument. Providers that require OAuth, different credentials for IMAP and SMTP, STARTTLS, or other ports are not supported in this version.

The server exposes `list_mail`, `search_mail`, `get_mail`, `send_mail`, and `remove_mailbox`. Reading is limited to the inbox. Search combines its filters with AND. Message bodies are returned as plain text; attachments and HTML are excluded. `send_mail` sends a plain-text message to at most five recipients and is limited to 20 calls per connected mailbox per UTC day. Removing and reconnecting a mailbox resets this local counter. A successful SMTP submission does not prove delivery.

The assistant must show the exact recipients, subject, and body and obtain explicit approval before calling `send_mail`. You can delete the stored connection with `remove_mailbox` and disconnect the MCP client separately to revoke its OAuth token.

## Run locally

Requirements: Node.js 24 or later and a Cloudflare account. Install dependencies with `npm ci`, then run `npm run check`.

Configure a Cloudflare KV namespace as `OAUTH_KV`, a D1 database as `DB`, and apply `migrations/0001_initial.sql`. Set `MCP_BASE_URL` to the canonical MCP URL and create a `CREDENTIAL_KEY` secret containing a random base64-encoded 32-byte key. Do not commit that key. Configure a custom domain for the Worker. The example production bindings are in `wrangler.jsonc`.

To run locally, make a copy of `wrangler.jsonc` without `routes`, set `MCP_BASE_URL` to `http://localhost:8787/mail`, set a disposable local `CREDENTIAL_KEY`, and run `npx wrangler dev --local`. OAuth resource metadata is at `/.well-known/oauth-protected-resource/mail` and authorization server metadata is at `/.well-known/oauth-authorization-server`.

To deploy, run `npx wrangler d1 migrations apply DB --remote`, `npx wrangler secret put CREDENTIAL_KEY`, then `npx wrangler deploy`. Set `OPENAI_CHALLENGE` only when the OpenAI developer portal supplies a domain verification value. The Worker requires Cloudflare account permissions for Workers, KV, D1, routes, and DNS.

The production Cloudflare Worker is named `bussines-mail-ai-agent-plugin` (Bussines Mail AI Agent Plugin). Its canonical MCP endpoint is `https://mcp.softlian.com/mail`.

## Security and data

App passwords are encrypted with AES-256-GCM using `CREDENTIAL_KEY` before D1 storage. The key is a Cloudflare Worker secret, separate from D1. Message contents are fetched on demand and are not persisted by this application. OAuth grants and short-lived authorization state are stored in KV. Daily send counters are deleted after 30 days, or immediately with the mailbox connection when `remove_mailbox` is used. The server verifies the IMAP and SMTP credentials before storing them, limits authorization attempts per source IP, validates form origin and state, and blocks raw IP and local hostnames in mail server fields. It accepts only implicit TLS connections on ports 993 and 465.

`CREDENTIAL_KEY` is required to decrypt all saved app passwords. Rotate it only with a migration plan or after users reconnect. Treat database and KV exports as sensitive. Never put mailbox credentials in issues, logs, screenshots, chats, or example config files.

## Publishing

The plugin manifest is at `plugins/smpt-mail-plugin/.codex-plugin/plugin.json` and the repo marketplace is at `.agents/plugins/marketplace.json`. The OpenAI submission test plan is in `docs/submission.md`. Public publication and review require a live HTTPS endpoint, verified publisher identity, working legal and support URLs, and a reviewer mailbox with app-password access.

## License

This project uses the custom **Bussines Mail Source-Available License 1.0**. You may clone, study, use, modify, self-host, and share the code with its notices and restrictions. You may not submit the software, derivatives, plugins, or hosted MCP endpoints to any AI company for review, approval, listing, publication, or distribution without Ahmad Faghih's separate written permission. Connecting your own instance to an AI client for your own use is allowed.

This is a source-available project, not an OSI-approved open-source project. Third-party dependencies keep their own licenses. Earlier MIT releases retain their original permissions. See [LICENSE](LICENSE) for the full terms.
