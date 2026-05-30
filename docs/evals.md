# AgentSim Evals

AgentSim evals are a benchmark harness for the artifact-first CLI loop:

```text
Goal -> Progress -> Decisions -> Artifacts -> Review -> Final package
```

The public smoke check remains:

```bash
pnpm eval:mock
```

Other eval scripts are maintainer-local comparison tools. They write ignored
reports under `outputs/evals/`.

Maintainer-local scripts:

```bash
pnpm eval:domain
pnpm eval:throughput
pnpm eval
```

## Philosophy

The benchmark measures whether AgentSim produces a reviewed, runnable,
handoff-ready package. It does not reward generic agent chatter, token volume,
or faster runs that lower package quality.

Each case declares the expected app name, primary entity, required fields,
statuses, artifacts, required phrases, forbidden phrases, and optional bounded
commands. The mock mode is deterministic and requires no external API keys.

Suites:

- `smoke`: fast deterministic regression checks for the public CLI promise.
- `domain`: stricter preset-domain checks for known vertical slices.
- `all`: smoke plus domain cases.
- throughput: repeated smoke runs with configurable concurrency.

## Metrics

- `hardGatePassed`: the run completed, required package and trace files exist,
  final package validation passed, required commands passed, and no prompt
  secret leaked when a secret-like token is present.
- `acceptanceCriteriaScore`: required case-specific terms and domain docs.
- `runnableAppScore`: app files, validation, and command checks.
- `apiBehaviorPresent`: static confirmation that the generated local API keeps
  health, list, create, status-update, required-field validation, and status
  validation behavior.
- `seedDataPresent`: confirmation that generated app seed data exists and is
  valid JSON.
- `commandChecksRun`: bounded eval-level commands executed with contained cwd,
  timeout, safe env, output caps, and `shell: false`.
- `domainFidelityScore`: expected domain spec, app fields, statuses, and
  forbidden phrase checks.
- `domainInferencePresent`: optional trace metadata for the matched domain
  preset, confidence, fallback use, and clarification warnings.
- `packageCompletenessScore`: required final package files.
- `traceabilityScore`: events, decisions, approvals, context, and lineage.
- `reviewabilityScore`: QA, code review, and known-issues artifacts.
- `qualityScore`: weighted quality score. Duration never improves this score.

Quality weighting:

```text
0.30 acceptance criteria
0.20 runnable app
0.20 domain fidelity
0.10 package completeness
0.10 traceability
0.10 reviewability
```

Throughput reports quality-adjusted packages per hour, so a faster baseline only
wins when it keeps the same acceptance and quality bar.

Reports use `schemaVersion: 1` and are written as JSON, Markdown, and CSV:

```text
outputs/evals/latest.json
outputs/evals/latest.md
outputs/evals/latest.csv
```

The JSON report includes safe comparison metadata: git commit when available,
Node version, platform, architecture, AgentSim package version, options,
summary, and sorted results.

## Fair Comparisons

Compare AgentSim against baselines using the same eval cases, same mock/live
mode, same command checks, same timeout limits, and the same hardware class.
Report both hard-gate acceptance and quality score. Do not claim a throughput
improvement from wall-clock speed alone.

For live runs, disclose provider, model, retry policy, and any manual
interventions. Normal CI should use mock mode only.

Use the report comparison helper in code when comparing two JSON reports. It
tracks accepted-run delta, average quality delta, failure category changes,
hard-gate regressions, and per-case quality regressions.

## Current Limits

The API behavior check is intentionally static. It proves expected generated
route and validation code is present, but it does not start the server or run a
browser end-to-end flow. Evals do not prove hosted production readiness,
multi-user concurrency, authentication, durable persistence, or third-party
integrations. Command checks are deliberately bounded and are not a general
shell scripting facility.
