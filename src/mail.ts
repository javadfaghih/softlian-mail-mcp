import { ImapFlow } from "imapflow";
import type { FetchMessageObject } from "imapflow";
import nodemailer from "nodemailer";
import PostalMime from "postal-mime";
import type { MailAccount } from "./env";

export interface MailSummary {
  uid: number;
  subject: string | null;
  from: string[];
  date: string | null;
  seen: boolean;
}

function addressList(addresses: Array<{ address?: string } | null> | undefined): string[] {
  return (addresses ?? []).map((address) => address?.address ?? "").filter(Boolean);
}

function summarize(message: FetchMessageObject): MailSummary {
  return {
    uid: message.uid,
    subject: message.envelope?.subject ?? null,
    from: addressList(message.envelope?.from),
    date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
    seen: message.flags?.has("\\Seen") ?? false,
  };
}

async function withInbox<T>(account: MailAccount, password: string, operation: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: account.imap_host,
    port: 993,
    secure: true,
    auth: { user: account.email, pass: password },
    logger: false,
    disableAutoIdle: true,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      return await operation(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function verifyMailbox(account: Pick<MailAccount, "email" | "imap_host">, password: string): Promise<void> {
  const client = new ImapFlow({
    host: account.imap_host,
    port: 993,
    secure: true,
    auth: { user: account.email, pass: password },
    logger: false,
    disableAutoIdle: true,
  });
  await client.connect();
  await client.logout().catch(() => undefined);
}

export async function verifySender(account: Pick<MailAccount, "email" | "smtp_host">, password: string): Promise<void> {
  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: 465,
    secure: true,
    auth: { user: account.email, pass: password },
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export async function listMail(account: MailAccount, password: string, limit: number): Promise<MailSummary[]> {
  return withInbox(account, password, async (client) => {
    const total = client.mailbox ? client.mailbox.exists : 0;
    if (total === 0) return [];
    const start = Math.max(1, total - limit + 1);
    const messages = await client.fetchAll(`${start}:${total}`, { envelope: true, flags: true, uid: true });
    return messages.map(summarize).reverse();
  });
}

export async function searchMail(
  account: MailAccount,
  password: string,
  query: { from?: string; subject?: string; text?: string; since?: string },
  limit: number,
): Promise<MailSummary[]> {
  return withInbox(account, password, async (client) => {
    const search = {
      ...(query.from ? { from: query.from } : {}),
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.text ? { text: query.text } : {}),
      ...(query.since ? { since: new Date(query.since) } : {}),
    };
    const uids = await client.search(search, { uid: true });
    if (!uids || uids.length === 0) return [];
    const selected = uids.slice(-limit);
    const messages = await client.fetchAll(selected, { envelope: true, flags: true, uid: true }, { uid: true });
    return messages.map(summarize).sort((a, b) => b.uid - a.uid);
  });
}

export async function getMail(account: MailAccount, password: string, uid: number) {
  return withInbox(account, password, async (client) => {
    const meta = await client.fetchOne(String(uid), { size: true, envelope: true, flags: true, uid: true }, { uid: true });
    if (!meta) return null;
    if ((meta.size ?? 0) > 256_000) {
      return { ...summarize(meta), error: "This message exceeds the 256 KB reading limit." };
    }
    const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!message || !message.source) return null;
    const parsed = await PostalMime.parse(message.source);
    return {
      ...summarize(meta),
      to: addressList(parsed.to),
      cc: addressList(parsed.cc),
      text: parsed.text?.slice(0, 40_000) ?? "",
      hasAttachments: parsed.attachments.length > 0,
    };
  });
}

export async function sendMail(
  account: MailAccount,
  password: string,
  input: { to: string[]; subject: string; text: string },
): Promise<{ messageId: string; accepted: string[]; rejected: string[] }> {
  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: 465,
    secure: true,
    auth: { user: account.email, pass: password },
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
  });
  try {
    const result = await transport.sendMail({ from: account.email, to: input.to, subject: input.subject, text: input.text });
    return { messageId: result.messageId, accepted: result.accepted.map(String), rejected: result.rejected.map(String) };
  } finally {
    transport.close();
  }
}
