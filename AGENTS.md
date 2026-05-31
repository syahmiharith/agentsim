# AGENTS.md

## Project Boundary

Agentsim is an open-source, artifact-first CLI workflow for solo software freelancers.

Current public promise:

```text
vague client software request
-> scoped plan
-> reviewed runnable prototype
-> handoff-ready final package
```

Agentsim is a BYOK control plane. It coordinates model providers, agents, workspaces, artifacts, reviews, approvals, event traces, and final packages. It does not own foundation models, cloud infrastructure, deployment platforms, vector databases, or container runtimes.

The user-facing abstraction should stay outcome-driven:

```text
Goal -> Progress -> Decisions -> Artifacts -> Review -> Final package
```

Do not turn the product into generic multi-agent chat.

## Documentation Reference Rule

When implementation direction is uncertain, check the repository documentation before inventing a new product path.

Use these references in order:

```text
README.md
docs/milestones.md
docs/architecture.md
CONTRIBUTING.md
SECURITY.md
tests/
```

Treat `README.md` as the public promise. Treat `docs/milestones.md` as the current public roadmap. Treat tests as executable expectations for the current vertical slice.

If documentation and code disagree, prefer the code for current behavior, then update the smallest relevant documentation or implementation surface so future work has one clear source of truth.

Private strategy, private prompts, local evidence, and local Codex plans belong in ignored paths such as `docs/private/`, `private/`, or `prompts/private/`. Do not commit them.

## Current Milestone

The current public focus is still the CLI vertical slice:

```bash
pnpm agentsim run "Build an inventory request system for a flower company" --mock
```

`pnpm demo` is a local shortcut for the same run command:

```bash
pnpm demo "Build an inventory request system for a flower company" --mock
```

The final package should include client, planning, technical, app, review, and trace artifacts. The generated app should be simple but runnable locally.

Prioritize improvements that strengthen:

1. core contracts
2. CLI run workflow
3. local filesystem workspace
4. artifact generation and validation
5. event trace, decisions, approvals, and lineage
6. review and QA artifacts
7. final package assembly
8. runnable app output

## Commands

Use the package scripts that exist in `package.json`:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm eval:mock
pnpm demo "Build an inventory request system for a flower company" --mock
pnpm agentsim run "Build an inventory request system for a flower company" --mock
pnpm agentsim dashboard <runId>
pnpm agentsim tui <runId>
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
pnpm eval:domain
pnpm eval:runtime
pnpm eval:throughput
```

Maintainer-local checks are private evidence. Do not publish, document, or commit their outputs until the maintainer intentionally chooses what to share.

## Code Structure

Important entry points:

```text
src/cli.ts                         CLI command surface
src/workflow.ts                    current end-to-end workflow
src/types.ts                       public core contracts
src/agents/agents.ts               current role definitions
src/core/artifacts.ts              artifact store and lineage export
src/core/events.ts                 JSONL event store and redaction
src/core/final-package-validation.ts
src/core/workspace.ts              local filesystem workspace driver
src/domain/                        software-freelance domain pack and inference
src/providers/                     mock and OpenAI-compatible providers
src/templates/                     Markdown and generated app templates
tests/                             executable expectations
```

The current package layout is intentionally simple. Do not introduce a monorepo package split unless the existing CLI workflow needs it.

## Core Contracts

Keep implementation aligned with these contracts:

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

Use thin interfaces for replaceable dependencies. Keep `LocalFilesystemWorkspaceDriver` as the v0 default. Add more infrastructure only when it is needed for the current workflow.

## Artifact-First Rule

Agents coordinate through artifacts, not free-form chat.

Good coordination primitives:

```text
Artifact produced
Artifact reviewed
Artifact revised
Artifact approved
Artifact exported
```

Each artifact should preserve owner, status, review status, approval status, content hash, final package path, and lineage.

Do not add more agents unless the current workflow produces better artifacts because of it.

## Security Rules

Agentsim uses Bring Your Own Key. Never leak API keys, credentials, private prompts, client data, or secrets into:

```text
logs
events
artifacts
workspace files
model-visible prompts
error traces
private reports
public docs
```

Use `.env` only for local development. Keep `.env.example` public-safe. Generated outputs and private planning files must stay ignored.

## What Not To Build Now

Do not start with:

```text
SaaS accounts
agent marketplace
visual workflow builder
generic multi-agent chat UI
Docker-per-agent runtime
remote VM runtime
autonomous deploys
automatic client emails
payment charging
production delivery claims
```

If a proposed change does not strengthen the current `goal -> reviewed final package` loop, defer it or document why it is necessary now.

## Definition of Done

For code changes:

- relevant tests are added or updated
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass
- generated outputs remain ignored
- docs are updated when public behavior changes

For documentation changes:

- commands match `package.json`
- public docs do not expose private strategy, private prompts, or private evidence
- `README.md`, `docs/milestones.md`, `docs/architecture.md`, and `CONTRIBUTING.md` stay consistent
