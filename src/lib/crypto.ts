import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function key(): Buffer {
  const raw = getEnv().ENCRYPTION_KEY;
  const decoded = Buffer.from(raw, "base64");

  if (decoded.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be a base64-encoded 32-byte value. Generate it with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  return decoded;
}

/** Encrypts a secret for storage. Never log or return the result to the client. */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ["v1", iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Unsupported or corrupted secret payload");
  }

  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(payload: string): string {
  try {
    const value = decryptSecret(payload);
    return `${"*".repeat(Math.max(4, Math.min(12, value.length - 4)))}${value.slice(-4)}`;
  } catch {
    return "********";
  }
}
