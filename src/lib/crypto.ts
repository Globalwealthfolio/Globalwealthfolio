const PBKDF2_ITERATIONS = 600000;
const KEY_LENGTH = 256;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function fromBase64(str: string): Uint8Array {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"],
  );
}

export function isEncrypted(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const p = JSON.parse(raw);
    return p && p.encrypted === true && typeof p.data === "string" && typeof p.iv === "string";
  } catch {
    return false;
  }
}

export async function encryptData(data: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(data));
  return JSON.stringify({
    encrypted: true,
    salt: base64(salt),
    iv: base64(iv),
    data: base64(new Uint8Array(ciphertext)),
  });
}

export async function decryptData(payload: string, passphrase: string): Promise<string> {
  const p = JSON.parse(payload);
  if (!p.encrypted) return payload;
  const salt = fromBase64(p.salt);
  const iv = fromBase64(p.iv);
  const data = fromBase64(p.data);
  const key = await deriveKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
