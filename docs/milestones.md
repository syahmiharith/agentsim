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
- Core contracts for `Agent`, `TaskRun`, `Artifact`, `Workspace`, `Decision`, `Approval`, `Event`, `Organization`, `Project`, and `DomainPack`.
- Mock and OpenAI-compatible model provider boundary.
- Artifact lineage, decision logs, approval records, and event trace.
- Generated runnable Vite React app package with local API and JSON persistence.
- Final package validation and `run-summary.json`.

The next work should strengthen this spine rather than broaden the product.

## Milestone 1: Harder CLI Demo

Goal: prove `goal -> package` reliably across more than one client-style software request.

Build:

- Keep `agentsim run` as the canonical command while preserving `pnpm demo` as a local shortcut.
- Keep `Organization`, `Project`, and `DomainPack` as thin core contracts.
- Keep the software-freelance workflow represented by `software-freelance-pack`.
- Strengthen required artifact validation for final-package completeness.
- Keep `run-summary.json` accurate with run status, package path, artifact count, validation result, and failures.

Acceptance:

- One command creates a complete delivery package.
- Every final package has requirements, scope, architecture, task breakdown, app, QA report, handoff guide, events, decisions, approvals, lineage, and run summary.
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
