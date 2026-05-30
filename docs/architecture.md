# Agentsim Architecture

Agentsim is currently a TypeScript CLI proof of concept for one narrow workflow: turn a vague freelance software request into a reviewed, runnable, handoff-ready final package.

The implementation is intentionally simple. Keep the current CLI vertical slice useful before splitting the repo into packages or adding heavier infrastructure.

## System Flow

```text
CLI
-> workflow
-> domain pack
-> model provider
-> artifact store
-> workspace driver
-> final package
-> validation
-> dashboard inspection
```

The current workflow starts from a client-style goal, infers a software-freelance domain spec, generates durable artifacts, writes a runnable app prototype, records decisions and approvals, validates the final package, and writes trace files.

## Main Modules

| Module | Responsibility |
| --- | --- |
| `src/cli.ts` | Defines `agentsim run`, `demo`, `dashboard`, and `tui` command parsing and provider selection. |
| `src/workflow.ts` | Coordinates the current end-to-end run from goal to final package. |
| `src/types.ts` | Holds core contracts used across the CLI, workflow, artifacts, events, and providers. |
| `src/agents/agents.ts` | Defines the current software-freelance role set. |
| `src/domain/` | Defines the software-freelance domain pack and deterministic domain-spec inference. |
| `src/templates/` | Generates Markdown artifacts and the runnable app prototype. |
| `src/core/artifacts.ts` | Writes artifacts, content hashes, status metadata, and lineage. |
| `src/core/events.ts` | Writes redacted JSONL event traces. |
| `src/core/final-package-validation.ts` | Validates required final-package files, trace files, artifact ownership, review status, and lineage. |
| `src/core/workspace.ts` | Provides the local filesystem workspace driver. |
| `src/providers/` | Provides mock and OpenAI-compatible model providers. |
| `src/tui/run-inspector.ts` | Inspects completed runs from local outputs. |
| `tests/` | Captures executable expectations for CLI parsing, workflow output, domain packs, validation, hashing, redaction, and TUI inspection. |

## Core Contracts

The public architecture is built around these contracts:

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
ModelProvider
WorkspaceDriver
ArtifactStore
EventStore
```

The contracts can stay thin in v0. Their job is to keep the control plane replaceable and inspectable while the current workflow matures.

## CLI Layer

`src/cli.ts` is the command surface.

Supported commands:

```bash
pnpm agentsim run "Build an inventory request system for a flower company" --mock
pnpm demo "Build an inventory request system for a flower company" --mock
pnpm agentsim dashboard <runId>
pnpm agentsim tui <runId>
```

Provider selection is CLI-level:

- `--mock` uses deterministic mock mode.
- `--live` requires configured OpenAI-compatible provider settings.
- no flag uses auto mode, falling back to mock mode when no live key is configured.

The CLI should remain a thin adapter. Product behavior belongs in workflow, domain, core, template, and provider modules.

## Workflow Layer

`src/workflow.ts` currently owns the end-to-end software-freelance demo run.

Main responsibilities:

- create a local workspace
- create event and artifact stores
- infer a `DomainSpec` through the domain pack
- record provider and domain decisions
- generate planning, technical, review, client, app, and trace artifacts
- copy the generated app into the final package
- validate package completeness
- write `trace/run-summary.json`
- return run metadata to the CLI

Keep workflow changes narrowly scoped. If behavior becomes reusable across future workflows, extract a small helper or interface only when it removes real duplication.

## Domain Pack Layer

`src/domain/software-freelance-pack.ts` is the reference domain pack.

It defines:

- package identity and version
- participating agents
- artifact manifest
- required final-package files
- required trace files
- review rubric
- domain-spec inference function

The current domain pack is public and intentionally limited. Deeper private strategy for future pack design belongs in ignored private docs, not public roadmap text.

## Artifact and Trace Layer

Agentsim is artifact-first. Coordination should happen through durable artifacts, not agent chat.

Artifact expectations:

- every artifact has an owner agent
- every artifact has a status
- every artifact has review and approval status
- every artifact has a content hash
- every artifact records input artifact lineage
- exported package paths match the domain pack manifest

Trace expectations:

- `trace/events.jsonl` records important run events
- `trace/decisions.json` records system and human decisions
- `trace/approvals.json` records approval state
- `trace/domain-spec.json` records inferred domain behavior
- `trace/artifact-lineage.json` records artifact metadata and dependencies
- `trace/run-summary.json` records run result and validation status

Event data and messages must be redacted before writing.

## Workspace Layer

The current workspace driver is `LocalFilesystemWorkspaceDriver`.

It supports:

- create workspace directories
- write files
- read files
- list workspace files
- copy generated directories into the final package

`WorkspaceDriver.runCommand` exists as an optional interface contract for the local execution milestone. Do not add Docker, remote VM, or cloud execution until local filesystem execution proves the need.

## Provider Layer

Agentsim is BYOK. Model providers are replaceable behind `ModelProvider`.

Current providers:

- mock provider for deterministic no-key tests and demos
- OpenAI-compatible provider for live local runs

Provider implementations must not leak secrets into prompts, events, artifacts, logs, errors, or generated files.

## Final Package Shape

A successful run writes:

```text
outputs/{runId}/final-package/
+-- client/
+-- planning/
+-- technical/
+-- app/
+-- review/
+-- trace/
```

The final package shape is a user-facing contract. If it changes, update README examples, validation, and tests together.

## Design Rules

- Keep the software-freelance workflow useful before expanding the platform.
- Prefer small interfaces over concrete infrastructure lock-in.
- Prefer artifact validation over assumptions.
- Prefer traceable decisions over hidden behavior.
- Prefer deterministic mock behavior for tests.
- Keep generated apps simple, local, and reviewable.
- Keep private strategy, prompts, and evidence out of public docs.
