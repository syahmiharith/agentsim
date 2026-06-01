# Agentsim Architecture

Agentsim is currently a TypeScript CLI proof of concept for one narrow workflow: turn a vague freelance software request into a reviewed, runnable, handoff-ready final package.

The implementation is intentionally simple. Keep the current CLI vertical slice useful before splitting the repo into packages or adding heavier infrastructure.

## System Flow

```text
CLI
-> workflow wrapper
-> orchestrator
-> domain pack
-> task compiler
-> scheduler
-> model provider
-> artifact store
-> state repositories
-> workspace driver
-> final package
-> validation
-> dashboard inspection
```

The current workflow starts from a client-style goal, derives a prompt-specific product brief, infers a software-freelance domain spec, derives a single-entity AppSpec, generates durable artifacts, writes a runnable app prototype from that AppSpec, records decisions and approvals, validates the final package, and writes trace files.

## Main Modules

| Module                                 | Responsibility                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cli.ts`                           | Defines `agentsim run`, `demo`, `dashboard`, `tui`, inspection, viewer, tool registry, approval, and resume command parsing.         |
| `src/workflow.ts`                      | Preserves the existing `runDemo()` compatibility entry point.                                                                        |
| `src/orchestrator.ts`                  | Owns run creation, resume, scheduler execution, task execution, validation, approval pause, and final package completion.            |
| `src/types.ts`                         | Holds core contracts used across the CLI, workflow, artifacts, events, and providers.                                                |
| `src/agents/`                          | Defines the current software-freelance role set and artifact-producing step registry.                                                |
| `src/app-spec/`                        | Defines the M1 runnable app contract, validation rules, and `DomainSpec -> AppSpec` adapter for deterministic rendering.             |
| `src/domain/`                          | Defines the software-freelance domain pack and deterministic domain-spec inference.                                                  |
| `src/templates/`                       | Generates Markdown artifacts and the runnable app prototype.                                                                         |
| `src/core/artifacts.ts`                | Writes artifacts, content hashes, status metadata, and lineage.                                                                      |
| `src/core/context.ts`                  | Assembles, validates, renders, and evaluates context packages.                                                                       |
| `src/core/events.ts`                   | Writes redacted JSONL event traces.                                                                                                  |
| `src/core/final-package-validation.ts` | Validates required final-package files, trace files, artifact ownership, review status, lineage, and context provenance.             |
| `src/core/paths.ts`                    | Prevents absolute-path use and workspace escape for relative path operations.                                                        |
| `src/core/repo-context.ts`             | Imports bounded read-only local repo summaries without copying source contents or secret files.                                      |
| `src/core/repositories.ts`             | Persists local JSON state for runs, tasks, artifacts, actions, context packages, messages, events, and approvals.                    |
| `src/core/scheduler.ts`                | Marks dependency-ready tasks and identifies blocked, failed, and terminal task sets.                                                 |
| `src/core/state-machines.ts`           | Validates allowed run and task status transitions.                                                                                   |
| `src/core/task-compiler.ts`            | Projects workflow graph nodes into persisted task state for compatibility.                                                           |
| `src/core/workflow-graph.ts`           | Compiles `AgentStep` entries into a deterministic workflow graph with nodes, edges, timeouts, and validation.                        |
| `src/core/tool-registry.ts`            | Exposes the built-in tool manifest and validates context-policy `allowedTools`.                                                      |
| `src/core/tools.ts`                    | Wraps file, artifact, command, and approval tools with risk-aware execution rules.                                                   |
| `src/core/tool-runtime.ts`             | Injects the active tool runtime into agent execution using the current stores, repos, and workspace.                                 |
| `src/core/workspace.ts`                | Provides the local filesystem workspace driver.                                                                                      |
| `src/providers/`                       | Provides mock and Chat Completions-compatible model providers.                                                                       |
| `src/tui/run-inspector.ts`             | Inspects completed runs from local outputs.                                                                                          |
| `tests/`                               | Captures executable expectations for CLI parsing, workflow output, domain packs, validation, hashing, redaction, and TUI inspection. |

## Core Contracts

The public architecture is built around these contracts:

```text
Agent
AgentStep
TaskRun
Run
Task
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
- `--live` requires configured Chat Completions-compatible provider settings.
- no flag uses auto mode, falling back to mock mode when no live key is configured.

The CLI should remain a thin adapter. Product behavior belongs in workflow, domain, core, template, and provider modules.

Additional local inspection commands read persisted state:

