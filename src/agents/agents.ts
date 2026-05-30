import type { Agent } from "../types.js";

export const agents: Agent[] = [
  {
    id: "client-intake",
    displayName: "Client Intake Agent",
    mission: "Turn a vague client goal into a crisp business-facing proposal and summary."
  },
  {
    id: "scope-pm",
    displayName: "Scope / PM Agent",
    mission: "Define requirements, scope, assumptions, timeline, risks, and implementation tasks."
  },
  {
    id: "software-architect",
    displayName: "Software Architect Agent",
    mission: "Design a practical technical plan for the prototype and handoff package."
  },
  {
    id: "builder",
    displayName: "Builder Agent",
    mission: "Create the runnable local prototype and developer-facing README."
  },
  {
    id: "reviewer-qa",
    displayName: "Reviewer / QA Agent",
    mission: "Review package quality, identify gaps, and record known issues."
  },
  {
    id: "delivery",
    displayName: "Delivery Agent",
    mission: "Assemble the final client-ready package and handoff guide."
  }
];

export function getAgent(id: Agent["id"]): Agent {
  const agent = agents.find((candidate) => candidate.id === id);
  if (!agent) {
    throw new Error(`Unknown agent: ${id}`);
  }
  return agent;
}

