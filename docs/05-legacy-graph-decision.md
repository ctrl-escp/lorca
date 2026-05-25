# Legacy graph format decision

Date: 2026-05-25

## Decision

Lorca should migrate runtime execution to native V2 step chains only. The V1 graph format should remain only as a temporary import/migration compatibility path for old saved pipelines and graph-only capsules.

Do not keep the V2-to-V1 bridge indefinitely. Do not drop V1 import yet.

## Current state

- Top-level pipelines are canonical V2 `steps[]` definitions.
- `executeStepChain()` is the primary runtime path for V2 pipelines, loop groups, inline capsule chains, snapshots, history reads, and artifact refs.
- V1 graph support still exists in `LegacyPipelineDefinition`, `executePipeline()`, `validateLegacyPipeline()`, `topologicalOrder()`, `migrateLegacyPipeline()`, and `compilePipelineToLegacyGraph()`.
- Capsules created or edited after the step-chain migration carry `steps[]`, but `ensureCapsuleStepChain()` and capsule stores still refresh legacy `nodes`, `edges`, and `outputRef`.
- Graph-only capsules and old graph pipeline records are still migrated on load/import.

## Why

Native step-chain execution is now the only representation that covers the full product surface. Loop groups cannot round-trip cleanly through the V1 graph bridge, and the bridge flattens nested loop steps only to keep legacy capsule graph fields populated. Keeping that bridge as a long-term runtime dependency would preserve duplicate executor behavior and make newer features harder to reason about.

At the same time, V1 import/migration is still useful. Old IndexedDB records, exported capsules, and tests may contain graph-only definitions. Removing that support in the same change as executor cleanup would make compatibility failures hard to separate from runtime regressions.

## Policy

- New code must read and write V2 `steps[]` as the canonical pipeline and capsule body.
- V1 `nodes`, `edges`, and `outputRef` are compatibility fields only.
- V1 graph-only definitions may be accepted at load/import boundaries and immediately migrated to `steps[]`.
- Runtime execution should not require compiling V2 steps back into V1 graphs.
- V1 import can be removed only after an explicit schema cutoff or migration/export compatibility decision.

## Migration sequence

1. Fix behavior gaps in the native executor first: JSON parsing parity, nested abort propagation, nested params, and relevant run options.
2. Add real step-chain capsule validation before graph fields stop masking invalid capsule bodies.
3. Stop writing refreshed legacy graph fields for capsules that already have `steps[]`; strip graph fields on save/export for migrated bodies.
4. Make graph-only capsule execution migration-first in both fallback sites:
   - `executeCapsuleStep()` in `packages/pipeline/src/stepExecutor.ts`, when the resolved capsule has no `steps[]`.
   - `executeCapsuleTestRun()` in `packages/capsules/src/executor.ts`, when it currently builds a synthetic `LegacyPipelineDefinition`.
5. Rewrite built-in example capsules as step-chain-first fixtures; keep one small graph fixture set for migration tests.
6. Keep `migrateLegacyPipeline()` and `ensureCapsuleStepChain()` narrowly scoped to load/import compatibility.
7. Remove the V2-to-V1 bridge and legacy runtime once no production path calls them.
8. Later, decide whether V1 import itself remains supported or gets a documented schema cutoff.

## Removal inventory

Remove these only after the native paths, persistence rules, and migration tests are in place:

- `compilePipelineToLegacyGraph()` and `expandLoopGroupsForLegacyCompile()`.
- `syncCapsuleLegacyGraphFromSteps()`.
- `executePipeline()` and V1-only capsule loop execution.
- `validateLegacyPipeline()` and `topologicalOrder()`.
- Graph remap helpers such as `applyModelRemapsToNodes()`.
- Graph-based `outputKey()` / `resolveOutputRef()` production usage.
- Legacy-only test coverage in `executor.test.ts`, most of `capsuleLoop.test.ts`, and graph-runtime branches in `capsuleInstance.test.ts`.

## Acceptance criteria for removal

- All user-created pipelines and capsules persist without `nodes`, `edges`, or `outputRef` when `steps[]` exists.
- Exported capsules do not reintroduce `nodes`, `edges`, or `outputRef` for migrated step-chain bodies.
- Import/load tests cover graph-only pipeline and capsule migration into V2.
- At least one import-migration e2e covers a graph-only capsule or pipeline export.
- `validateCapsule()` validates `steps[]` when present; graph validation is migration-only.
- Pipeline execution, capsule execution, inline capsule execution, inline lock/extract flows, capsule tests, loop groups, partial runs, snapshots, history reads, and model remapping all pass through native step-chain paths.
- `rg "executePipeline\\(|compilePipelineToLegacyGraph\\(|validateLegacyPipeline|topologicalOrder\\(" packages apps` has no production call sites.

## Schema cutoff

Dropping graph fields from `CapsuleDefinition` should be a schema decision, not an incidental cleanup:

- Bump capsule `schemaVersion` when `nodes`, `edges`, and `outputRef` leave the persisted/exported shape.
- Keep V1 graph import available through `migrateLegacyPipeline()` / `ensureCapsuleStepChain()` until there is an explicit cutoff.
- Consider a one-time IndexedDB migration that rewrites existing step-chain capsules without graph fields.
