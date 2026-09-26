import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionFailureMessage } from "../src/connection-errors.ts";

test("only an authentication failure blames mailbox credentials", () => {
  assert.match(connectionFailureMessage("IMAP", {authenticationFailed: true}), /app password/);
  assert.match(connectionFailureMessage("SMTP", {code: "EAUTH"}), /app password/);
  assert.doesNotMatch(connectionFailureMessage("SMTP", {code: "ETIMEDOUT"}), /app password|rejected/);
});

test("network and certificate failures identify the affected protocol", () => {
  assert.match(connectionFailureMessage("IMAP", {code: "CONNECT_TIMEOUT"}), /IMAP.*993/);
  assert.match(connectionFailureMessage("SMTP", {code: "ESOCKET", message: "certificate has expired"}), /SMTP.*TLS certificate/);
  assert.match(connectionFailureMessage("IMAP", {code: "ENOTFOUND"}), /hostname/);
});

test("provider responses and secrets are never included in error messages", () => {
  for (const error of [null, "secret", {message: "secret user@example.com"}, {code:"EAUTH", message:"secret user@example.com"}]) {
    assert.doesNotMatch(connectionFailureMessage("SMTP", error), /secret|user@example/);
  }
});