```bash
pnpm agentsim inspect <runId>
pnpm agentsim events <runId>
pnpm agentsim artifacts <runId>
pnpm agentsim tasks <runId>
pnpm agentsim graph <runId>
pnpm agentsim approvals <runId>
pnpm agentsim contexts <runId>
pnpm agentsim context <runId> <contextPackageId>
pnpm agentsim viewer <runId>
pnpm agentsim tools
pnpm agentsim approve <runId> <approvalId>
pnpm agentsim reject <runId> <approvalId>
pnpm agentsim resume <runId> [--mock|--live]
pnpm eval:mock
```

`run` and `demo` also accept `--repo <path>` for bounded read-only repo summary import, `--max-concurrent-tasks <n>` for local scheduler batching, and the command-execution flags `--allow-commands --command-policy <strict|dev|unsafe-local>`.

## Workflow Layer

`src/workflow.ts` is now a compatibility wrapper. `src/orchestrator.ts` owns the end-to-end software-freelance run and persisted state.

Main responsibilities:

- create a local workspace
- create event and artifact stores
- create a persisted run record
- compile `AgentStep` entries into a validated workflow graph
- persist graph metadata and project tasks derived from that graph
- rehydrate existing run state for `resume`
- mark dependency-ready tasks before execution
- infer a `DomainSpec` through the domain pack and persist it for resume
- derive and persist a ProductBrief and AppSpec as the runnable generated-app contract
- record provider and domain decisions
- execute tasks through the scheduler in deterministic compiled-step order
- assemble and validate a context package before each agent action
- generate planning, technical, review, client, app, and trace artifacts
- copy the generated app into the final package
- write `trace/app-spec.json` and structured `trace/app-validation.json`
- record generated-app command checks in `app/test-report.md` and `trace/command-results.jsonl` when local command execution is enabled
- validate package completeness and convert validation into a review verdict
- update run and task state
- write `trace/run-summary.json`
- return run metadata to the CLI

The default orchestration path remains single-task execution so the final package stays compatible. The scheduler can run a bounded batch of ready tasks when requested, while avoiding duplicate output producers in the same batch. Repositories remain separate so later work can add richer execution without changing the artifact contract.

## Runnable App Contract

`ProductBrief` captures prompt-specific intent before the compatibility `DomainSpec` layer. `AppSpec` is the contract between domain inference and deterministic app rendering. `DomainSpec` remains the planning and markdown contract; `ProductBrief` and `AppSpec` are persisted to state and exported to trace.

The current AppSpec surface supports one primary entity, field metadata, screens, a status workflow, summary metrics, assumptions, risks, unresolved questions, deferred features, acceptance scenarios, and seed records. Supported archetypes are `crud-workflow`, `booking-lite`, and `inventory-lite`, with renderer capability manifests declaring supported screen kinds, field types, runtime checks, and unsupported features. When command execution is enabled with the dev policy, generated app validation runs syntax, install, build, and local API smoke checks for health, list, create, and status transition behavior. External calendar sync, full inventory accounting, rich business-rule execution, and multi-entity relations are later milestones and should be recorded as deferred or unresolved instead of implied by generated apps.

`resume` reuses `outputs/{runId}`. It refuses completed, failed, or cancelled runs, refuses runs with pending approvals, reloads the persisted domain spec, rebuilds `artifactsByType` from persisted artifacts, and continues the scheduler from existing task statuses. If no model flag is supplied, the CLI uses the persisted run model mode.

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
- every artifact records the context package used to produce it
- exported package paths match the domain pack manifest
- every produced artifact is tied to a completed agent action
- every completed agent action records a context package id and hash
- agents communicate through structured task assignments, artifact handoffs, and review requests

Trace expectations:

- `trace/events.jsonl` records important run events
- `trace/agent-messages.json` records bounded agent communication, including sender, recipient, related artifact, question, and expected output
- `trace/agent-actions.json` records each agent action, input artifact IDs, output artifact ID, model/template source, and completion status
- `trace/context-packages.json` records the validated context package used by each completed action
- `trace/context-eval.json` records context coverage, size, and provenance checks
- `trace/decisions.json` records system and human decisions
- `trace/approvals.json` records artifact, tool, and human approval state
- `trace/domain-spec.json` records inferred domain behavior
- `trace/workflow-graph.json` records compiled workflow nodes, edges, timeouts, and conditions
- `trace/tool-registry.json` records available built-in tool manifests
- `trace/repo-context.json` records optional read-only repo context when `--repo` is used
- `trace/artifact-lineage.json` records artifact metadata and dependencies
- `trace/run-summary.json` records run result and validation status

