import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnvCredentialStore } from "./credential-store";
import { LiveKrogerProvider } from "./live-kroger";

const products = [
  { id: "p1", slug: "whole-milk-gallon", name: "Whole Milk", normalizedName: "whole milk" },
];

const stores = [{ id: "01400943", slug: "kroger", name: "Kroger" }];

describe("LiveKrogerProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T12:00:00Z"));
    delete process.env.KROGER_DEFAULT_LOCATION_ID;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("gracefully fails when credentials are missing", async () => {
    const provider = new LiveKrogerProvider(new EnvCredentialStore({}), vi.fn() as unknown as typeof fetch);

    expect(provider.hasRequiredCredentials()).toBe(false);

    const result = await provider.fetchPrices(products, stores);
    expect(result.success).toBe(false);
    expect(result.error).toContain("credentials are not configured");
  });

  it("gracefully fails when Kroger location id is missing", async () => {
    const provider = new LiveKrogerProvider(
      new EnvCredentialStore({
        KROGER_CLIENT_ID: "client-id",
        KROGER_CLIENT_SECRET: "client-secret",
      }),
      vi.fn() as unknown as typeof fetch
    );

    const result = await provider.fetchPrices(products, stores);

    expect(result.success).toBe(false);
    expect(result.error).toContain("KROGER_DEFAULT_LOCATION_ID");
  });

  it("fetches official API prices with OAuth client credentials", async () => {
    process.env.KROGER_DEFAULT_LOCATION_ID = "01400943";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-value", expires_in: 1800 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              productId: "0001111040101",
              description: "Whole Milk",
              items: [{ size: "1 gal", price: { regular: 3.99, promo: 3.49 } }],
            },
          ],
        }),
      });

    const provider = new LiveKrogerProvider(
      new EnvCredentialStore({
        KROGER_CLIENT_ID: "client-id",
        KROGER_CLIENT_SECRET: "client-secret",
      }),
      fetchImpl as unknown as typeof fetch
    );

    const pending = provider.fetchPrices(products, stores);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        productSlug: "whole-milk-gallon",
        storeSlug: "kroger",
        price: 3.99,
        salePrice: 3.49,
        confidence: 0.95,
        source: "live-kroger-api",
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.kroger.com/v1/connect/oauth2/token");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("https://api.kroger.com/v1/products?");
  });

  it("maps Kroger coupon and promotional price payloads into opportunities", async () => {
    process.env.KROGER_DEFAULT_LOCATION_ID = "01400943";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-value", expires_in: 1800 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              productId: "0001111040101",
              description: "Whole Milk",
              items: [{ size: "1 gal", price: { regular: 3.99, promo: 3.49 } }],
              coupons: [
                {
                  id: "coupon-1",
                  title: "$1 off Whole Milk",
                  description: "Clip digital coupon for $1 off.",
                  valueAmount: 1,
                  minimumQuantity: 1,
                  expirationDate: "2026-06-30T23:59:59Z",
                  isDigital: true,
                },
              ],
            },
          ],
        }),
      });

    const provider = new LiveKrogerProvider(
      new EnvCredentialStore({
        KROGER_CLIENT_ID: "client-id",
        KROGER_CLIENT_SECRET: "client-secret",
      }),
      fetchImpl as unknown as typeof fetch
    );

    const pending = provider.fetchOpportunities(products, stores);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      expect.objectContaining({
        type: "DIGITAL_COUPON",
        title: "$1 off Whole Milk",
        productSlug: "whole-milk-gallon",
        storeSlug: "kroger",
        valueType: "FIXED_OFF",
        valueAmount: 1,
        requiresClipping: true,
        requiresAccount: true,
        confidenceLevel: "OFFICIAL_API",
      }),
      expect.objectContaining({
        type: "STORE_SALE",
        productSlug: "whole-milk-gallon",
        storeSlug: "kroger",
        valueType: "SALE_PRICE",
        valueAmount: 3.49,
        confidence: 0.95,
      }),
    ]);
  });

  it("deduplicates token and product requests across concurrent fetches", async () => {
    process.env.KROGER_DEFAULT_LOCATION_ID = "01400943";
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-value", expires_in: 1800 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              productId: "0001111040101",
              description: "Whole Milk",
              items: [{ size: "1 gal", price: { regular: 3.99, promo: 3.49 } }],
              coupons: [
                {
                  id: "coupon-1",
                  title: "$1 off Whole Milk",
                  valueAmount: 1,
                  isDigital: true,
                },
              ],
            },
          ],
        }),
      });

    const provider = new LiveKrogerProvider(
      new EnvCredentialStore({
        KROGER_CLIENT_ID: "client-id",
        KROGER_CLIENT_SECRET: "client-secret",
      }),
      fetchImpl as unknown as typeof fetch
    );

    const pending = Promise.all([
      provider.fetchPrices(products, stores),
      provider.fetchOpportunities(products, stores),
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    const [priceResult, opportunityResult] = await pending;

    expect(priceResult.success).toBe(true);
    expect(opportunityResult.success).toBe(true);
    expect(priceResult.data).toHaveLength(1);
    expect(opportunityResult.data).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.kroger.com/v1/connect/oauth2/token");
    expect(String(fetchImpl.mock.calls[1][0])).toContain("https://api.kroger.com/v1/products?");
  });
});
