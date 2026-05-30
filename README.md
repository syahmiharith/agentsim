# Agentsim

Agentsim is an open-source, artifact-first AI organization layer for solo software freelancers.

The idea is simple: one capable developer should be able to direct a small AI agency that plans, builds, reviews, and packages real client work.

Today, a freelancer can hand Agentsim a vague client request:

```text
Build an inventory request system for a flower company
```

Agentsim turns that goal into a structured delivery package with planning docs, technical docs, a runnable app prototype, QA review, handoff notes, and trace files.

This is not another multi-agent chat toy. Agentsim is a control plane for durable work:

```text
Goal -> Progress -> Decisions -> Artifacts -> Review -> Final package
```

## Why This Should Exist

Solo software freelancers already do the work of a small agency:

- clarify vague client requests
- define scope and risks
- choose architecture
- build prototypes
- test and review delivery quality
- write handoff notes
- preserve decisions for later changes

Large teams have process, specialists, review loops, and delivery discipline. Solo developers usually have themselves, a chat window, and a pile of context they must keep in their head.

Agentsim is building the missing operating layer: one human director, one AI organization, real software delivery artifacts.

## The First Wedge

The first narrow use case is freelance software delivery:

```text
vague client request
-> AI agency workflow
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
    +-- decisions.json
    +-- artifact-lineage.json
```

The v0 demo is intentionally small. It proves the spine before the platform grows.

## What Makes Agentsim Different

Agentsim is not trying to create a new foundation model, a cloud IDE, or a generic agent marketplace.

It is a BYOK control plane for AI work execution. It coordinates replaceable model providers, agents, workspaces, artifacts, reviews, approvals, event traces, and final delivery packages.

The core bet:

- Artifacts beat chat transcripts.
- Review loops beat one-shot generation.
- Traceable decisions beat hidden prompt state.
- Domain workflows beat generic agent swarms.
- Human approval should gate high-risk actions.

If you care about making AI useful for real client delivery, this is the layer to help build.

## What Works Today

Agentsim already has a CLI-shaped proof:

- TypeScript CLI.
- Local filesystem workspace.
- Mock mode for deterministic no-key runs.
- OpenAI-compatible live model provider mode.
- Small agency roles: intake, PM, architect, builder, QA, delivery.
- Durable artifact generation.
- Artifact lineage, decision logs, approval records, and event traces.
- Runnable generated app package for the first software-freelance workflow.

## Quickstart

Requirements:

- Node.js 20.11+
- pnpm

Install and run the demo:

```bash
pnpm install
pnpm demo "Build an inventory request system for a flower company"
```

Use mock mode explicitly for deterministic no-key runs:

```bash
pnpm demo "Build an inventory request system for a flower company" --mock
```

Use live mode with an OpenAI-compatible provider:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
pnpm demo "Build an inventory request system for a flower company" --live
```

If no live key is configured and `--live` is not passed, Agentsim falls back to mock mode.

## Development

```bash
pnpm typecheck
pnpm test
pnpm build
```

Useful entry points:

- `src/cli.ts` - CLI command surface.
- `src/workflow.ts` - current end-to-end workflow.
- `src/types.ts` - core contracts.
- `src/agents/agents.ts` - agency role definitions.
- `src/core/` - artifacts, events, hashing, redaction, workspace behavior.
- `src/providers/` - model provider boundary.
- `src/templates/` - generated delivery package templates.
- `tests/` - workflow, CLI, hashing, and redaction coverage.

## Core Contracts

Agentsim is being built around these concepts:

- `Agent`
- `TaskRun`
- `Artifact`
- `Workspace`
- `Decision`
- `Approval`
- `Event`

Upcoming platform contracts include:

- `Organization`
- `Project`
- `DomainPack`
- `WorkspaceDriver`
- `ModelProvider`
- `ArtifactStore`
- `EventStore`

The current implementation is deliberately thin. The contracts are the product spine.

## Contribution Areas

The best contributions right now strengthen the vertical slice instead of widening the platform too early.

High-impact work:

- Make the CLI demo more reliable across different software project prompts.
- Add artifact validation for final package completeness.
- Improve the generated app quality without bloating the demo.
- Strengthen QA review artifacts and known-issues reporting.
- Add an eval harness that compares Agentsim workflow output against one-shot prompting.
- Extend the local workspace driver with safe command execution.
- Improve trace files so every run is easier to inspect and debug.
- Add domain-pack boundaries only where they make the software-freelance workflow cleaner.

Please avoid starting with:

- full web dashboards
- agent marketplaces
- complex persistent memory
- Docker-per-agent infrastructure
- SaaS account systems
- generic multi-agent chat UI

The project needs contributors who want to make one narrow workflow genuinely useful before making the system broad.

## Roadmap

The near-term path is:

1. Harder CLI demo.
2. Eval harness.
3. Local workspace execution loop.
4. Web artifact viewer.
5. Project lifecycle memory.
6. Solo agency operating dashboard.
7. Domain pack API.
8. Business operating layer.

See [docs/milestones.md](docs/milestones.md) for the detailed roadmap.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Agentsim uses the Developer Certificate of Origin. Sign off commits with:

```bash
git commit -s
```

Good pull requests are small, testable, and aligned with the artifact-first product direction.

## License

Agentsim is licensed under the Apache License 2.0. See [LICENSE](LICENSE).

Code generated by Agentsim for a user's project belongs to that user, subject to the licenses of any dependencies, templates, or third-party assets included in the generated project.
