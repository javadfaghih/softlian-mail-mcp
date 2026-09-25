import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptPassword, encryptPassword } from "../src/crypto.ts";

const key = Buffer.alloc(32, 7).toString("base64");

test("app password encrypts and decrypts for its mailbox", async () => {
  const encrypted = await encryptPassword("test app password", "mailbox-a", key);
  assert.notEqual(encrypted, "test app password");
  assert.equal(await decryptPassword(encrypted, "mailbox-a", key), "test app password");
});

test("encrypted password cannot be reused for a different mailbox", async () => {
  const encrypted = await encryptPassword("test app password", "mailbox-a", key);
  await assert.rejects(decryptPassword(encrypted, "mailbox-b", key));
});

test("an invalid encryption key is rejected", async () => {
  await assert.rejects(encryptPassword("test", "mailbox-a", "AA=="), /32 random bytes/);
});
