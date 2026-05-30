# Contributing to Agentsim

Thanks for helping improve Agentsim.

Agentsim is early, maintainer-led, and intentionally narrow. The best contributions make the current software-freelance CLI workflow more reliable, reviewable, traceable, and useful before expanding the platform.

## Local Setup

Requirements:

- Node.js 20.11+
- pnpm

Install dependencies:

```bash
pnpm install
```

Run the CLI demo in deterministic mock mode:

```bash
pnpm demo "Build an inventory request system for a flower company" --mock
```

Use the canonical CLI command when documenting product behavior:

```bash
pnpm agentsim run "Build an inventory request system for a flower company" --mock
```

Inspect a completed run:

```bash
pnpm agentsim dashboard <runId>
pnpm agentsim tui <runId>
```

## Required Checks

Run the relevant checks before opening a pull request:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Maintainer-local checks are private evidence. Do not include their outputs, scoring notes, or claims in public PRs unless the maintainer has intentionally published sanitized results.

## Branches, Commits, and PRs

- Branch from the current development branch.
- Use a focused branch name such as `docs/contributor-guidance`, `workflow/run-summary`, or `tests/package-validation`.
- Keep pull requests small enough to review in one pass. If a change touches several subsystems, split it unless the behavior cannot be verified independently.
- Use clear commit messages. Sign off commits with `git commit -s`.
- Open an issue first for major product direction changes, new workflow stages, security-sensitive changes, or anything that broadens Agentsim beyond the software-freelance vertical slice.
- Fill out the pull request template, including artifact or trace impact and verification.

Agentsim uses the Developer Certificate of Origin (DCO). By contributing, you certify that you have the right to submit the work under the Apache License 2.0.

If you forgot to sign off the latest commit:

```bash
git commit --amend --signoff
```

If several commits are missing signoff lines, use an interactive rebase and amend each affected commit, or squash them into one signed-off commit when that is appropriate for the PR.

## Documentation Update Rule

Update documentation when behavior changes:

- CLI commands or output: update `README.md` and any relevant docs.
- Architecture or module boundaries: update `docs/architecture.md`.
- Generated package shape: update README examples, final package validation expectations, and tests.
- Security, privacy, or secret-handling behavior: update `SECURITY.md`.

Private strategy, prompts, local Codex plans, and generated outputs belong in ignored paths such as `docs/private/`, `private/`, `prompts/private/`, or `outputs/`.

## Changing Artifact Types or Templates

Artifact changes affect the product contract. Keep them deliberate.

When adding, removing, or renaming an artifact:

- Update the `ArtifactType` union and domain pack manifest.
- Update required final package files or trace files when needed.
- Update final package validation tests.
- Update workflow generation, lineage, decisions, approvals, and event trace expectations.
- Update README package examples if public output changes.

When changing generated app templates, keep the app simple, runnable locally, and aligned with the current software-freelance demo. Prefer improving clarity, runnability, and reviewability over adding broad framework features.

## Project Direction

Keep Agentsim artifact-first. Prefer durable artifacts, decisions, approvals, event traces, and workspace outputs over agent-to-agent chat.

Current contribution areas:

- core contracts for agents, tasks, artifacts, decisions, approvals, and events
- CLI workflow reliability
- local filesystem workspace behavior
- artifact generation and validation
- event trace and artifact lineage quality
- review and QA reports
- final package assembly
- runnable app prototype quality
- concise documentation for contributors and users

Current boundaries:

- do not add a SaaS account system
- do not add an agent marketplace
- do not add Docker-per-agent infrastructure unless the current workflow needs it
- do not turn the project into a generic multi-agent chat UI
- do not claim production readiness, broad app generation, or enterprise-grade security
- do not expose private product strategy, private prompts, or private evidence in public docs

## Review Checklist

Good pull requests answer these questions:

- Does this strengthen the current `goal -> reviewed final package` loop?
- Are generated artifacts, trace files, decisions, approvals, or validation expectations updated consistently?
- Can the change be verified with `pnpm typecheck`, `pnpm test`, and `pnpm build`?
- Does the change avoid leaking secrets, private prompts, local outputs, or private strategy?
- Is broad platform work deferred unless it is necessary for the current vertical slice?

## Governance

Agentsim is currently maintainer-led. Major direction changes should be discussed in an issue before implementation.

Project priorities, in order:

1. artifact-first workflows
2. software delivery and freelance use cases
3. traceability, reviews, approvals, and handoff quality
4. narrow vertical-slice quality over broad generic agent-platform features