Event data and messages must be redacted before writing.

Internal state is persisted under:

```text
outputs/{runId}/state/
+-- run.json
+-- tasks.json
+-- agent-actions.json
+-- context-packages.json
+-- messages.json
+-- events.jsonl
+-- artifacts.json
+-- approvals.json
+-- workflow-graph.json
+-- tool-registry.json
+-- repo-context.json        # only when --repo is used
```

The `state/` files are for local resume, inspection, approvals, and scheduler state. The `final-package/trace/` files remain the reviewer-facing debug output.

## Context Package Layer

`src/core/context.ts` turns runtime context into an inspectable contract. Before an agent step executes, the orchestrator assembles a `ContextPackage` from the user goal, task objective, domain spec, optional repo summary, required input artifacts, structured messages, decisions, and approvals allowed by the step policy.

Validation gates enforce:

- required context kinds are present
- item hashes match item content
- item and package size limits are respected
- required input artifacts are represented in artifact context items
- the package hash matches the canonical package contents

Live model prompts are rendered from `ContextPackage` instead of ad hoc artifact reads inside agent steps. Final-package validation checks that each completed action references a stored context package and that the produced artifact lineage carries the same context package id and hash.

## Workspace Layer

The current workspace driver is `LocalFilesystemWorkspaceDriver`.

It supports:

- create workspace directories
- write files
- read files
- list workspace files
- copy generated directories into the final package

All relative workspace and artifact paths go through `safeJoin()`. Absolute paths are rejected when a relative path is expected, `..` escape attempts are rejected, and resolved targets must stay inside the workspace or final-package root.

`WorkspaceDriver.runCommand` exists as an optional interface contract for the local execution milestone. The generated-app builder writes `app/test-report.md` on every run and executes install/build checks only when command execution is explicitly enabled and allowed by policy. Do not add Docker, remote VM, or cloud execution until local filesystem execution proves the need.

## Tools And Approvals

The risk-aware tool runtime defines `read_file`, `write_file`, `list_files`, `create_artifact`, `run_command`, and `ask_human`.

- Safe file tools are contained to the workspace.
- Tools are passed into `AgentContext`, so real agent steps can use them.
- `create_artifact` uses the active artifact store and repository, not a disconnected store.
- `run_command` is dangerous, approval-required, allowlisted, timed, output-capped, and uses a sanitized environment.
- Command execution remains disabled unless explicitly allowed. Generated-app checks use the same local command runner and policy boundary when opt-in command execution is enabled.
- Command policy is separate from approval. `strict` allows only narrow version/syntax checks, `dev` allows bounded local package commands such as `pnpm build`, and `unsafe-local` preserves the broader local allowlist for trusted workspaces.
- When a context policy is active, tools must also be listed in
  `allowedTools`; denied calls emit `tool.blocked_by_policy`.
- Approval-required tools create or require approval state instead of silently executing.
- Every tool call appends a `tool.called` event.
- Command results are written to `state/command-results.jsonl` and `final-package/trace/command-results.jsonl`.

Approval commands operate on local state only. They do not send emails, deploy code, charge payments, or contact external services.

## Review And Evals

Final package validation is converted into a review result. A passing verdict completes the run. A failing verdict fails the run. A recoverable revise verdict emits a clear event when repair is disabled, which is the default. The experimental repair path can create a bounded fix task and apply narrow deterministic repairs for missing derived trace files, generated app files, or exported artifact files. It does not perform broad AI self-repair.

`pnpm eval:mock` runs deterministic mock evals across several software-freelance prompts and writes `outputs/evals/latest.json` and `outputs/evals/latest.md`, including duration, validation status, and a coarse failure category.

## Provider Layer

Agentsim is BYOK and model-agnostic at runtime. Model providers are replaceable behind `ModelProvider`.

Current providers:

- mock provider for deterministic no-key tests and demos
- Chat Completions-compatible HTTP provider for live local runs

Live provider configuration is provider-neutral:

```text
AGENTSIM_MODEL_PROVIDER=chat-completions-compatible
AGENTSIM_MODEL_API_KEY=...
AGENTSIM_MODEL_BASE_URL=...
AGENTSIM_MODEL_NAME=...
```

Provider-specific `OPENAI_*` and `OPENAI_COMPATIBLE_*` environment variables are backward-compatible aliases, not the architecture boundary.

Provider implementations must not leak secrets into prompts, events, artifacts, logs, errors, or generated files. The workflow, artifact graph, review state, event trace, and final package validation stay inside Agentsim rather than a provider SDK.

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
