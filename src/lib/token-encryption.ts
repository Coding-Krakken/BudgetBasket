import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const TOKEN_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(secret = process.env.APP_SECRET ?? process.env.NEXTAUTH_SECRET): Buffer {
  if (!secret || secret.length < 16) {
    throw new Error("APP_SECRET must be configured with at least 16 characters for token encryption.");
  }

  return createHash("sha256").update(secret).digest();
}

export function isEncryptedToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(TOKEN_PREFIX);
}

export function encryptProviderToken(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isEncryptedToken(value)) return value;

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${TOKEN_PREFIX}${Buffer.concat([iv, authTag, encrypted]).toString("base64url")}`;
}

export function decryptProviderToken(value: string | null | undefined): string | null {
  if (!value) return null;

  // Legacy plaintext values are returned so old rows can be rotated by the migration script.
  if (!isEncryptedToken(value)) return value;

  const payload = Buffer.from(value.slice(TOKEN_PREFIX.length), "base64url");
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskEncryptedToken(value: string | null | undefined): string | null {
  if (!value) return null;
  return isEncryptedToken(value) ? `${TOKEN_PREFIX}...` : "legacy-plaintext";
}
