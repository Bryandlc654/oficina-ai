import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("super-secret-123");
    await expect(verifyPassword("super-secret-123", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("super-secret-123");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("never stores the plain password", async () => {
    const hash = await hashPassword("super-secret-123");
    expect(hash).not.toContain("super-secret-123");
    expect(hash.startsWith("$2")).toBe(true);
  });
});
