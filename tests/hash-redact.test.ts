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
      message: "hello"
    });

    const [line] = (await readFile(eventsPath, "utf8")).trim().split("\n");
    const event = JSON.parse(line ?? "{}");
    expect(event.runId).toBe("store-run-id");
  });
});
