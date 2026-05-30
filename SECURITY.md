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

## Sensitive Data Rules

Agentsim is a BYOK control plane. Contributions must not leak API keys, credentials, client data, or secrets into:

- logs
- event traces
- generated artifacts
- workspace files
- model-visible prompts
- error output

When reporting a bug, redact secrets and replace real client data with representative examples.

## Prompt and Generated Artifact Risks

Agentsim coordinates model prompts, generated project artifacts, event traces, and handoff files. Treat all of those as potential places where private data can leak.

Security-sensitive examples include:

- a model prompt containing a real API key or client secret
- `events.jsonl` preserving private user input that should have been redacted
- generated handoff notes that include confidential client details
- generated app code that writes secrets to logs
- prompt injection that causes the workflow to reveal hidden instructions or credentials
