# Contributing to Agentsim

Thanks for helping improve Agentsim.

Agentsim is early, maintainer-led, and intentionally narrow. The best contributions make the current software-freelance CLI workflow more reliable, reviewable, and useful before expanding the platform.

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

## Checks

Run the relevant checks before opening a pull request:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Use the actual package scripts above. Do not add new tooling unless it clearly improves the current workflow.

## Branch and PR Workflow

1. Open an issue first for major product direction changes, new workflow stages, security-sensitive changes, or anything that broadens Agentsim beyond the software-freelance vertical slice.
2. Create a focused branch from the current development branch.
3. Keep pull requests small enough to review in one pass.
4. Update tests, docs, templates, or generated artifact expectations when behavior changes.
5. Fill out the pull request template, including artifact/trace impact and verification.

Good pull requests explain why the change fits Agentsim, not just what changed.

## Contribution Policy

Agentsim uses the Developer Certificate of Origin (DCO) for contributions.

By contributing, you certify that you have the right to submit the work under the Apache License 2.0. Sign off commits with:

```bash
git commit -s
```

This adds a line like:

```text
Signed-off-by: Your Name <you@example.com>
```

If you forgot to sign off the latest commit, fix it with:

```bash
git commit --amend --signoff
```

If several commits are missing signoff lines, use an interactive rebase and amend each affected commit, or squash them into one signed-off commit when that is appropriate for the PR.

## Project Direction

Keep Agentsim artifact-first. Prefer durable artifacts, decisions, approvals, event traces, and workspace outputs over agent-to-agent chat.

Do not add broad platform infrastructure before the software-freelance workflow is reliable and useful.

Current contribution areas:

- core contracts for agents, tasks, artifacts, decisions, approvals, and events
- CLI workflow reliability
- local filesystem workspace behavior
- artifact generation and validation
- event trace and artifact lineage quality
- review and QA reports
- final package assembly
- runnable app prototype quality
- eval cases and scoring
- concise documentation for contributors and users

Current boundaries:

- do not start with a full web dashboard
- do not add an agent marketplace
- do not add Docker-per-agent infrastructure unless the current workflow needs it
- do not add a SaaS account system
- do not turn the project into a generic multi-agent chat UI
- do not claim production readiness, broad app generation, or enterprise-grade security

## Governance

Agentsim is currently maintainer-led. Major direction changes should be discussed in an issue before implementation.

Project priorities, in order:

1. artifact-first workflows
2. software delivery and freelance use cases
3. traceability, reviews, approvals, and handoff quality
4. narrow vertical-slice quality over broad generic agent-platform features

