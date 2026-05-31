import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlEventStore } from "../src/core/events.js";
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

  it("redacts common provider, source control, cloud, and private key secrets", () => {
    const input = [
      "anthropic_api_key=sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890",
      "github_token=ghp_abcdefghijklmnopqrstuvwxyz1234567890",
      "fine_grained=github_pat_abcdefghijklmnopqrstuvwxyz_1234567890",
      "AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF",
      "AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz1234567890",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789",
      "-----BEGIN PRIVATE KEY-----\nvery-secret-material\n-----END PRIVATE KEY-----",
    ].join("\n");

    const redacted = redactSecrets(input);

    expect(redacted).not.toContain("sk-ant-api03");
    expect(redacted).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
    expect(redacted).not.toContain("github_pat_abcdefghijklmnopqrstuvwxyz");
    expect(redacted).not.toContain("AKIA1234567890ABCDEF");
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz1234567890");
    expect(redacted).not.toContain("very-secret-material");
  });

  it("redacts records before event persistence", () => {
    const redacted = redactRecord({ token: "secret-value", nested: { apiKey: "abc123" } });
    expect(JSON.stringify(redacted)).not.toContain("secret-value");
    expect(JSON.stringify(redacted)).not.toContain("abc123");
  });

  it("keeps runId owned by the event store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "agentsim-events-"));
    const eventsPath = join(dir, "events.jsonl");
    const store = new JsonlEventStore("store-run-id", eventsPath);

    await store.append({
      level: "info",
      name: "test.event",
      message: "hello",
    });

    const [line] = (await readFile(eventsPath, "utf8")).trim().split("\n");
    const event = JSON.parse(line ?? "{}");
    expect(event.runId).toBe("store-run-id");
  });
});
