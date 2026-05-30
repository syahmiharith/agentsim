import { describe, expect, it } from "vitest";
import { sha256 } from "../src/core/hash.js";
import { redactRecord, redactSecrets } from "../src/core/redact.js";

describe("core utilities", () => {
  it("hashes content deterministically", () => {
    expect(sha256("agentsim")).toBe(sha256("agentsim"));
    expect(sha256("agentsim")).not.toBe(sha256("other"));
  });

  it("redacts obvious secrets", () => {
    expect(redactSecrets("OPENAI_API_KEY=sk-testsecret123456")).not.toContain("sk-testsecret123456");
    expect(redactSecrets("Authorization: Bearer abc.def.ghi")).toContain("Bearer [REDACTED]");
  });

  it("redacts records before event persistence", () => {
    const redacted = redactRecord({ token: "secret-value", nested: { apiKey: "abc123" } });
    expect(JSON.stringify(redacted)).not.toContain("secret-value");
    expect(JSON.stringify(redacted)).not.toContain("abc123");
  });
});

