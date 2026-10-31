import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.DATABASE_URL ??= "mysql://test:test@localhost:3306/test";
  process.env.AUTH_SECRET ??= "test-secret-with-at-least-24-characters";
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
});

describe("secret encryption", () => {
  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret } = await import("./crypto");
    const cipher = encryptSecret("gemini-api-key-123");
    expect(cipher).not.toContain("gemini-api-key-123");
    expect(decryptSecret(cipher)).toBe("gemini-api-key-123");
  });

  it("produces different ciphertexts for the same input", async () => {
    const { encryptSecret } = await import("./crypto");
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("masks a secret without revealing it", async () => {
    const { encryptSecret, maskSecret } = await import("./crypto");
    const masked = maskSecret(encryptSecret("abcdefghijkl"));
    expect(masked).toMatch(/\*+/);
    expect(masked).not.toContain("abcdefghijkl");
  });
});
