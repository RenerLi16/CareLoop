// Browser-native file encryption. No password, key, or backup is uploaded or persisted here.
export const PROTECTED_FORMAT = "careloop-protected-1";
export const MAX_PLAINTEXT_BYTES = 5_000_000;
export const MAX_FILE_BYTES = 7_000_000;
const ITERATIONS = 600_000;
const encoder = new TextEncoder();
const aad = encoder.encode("CareLoop protected bedside backup v1");
const requireCrypto = () => {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      "Backup protection needs a supported browser at HTTPS or localhost. No unprotected file was created.",
    );
};
function password(value, creating) {
  if (
    typeof value !== "string" ||
    value.length < (creating ? 12 : 1) ||
    value.length > 256 ||
    (creating && !value.trim())
  )
    throw new Error(
      creating
        ? "Use a backup passphrase of 12–256 characters."
        : "Enter the backup passphrase (up to 256 characters).",
    );
  return value; // Do not trim or normalize passwords.
}
function encode64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
function decode64(value, expected) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > MAX_FILE_BYTES ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw new Error("The protected backup has an invalid file format.");
  let bytes;
  try {
    bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("The protected backup has an invalid file format.");
  }
  if (expected && bytes.length !== expected)
    throw new Error("The protected backup has invalid encryption settings.");
  return bytes;
}
async function derive(passphrase, salt, usage) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}
export async function protectFile(payload, passphrase) {
  requireCrypto();
  password(passphrase, true);
  const plain = encoder.encode(JSON.stringify(payload));
  if (plain.length > MAX_PLAINTEXT_BYTES)
    throw new Error("This backup exceeds the 5 MB protected-file limit.");
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt, "encrypt");
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
    key,
    plain,
  );
  plain.fill(0);
  return {
    format: PROTECTED_FORMAT,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: ITERATIONS,
      salt: encode64(salt),
    },
    cipher: { name: "AES-GCM", iv: encode64(iv), tagLength: 128 },
    data: encode64(new Uint8Array(encrypted)),
  };
}
export async function unlockFile(envelope, passphrase) {
  requireCrypto();
  password(passphrase, false);
  if (
    !envelope ||
    envelope.format !== PROTECTED_FORMAT ||
    envelope.kdf?.name !== "PBKDF2" ||
    envelope.kdf.hash !== "SHA-256" ||
    envelope.kdf.iterations !== ITERATIONS ||
    envelope.cipher?.name !== "AES-GCM" ||
    envelope.cipher.tagLength !== 128
  )
    throw new Error(
      "This protected backup format or encryption settings are not supported.",
    );
  const salt = decode64(envelope.kdf.salt, 16),
    iv = decode64(envelope.cipher.iv, 12),
    data = decode64(envelope.data);
  if (data.length < 16 || data.length > MAX_PLAINTEXT_BYTES + 16)
    throw new Error("The protected backup is empty, truncated, or too large.");
  const key = await derive(passphrase, salt, "decrypt");
  let plain;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
        key,
        data,
      ),
    );
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
  } catch {
    throw new Error(
      "Could not unlock this backup. Check the passphrase and that the file is complete and unchanged.",
    );
  } finally {
    plain?.fill(0);
  }
}
