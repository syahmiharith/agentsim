# Domain Layer

Agentsim currently supports simple workflow prototype domains for the CLI vertical slice:

```text
Goal -> Progress -> Decisions -> Artifacts -> Review -> Final package
```

The domain layer turns a client goal into a `DomainSpec`. The generated app then uses that spec to render one primary entity, a form, a list, status updates, a local JSON API, seed data, and handoff documentation.

## Core Types

`DomainSpec` is the runtime contract consumed by templates, context packages, evals, and trace files. It contains app metadata, a primary entity, fields, workflow statuses, target users, screens, actions, assumptions, risks, seed records, and generated artifact types.

`DomainPreset` is the registry shape used for deterministic mock inference. A preset contains the stable domain content plus keywords and optional priority for matching.

`DomainInferenceResult` wraps the inferred spec with metadata:

- `matchedPresetId`
- `confidence`
- `matchedKeywords`
- `warnings`
- `needsClarification`
- `fallbackUsed`

The compatibility function remains:

```ts
inferDomainSpec(goal: string): DomainSpec
```

New code should prefer:

```ts
inferDomainSpecResult(goal: string): DomainInferenceResult
```

## Matching

Inference is deterministic and registry-based.

- Goals are normalized to lowercase with collapsed whitespace.
- Keywords match with simple `includes`.
- Score is the number of matched keywords plus optional preset priority.
- If no non-fallback preset matches, Agentsim uses `fallback-client-request-tracker`.
- If the top two non-fallback scores are close, inference records `needsClarification: true` and a warning.

The CLI does not ask clarification questions yet. The warning is written as trace metadata so evals and future UI surfaces can inspect it.

## Validation

`validateDomainSpec()` checks:

- app metadata and safe slugs
- primary entity shape
- unique valid field names
- select field options
- workflow statuses
- screens and core actions
- seed record field, status, number, date, and select values
- generated artifact type completeness and uniqueness

Every preset must validate before it is considered safe to use.

## Adding A Simple Workflow Preset

Add a `DomainPreset` to `src/domain/presets.ts`.

Use a unique `id`, unique `appSlug`, and `appArchetype: "simple-workflow"`. Include:

- keywords that identify the prompt family
- one primary entity with required fields
- workflow statuses
- target users
- three screens: create, list, admin/review
- core actions and approval points
- assumptions and risks
- at least one valid seed record

Then add tests for the expected prompt, preset ID, app name, entity, required fields, and status values.

## Current Limits

The domain layer intentionally does not support:

- true multi-entity generated apps
- model-based inference
- interactive clarification
- externally loaded domain plugins
- arbitrary app archetypes

Add a new app archetype only when the generated app, artifacts, validation, and eval expectations are ready to support a different runtime shape.
