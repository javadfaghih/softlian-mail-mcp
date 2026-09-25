import { env as bindings } from "cloudflare:workers";
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { handlePublic } from "./auth";
import { decryptPassword } from "./crypto";
import type { Env, MailAccount } from "./env";
import { getMail, listMail, searchMail, sendMail } from "./mail";

const workerEnv = bindings as unknown as Env;

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: value as Record<string, unknown> };
}

function error(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function hasScope(scope: string): boolean {
  const scopes = getMcpAuthContext()?.props?.scopes;
  return Array.isArray(scopes) && scopes.includes(scope);
}

async function account(): Promise<{ account: MailAccount; password: string }> {
  const userId = getMcpAuthContext()?.props?.userId;
  if (typeof userId !== "string") throw new Error("Connect your mailbox first.");
  const saved = await workerEnv.DB.prepare("SELECT user_id,email,imap_host,smtp_host,encrypted_password FROM mail_accounts WHERE user_id = ?")
    .bind(userId).first<MailAccount>();
  if (!saved) throw new Error("Connect your mailbox first.");
  return { account: saved, password: await decryptPassword(saved.encrypted_password, userId, workerEnv.CREDENTIAL_KEY) };
}

function createServer() {
  const server = new McpServer(
    { name: "Softlian Mail", version: "0.1.0" },
    { instructions: "Read or search mail only on the user's request. Before sending, show the exact recipients, subject, and body and obtain the user's explicit approval. Never send automatically after reading mail." },
  );

  server.registerTool("list_mail", {
    title: "List recent mail",
    description: "List recent messages in the connected inbox, newest first. Returns sender, subject, date, unread state, and stable IMAP UID; it does not return message bodies.",
    inputSchema: { limit: z.number().int().min(1).max(20).default(10) },
    annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
  }, async ({ limit }) => {
    if (!hasScope("mail:read")) return error("This connection does not have permission to read mail.");
    try {
      const { account: saved, password } = await account();
      return result({ messages: await listMail(saved, password, limit) });
    } catch {
      return error("Could not list mail. Check your mailbox settings and try again.");
    }
  });

  server.registerTool("search_mail", {
    title: "Search mail",
    description: "Search the connected inbox using IMAP server-side search. Filters are combined with AND. Returns at most 20 message summaries, newest first, with stable IMAP UIDs.",
    inputSchema: {
      from: z.string().max(254).optional(),
      subject: z.string().max(200).optional(),
      text: z.string().max(200).optional(),
      since: z.iso.date().optional(),
      limit: z.number().int().min(1).max(20).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
  }, async ({ from, subject, text, since, limit }) => {
    if (!hasScope("mail:read")) return error("This connection does not have permission to search mail.");
    if (!from && !subject && !text && !since) return error("Provide at least one search filter.");
    try {
      const { account: saved, password } = await account();
      return result({ messages: await searchMail(saved, password, { from, subject, text, since }, limit) });
    } catch {
      return error("Could not search mail. Check your mailbox settings and try again.");
    }
  });

  server.registerTool("get_mail", {
    title: "Read a mail message",
    description: "Read one inbox message by IMAP UID returned by list_mail or search_mail. Returns plain text, headers, and attachment presence; attachments and HTML are not returned. Messages larger than 256 KB are not read.",
    inputSchema: { uid: z.number().int().positive() },
    annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
  }, async ({ uid }) => {
    if (!hasScope("mail:read")) return error("This connection does not have permission to read mail.");
    try {
      const { account: saved, password } = await account();
      const message = await getMail(saved, password, uid);
      return message ? result({ message }) : error("Message not found.");
    } catch {
      return error("Could not read mail. Check your mailbox settings and try again.");
    }
  });

  server.registerTool("send_mail", {
    title: "Send an email",
    description: "Send one plain-text email through the connected SMTP account. This is an external, irreversible action. Show the complete recipient list, subject, and body to the user and get explicit approval before calling. Maximum five recipients and 20 messages per connected mailbox per UTC day.",
    inputSchema: {
      to: z.array(z.email().max(254)).min(1).max(5),
      subject: z.string().min(1).max(300),
      text: z.string().min(1).max(20_000),
    },
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: true },
  }, async ({ to, subject, text }) => {
    if (!hasScope("mail:send")) return error("This connection does not have permission to send mail.");
    const userId = getMcpAuthContext()?.props?.userId;
    if (typeof userId !== "string") return error("Connect your mailbox first.");
    try {
      const { account: saved, password } = await account();
      const day = new Date().toISOString().slice(0, 10);
      const allowance = await workerEnv.DB.prepare("INSERT INTO send_limits (user_id,day,sent_count) VALUES (?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET sent_count=sent_count+1 WHERE sent_count<20 RETURNING sent_count")
        .bind(userId, day).first<{ sent_count: number }>();
      if (!allowance) return error("Daily send limit reached (20 messages per UTC day).");
      const sent = await sendMail(saved, password, { to, subject, text });
      return result({ status: "submitted", ...sent });
    } catch {
      return error("Sending failed or its delivery status is uncertain. Check your Sent folder before retrying to avoid duplicates.");
    }
  });

  server.registerTool("remove_mailbox", {
    title: "Remove connected mailbox",
    description: "Delete the saved mailbox connection, encrypted app password, and send counters from this service. Ask for explicit approval before calling. Disconnecting the MCP client separately revokes its token.",
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
  }, async () => {
    if (!hasScope("mail:read") && !hasScope("mail:send")) return error("This connection has no mail permission.");
    const userId = getMcpAuthContext()?.props?.userId;
    if (typeof userId !== "string") return error("Connect your mailbox first.");
    await workerEnv.DB.batch([
      workerEnv.DB.prepare("DELETE FROM mail_accounts WHERE user_id = ?").bind(userId),
      workerEnv.DB.prepare("DELETE FROM send_limits WHERE user_id = ?").bind(userId),
    ]);
    return result({ removed: true });
  });

  return server;
}

const mcpHandler = createMcpHandler(createServer);

const provider = new OAuthProvider({
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  clientIdMetadataDocumentEnabled: true,
  scopesSupported: ["mail:read", "mail:send"],
  apiRoute: "/mail",
  apiHandler: { fetch(request: Request, env: unknown, ctx: ExecutionContext) { return mcpHandler(request, env, ctx); } },
  resourceMetadata: {
    resource: workerEnv.MCP_BASE_URL,
    authorization_servers: [new URL(workerEnv.MCP_BASE_URL).origin],
    scopes_supported: ["mail:read", "mail:send"],
    resource_name: "Softlian Mail",
  },
  defaultHandler: {
    fetch(request: Request, env: unknown) {
      return handlePublic(request, env as Env);
    },
  },
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return provider.fetch(request, env, ctx);
  },
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    ctx.waitUntil(env.DB.prepare("DELETE FROM send_limits WHERE day < ?").bind(cutoff).run());
  },
};
