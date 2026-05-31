# Agentsim Milestones

## Public Roadmap Boundary

This public roadmap covers the near-term open-source product path: make the software-freelance CLI workflow reliable, reviewable, runnable, and understandable.

Private long-term strategy, competitive positioning, private prompts, and deeper product expansion plans should stay in ignored local docs such as `docs/private/`.

## North Star For Public Work

One solo software freelancer can turn a vague client software request into a scoped, reviewed, runnable, handoff-ready software delivery package.

The current workflow should stay centered on:

```text
Goal -> Progress -> Decisions -> Artifacts -> Review -> Final package
```

Complexity should increase only when it improves artifact quality, traceability, review, runnability, or handoff usefulness.

## How To Use This Roadmap

Decision order:

1. Preserve the current CLI vertical slice.
2. Improve artifact quality, traceability, review, and runnable output.
3. Keep infrastructure replaceable behind thin contracts.
4. Delay broad platform work until the software-freelance workflow is clearly useful.

If a proposed change does not strengthen the current `goal -> reviewed final package` loop, defer it or write down why it is necessary now.

## Current Position

Agentsim already has the first CLI-shaped proof:

```bash
pnpm agentsim run "Build an inventory request system for a flower company" --mock
```

`pnpm demo` remains a shortcut for local demos.

Current capabilities:

- TypeScript CLI and local filesystem workspace.
- Core contracts for `Agent`, `AgentStep`, `TaskRun`, `Run`, `Task`, `Artifact`, `ContextPackage`, `Workspace`, `Decision`, `Approval`, `Event`, `Organization`, `Project`, and `DomainPack`.
- Artifact-producing agent step registry for the current intake, planning, architecture, build, review, and delivery roles.
- Deterministic task graph compilation from the current `AgentStep` registry.
- Persisted workflow graph metadata with CLI graph inspection.
- Local run, task, artifact, message, context package, event, and approval state persistence.
- Real local resume from persisted run state after approvals are resolved.
- Scheduler helpers for dependency-ready, blocked, failed, and terminal task state.
- State transition helpers for run and task lifecycles.
- Risk-aware local tool wrappers for workspace files, artifacts, commands, and human approval requests.
- CLI inspection commands for runs, events, artifacts, tasks, approvals, and context packages.
- Static local run viewer and built-in tool registry inspection commands.
- Optional read-only repo context import for local runs.
- Deterministic mock eval runner with local JSON/Markdown reports.
- Mock and Chat Completions-compatible model provider boundary.
- Structured agent messages, agent action records, context packages, artifact lineage, decision logs, approval records, and event trace.
- Generated runnable Vite React app package with local API and JSON persistence.
- Final package validation and `run-summary.json`.

The next work should strengthen this spine rather than broaden the product.

## Milestone 1: Harder CLI Demo

Goal: prove `goal -> package` reliably across more than one client-style software request.

Build:

- Keep `agentsim run` as the canonical command while preserving `pnpm demo` as a local shortcut.
- Keep `Organization`, `Project`, and `DomainPack` as thin core contracts.
- Keep `AgentStep` focused on artifact production instead of generic agent chat.
- Keep compiled `Task` state aligned with the existing `AgentStep` registry until the orchestrator fully replaces the static loop.
- Keep the software-freelance workflow represented by `software-freelance-pack`.
- Strengthen required artifact validation for final-package completeness.
- Keep `run-summary.json` accurate with run status, package path, artifact count, validation result, and failures.
- Keep `state/` files local and ignored as generated output.

Acceptance:

- One command creates a complete delivery package.
- Every final package has requirements, scope, architecture, task breakdown, app, QA report, handoff guide, agent messages, agent actions, context packages, events, decisions, approvals, lineage, and run summary.
- Every run has persisted run, task, artifact, message, context package, event, and approval state.
- Users can inspect a run with `agentsim inspect`, `agentsim tasks`, `agentsim graph`, `agentsim events`, `agentsim artifacts`, `agentsim approvals`, `agentsim contexts`, `agentsim context`, and `agentsim viewer`.
- Approval-paused runs can continue with `agentsim approve` followed by `agentsim resume`.
- The code still defaults to local filesystem and mock mode without keys.

Do not build:

- SaaS accounts.
- Docker runtime.
- Multi-agent chat.
- Agent marketplace.

## Milestone 2: Local Workspace Execution Loop

Goal: prove tangible execution, not just file generation.

Build:

- Extend `WorkspaceDriver` with a safe command runner.
- Run generated app install/build checks automatically where safe.
- Capture command results into `trace/command-results.jsonl`.
- Add a small repair loop for common generated-app failures.
- Add `test-report.md` to the app package.

Current implementation note:

- The safe command runner exists, but automatic generated-app command execution remains disabled by default.
- Repair-loop plumbing exists, but automatic fix execution is still intentionally limited.

Acceptance:

- Generated apps can be installed and built from the package README commands.
- Build failures are captured in QA artifacts and event traces.
- At least one repair attempt is recorded when a known fixable error occurs.

Do not build:

- Docker-per-agent.
- Remote VM execution.
- Autonomous deploys.

## Milestone 3: Web Artifact Viewer

Goal: make completed runs understandable to a human director without requiring manual filesystem inspection.

Build:

- A local web viewer for completed runs.
- Views for Goal, Progress, Decisions, Artifacts, Review, Trace, and Final Package.
- Markdown artifact preview and app file tree.
- Decision and approval status surfaces.

Acceptance:

- A user can inspect a run without opening the filesystem manually.
- The UI follows the product flow: Goal -> Progress -> Decisions -> Artifacts -> Review -> Final Package.
- The UI does not expose agent chat as the core experience.

Do not build:

- Full SaaS dashboard.
- Visual workflow builder.
- Team permissions.

## Execution Rules

- Useful output first, complexity second.
- Add interfaces early, keep implementations simple.
- Prefer artifact complexity, execution capability, persistence, and review quality over more agents.
- Keep the user experience centered on giving a goal, reviewing artifacts, inspecting traceability, and receiving a final package.
- Avoid turning Agentsim into generic multi-agent chat software.
