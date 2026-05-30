import type { DomainSpec, EntitySpec, FieldSpec, ScreenSpec } from "./domain-spec.js";

export interface DomainPreset {
  id: string;
  appName: string;
  appSlug: string;
  appArchetype?: "simple-workflow";
  domain: string;
  keywords: string[];
  priority?: number;
  primaryEntity: EntitySpec;
  supportingEntities?: EntitySpec[];
  targetUsers: string[];
  screens: ScreenSpec[];
  workflowStatuses: string[];
  coreActions: string[];
  approvalPoints: string[];
  generatedArtifactTypes?: string[];
  assumptions: string[];
  risks: string[];
  seedRecords: Array<Record<string, string | number>>;
  fallback?: boolean;
}

export const defaultGeneratedArtifactTypes = [
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
  "handoff-notes",
  "user-guide"
];

export const domainPresets: DomainPreset[] = [
  {
    id: "barber-booking",
    appName: "Barber Booking Desk",
    appSlug: "barber-booking-desk",
    appArchetype: "simple-workflow",
    domain: "barber booking",
    keywords: ["barber", "booking"],
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
  },
  {
    id: "clinic-appointment",
    appName: "Clinic Appointment Desk",
    appSlug: "clinic-appointment-desk",
    appArchetype: "simple-workflow",
    domain: "clinic appointment",
    keywords: ["clinic", "appointment"],
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
  },
  {
    id: "restaurant-reservation",
    appName: "Restaurant Reservation Desk",
    appSlug: "restaurant-reservation-desk",
    appArchetype: "simple-workflow",
    domain: "restaurant reservation",
    keywords: ["restaurant", "reservation"],
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
  },
  {
    id: "equipment-checkout",
    appName: "Club Equipment Checkout",
    appSlug: "club-equipment-checkout",
    appArchetype: "simple-workflow",
    domain: "equipment checkout",
    keywords: ["equipment", "checkout", "university club"],
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
  },
  {
    id: "student-portal",
    appName: "Student Portal Desk",
    appSlug: "student-portal-desk",
    appArchetype: "simple-workflow",
    domain: "student service request",
    keywords: ["student", "portal"],
    primaryEntity: entity("Student Request", "Student Requests", "requests", [
      field("studentName", "Student name", "text"),
      field("studentId", "Student ID", "text"),
      selectField("requestType", "Request type", ["Enrollment", "Transcript", "Advising", "Financial aid"]),
      field("targetDate", "Target date", "date", false),
      field("notes", "Notes", "textarea", false)
    ]),
    targetUsers: ["students", "student services staff", "program administrators"],
    screens: screens("New Student Request", "Student Request List", "Services Admin"),
    workflowStatuses: ["Submitted", "In Review", "Waiting on Student", "Resolved", "Rejected"],
    coreActions: ["Create student request", "View student requests", "Update request status", "Filter by status"],
    approvalPoints: ["Resolve request", "Reject request"],
    assumptions: ["The school needs a lightweight portal workflow before SIS integration.", "Staff can triage student service requests from one queue."],
    risks: ["Production use needs authentication, FERPA-aware access controls, and audit logging.", "The prototype does not integrate with a student information system."],
    seedRecords: [
      { studentName: "Iris Nguyen", studentId: "S-1042", requestType: "Transcript", targetDate: "2026-06-09", notes: "Needs unofficial copy.", status: "In Review" },
      { studentName: "Mateo Brooks", studentId: "S-1188", requestType: "Advising", targetDate: "2026-06-12", notes: "Graduation planning.", status: "Submitted" }
    ]
  },
  {
    id: "expense-splitter",
    appName: "Expense Splitter Desk",
    appSlug: "expense-splitter-desk",
    appArchetype: "simple-workflow",
    domain: "shared expense tracking",
    keywords: ["expense", "splitter"],
    primaryEntity: entity("Expense", "Expenses", "expenses", [
      field("title", "Title", "text"),
      field("paidBy", "Paid by", "text"),
      field("amount", "Amount", "number"),
      field("participants", "Participants", "text"),
      selectField("category", "Category", ["Food", "Travel", "Supplies", "Other"]),
      field("notes", "Notes", "textarea", false)
    ]),
    targetUsers: ["friends", "trip organizers", "small group admins"],
    screens: screens("New Expense", "Expense List", "Settlement Admin"),
    workflowStatuses: ["Logged", "Reviewed", "Split Calculated", "Settled", "Disputed"],
    coreActions: ["Create expense", "View expenses", "Update expense status", "Filter by status"],
    approvalPoints: ["Mark split calculated", "Mark settled"],
    assumptions: ["The first prototype tracks shared expenses without payment processing.", "Participants can be captured as a simple comma-separated field for review."],
    risks: ["Production use needs account identity and payment reconciliation.", "Advanced split formulas are not modeled yet."],
    seedRecords: [
      { title: "Dinner", paidBy: "Ari", amount: 128, participants: "Ari, Sam, Lee", category: "Food", notes: "Team meal.", status: "Reviewed" },
      { title: "Train tickets", paidBy: "Lee", amount: 84, participants: "Ari, Sam, Lee", category: "Travel", notes: "Round trip.", status: "Logged" }
    ]
  },
  {
    id: "small-crm",
    appName: "Small CRM Desk",
    appSlug: "small-crm-desk",
    appArchetype: "simple-workflow",
    domain: "small business CRM",
    keywords: ["crm", "customer relationship", "lead"],
    primaryEntity: entity("Lead", "Leads", "leads", [
      field("companyName", "Company name", "text"),
      field("contactName", "Contact name", "text"),
      field("email", "Email", "text"),
      selectField("source", "Source", ["Referral", "Website", "Event", "Outbound"]),
      field("estimatedValue", "Estimated value", "number", false),
      field("notes", "Notes", "textarea", false)
    ]),
    targetUsers: ["solo business owner", "sales assistant", "operations admin"],
    screens: screens("New Lead", "Lead List", "Pipeline Admin"),
    workflowStatuses: ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"],
    coreActions: ["Create lead", "View leads", "Update lead status", "Filter by status"],
    approvalPoints: ["Qualify lead", "Mark deal won or lost"],
    assumptions: ["The business needs a simple pipeline tracker before adopting a full CRM.", "One shared admin queue is enough for a first review."],
    risks: ["Production use needs email integration, access controls, and activity history.", "Forecasting and reminders are outside the MVP."],
    seedRecords: [
      { companyName: "North Pier Studio", contactName: "Dana Fox", email: "dana@example.com", source: "Referral", estimatedValue: 4200, notes: "Needs quote this week.", status: "Qualified" },
      { companyName: "Greenline Cafe", contactName: "Omar Chen", email: "omar@example.com", source: "Website", estimatedValue: 1800, notes: "Asked about booking site.", status: "New" }
    ]
  },
  {
    id: "landing-page-content",
    appName: "Local Business Landing Desk",
    appSlug: "local-business-landing-desk",
    appArchetype: "simple-workflow",
    domain: "landing page content request",
    keywords: ["landing page", "local business"],
    primaryEntity: entity("Content Request", "Content Requests", "requests", [
      field("businessName", "Business name", "text"),
      selectField("section", "Section", ["Hero", "Services", "About", "Contact"]),
      field("headline", "Headline", "text"),
      field("owner", "Owner", "text"),
      field("notes", "Notes", "textarea", false)
    ]),
    targetUsers: ["business owner", "freelance developer", "content reviewer"],
    screens: screens("New Content Request", "Content Request List", "Landing Page Admin"),
    workflowStatuses: ["Draft", "In Review", "Approved", "Published Copy", "Rejected"],
    coreActions: ["Create content request", "View content requests", "Update request status", "Filter by section or status"],
    approvalPoints: ["Approve landing copy", "Mark copy ready for implementation"],
    assumptions: ["The first package should organize content and handoff assets before building a public site.", "Publishing is a high-risk action and remains outside the v0 workflow."],
    risks: ["The prototype does not publish a public website.", "Brand assets and SEO requirements need client review."],
    seedRecords: [
      { businessName: "Elm Street Bakery", section: "Hero", headline: "Fresh bread every morning", owner: "Nora", notes: "Mention catering.", status: "In Review" },
      { businessName: "Elm Street Bakery", section: "Services", headline: "Custom cakes and daily pastries", owner: "Nora", notes: "Add seasonal menu later.", status: "Draft" }
    ]
  },
  {
    id: "inventory-request",
    appName: "Inventory Request Desk",
    appSlug: "inventory-request-desk",
    appArchetype: "simple-workflow",
    domain: "inventory request",
    keywords: ["flower", "inventory"],
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
  },
  {
    id: "fallback-client-request-tracker",
    appName: "Client Request Tracker",
    appSlug: "client-request-tracker",
    appArchetype: "simple-workflow",
    domain: "client request tracking",
    keywords: [],
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
    ],
    fallback: true
  }
];

export function domainSpecFromPreset(preset: DomainPreset, sourceGoal: string): DomainSpec {
  return {
    sourceGoal,
    appName: preset.appName,
    appSlug: preset.appSlug,
    appArchetype: preset.appArchetype,
    domain: preset.domain,
    primaryEntity: cloneEntity(preset.primaryEntity),
    supportingEntities: (preset.supportingEntities ?? []).map(cloneEntity),
    targetUsers: [...preset.targetUsers],
    screens: preset.screens.map((screen) => ({ ...screen, actions: [...screen.actions] })),
    workflowStatuses: [...preset.workflowStatuses],
    coreActions: [...preset.coreActions],
    approvalPoints: [...preset.approvalPoints],
    generatedArtifactTypes: [...(preset.generatedArtifactTypes ?? defaultGeneratedArtifactTypes)],
    assumptions: [...preset.assumptions],
    risks: [...preset.risks],
    seedRecords: preset.seedRecords.map((record) => ({ ...record }))
  };
}

function cloneEntity(entitySpec: EntitySpec): EntitySpec {
  return {
    ...entitySpec,
    fields: entitySpec.fields.map((fieldSpec) => ({ ...fieldSpec, options: fieldSpec.options ? [...fieldSpec.options] : undefined }))
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
