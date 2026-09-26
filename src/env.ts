import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  DB: D1Database;
  DEMO_BUCKET: R2Bucket;
  CREDENTIAL_KEY: string;
  MCP_BASE_URL: string;
  OPENAI_CHALLENGE?: string;
}

export interface MailAccount {
  user_id: string;
  email: string;
  imap_host: string;
  smtp_host: string;
  encrypted_password: string;
}
