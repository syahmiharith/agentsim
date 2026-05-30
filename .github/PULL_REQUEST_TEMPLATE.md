## Summary

Describe what changed and why.

## Why this fits Agentsim

Explain how this supports artifact-first software delivery, traceability, review quality, approvals, or final handoff quality.

## Files / areas changed

List the main files, packages, templates, generated artifacts, or workflows touched.

## Type of change

- [ ] Core contracts
- [ ] CLI workflow
- [ ] Artifact generation
- [ ] Workspace behavior
- [ ] Model provider boundary
- [ ] Review / QA
- [ ] Documentation
- [ ] Tests
- [ ] Chore

## Product fit

- [ ] Keeps the software-freelance v0 workflow narrow and useful
- [ ] Preserves artifact-first coordination
- [ ] Avoids adding broad platform infrastructure without a current need
- [ ] Adds or updates durable artifacts, traceability, reviews, or handoff quality

## Verification

- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] Manual demo run, if behavior changed:

```bash
pnpm demo "Build an inventory request system for a flower company" --mock
```

## Artifacts / trace impact

List any generated package files, trace files, artifact lineage, decisions, or approvals affected by this change.

## Risks / regressions

Call out known limitations, possible regressions, migration notes, or follow-up work.

## DCO

- [ ] My commits are signed off with `git commit -s`
- [ ] I checked that each commit includes a `Signed-off-by:` line
