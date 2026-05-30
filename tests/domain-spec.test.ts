import { describe, expect, it } from "vitest";
import type { DomainSpec } from "../src/domain/domain-spec.js";
import { inferDomainSpec, inferDomainSpecResult } from "../src/domain/mock-domain-spec.js";
import { matchDomainPreset } from "../src/domain/domain-inference.js";
import { validateDomainSpec } from "../src/domain/domain-validation.js";
import { domainPresets, domainSpecFromPreset } from "../src/domain/presets.js";

describe("inferDomainSpec", () => {
  it("maps a barber prompt to booking workflow fields and statuses", () => {
    const spec = inferDomainSpec("Build a booking system for a barber shop");

    expect(spec.appName).toContain("Barber");
    expect(spec.primaryEntity.name).toBe("Booking");
    expect(spec.workflowStatuses).toContain("Confirmed");
    expect(spec.primaryEntity.fields.map((field) => field.name)).toEqual(expect.arrayContaining(["service", "appointmentDateTime"]));
  });

  it("maps a clinic prompt to appointment workflow fields", () => {
    const spec = inferDomainSpec("Build a clinic appointment system");

    expect(spec.domain).toBe("clinic appointment");
    expect(spec.primaryEntity.name).toBe("Appointment");
    expect(spec.primaryEntity.fields.map((field) => field.name)).toEqual(expect.arrayContaining(["patientName", "provider", "visitReason"]));
  });

  it("maps a restaurant prompt to reservation workflow fields", () => {
    const spec = inferDomainSpec("Build a restaurant reservation system");

    expect(spec.primaryEntity.name).toBe("Reservation");
    expect(spec.primaryEntity.fields.map((field) => field.name)).toEqual(expect.arrayContaining(["partySize", "seatingPreference"]));
  });

  it("maps an equipment prompt to checkout workflow statuses", () => {
    const spec = inferDomainSpec("Build an equipment checkout system for a university club");

    expect(spec.primaryEntity.name).toBe("Checkout");
    expect(spec.workflowStatuses).toEqual(expect.arrayContaining(["Checked Out", "Returned", "Overdue"]));
  });

  it.each([
    ["Build an inventory request system for a flower company", "inventory-request", "Inventory Request Desk", "Inventory Request"],
    ["Build a booking system for a barber shop", "barber-booking", "Barber Booking Desk", "Booking"],
    ["Build a clinic appointment system", "clinic-appointment", "Clinic Appointment Desk", "Appointment"],
    ["Build a restaurant reservation system", "restaurant-reservation", "Restaurant Reservation Desk", "Reservation"],
    ["Build an equipment checkout system for a university club", "equipment-checkout", "Club Equipment Checkout", "Checkout"],
    ["Build a CRM for a small business", "small-crm", "Small CRM Desk", "Lead"],
    ["Build a student portal", "student-portal", "Student Portal Desk", "Student Request"],
    ["Build a landing page workflow for a local business", "landing-page-content", "Local Business Landing Desk", "Content Request"]
  ])("returns inference metadata for %s", (goal, presetId, appName, entityName) => {
    const result = inferDomainSpecResult(goal);

    expect(result.matchedPresetId).toBe(presetId);
    expect(result.spec.appName).toBe(appName);
    expect(result.spec.primaryEntity.name).toBe(entityName);
    expect(result.spec.appArchetype).toBe("simple-workflow");
    expect(result.fallbackUsed).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.35);
    expect(validateDomainSpec(result.spec).ok).toBe(true);
  });

  it("uses fallback metadata when no preset matches", () => {
    const result = inferDomainSpecResult("Build something for a tiny office");

    expect(result.matchedPresetId).toBe("fallback-client-request-tracker");
    expect(result.spec.appName).toBe("Client Request Tracker");
    expect(result.fallbackUsed).toBe(true);
    expect(result.confidence).toBe(0.35);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("fallback")]));
  });

  it("marks close preset matches as needing clarification", () => {
    const result = inferDomainSpecResult("Build a clinic appointment and barber booking system");

    expect(result.needsClarification).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("multiple close presets")]));
  });

  it("raises confidence for stronger keyword matches", () => {
    const weak = inferDomainSpecResult("Build a barber scheduling tool");
    const strong = inferDomainSpecResult("Build a barber booking system");

    expect(weak.matchedPresetId).toBe("barber-booking");
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });

  it("matches presets deterministically by score", () => {
    const match = matchDomainPreset("Build an equipment checkout system for a university club", domainPresets);

    expect(match.preset.id).toBe("equipment-checkout");
    expect(match.matchedKeywords).toEqual(["equipment", "checkout", "university club"]);
    expect(match.ambiguous).toBe(false);
  });
});

describe("domain preset registry", () => {
  it("keeps preset IDs and slugs unique", () => {
    expect(new Set(domainPresets.map((preset) => preset.id)).size).toBe(domainPresets.length);
    expect(new Set(domainPresets.map((preset) => preset.appSlug)).size).toBe(domainPresets.length);
  });

  it("keeps every preset valid and simple-workflow shaped", () => {
    for (const preset of domainPresets) {
      const spec = domainSpecFromPreset(preset, "Build a test app");
      expect(spec.appArchetype).toBe("simple-workflow");
      expect(spec.primaryEntity.fields.length).toBeGreaterThan(0);
      expect(spec.workflowStatuses.length).toBeGreaterThan(0);
      expect(spec.seedRecords.length).toBeGreaterThan(0);
      expect(spec.screens.length).toBeGreaterThan(0);
      expect(spec.coreActions.length).toBeGreaterThan(0);
      expect(validateDomainSpec(spec).failures).toEqual([]);
    }
  });
});

describe("validateDomainSpec", () => {
  const validSpec = inferDomainSpec("Build an inventory request system for a flower company");

  it("fails duplicate field names", () => {
    const spec = cloneSpec(validSpec);
    spec.primaryEntity.fields.push({ ...spec.primaryEntity.fields[0] });

    expect(validateDomainSpec(spec).failures).toEqual(expect.arrayContaining([expect.stringContaining("duplicate field name")]));
  });

  it("fails invalid app slugs", () => {
    const spec = cloneSpec(validSpec);
    spec.appSlug = "Invalid Slug";

    expect(validateDomainSpec(spec).failures).toEqual(expect.arrayContaining([expect.stringContaining("appSlug")]));
  });

  it("fails invalid seed statuses", () => {
    const spec = cloneSpec(validSpec);
    spec.seedRecords[0].status = "Unknown";

    expect(validateDomainSpec(spec).failures).toEqual(expect.arrayContaining([expect.stringContaining("valid workflow status")]));
  });

  it("fails missing required seed fields", () => {
    const spec = cloneSpec(validSpec);
    delete spec.seedRecords[0].itemName;

    expect(validateDomainSpec(spec).failures).toEqual(expect.arrayContaining([expect.stringContaining("itemName is required")]));
  });

  it("fails invalid select seed options", () => {
    const spec = cloneSpec(validSpec);
    spec.seedRecords[0].priority = "Emergency";

    expect(validateDomainSpec(spec).failures).toEqual(expect.arrayContaining([expect.stringContaining("valid select option")]));
  });
});

function cloneSpec(spec: DomainSpec): DomainSpec {
  return JSON.parse(JSON.stringify(spec)) as DomainSpec;
}
