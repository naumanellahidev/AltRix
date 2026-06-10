/**
 * src/lib/crypto/ptEncryption.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight symmetric encryption for parent-teacher / collaboration messages.
 * Uses the browser's native Web Crypto API (AES-GCM 256-bit).
 *
 * NOTE: The key is derived from a fixed application secret.  For a production
 * deployment you would store the key in Supabase Vault / per-conversation keys.
 * This implementation keeps things self-contained and functional.
 */

const APP_SECRET = "altrix-collab-aes-key-v1"; // 32-char string → 256-bit key

/** Derive a CryptoKey from the shared secret (cached after first call). */
let _cachedKey: CryptoKey | null = null;
async function getKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;

  const enc = new TextEncoder();
  const raw = enc.encode(APP_SECRET.padEnd(32, "0").slice(0, 32));
  _cachedKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  return _cachedKey;
}

export interface EncryptedPayload {
  iv: string;   // base64-encoded initialisation vector
  data: string; // base64-encoded ciphertext
}

/** Encrypt a plaintext string → EncryptedPayload */
export async function encryptMessage(plaintext: string): Promise<EncryptedPayload> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
  };
}

/** Decrypt an EncryptedPayload → plaintext string */
export async function decryptMessage(payload: EncryptedPayload): Promise<string> {
  try {
    const key = await getKey();
    const iv = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
    const data = Uint8Array.from(atob(payload.data), (c) => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    // If decryption fails (e.g. plain-text messages stored before encryption was added),
    // try returning the raw data field as-is.
    try {
      return atob(payload.data);
    } catch {
      return "[encrypted message]";
    }
  }
}
