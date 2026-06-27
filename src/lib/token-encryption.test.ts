import { describe, expect, it, vi } from "vitest";

describe("provider token encryption", () => {
  it("encrypts and decrypts provider tokens without storing plaintext", async () => {
    vi.stubEnv("APP_SECRET", "test-secret-with-enough-length");
    const { decryptProviderToken, encryptProviderToken, isEncryptedToken } = await import("./token-encryption");

    const encrypted = encryptProviderToken("access-token-value");

    expect(encrypted).not.toBe("access-token-value");
    expect(encrypted).toContain("enc:v1:");
    expect(isEncryptedToken(encrypted)).toBe(true);
    expect(decryptProviderToken(encrypted)).toBe("access-token-value");
  });

  it("allows legacy plaintext reads so migration can rotate old rows", async () => {
    vi.stubEnv("APP_SECRET", "test-secret-with-enough-length");
    const { decryptProviderToken } = await import("./token-encryption");

    expect(decryptProviderToken("legacy-token")).toBe("legacy-token");
  });
});
