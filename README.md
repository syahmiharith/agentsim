# Agentsim

[![CI](https://github.com/syahmiharith/agentsim/actions/workflows/ci.yml/badge.svg)](https://github.com/syahmiharith/agentsim/actions/workflows/ci.yml)
[![CodeQL](https://github.com/syahmiharith/agentsim/actions/workflows/codeql.yml/badge.svg)](https://github.com/syahmiharith/agentsim/actions/workflows/codeql.yml)
[![DCO](https://github.com/syahmiharith/agentsim/actions/workflows/dco.yml/badge.svg)](https://github.com/syahmiharith/agentsim/actions/workflows/dco.yml)

Agentsim is an open-source tool for turning vague software requests into structured delivery packages.

It is designed for solo software freelancers who need help with planning, building, reviewing, and handing off client work.

A user can give Agentsim a rough client request:

```text
Build an inventory request system for a flower company
```

Agentsim turns that request into a project package containing planning documents, technical notes, a runnable app prototype, QA review, handoff notes, and trace files.

Agentsim focuses on durable project artifacts rather than chat transcripts.

```text
Goal -> Plan -> Decisions -> Artifacts -> Review -> Final package
```

## Project Status

Agentsim is alpha, pre-1.0 software. The current repo is a CLI proof of concept for one narrow software-freelance workflow, not a general-purpose agent platform or production delivery system.

Current capability:

* run a local CLI workflow from a high-level client request
* generate planning, technical, review, client handoff, trace, and app prototype files
* run in deterministic mock mode without provider keys
* use a model-agnostic Chat Completions-compatible provider in live mode when configured

Current limitations:

* generated apps are simple prototypes and still need human review before client delivery
* the workflow is tuned for the first software-freelance demo, not arbitrary domains
* approvals, workspace execution, and provider routing are still early
* no hosted service, dashboard, or production deployment automation exists yet

## Problem

Solo software freelancers often do the work of a small software team by themselves:

* clarifying vague client requests
* defining scope and risks
* choosing architecture
* building prototypes
* testing and reviewing delivery quality
* writing handoff notes
* preserving decisions for later changes

Large teams have process, specialists, review loops, and delivery discipline. Solo developers usually have scattered notes, a chat window, and a lot of project context they must keep in their head.

Agentsim provides a structured workflow for turning client requests into reviewed, handoff-ready software artifacts.

## Current Focus

The first use case is freelance software delivery:

```text
vague client request
-> AI-assisted workflow
-> scoped plan
-> reviewed runnable prototype
-> handoff-ready package
```

The generated package currently follows this shape:

```text
outputs/{runId}/final-package/
+-- client/
|   +-- project-summary.md
|   +-- handoff-notes.md
|   +-- user-guide.md
+-- planning/
|   +-- requirements.md
|   +-- scope.md
|   +-- assumptions.md
|   +-- timeline.md
|   +-- risks.md
+-- technical/
|   +-- architecture.md
|   +-- task-breakdown.md
+-- app/
|   +-- package.json
|   +-- src/
|   +-- README.md
+-- review/
|   +-- qa-report.md
|   +-- code-review.md
|   +-- known-issues.md
+-- trace/
    +-- events.jsonl
    +-- agent-messages.json
    +-- agent-actions.json
    +-- decisions.json
    +-- artifact-lineage.json
```

The v0 demo is intentionally small. It validates the core workflow before the project expands.

For the flower-company inventory example, a useful run should produce artifacts such as:

* `planning/requirements.md` describing request creation, list viewing, status updates, and admin needs
* `technical/architecture.md` explaining the simple local app structure and data model
* `review/qa-report.md` checking whether the generated package matches the scoped requirements
* `trace/events.jsonl` showing the workflow events that led to the final package
* `trace/agent-messages.json` showing structured task assignments, handoffs, and review requests between agents
* `trace/agent-actions.json` showing each role-owned action, input artifacts, output artifact, model/source, and status

## Design Principles

Agentsim is not trying to be a foundation model, a cloud IDE, or a generic agent marketplace.

The project is built around a few principles:

* Artifacts are more useful than chat transcripts.
* Review loops are safer than unchecked generation.
* Important decisions should be traceable.
* Domain-specific workflows are more useful than generic agent swarms.
* High-risk actions should require human approval.
* Model providers should be replaceable.

The goal is to make AI-assisted software delivery easier to inspect, review, and continue over time.

## Current Capabilities

Agentsim currently has a CLI-based proof of concept:

* TypeScript CLI
* local filesystem workspace
* mock mode for deterministic no-key runs
* model-agnostic live provider mode through the Chat Completions-compatible `ModelProvider` boundary
* artifact-producing agent steps for intake, planning, architecture, implementation, QA, and delivery
* durable artifact generation
* artifact lineage, decision logs, approval records, and event traces
* runnable generated app package for the first software-freelance workflow

## Quickstart

### Requirements

* Node.js 20.11+
* pnpm

Install dependencies:

```bash
pnpm install
```

Run the demo:

```bash
pnpm demo "Build an inventory request system for a flower company"
```

Use mock mode explicitly for deterministic no-key runs:

```bash
pnpm demo "Build an inventory request system for a flower company" --mock
```

Use live mode with any Chat Completions-compatible provider:

```bash
AGENTSIM_MODEL_PROVIDER=chat-completions-compatible
AGENTSIM_MODEL_API_KEY=...
AGENTSIM_MODEL_BASE_URL=https://api.openai.com/v1
AGENTSIM_MODEL_NAME=gpt-4.1-mini
pnpm demo "Build an inventory request system for a flower company" --live
```

Existing `OPENAI_*` and `OPENAI_COMPATIBLE_*` environment variables are still supported as aliases.

If no live key is configured and `--live` is not passed, Agentsim falls back to mock mode.

Agentsim owns the runtime orchestration, artifact graph, review state, event trace, and final package validation. Live providers only implement the small `ModelProvider.generate()` boundary.

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```

Useful entry points:

* `src/cli.ts` - CLI command surface
* `src/workflow.ts` - current end-to-end workflow
* `src/types.ts` - core contracts
* `src/agents/` - role definitions and artifact-producing step registry
* `src/core/` - artifacts, events, hashing, redaction, and workspace behavior
* `src/providers/` - model provider boundary
* `src/templates/` - generated delivery package templates
* `tests/` - workflow, CLI, hashing, and redaction coverage

## Project Model

Agentsim is currently built around these concepts:

* `Agent`
* `AgentStep`
* `TaskRun`
* `Artifact`
* `Workspace`
* `Decision`
* `Approval`
* `Event`

Planned contracts include:

* `Organization`
* `Project`
* `DomainPack`
* `WorkspaceDriver`
* `ModelProvider`
* `ArtifactStore`
* `EventStore`

The current implementation is deliberately thin. The priority is to make the software-delivery workflow useful before expanding the platform surface area.

## Contributing

The best contributions right now improve the current vertical slice instead of widening the platform too early.

Who should contribute:

* developers interested in practical CLI tools and local-first workflows
* people who care about artifact quality, review loops, and traceability
* freelancers or technical reviewers who can identify gaps in handoff packages
* contributors willing to keep changes small, testable, and aligned with the current scope

High-impact areas:

* make the CLI demo more reliable across different software project prompts
* add artifact validation for final package completeness
* improve the generated app quality without bloating the demo
* strengthen QA review artifacts and known-issues reporting
* extend the local workspace driver with safe command execution
* improve trace files so every run is easier to inspect and debug
* add domain-pack boundaries only where they make the software-freelance workflow cleaner

Please avoid starting with:

* full web dashboards
* agent marketplaces
* complex persistent memory
* Docker-per-agent infrastructure
* SaaS account systems
* generic multi-agent chat UI

The project needs contributors who want to make one narrow workflow genuinely useful before making the system broad.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Agentsim uses the Developer Certificate of Origin. Sign off commits with:

```bash
git commit -s
```

Good pull requests are small, testable, and aligned with the artifact-first product direction.

## Roadmap

The public near-term path is:

1. harder CLI demo
2. local workspace execution loop
3. web artifact viewer

See [docs/milestones.md](docs/milestones.md) for the detailed roadmap.

## License

Agentsim is licensed under the Apache License 2.0. See [LICENSE](LICENSE).

Code generated by Agentsim for a user's project belongs to that user, subject to the licenses of any dependencies, templates, or third-party assets included in the generated project.
