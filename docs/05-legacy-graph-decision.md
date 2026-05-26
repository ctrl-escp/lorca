# Legacy graph format decision

Date: 2026-05-25 · **Status updated:** 2026-05-25 (migration complete)

## Decision

Lorca should migrate runtime execution to native V2 step chains only. The V1 graph format should remain only as a temporary import/migration compatibility path for old saved pipelines and graph-only capsules.

Do not keep the V2-to-V1 bridge indefinitely. Do not drop V1 import yet.

## Current state (post-migration)

- Top-level pipelines and capsules are canonical V2 `steps[]` definitions at runtime, in IndexedDB, and in export files.
- `executeStepChain()` is the only production executor for pipelines, loop groups, inline capsule chains, snapshots, history reads, and artifact refs.
- **Removed from production:** `executePipeline()`, `compilePipelineToLegacyGraph()`, `syncCapsuleLegacyGraphFromSteps()`, and the V2→V1 bridge. Legacy graph validation helpers (`validateLegacyPipeline`, `topologicalOrder`, `outputKey`, `resolveOutputRef`) live in `packages/pipeline/src/legacyGraph.ts` and are exported only via the `@lorca/pipeline/legacyGraph` subpath for import/migration tests.
- **Import/load only:** `migrateLegacyPipeline()` and `ensureCapsuleStepChain()` convert graph-only or legacy pipeline records to `steps[]`. Graph import validation uses `validateGraphCapsuleForImport()` on that path; `validateCapsule()` is step-chain-only.
- **Persistence:** Capsule `schemaVersion` **2** is written for normalized step-chain bodies. Dexie v2 upgrade and load-time normalization strip `nodes`, `edges`, and `outputRef` once `steps[]` exists. Content signatures hash canonical `steps[]`, input, and interface — not stale graph fields.
- Built-in examples are step-chain-first; narrow graph fixtures remain in migration tests only.

## Why

Native step-chain execution is now the only representation that covers the full product surface. Loop groups cannot round-trip cleanly through the V1 graph bridge, and the bridge flattens nested loop steps only to keep legacy capsule graph fields populated. Keeping that bridge as a long-term runtime dependency would preserve duplicate executor behavior and make newer features harder to reason about.

At the same time, V1 import/migration is still useful. Old IndexedDB records, exported capsules, and tests may contain graph-only definitions. Removing that support in the same change as executor cleanup would make compatibility failures hard to separate from runtime regressions.

## Policy

- New code must read and write V2 `steps[]` as the canonical pipeline and capsule body.
- V1 `nodes`, `edges`, and `outputRef` are compatibility fields only at import/load boundaries.
- V1 graph-only definitions may be accepted at load/import boundaries and immediately migrated to `steps[]`.
- Runtime execution must not compile V2 steps back into V1 graphs.
- V1 import can be removed only after an explicit schema cutoff or migration/export compatibility decision.

## Migration sequence

All steps below are **complete** as of 2026-05-25:

1. ✅ Fix behavior gaps in the native executor: JSON parsing parity, nested abort propagation, nested params, and relevant run options.
2. ✅ Add real step-chain capsule validation before graph fields stop masking invalid capsule bodies.
3. ✅ Stop writing refreshed legacy graph fields for capsules that already have `steps[]`; strip graph fields on save/export for migrated bodies.
4. ✅ Make graph-only capsule execution migration-first in both fallback sites (`executeCapsuleStep()`, `executeCapsuleTestRun()`).
5. ✅ Rewrite built-in example capsules as step-chain-first fixtures; keep one small graph fixture set for migration tests.
6. ✅ Keep `migrateLegacyPipeline()` and `ensureCapsuleStepChain()` narrowly scoped to load/import compatibility.
7. ✅ Remove the V2-to-V1 bridge and legacy runtime (`executePipeline`, graph compiler, graph sync helpers).
8. ⏳ **Future:** decide whether V1 import itself remains supported or gets a documented import cutoff (schema v2 persistence is done; graph import still accepted).

## Removal inventory

| Item | Status |
|------|--------|
| `compilePipelineToLegacyGraph()` and `expandLoopGroupsForLegacyCompile()` | Removed |
| `syncCapsuleLegacyGraphFromSteps()` | Removed |
| `executePipeline()` and V1-only capsule loop execution | Removed |
| `validateLegacyPipeline()` and `topologicalOrder()` | Moved to `legacyGraph.ts` (import path only) |
| Graph remap helpers such as `applyModelRemapsToNodes()` | Removed; remaps apply to `steps[]` only |
| Graph-based `outputKey()` / `resolveOutputRef()` production usage | Removed from public API |
| Legacy-only tests in `executor.test.ts`, most of `capsuleLoop.test.ts` | Removed; migration coverage in `legacyGraph.test.ts`, `migration.test.ts`, `graphImportMigration.spec.ts` |

## Acceptance criteria for removal

All criteria **met** (2026-05-25):

- ✅ User-created pipelines and capsules persist without `nodes`, `edges`, or `outputRef` when `steps[]` exists.
- ✅ Exported capsules do not reintroduce graph fields for migrated step-chain bodies.
- ✅ Import/load tests cover graph-only pipeline and capsule migration into V2 (`persistence.test.ts`, `importExport.test.ts`, `graphImportMigration.spec.ts`).
- ✅ At least one import-migration e2e covers graph-only capsule or pipeline export.
- ✅ `validateCapsule()` validates `steps[]` only; graph validation is migration-only (`validateGraphCapsuleForImport`).
- ✅ Pipeline execution, capsule execution, inline capsule execution, inline lock/extract flows, capsule tests, loop groups, partial runs, snapshots, history reads, and model remapping pass through native step-chain paths (`nativePathSmoke.test.ts`, matrix in `docs/tmp-remaining-implementations.md`).
- ✅ `rg "executePipeline\\(|compilePipelineToLegacyGraph\\(|validateLegacyPipeline|topologicalOrder\\(" packages apps` has no production call sites outside `legacyGraph.ts` and tests.

## Schema cutoff

**Implemented (2026-05-25):**

- Capsule `schemaVersion` bumped to **2** for persisted/exported step-chain bodies (`1` still accepted at import).
- Dexie v2 upgrade rewrites existing capsule and pipeline records; load-time normalization catches missed rows.
- V1 graph import remains available through `migrateLegacyPipeline()` / `ensureCapsuleStepChain()` until an explicit **import** cutoff is decided.

**Future (optional):** reject graph-only imports without migration, or drop `LegacyPipelineDefinition` from the type surface entirely.
