# Software Freelance Eval Cases

These cases exercise the first Agentsim wedge: a solo freelance developer turns a vague client software request into a scoped, reviewed, runnable handoff package.

Run them with:

```bash
pnpm eval
```

The eval harness writes one final package and one scorecard per case, plus a combined report and development justification under `outputs/evals/{evalRunId}`.

Generated eval runs and private benchmark comparisons are ignored by git. Use them to track whether Agentsim is at least equal to strong one-shot model baselines on throughput before promoting the project publicly for contribution.

## Cases

- Inventory request system
- Booking system
- Student portal
- Expense splitter
- Small CRM
- Landing page for local business

## Justification Lens

Each case is evaluated as a possible Agentsim use case, not just as a generated app prompt. The report asks:

- Is this a plausible freelance client request?
- Does the workflow need durable artifacts, review, traceability, and handoff notes?
- Does Agentsim produce evidence that a one-shot answer does not?
- Is the use case a core wedge, adjacent wedge, or edge case?
- Is the run result a strong fit, promising, or weak fit for continued product development?
