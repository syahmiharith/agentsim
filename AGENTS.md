# AGENTS.md

## Project: Agentsim

Agentsim is an open-source AI organization layer for solo software freelancers.

The goal is to help one capable person operate with the execution capacity, specialist coverage, and coordination discipline of a small software agency.

The first narrow use case is:

> A solo freelance software developer gives a vague client software request to an AI team and receives a scoped, reviewed, runnable, handoff-ready software delivery package.

Agentsim is **not** trying to create a new foundation model. It is a **BYOK control plane** that coordinates model providers, agents, workspaces, artifacts, reviews, approvals, and final delivery packages.

---

## Core Product Vision

Long-term vision:

> One human director. One AI organization. Real business execution.

First wedge:

> One solo software freelancer can turn a vague client request into a professional software delivery package with the support of a structured AI team.

The user should feel like they are directing a small software agency, not operating an agent framework.

The product experience should be:

```text
Goal
→ Progress
→ Decisions needed
→ Artifacts
→ Review
→ Final package
```

The internal system may use agents, tasks, model calls, workspaces, and reviewers, but the user-facing abstraction should remain outcome-driven.

---

## What Agentsim Is

Agentsim is mostly a **control plane**.

It owns:

```text
goals
agents
task assignment
artifact flow
approvals
decisions
event trace
workspace abstraction
memory
lineage
final package assembly
```

It does not own:

```text
foundation models
container runtimes
cloud infrastructure
vector databases
deployment platforms
```

Those should remain replaceable dependencies behind thin interfaces.

Use abstractions such as:

```ts
ModelProvider
WorkspaceDriver
ToolExecutor
ArtifactStore
EventStore
```

---

## v0 Target

The first milestone is a CLI demo.

Example:

```bash
pnpm demo "Build an inventory request system for a flower company"
```

Expected output:

```text
outputs/{runId}/final-package/
├── client/
│   ├── project-summary.md
│   ├── handoff-notes.md
│   └── user-guide.md
├── planning/
│   ├── requirements.md
│   ├── scope.md
│   ├── assumptions.md
│   ├── timeline.md
│   └── risks.md
├── technical/
│   ├── architecture.md
│   ├── task-breakdown.md
│   └── deployment-guide.md
├── app/
│   ├── package.json
│   ├── src/
│   └── README.md
├── review/
│   ├── qa-report.md
│   ├── code-review.md
│   └── known-issues.md
└── trace/
    ├── events.jsonl
    ├── decisions.json
    └── artifact-lineage.json
```

The generated app should be simple but runnable locally.

For the first demo, acceptable app scope:

```text
create inventory request
view request list
update request status
basic admin page
mock database or SQLite
README with run instructions
```

The demo must prove:

```text
high-level client goal
→ AI agency workflow
→ artifact generation
→ runnable software prototype
→ QA review
→ final handoff package
```

---

## Recommended Stack

Use TypeScript as the main implementation language.

Preferred v0 stack:

```text
TypeScript
pnpm
Node.js
Commander.js
Zod
tsx
dotenv
execa
fs/promises
```

Use Python only for optional eval/data/helper scripts later.

Use Go only later if a stable runner, daemon, or standalone binary becomes necessary.

---

## Suggested Repository Structure

Start with this shape:

```text
/apps/cli
/packages/core
/packages/artifacts
/packages/agents
/packages/workspaces
/packages/model-providers
/packages/evals
/examples/software-freelance
/outputs
```

Do not add a full web app until the CLI vertical slice works.

---

## Core Contracts

Build around these contracts from day one:

```text
Agent
TaskRun
Artifact
Workspace
Decision
Approval
Event
Organization
Project
DomainPack
```

These are the spine of the product.

The implementation can be thin in v0, but the contracts should be clean.

---

## Artifact-First Rule

Agentsim is artifact-first.

Agents should coordinate through artifacts, not free-form chat.

Good coordination primitive:

```text
Artifact produced
Artifact reviewed
Artifact revised
Artifact approved
Artifact exported
```

Avoid making agent-to-agent chat the core system.

Each artifact should track:

```text
id
runId
projectId
type
title
status
ownerAgentId
inputArtifactIds
contentPath
contentHash
createdAt
updatedAt
reviewStatus
approvalStatus
```

Example artifact statuses:

```text
draft
reviewed
approved
rejected
superseded
```

---

## Agent Model

For the first software-freelance workflow, use a small AI agency team:

```text
Client Intake Agent
Scope / PM Agent
Software Architect Agent
Builder Agent
Reviewer / QA Agent
Delivery Agent
```

Responsibilities:

### Client Intake Agent

Turns vague client goals into:

```text
client brief
clarifying questions
assumptions
initial project interpretation
```

### Scope / PM Agent

Produces:

```text
requirements
scope
timeline
milestones
risks
task breakdown
```

### Software Architect Agent

Produces:

```text
architecture
database plan
API plan
technical constraints
implementation approach
```

### Builder Agent

Produces or modifies:

```text
app files
README
.env.example
setup instructions
```

### Reviewer / QA Agent

Checks:

```text
requirements consistency
scope realism
code quality
runnability
known issues
missing edge cases
```

### Delivery Agent

