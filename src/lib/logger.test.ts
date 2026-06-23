import { describe, expect, it } from "vitest";
import { redactSensitiveValue } from "./logger";

describe("logger redaction", () => {
  it("redacts credential values in messages and nested fields", () => {
    const redacted = redactSensitiveValue(
      {
        msg: "token secret-client-value failed",
        nested: { authorization: "Bearer secret-token-value" },
        list: ["plain", "secret-client-value"],
      },
      ["secret-client-value", "secret-token-value"]
    );

    expect(JSON.stringify(redacted)).not.toContain("secret-client-value");
    expect(JSON.stringify(redacted)).not.toContain("secret-token-value");
    expect(redacted).toEqual({
      msg: "token [REDACTED] failed",
      nested: { authorization: "Bearer [REDACTED]" },
      list: ["plain", "[REDACTED]"],
    });
  });
});
