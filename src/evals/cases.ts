export interface EvalCase {
  id: string;
  title: string;
  goal: string;
  expectedAppName: string;
  expectedEntityName: string;
  expectedStatuses: string[];
  useCase: EvalUseCase;
}

export interface EvalUseCase {
  targetUser: string;
  scenario: string;
  productFit: "core-wedge" | "adjacent-wedge" | "edge-case";
  businessJustification: string;
  whyAgentsim: string;
  oneShotFailureMode: string;
  proofSignals: string[];
}

export const softwareFreelanceEvalCases: EvalCase[] = [
  {
    id: "inventory-request-system",
    title: "Inventory request system",
    goal: "Build an inventory request system for a flower company",
    expectedAppName: "Inventory Request Desk",
    expectedEntityName: "Inventory Request",
    expectedStatuses: ["Pending", "Approved", "Ordered"],
    useCase: {
      targetUser: "solo developer building an operations prototype for a small business client",
      scenario: "The client gives a vague workflow request and needs a package they can review with staff before paying for production work.",
      productFit: "core-wedge",
      businessJustification: "This is a strong first wedge because small businesses often need scope, workflow clarity, a runnable prototype, and handoff notes before a larger project is approved.",
      whyAgentsim: "Agentsim can turn the ambiguous request into requirements, scope, technical notes, a runnable local app, QA review, and a traceable handoff package.",
      oneShotFailureMode: "A one-shot prompt may describe an inventory app, but it usually will not preserve artifact lineage, review status, runnable app files, and client handoff structure together.",
      proofSignals: ["requirements", "runnable app", "QA report", "handoff notes", "event trace"]
    }
  },
  {
    id: "booking-system",
    title: "Booking system",
    goal: "Build a booking system for a barber shop",
    expectedAppName: "Barber Booking Desk",
    expectedEntityName: "Booking",
    expectedStatuses: ["Requested", "Confirmed", "Completed"],
    useCase: {
      targetUser: "freelancer scoping a scheduling workflow for a local service business",
      scenario: "The client needs appointment intake, status handling, and a reviewable admin flow before calendar or payment integrations.",
      productFit: "core-wedge",
      businessJustification: "Booking projects are common freelance work, but risk grows quickly when scheduling rules, roles, reminders, and integrations are unclear.",
      whyAgentsim: "Agentsim should expose the MVP boundary, assumptions, risks, and next integration questions while still generating a runnable prototype.",
      oneShotFailureMode: "A one-shot prompt often jumps to implementation details without separating MVP scope from production scheduling risk.",
      proofSignals: ["scope", "timeline", "risk register", "booking statuses", "known issues"]
    }
  },
  {
    id: "student-portal",
    title: "Student portal",
    goal: "Build a student portal for handling student service requests",
    expectedAppName: "Student Portal Desk",
    expectedEntityName: "Student Request",
    expectedStatuses: ["Submitted", "In Review", "Resolved"],
    useCase: {
      targetUser: "freelancer assessing whether an education workflow is safe to prototype",
      scenario: "A school wants a student-facing workflow, but privacy, identity, and system integration risk must be made visible.",
      productFit: "adjacent-wedge",
      businessJustification: "This use case tests whether Agentsim can be useful when the domain has higher compliance and access-control concerns.",
      whyAgentsim: "Agentsim should produce a prototype while clearly calling out what must not be treated as production-ready.",
      oneShotFailureMode: "A one-shot prompt can understate privacy, audit, and integration risks because there is no separate review artifact.",
      proofSignals: ["assumptions", "risks", "known issues", "review report", "handoff questions"]
    }
  },
  {
    id: "expense-splitter",
    title: "Expense splitter",
    goal: "Build an expense splitter for a small group trip",
    expectedAppName: "Expense Splitter Desk",
    expectedEntityName: "Expense",
    expectedStatuses: ["Logged", "Split Calculated", "Settled"],
    useCase: {
      targetUser: "solo developer validating a lightweight consumer workflow before building deeper logic",
      scenario: "The request sounds simple, but payment, identity, settlement, and split rules can make it deceptively complex.",
      productFit: "adjacent-wedge",
      businessJustification: "This case tests whether Agentsim can keep a small app narrow and avoid overbuilding risky financial behavior.",
      whyAgentsim: "Agentsim should produce a local review prototype and identify payment processing as outside the first delivery.",
      oneShotFailureMode: "A one-shot prompt may either overbuild payment features or omit settlement limitations.",
      proofSignals: ["MVP scope", "out-of-scope payment handling", "status flow", "runnable app", "review limitations"]
    }
  },
  {
    id: "small-crm",
    title: "Small CRM",
    goal: "Build a small CRM for a local service business",
    expectedAppName: "Small CRM Desk",
    expectedEntityName: "Lead",
    expectedStatuses: ["New", "Qualified", "Won"],
    useCase: {
      targetUser: "freelancer packaging a business workflow prototype for a non-technical owner",
      scenario: "A local business wants lead tracking but may not know the difference between a prototype, a CRM integration, and an operating process.",
      productFit: "core-wedge",
      businessJustification: "CRM-lite work is a plausible freelance wedge because the client values process clarity and handoff more than novel technology.",
      whyAgentsim: "Agentsim should create a delivery package that explains pipeline scope, lead fields, risks, and implementation boundaries.",
      oneShotFailureMode: "A one-shot prompt may generate generic CRM advice without producing an inspectable app and delivery package.",
      proofSignals: ["pipeline statuses", "technical plan", "client guide", "handoff notes", "trace files"]
    }
  },
  {
    id: "local-business-landing-page",
    title: "Landing page for local business",
    goal: "Build a landing page workflow for a local bakery",
    expectedAppName: "Local Business Landing Desk",
    expectedEntityName: "Content Request",
    expectedStatuses: ["Draft", "Approved", "Published Copy"],
    useCase: {
      targetUser: "freelancer organizing client content before implementing a public site",
      scenario: "The client asks for a landing page, but the immediate blocker is collecting, reviewing, and approving copy and sections.",
      productFit: "edge-case",
      businessJustification: "This is a weaker but useful edge case because Agentsim must justify when a workflow package is better than just generating page copy.",
      whyAgentsim: "Agentsim should help when the value is content approval, handoff structure, and publishing risk control rather than a finished marketing page.",
      oneShotFailureMode: "A one-shot prompt can write copy, but it will not manage approval state, handoff artifacts, or decision trace.",
      proofSignals: ["approval statuses", "handoff notes", "scope boundaries", "publishing risk", "client review flow"]
    }
  }
];
