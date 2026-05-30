import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Event, EventStore } from "../types.js";
import { redactRecord, redactSecrets } from "./redact.js";

export class JsonlEventStore implements EventStore {
  constructor(
    private readonly runId: string,
    private readonly eventsPath: string
  ) {}

  async append(input: Omit<Event, "id" | "timestamp">): Promise<Event> {
    const event: Event = {
      ...input,
      id: randomUUID(),
      runId: this.runId,
      timestamp: new Date().toISOString(),
      message: redactSecrets(input.message),
      data: input.data ? redactRecord(input.data) : undefined
    };

    await mkdir(dirname(this.eventsPath), { recursive: true });
    await appendFile(this.eventsPath, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }
}

