function uint8ToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function base64ToUint8(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function importAesKeyFromMasterSecret(masterSecret: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(masterSecret)
  );

  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt"
  ]);
}

export async function encryptGeminiApiKeyPlaintext(
  plaintext: string,
  masterSecret: string
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKeyFromMasterSecret(masterSecret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    ciphertextB64: uint8ToBase64(new Uint8Array(ciphertext)),
    ivB64: uint8ToBase64(iv)
  };
}

export async function decryptGeminiApiKeyMaterial(
  ciphertextB64: string,
  ivB64: string,
  masterSecret: string
) {
  const key = await importAesKeyFromMasterSecret(masterSecret);
  const iv = base64ToUint8(ivB64);
  const ciphertext = base64ToUint8(ciphertextB64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

export function apiKeyLast4(plaintext: string) {
  const trimmed = plaintext.trim();
  if (trimmed.length <= 4) {
    return trimmed;
  }

  return trimmed.slice(-4);
}
