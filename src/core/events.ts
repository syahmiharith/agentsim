import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Event, EventStore } from "../types.js";
import { redactRecord, redactSecrets } from "./redact.js";

type EventTransform = (event: Event) => Event;

export class JsonlEventStore implements EventStore {
  constructor(
    private readonly runId: string,
    private readonly eventsPath: string,
    private readonly transform?: EventTransform
  ) {}

  async append(input: Omit<Event, "id" | "timestamp" | "runId">): Promise<Event> {
    const event: Event = {
      ...input,
      id: randomUUID(),
      runId: this.runId,
      timestamp: new Date().toISOString(),
      message: redactSecrets(input.message),
      data: input.data ? redactRecord(input.data) : undefined
    };

    return this.appendExisting(event);
  }

  async appendExisting(event: Event): Promise<Event> {
    const eventToWrite = this.transform ? this.transform(event) : event;
    await mkdir(dirname(this.eventsPath), { recursive: true });
    await appendFile(this.eventsPath, `${JSON.stringify(eventToWrite)}\n`, "utf8");
    return event;
  }
}

export class CompositeEventStore implements EventStore {
  constructor(
    private readonly runId: string,
    private readonly stores: JsonlEventStore[]
  ) {}

  async append(input: Omit<Event, "id" | "timestamp" | "runId">): Promise<Event> {
    if (this.stores.length === 0) {
      throw new Error("CompositeEventStore requires at least one event store.");
    }

    const event: Event = {
      ...input,
      id: randomUUID(),
      runId: this.runId,
      timestamp: new Date().toISOString(),
      message: redactSecrets(input.message),
      data: input.data ? redactRecord(input.data) : undefined
    };
    await Promise.all(this.stores.map((store) => store.appendExisting(event)));
    return event;
  }
}
