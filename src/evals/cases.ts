export interface EvalCase {
  id: string;
  title: string;
  goal: string;
  expectedAppName: string;
  expectedEntityName: string;
  expectedStatuses: string[];
}

export const softwareFreelanceEvalCases: EvalCase[] = [
  {
    id: "inventory-request-system",
    title: "Inventory request system",
    goal: "Build an inventory request system for a flower company",
    expectedAppName: "Inventory Request Desk",
    expectedEntityName: "Inventory Request",
    expectedStatuses: ["Pending", "Approved", "Ordered"]
  },
  {
    id: "booking-system",
    title: "Booking system",
    goal: "Build a booking system for a barber shop",
    expectedAppName: "Barber Booking Desk",
    expectedEntityName: "Booking",
    expectedStatuses: ["Requested", "Confirmed", "Completed"]
  },
  {
    id: "student-portal",
    title: "Student portal",
    goal: "Build a student portal for handling student service requests",
    expectedAppName: "Student Portal Desk",
    expectedEntityName: "Student Request",
    expectedStatuses: ["Submitted", "In Review", "Resolved"]
  },
  {
    id: "expense-splitter",
    title: "Expense splitter",
    goal: "Build an expense splitter for a small group trip",
    expectedAppName: "Expense Splitter Desk",
    expectedEntityName: "Expense",
    expectedStatuses: ["Logged", "Split Calculated", "Settled"]
  },
  {
    id: "small-crm",
    title: "Small CRM",
    goal: "Build a small CRM for a local service business",
    expectedAppName: "Small CRM Desk",
    expectedEntityName: "Lead",
    expectedStatuses: ["New", "Qualified", "Won"]
  },
  {
    id: "local-business-landing-page",
    title: "Landing page for local business",
    goal: "Build a landing page workflow for a local bakery",
    expectedAppName: "Local Business Landing Desk",
    expectedEntityName: "Content Request",
    expectedStatuses: ["Draft", "Approved", "Published Copy"]
  }
];