Packages:

```text
client summary
handoff notes
final package
trace files
```

---

## TaskRun State Machine

Use deterministic task states before adding complex orchestration.

Suggested states:

```text
PENDING
RUNNING
PRODUCED_ARTIFACT
NEEDS_REVIEW
REVIEW_PASSED
REVIEW_FAILED
WAITING_HUMAN_APPROVAL
APPROVED
REJECTED
COMPLETED
FAILED
CANCELLED
```

Failure states should preserve traceability:

```text
FAILED_MODEL_CALL
FAILED_TOOL_CALL
FAILED_REVIEW
TIMEOUT
BUDGET_EXCEEDED
```

---

## Workspace Strategy

Do not start with complex Docker infrastructure.

Start with a workspace abstraction:

```text
WorkspaceDriver
├── LocalFilesystemWorkspaceDriver
└── DockerWorkspaceDriver later
```

v0 should use:

```text
LocalFilesystemWorkspaceDriver
```

The interface should allow later support for:

```text
DockerWorkspaceDriver
E2BWorkspaceDriver
DaytonaWorkspaceDriver
RemoteVMWorkspaceDriver
```

The interface should support:

```ts
createWorkspace(runId)
writeFile(workspaceId, path, content)
readFile(workspaceId, path)
listFiles(workspaceId)
runCommand(workspaceId, command)
```

`runCommand` can be optional in the first implementation but should be included in the interface design.

---

## BYOK Model Provider Rule

Agentsim uses Bring Your Own Key.

Start simple:

```text
.env-based API keys for local development
```

Later:

```text
encrypted credential storage
provider-level routing
per-run model selection
cost tracking
```

Never leak API keys into:

```text
logs
events
artifacts
workspace files
model-visible prompts
error traces
```

Start with a simple provider interface:

```ts
interface ModelProvider {
  generate(input: GenerateInput): Promise<GenerateResult>
}
```

Start with one provider first. Add more only after the vertical slice works.

---

## Event Trace

Every run should produce an event log.

For v0:

```text
outputs/{runId}/final-package/trace/events.jsonl
```

Each event should include:

```text
timestamp
runId
taskRunId
agentId
eventType
message
artifactId?
metadata?
```

The event trace is important because the product’s differentiation depends on:

```text
traceability
artifact lineage
reviewability
debuggability
```

---

## Evaluation Harness

Evaluation is not optional.

Create an eval harness early.

Suggested folder:

```text
/packages/evals
/examples/software-freelance/evals
```

Eval cases should include:

```text
inventory request system
booking system
student portal
expense splitter
small CRM
landing page for local business
```

Score outputs on:

```text
requirement completeness
scope realism
artifact consistency
runnability
QA quality
handoff usefulness
cost per run
human decisions required
```

The product must eventually prove that this workflow is better than a single ChatGPT/Claude prompt.

---

## Human Approval Principle

The AI team can draft, analyze, recommend, generate, and package.

The AI team should require human approval before high-risk actions such as:

```text
sending emails
publishing websites
deploying to production
charging money
ordering services
deleting data
changing pricing
contacting clients
```

For v0, approvals can be stored as records even if the CLI uses simple prompts.

---

## What To Avoid In v0

Do not build these first:

```text
full web dashboard
visual workflow builder
agent marketplace
complex persistent memory
multi-agent chat UI
Docker-per-agent runtime
SaaS BYOK
broad business management
generic Manus clone
```

Do not overbuild the platform before the first useful output works.

The first product must be useful even before it is complex.

---

## Differentiation

Agentsim is not mainly:

```text
multi-agent chat
```

It is:

```text
artifact-first AI work execution for solo software freelancers
```

The differentiator is:

```text
durable artifacts
artifact lineage
human approvals
review loops
decision logs
workspace outputs
final delivery packages
organizational memory over time
```

The first proof is narrow:

> Can one solo developer use Agentsim to handle freelance software work with the discipline and output quality of a small agency?

Build toward that.

---

## Development Priorities

Prioritize in this order:

```text
1. Core contracts
2. CLI run command
3. Local filesystem workspace
4. Artifact generation
5. Event trace
6. Review step
7. Final package assembly
8. Runnable app output
9. Eval harness
10. Web artifact viewer later
```

Do not add more agents unless the existing workflow produces better artifacts.

Do not add more infrastructure unless the current workflow needs it.

Do not add broad domain support until the software-freelance workflow is useful.

---

## Quality Bar

A successful v0 run should satisfy:

```text
The user gives one high-level client goal.
The system produces multiple durable artifacts.
The artifacts are internally consistent.
The generated app can run locally.
The reviewer identifies weaknesses or confirms readiness.
The final package is organized enough to hand off.
The event trace explains what happened.
```

This is the minimum product proof.

---

## North Star

Agentsim should grow through this sequence:

```text
1. Generate reviewed software delivery packages
2. Generate runnable software packages
3. Manage project lifecycle
4. Manage freelance agency operations
5. Add domain packs
6. Support recurring business workflows
7. Become an AI organization runtime
```

Always preserve the main thesis:

> One capable human should be able to direct an AI team that plans, builds, reviews, remembers, and operates business workflows.
