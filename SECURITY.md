# Security Policy

## Supported Versions

Agentsim is pre-1.0. Security fixes are handled on the main branch until release branches exist. There is no formal security SLA yet.

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub Security Advisories.

Do not open public issues for:

- leaked API keys, tokens, or credentials
- client or private data exposure
- prompt-injection issues that expose secrets or private context
- dependency vulnerabilities with a working exploit path
- generated artifact risks that could expose sensitive data or unsafe instructions

Include enough detail to reproduce the issue, but redact secrets and replace real client data with representative examples.

Useful report details:

- affected command or workflow
- expected and actual behavior
- relevant package version, commit, or branch
- sanitized logs or trace paths
- whether the issue appears in mock mode, live provider mode, or both

## Data Classification

Treat Agentsim files and outputs according to the most sensitive data they contain.

| Class | Examples | Handling |
| --- | --- | --- |
| Public | README, public docs, issue templates, source code, tests without secrets | Safe to commit after review. |
| Local private | `outputs/`, generated packages, local notes, local run traces | Keep ignored. Share only after sanitizing client-like data and prompts. |
| Confidential | client requests, private strategy docs, private prompts, local notes | Keep in ignored private paths such as `docs/private/`, `private/`, or `prompts/private/`. |
| Secret | API keys, tokens, private keys, credentials, live `.env` files | Never commit, log, place in prompts, or include in generated artifacts. Rotate immediately if exposed. |

## Sensitive Data Rules

Agentsim is a BYOK control plane. Contributions must not leak API keys, credentials, client data, or secrets into:

- logs
- event traces
- generated artifacts
- workspace files
- model-visible prompts
- error output
- private reports
- public documentation

When reporting a bug, redact secrets and replace real client data with representative examples.

## Prompt and Generated Artifact Risks

Agentsim coordinates model prompts, generated project artifacts, event traces, and handoff files. Treat all of those as possible places where private data can leak.

Security-sensitive examples include:

- a model prompt containing a real API key or client secret
- `events.jsonl` preserving private user input that should have been redacted
- generated handoff notes that include confidential client details
- generated app code that writes secrets to logs
- prompt injection that causes the workflow to reveal hidden instructions or credentials
- private strategy notes copied into public docs or generated outputs

## Local Outputs and Private Planning

Generated outputs are ignored because they can contain private prompts, provider responses, timing data, and client-like examples. Do not commit:

- `outputs/`
- private local files
- private Codex or agent scratch files

Private strategy and prompt files should stay in ignored directories. If a private file was accidentally committed, adding it to `.gitignore` is not enough; remove it from the public branch and consider history cleanup if the content is sensitive.

## Dependency and Generated Code Review

Dependency updates and generated app templates should be reviewed for:

- unnecessary network access
- secret logging
- unsafe file operations
- vulnerable dependencies
- confusing instructions that could lead users to expose credentials

Generated apps are prototypes for local review. Do not represent them as production-ready without additional human security review.
