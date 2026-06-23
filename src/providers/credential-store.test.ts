import { describe, expect, it } from "vitest";
import { EnvCredentialStore, collectCredentialValues, getCredentialEnvName } from "./credential-store";

describe("EnvCredentialStore", () => {
  it("maps provider credentials to upper-case environment variables", () => {
    expect(getCredentialEnvName("live-kroger-api", "client_id")).toBe("KROGER_CLIENT_ID");
    expect(getCredentialEnvName("live-kroger-api", "client_secret")).toBe("KROGER_CLIENT_SECRET");
    expect(getCredentialEnvName("live-walmart-api", "api_key")).toBe("WALMART_API_KEY");
    expect(getCredentialEnvName("ibotta", "oauth_access_token")).toBe("IBOTTA_OAUTH_ACCESS_TOKEN");
  });

  it("returns credentials without exposing missing or blank values", () => {
    const store = new EnvCredentialStore({
      KROGER_CLIENT_ID: "client-id",
      KROGER_CLIENT_SECRET: " ",
    });

    expect(store.getCredential("live-kroger-api", "client_id")).toBe("client-id");
    expect(store.getCredential("live-kroger-api", "client_secret")).toBeNull();
    expect(store.hasCredentials("live-kroger-api", ["client_id", "client_secret"])).toBe(false);
    expect(store.missingCredentials("live-kroger-api", ["client_id", "client_secret"])).toEqual(["client_secret"]);
  });

  it("collects configured credential values for log redaction", () => {
    const store = new EnvCredentialStore({
      KROGER_CLIENT_ID: "client-id",
      KROGER_CLIENT_SECRET: "client-secret",
      WALMART_API_KEY: "walmart-key",
    });

    expect(
      collectCredentialValues(store, {
        "live-kroger-api": ["client_id", "client_secret"],
        "live-walmart-api": ["api_key"],
      }).sort()
    ).toEqual(["client-id", "client-secret", "walmart-key"]);
  });
});
