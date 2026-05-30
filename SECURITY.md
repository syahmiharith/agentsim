# Security Policy

## Supported Versions

Agentsim is pre-1.0. Security fixes are handled on the main branch until release branches exist.

## Reporting a Vulnerability

Please report vulnerabilities privately through GitHub Security Advisories.

Do not open public issues for vulnerabilities, leaked credentials, prompt-injection findings that expose secrets, or client-sensitive generated artifacts.

## Sensitive Data Rules

Agentsim is a BYOK control plane. Contributions must not leak API keys, credentials, client data, or secrets into:

- logs
- event traces
- generated artifacts
- workspace files
- model-visible prompts
- error output

When reporting a bug, redact secrets and replace real client data with representative examples.
