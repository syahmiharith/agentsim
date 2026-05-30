# Contributing to Agentsim

Thanks for helping improve Agentsim.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

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

## Project Direction

Keep Agentsim artifact-first. Prefer durable artifacts, decisions, approvals, event traces, and workspace outputs over agent-to-agent chat.

Do not add broad platform infrastructure before the software-freelance workflow is reliable and useful.

