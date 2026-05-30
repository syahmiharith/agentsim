# Agentsim Milestones

## North Star

One capable person can direct an AI organization that plans, builds, reviews, remembers, and operates business workflows.

The first proof stays narrow:

```text
solo freelance software developer
-> AI agency team
-> scoped, reviewed, runnable, handoff-ready software package
```

Complexity should increase through artifacts, memory, decisions, workflows, and execution rights, not by adding more agents first.

## Current Position

Agentsim already has the first CLI-shaped proof:

```bash
pnpm demo "Build an inventory request system for a flower company"
```

Current capabilities:

- TypeScript CLI and local filesystem workspace.
- Core contracts for `Agent`, `TaskRun`, `Artifact`, `Workspace`, `Decision`, `Approval`, and `Event`.
- Mock and OpenAI-compatible model provider boundary.
- Artifact lineage, decision logs, approval records, and event trace.
- Generated runnable Vite React app package with local API and JSON persistence.

The next work should strengthen organizational capability around this spine.

## Milestone 1: Harder CLI Demo

Goal: prove `goal -> package` reliably across more than one example.

Build:

- Add `agentsim run` as the canonical command while keeping `pnpm demo` as a local shortcut.
- Add `Organization`, `Project`, and `DomainPack` as thin core contracts.
- Move the software freelance workflow into a first `software-freelance-pack` config.
- Add required artifact validation for final-package completeness.
- Add a `run-summary.json` with run status, package path, artifact count, and failures.

Acceptance:

- One command creates a complete delivery package.
- Every final package has requirements, scope, architecture, task breakdown, app, QA report, handoff guide, events, decisions, approvals, and lineage.
- The code still defaults to local filesystem and mock mode without keys.

Do not build:

- Dashboard.
- Docker runtime.
- Multi-agent chat.
- SaaS accounts.

## Milestone 2: Eval Harness

Goal: prove the workflow is better than one-shot prompting.

Build:

- Add eval cases for inventory system, booking system, student portal, expense splitter, and small CRM.
- Add a deterministic mock eval mode and optional live model eval mode.
- Score package outputs with a rubric: completeness, runnable app, client clarity, technical clarity, QA quality, and traceability.
- Compare Agentsim workflow output against a single-prompt baseline.

Acceptance:

- `pnpm eval` runs all cases and writes an eval report.
- Each case creates an output package and a scorecard.
- The report shows where workflow structure beats or loses to one-shot prompting.

Do not build:

- Complex benchmark platform.
- Public leaderboard.
- Model marketplace.

## Milestone 3: Local Workspace Execution Loop

Goal: prove tangible execution, not just file generation.

Build:

- Extend `WorkspaceDriver` with a command runner.
- Run generated app install/build checks automatically where safe.
- Capture command results into `trace/command-results.jsonl`.
- Add an error repair loop for common generated-app failures.
- Add `test-report.md` to the app package.

Acceptance:

- Generated apps can be installed and built from the package README commands.
- Build failures are captured in QA artifacts and event traces.
- At least one repair attempt is recorded when a known fixable error occurs.

Do not build:

- Docker-per-agent.
- Remote VM execution.
- Autonomous deploys.

## Milestone 4: Web Artifact Viewer

Goal: make the product understandable to a human director.

Build:

- A local web viewer for completed runs.
- Views for Goal, Progress, Artifacts, Decisions, Events, QA, and Final Package.
- Artifact preview for Markdown and app file tree.
- Decision and approval status surfaces.

Acceptance:

- A user can inspect a run without opening the filesystem manually.
- The UI follows the product flow: Goal -> Progress -> Decisions -> Artifacts -> Review -> Final Package.
- The UI does not expose agent-chat as the core experience.

Do not build:

- Full SaaS dashboard.
- Visual workflow builder.
- Team permissions.

## Milestone 5: Project Lifecycle Memory

Goal: move from one-shot package generation to project continuation.

Build:

- Persist projects separately from task runs.
- Add commands for continuing a project, revising scope, handling a change request, and generating handoff v2.
- Store client preferences, approved scope, rejected features, stack decisions, known issues, and prior artifacts.
- Add superseded artifact status and change-request history.

Acceptance:

- A user can run a second command against an existing project.
- The new run references previous decisions and artifacts.
- Change requests produce updated scope, impact notes, revised tasks, and delivery notes.

Do not build:

- Vector memory first.
- Broad CRM.
- Email sending.

## Milestone 6: Solo Agency Operating Dashboard

Goal: move from project tool to solo agency operating system.

Build:

- Clients, projects, proposal status, delivery status, pending decisions, and weekly report.
- Lead qualification and proposal pipeline as artifacts first.
- Client communication drafts without automatic sending.
- Invoice reminder artifacts without payment automation.

Acceptance:

- A weekly agency review summarizes active projects, delayed work, client follow-ups, unpaid invoices, risks, and recommended next actions.
- The dashboard emphasizes decisions needed and delivery risks.
- High-risk actions require approval gates.

Do not build:

- Payment charging.
- Automatic client email.
- Accounting system.
- Generic business OS outside software freelancing.

## Milestone 7: Domain Pack API

Goal: make Agentsim open-source extensible without losing domain quality.

Build:

- Formal `DomainPack` interface for agents, workflow steps, artifact types, rubrics, risk checklists, approval rules, final package templates, and tools.
- Keep `software-freelance-pack` as the reference implementation.
- Add one small experimental second pack only after the software pack is strong.

Acceptance:

- Contributors can add a domain pack without editing the core orchestrator.
- Packs define behavior through artifacts, workflows, rubrics, and approval policies.
- Domain-aware behavior is stronger than generic agents.

Do not build:

- Marketplace.
- Unreviewed pack execution.
- Broad generic pack that weakens the product identity.

## Milestone 8: Business Operating Layer

Goal: support recurring business workflows with controlled execution rights.

Build:

- Recurring review workflows.
- Business memory for projects, clients, decisions, risks, and recurring obligations.
- Approval policy tiers for low-risk automatic tasks and high-risk human decisions.
- Optional integrations only behind explicit approval.

Acceptance:

- The system can run a weekly business review for a solo software agency.
- It can recommend next actions from durable memory and current project state.
- It does not autonomously send messages, charge money, publish sites, order services, delete files, or change pricing.

## Execution Rules

- Useful output first, complexity second.
- Add interfaces early, keep implementations simple.
- Upgrade through artifact complexity, execution capability, persistence, decision rights, and domain awareness.
- Keep the user experience centered on: give goal, review plan, approve decisions, inspect artifacts, receive final package, continue project.
- Avoid turning Agentsim into generic multi-agent chat software.

