import { describe, expect, it } from "vitest";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";

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
});
