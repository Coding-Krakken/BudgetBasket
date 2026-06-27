import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  providerConnection: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  default: mockDb,
}));

describe("LiveKrogerDigitalProvider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_SECRET", "test-secret-with-enough-length");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refreshes expired connected-account tokens and stores rotated tokens encrypted", async () => {
    const { credentialStore } = await import("./credential-store");
    const { LiveKrogerDigitalProvider } = await import("./live-kroger-digital");
    const { decryptProviderToken, encryptProviderToken, isEncryptedToken } = await import("@/lib/token-encryption");

    credentialStore.setCredential("live-kroger-digital", "client_id", "client-id");
    credentialStore.setCredential("live-kroger-digital", "client_secret", "client-secret");

    mockDb.providerConnection.findMany.mockResolvedValue([
      {
        id: "conn-1",
        userId: "user-1",
        accessToken: encryptProviderToken("expired-access"),
        refreshToken: encryptProviderToken("old-refresh"),
        tokenExpiresAt: new Date("2026-01-01T00:00:00Z"),
        accountId: "acct-1",
      },
    ]);
    mockDb.providerConnection.update.mockResolvedValue({});

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 1800,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "coupon-1",
              title: "$1 off milk",
              saving: { value: 1, type: "AMOUNT" },
              expirationDate: "2026-12-31T23:59:59Z",
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new LiveKrogerDigitalProvider().fetchOpportunities();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        title: "$1 off milk",
        requiresAccount: true,
        confidenceLevel: "CONNECTED_ACCOUNT",
        confidence: 0.93,
      }),
    ]);

    const refreshUpdate = mockDb.providerConnection.update.mock.calls[0][0].data;
    expect(refreshUpdate.accessToken).not.toBe("new-access");
    expect(refreshUpdate.refreshToken).not.toBe("new-refresh");
    expect(isEncryptedToken(refreshUpdate.accessToken)).toBe(true);
    expect(isEncryptedToken(refreshUpdate.refreshToken)).toBe(true);
    expect(decryptProviderToken(refreshUpdate.accessToken)).toBe("new-access");
    expect(decryptProviderToken(refreshUpdate.refreshToken)).toBe("new-refresh");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.kroger.com/v1/connect/oauth2/token",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams),
      })
    );
    const tokenBody = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(tokenBody.get("refresh_token")).toBe("old-refresh");
  });
});
