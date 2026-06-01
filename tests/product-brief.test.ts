import { describe, expect, it } from "vitest";
import { parseProductBriefJson, productBriefFromDomainSpec, productBriefToDomainSpec } from "../src/domain/product-brief.js";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";

describe("ProductBrief", () => {
  it("parses strict model JSON and derives a valid DomainSpec", () => {
    const { brief } = parseProductBriefJson(
      JSON.stringify({
        schemaVersion: 1,
        appName: "Pet Grooming Scheduler",
        appArchetype: "booking-lite",
        domain: "pet grooming appointments",
        targetUsers: ["front desk staff"],
        primaryJobs: ["Create appointment", "Confirm appointment"],
        entities: [
          {
            name: "Appointment",
            pluralName: "Appointments",
            slug: "appointments",
            fields: [
              { name: "petName", label: "Pet name", type: "text", required: true },
              { name: "service", label: "Service", type: "select", required: true, options: ["Bath", "Trim"] },
              { name: "appointmentDateTime", label: "Appointment date/time", type: "datetime", required: true },
            ],
          },
        ],
        workflows: [
          { name: "Appointment workflow", statuses: ["Requested", "Confirmed", "Completed"], initialStatus: "Requested", terminalStatuses: ["Completed"] },
        ],
        screens: [{ name: "New Appointment", purpose: "Create appointments.", actions: ["Create appointment"] }],
        constraints: [],
        assumptions: ["Local prototype only."],
        risks: [],
        deferredFeatures: ["calendar sync"],
        seedRecords: [{ petName: "Mochi", service: "Bath", appointmentDateTime: "2026-06-05T09:00", status: "Requested" }],
      }),
      "Build a pet grooming appointment system",
    );

    expect(brief.appArchetype).toBe("booking-lite");
    expect(productBriefToDomainSpec(brief).primaryEntity.name).toBe("Appointment");
  });

  it("keeps unsupported prompt requirements as deferred features", () => {
    const { brief } = parseProductBriefJson(
      JSON.stringify({
        schemaVersion: 1,
        appName: "Repair Desk",
        appArchetype: "crud-workflow",
        domain: "phone repair tickets",
        targetUsers: ["repair staff"],
        primaryJobs: ["Create ticket"],
        entities: [
          {
            name: "Ticket",
            pluralName: "Tickets",
            slug: "tickets",
            fields: [{ name: "customerName", label: "Customer name", type: "text", required: true }],
          },
        ],
        workflows: [{ name: "Ticket workflow", statuses: ["Open", "Closed"], initialStatus: "Open", terminalStatuses: ["Closed"] }],
        screens: [{ name: "New Ticket", purpose: "Create tickets.", actions: ["Create ticket"] }],
        constraints: [],
        assumptions: ["Local prototype only."],
        risks: [],
        unresolvedQuestions: ["Who can close tickets?"],
        deferredFeatures: [],
        seedRecords: [{ customerName: "Ari", status: "Open" }],
      }),
      "Build a phone repair ticket system with login, SMS notifications, Stripe billing, and hosted production deployment",
    );
    const domainSpec = productBriefToDomainSpec(brief);

    expect(brief.unresolvedQuestions).toContain("Who can close tickets?");
    expect(domainSpec.deferredFeatures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Authentication"),
        expect.stringContaining("Payments"),
        expect.stringContaining("Hosted deployment"),
        expect.stringContaining("Notifications"),
      ]),
    );
  });

  it("rejects malformed model JSON", () => {
    expect(() => parseProductBriefJson("{ nope", "Build an app")).toThrow("invalid JSON");
  });

  it("derives a mock ProductBrief from deterministic DomainSpec", () => {
    const spec = inferDomainSpec("Build an inventory request system for a flower company");
    const brief = productBriefFromDomainSpec(spec);

    expect(brief.appName).toBe("Inventory Request Desk");
    expect(brief.appArchetype).toBe("inventory-lite");
    expect(brief.entities[0].name).toBe("Inventory Request");
  });
});
