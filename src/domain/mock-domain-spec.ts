import type { DomainSpec, EntitySpec, FieldSpec, ScreenSpec } from "./domain-spec.js";

const defaultArtifactTypes = [
  "proposal",
  "project-summary",
  "requirements",
  "scope",
  "assumptions",
  "timeline",
  "risks",
  "architecture",
  "database-schema",
  "api-plan",
  "task-breakdown",
  "app",
  "qa-report",
  "code-review",
  "known-issues",
  "handoff-guide"
];

export function inferDomainSpec(goal: string): DomainSpec {
  const normalized = goal.toLowerCase();

  if (normalized.includes("barber") || normalized.includes("booking")) {
    return buildSpec({
      sourceGoal: goal,
      appName: "Barber Booking Desk",
      appSlug: "barber-booking-desk",
      domain: "barber booking",
      primaryEntity: entity("Booking", "Bookings", "bookings", [
        field("customerName", "Customer name", "text"),
        selectField("service", "Service", ["Haircut", "Beard trim", "Shave", "Color consultation"]),
        field("barber", "Barber", "text"),
        field("appointmentDateTime", "Appointment date/time", "datetime"),
        field("phone", "Phone", "text"),
        field("notes", "Notes", "textarea", false)
      ]),
      targetUsers: ["front desk staff", "barbers", "shop manager"],
      screens: screens("New Booking", "Booking Schedule", "Admin Queue"),
      workflowStatuses: ["Requested", "Confirmed", "Checked In", "Completed", "Cancelled"],
      coreActions: ["Create booking", "View bookings", "Update booking status", "Filter by status"],
      approvalPoints: ["Confirm booking time", "Cancel confirmed booking"],
      assumptions: ["The shop needs a lightweight scheduling prototype before calendar integrations.", "Staff can manage bookings from one shared admin view."],
      risks: ["Double-booking rules are not modeled yet.", "Production use needs calendar sync and customer notifications."],
      seedRecords: [
        { customerName: "Ari Lane", service: "Haircut", barber: "Mika", appointmentDateTime: "2026-06-04T10:00", phone: "555-0141", notes: "Prefers morning appointments.", status: "Confirmed" },
        { customerName: "Noah Chen", service: "Beard trim", barber: "Sam", appointmentDateTime: "2026-06-04T13:30", phone: "555-0188", notes: "First visit.", status: "Requested" }
      ]
    });
  }

  if (normalized.includes("clinic") || normalized.includes("appointment")) {
    return buildSpec({
      sourceGoal: goal,
      appName: "Clinic Appointment Desk",
      appSlug: "clinic-appointment-desk",
      domain: "clinic appointment",
      primaryEntity: entity("Appointment", "Appointments", "appointments", [
        field("patientName", "Patient name", "text"),
        field("provider", "Provider", "text"),
        field("visitReason", "Visit reason", "text"),
        field("appointmentDateTime", "Appointment date/time", "datetime"),
        field("phone", "Phone", "text"),
        field("notes", "Notes", "textarea", false)
      ]),
      targetUsers: ["reception staff", "clinic admin", "care providers"],
      screens: screens("New Appointment", "Appointment List", "Clinic Admin"),
      workflowStatuses: ["Requested", "Scheduled", "Checked In", "Completed", "Cancelled"],
      coreActions: ["Create appointment", "View appointments", "Update appointment status", "Filter by provider or status"],
      approvalPoints: ["Schedule appointment", "Cancel scheduled appointment"],
      assumptions: ["The clinic wants a workflow prototype before EHR integration.", "Reception staff can manage scheduling from one shared queue."],
      risks: ["Production use must address privacy, authentication, and audit requirements.", "Provider availability rules are not modeled yet."],
      seedRecords: [
        { patientName: "Mina Patel", provider: "Dr. Rivera", visitReason: "Annual checkup", appointmentDateTime: "2026-06-05T09:30", phone: "555-0160", notes: "Bring lab results.", status: "Scheduled" },
        { patientName: "Jon Bell", provider: "Nurse Kim", visitReason: "Follow-up", appointmentDateTime: "2026-06-05T11:00", phone: "555-0119", notes: "Prefers text reminder.", status: "Requested" }
      ]
    });
  }

  if (normalized.includes("restaurant") || normalized.includes("reservation")) {
    return buildSpec({
      sourceGoal: goal,
      appName: "Restaurant Reservation Desk",
      appSlug: "restaurant-reservation-desk",
      domain: "restaurant reservation",
      primaryEntity: entity("Reservation", "Reservations", "reservations", [
        field("guestName", "Guest name", "text"),
        field("partySize", "Party size", "number"),
        field("reservationDateTime", "Reservation date/time", "datetime"),
        field("phone", "Phone", "text"),
        selectField("seatingPreference", "Seating preference", ["No preference", "Indoor", "Patio", "Bar"]),
        field("notes", "Notes", "textarea", false)
      ]),
      targetUsers: ["host staff", "restaurant manager", "front-of-house team"],
      screens: screens("New Reservation", "Reservation List", "Host Stand View"),
      workflowStatuses: ["Requested", "Confirmed", "Seated", "Completed", "Cancelled"],
      coreActions: ["Create reservation", "View reservations", "Update reservation status", "Filter by status"],
      approvalPoints: ["Confirm reservation", "Cancel confirmed reservation"],
      assumptions: ["The restaurant needs a host-stand workflow prototype before table management integrations.", "Staff can handle reservations from one list view."],
      risks: ["Table capacity and turn-time rules are not modeled yet.", "Production use needs notifications and conflict checks."],
      seedRecords: [
        { guestName: "Elena Park", partySize: 4, reservationDateTime: "2026-06-06T19:00", phone: "555-0172", seatingPreference: "Patio", notes: "Birthday dinner.", status: "Confirmed" },
        { guestName: "Chris Wong", partySize: 2, reservationDateTime: "2026-06-06T20:15", phone: "555-0190", seatingPreference: "Indoor", notes: "Quiet table if possible.", status: "Requested" }
      ]
    });
  }

  if (normalized.includes("equipment") || normalized.includes("checkout") || normalized.includes("university club")) {
    return buildSpec({
      sourceGoal: goal,
      appName: "Club Equipment Checkout",
      appSlug: "club-equipment-checkout",
      domain: "equipment checkout",
      primaryEntity: entity("Checkout", "Checkouts", "checkouts", [
        field("memberName", "Member name", "text"),
        field("equipmentItem", "Equipment item", "text"),
        field("checkoutDate", "Checkout date", "date"),
        field("dueDate", "Due date", "date"),
        selectField("condition", "Condition", ["Good", "Fair", "Needs review"]),
        field("notes", "Notes", "textarea", false)
      ]),
      targetUsers: ["club officers", "equipment managers", "club members"],
      screens: screens("New Checkout", "Equipment Checkout List", "Club Admin"),
      workflowStatuses: ["Requested", "Approved", "Checked Out", "Returned", "Overdue", "Rejected"],
      coreActions: ["Create checkout request", "View checkouts", "Update checkout status", "Filter overdue or open items"],
      approvalPoints: ["Approve checkout request", "Mark overdue item returned"],
      assumptions: ["Club officers need a lightweight tracker before inventory system integration.", "Members can request equipment through a shared form."],
      risks: ["Production use needs member authentication and damage tracking.", "Availability conflicts are not modeled yet."],
      seedRecords: [
        { memberName: "Taylor Smith", equipmentItem: "Camera kit", checkoutDate: "2026-06-01", dueDate: "2026-06-08", condition: "Good", notes: "For campus event.", status: "Checked Out" },
        { memberName: "Jordan Lee", equipmentItem: "Projector", checkoutDate: "2026-06-03", dueDate: "2026-06-05", condition: "Fair", notes: "Needs HDMI adapter.", status: "Requested" }
      ]
    });
  }

  if (normalized.includes("flower") || normalized.includes("inventory")) {
    return buildSpec({
      sourceGoal: goal,
      appName: "Inventory Request Desk",
      appSlug: "inventory-request-desk",
      domain: "inventory request",
      primaryEntity: entity("Inventory Request", "Inventory Requests", "requests", [
        field("itemName", "Item name", "text"),
        field("quantity", "Quantity", "number"),
        field("requester", "Requester", "text"),
        selectField("priority", "Priority", ["Low", "Normal", "High"]),
        field("notes", "Notes", "textarea", false)
      ]),
      targetUsers: ["staff", "operations admin", "shop manager"],
      screens: screens("New Request", "Request List", "Admin Queue"),
      workflowStatuses: ["Pending", "Approved", "Ordered", "Fulfilled", "Rejected"],
      coreActions: ["Create inventory request", "View requests", "Update request status", "Filter by status"],
      approvalPoints: ["Approve request", "Reject request"],
      assumptions: ["Staff and admin users can share one local app for the first review.", "Inventory requests are simple records, not full purchase orders."],
      risks: ["Supplier integrations are not modeled yet.", "Production use needs authentication and durable database storage."],
      seedRecords: [
        { itemName: "White roses", quantity: 48, requester: "Mina", priority: "High", notes: "Needed for weekend arrangements.", status: "Pending" },
        { itemName: "Sage ribbon rolls", quantity: 12, requester: "Jon", priority: "Normal", notes: "Low stock in wrapping station.", status: "Approved" }
      ]
    });
  }

  return buildSpec({
    sourceGoal: goal,
    appName: "Client Request Tracker",
    appSlug: "client-request-tracker",
    domain: "client request tracking",
    primaryEntity: entity("Request", "Requests", "requests", [
      field("title", "Title", "text"),
      field("requester", "Requester", "text"),
      selectField("priority", "Priority", ["Low", "Normal", "High"]),
      field("targetDate", "Target date", "date", false),
      field("notes", "Notes", "textarea", false)
    ]),
    targetUsers: ["client-facing staff", "project admin", "delivery lead"],
    screens: screens("New Request", "Request List", "Admin Queue"),
    workflowStatuses: ["Requested", "Approved", "In Progress", "Completed", "Rejected"],
    coreActions: ["Create request", "View requests", "Update request status", "Filter by status"],
    approvalPoints: ["Approve request", "Reject request"],
    assumptions: ["The client needs a general workflow prototype before domain-specific customization.", "Local persistence is enough for a first review."],
    risks: ["The domain may require fields not inferred from the prompt.", "Production use needs authentication and stronger data validation."],
    seedRecords: [
      { title: "Initial client request", requester: "Alex", priority: "Normal", targetDate: "2026-06-10", notes: "Review with client.", status: "Requested" },
      { title: "Follow-up task", requester: "Sam", priority: "High", targetDate: "2026-06-12", notes: "Confirm scope.", status: "Approved" }
    ]
  });
}

function buildSpec(input: Omit<DomainSpec, "supportingEntities" | "generatedArtifactTypes"> & Partial<Pick<DomainSpec, "supportingEntities" | "generatedArtifactTypes">>): DomainSpec {
  return {
    ...input,
    supportingEntities: input.supportingEntities ?? [],
    generatedArtifactTypes: input.generatedArtifactTypes ?? defaultArtifactTypes
  };
}

function entity(name: string, pluralName: string, slug: string, fields: FieldSpec[]): EntitySpec {
  return { name, pluralName, slug, fields };
}

function field(name: string, label: string, type: FieldSpec["type"], required = true): FieldSpec {
  return { name, label, type, required };
}

function selectField(name: string, label: string, options: string[], required = true): FieldSpec {
  return { name, label, type: "select", required, options };
}

function screens(createName: string, listName: string, adminName: string): ScreenSpec[] {
  return [
    { name: createName, purpose: "Capture a new record with the required fields.", actions: ["Create record"] },
    { name: listName, purpose: "Review submitted records in a scannable list.", actions: ["View records", "Filter records"] },
    { name: adminName, purpose: "Update workflow status and prepare client review.", actions: ["Update status"] }
  ];
}

