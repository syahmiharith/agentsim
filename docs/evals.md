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

## Philosophy

The benchmark measures whether AgentSim produces a reviewed, runnable,
handoff-ready package. It does not reward generic agent chatter, token volume,
or faster runs that lower package quality.

Each case declares the expected app name, primary entity, required fields,
statuses, artifacts, required phrases, forbidden phrases, and optional bounded
commands. The mock mode is deterministic and requires no external API keys.

## Metrics

- `hardGatePassed`: the run completed, required package and trace files exist,
  final package validation passed, required commands passed, and no prompt
  secret leaked when a secret-like token is present.
- `acceptanceCriteriaScore`: required case-specific terms and domain docs.
- `runnableAppScore`: app files, validation, and command checks.
- `domainFidelityScore`: expected domain spec, app fields, statuses, and
  forbidden phrase checks.
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

## Fair Comparisons

Compare AgentSim against baselines using the same eval cases, same mock/live
mode, same command checks, same timeout limits, and the same hardware class.
Report both hard-gate acceptance and quality score. Do not claim a throughput
improvement from wall-clock speed alone.

For live runs, disclose provider, model, retry policy, and any manual
interventions. Normal CI should use mock mode only.
