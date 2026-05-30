import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CompositeEventStore, JsonlEventStore } from "../src/core/events.js";

describe("composite event store", () => {
  it("writes the same event identity to every sink", async () => {
    const root = await mkdtemp(join(tmpdir(), "agentsim-events-test-"));
    const firstPath = join(root, "final", "events.jsonl");
    const secondPath = join(root, "state", "events.jsonl");
    const store = new CompositeEventStore("event-run", [
      new JsonlEventStore("event-run", firstPath),
      new JsonlEventStore("event-run", secondPath)
    ]);

    await store.append({ level: "info", name: "event.test", message: "hello" });

    const first = JSON.parse((await readFile(firstPath, "utf8")).trim());
    const second = JSON.parse((await readFile(secondPath, "utf8")).trim());
    expect(second).toMatchObject({
      id: first.id,
      timestamp: first.timestamp,
      runId: first.runId,
      name: first.name,
      message: first.message
    });
  });
});
