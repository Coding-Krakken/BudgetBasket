import { describe, expect, it, vi } from "vitest";

describe("provider OAuth state", () => {
  it("round-trips signed state with PKCE verifier", async () => {
    vi.stubEnv("APP_SECRET", "test-secret-with-enough-length");
    const { createCodeVerifier, createOAuthState, parseOAuthState } = await import("./provider-oauth");

    const codeVerifier = createCodeVerifier();
    const sealed = createOAuthState({
      providerId: "live-kroger-digital",
      userId: "user_123",
      codeVerifier,
      redirectTo: "https://example.test/integrations",
    });

    const parsed = parseOAuthState(sealed);
    expect(parsed.providerId).toBe("live-kroger-digital");
    expect(parsed.userId).toBe("user_123");
    expect(parsed.codeVerifier).toBe(codeVerifier);
  });

  it("rejects tampered state", async () => {
    vi.stubEnv("APP_SECRET", "test-secret-with-enough-length");
    const { createOAuthState, parseOAuthState } = await import("./provider-oauth");
    const sealed = createOAuthState({
      providerId: "live-kroger-digital",
      userId: "user_123",
      codeVerifier: "verifier",
      redirectTo: "https://example.test/integrations",
    });

    expect(() => parseOAuthState(`${sealed}x`)).toThrow("Invalid OAuth state");
  });
});
