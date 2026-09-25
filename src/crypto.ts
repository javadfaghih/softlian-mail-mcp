const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

async function credentialKey(encodedKey: string): Promise<CryptoKey> {
  const raw = fromBase64(encodedKey);
  if (raw.byteLength !== 32) {
    throw new Error("CREDENTIAL_KEY must contain 32 random bytes in base64");
  }
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptPassword(password: string, userId: string, encodedKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: encoder.encode(userId) },
    await credentialKey(encodedKey),
    encoder.encode(password),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptPassword(value: string, userId: string, encodedKey: string): Promise<string> {
  const parts = value.split(".");
  if (parts.length !== 2) throw new Error("Invalid encrypted credential");
  const iv = fromBase64(parts[0]);
  const ciphertext = fromBase64(parts[1]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: encoder.encode(userId) },
    await credentialKey(encodedKey),
    ciphertext as BufferSource,
  );
  return decoder.decode(plain);
}
