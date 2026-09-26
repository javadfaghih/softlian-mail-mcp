import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizationCompletePage } from "../src/auth-completion.ts";

test("successful authorization offers automatic and manual return to the OAuth client", async () => {
  const response = authorizationCompletePage("https://chatgpt.com/connector/oauth/example?code=sample&state=sample");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /http-equiv="refresh" content="0;url=https:\/\/chatgpt\.com\/connector\/oauth\/example\?code=sample&amp;state=sample"/);
  assert.match(html, /href="https:\/\/chatgpt\.com\/connector\/oauth\/example\?code=sample&amp;state=sample"/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-security-policy"), /form-action 'none'/);
});

test("callback URL cannot inject HTML or run a script scheme", async () => {
  const response = authorizationCompletePage("https://chatgpt.com/callback?state=%22%3E%3Cscript%3E");
  assert.doesNotMatch(await response.text(), /<script>/);
  assert.throws(() => authorizationCompletePage("javascript:alert(1)"), /Invalid OAuth callback URL/);
});
