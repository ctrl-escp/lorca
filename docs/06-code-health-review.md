# Code health review

Date: 2026-05-25 · **Status updated:** 2026-05-25 (legacy graph cleanup complete)

## Scope

This review focused on code smells, dead or stale paths, irrelevant tests, flows that no longer match the step-chain product, and opportunities to reduce project size without removing useful behavior.

## Summary

Findings **1–3, 4–9** from the original review are **resolved**. Finding **10** is **partially resolved** — the largest chain-editing hotspots were split; `LeftPane.vue` is now small. Optional follow-ups (V1 import cutoff, validation UX, output binding checks) are **complete** — see `docs/tmp-notes.md`.

## Findings

### 1. Legacy graph runtime still duplicates native step-chain execution — **Resolved**

~~`packages/pipeline/src/executor.ts` keeps the V1 graph executor alive…~~

**Resolution:** `executePipeline()` and `packages/pipeline/src/executor.ts` removed. All production execution goes through `executeStepChain()`. Graph-only capsules migrate via `ensureCapsuleStepChain()` at execution boundaries, then run natively.

### 2. Capsules still write legacy graph fields even when `steps[]` exists — **Resolved**

~~`syncCapsuleLegacyGraphFromSteps()` compiles V2 steps back to V1 graph fields…~~

**Resolution:** V2→V1 bridge and `syncCapsuleLegacyGraphFromSteps()` removed. `stripCapsuleLegacyGraphFields()` runs on save/export/load. Content signatures hash canonical step-chain data only. Tests assert migration to `steps[]`, not graph sync.

### 3. Capsule validation is still graph-era — **Resolved**

~~`validateCapsule()` validates `nodes`, `edges`, and `outputRef`…~~

**Resolution:** `validateCapsule()` validates `steps[]` via `validateStepChainPipeline()` plus capsule interface checks. Graph validation is migration-only (`validateGraphCapsuleForImport` in import path).

### 4. Step-chain validation is intentionally thin — **Resolved (core rules)**

~~`validatePipeline()` checks duplicate IDs and `primaryOutputName`…~~

**Resolution:** `stepChainValidation.ts` validates loop groups, history reads, template artifact refs, capsule input bindings, inline inner steps, duplicate artifact keys, and `outputStepId`. Covered by `stepChainValidation.test.ts`.

**Resolved:** `validateCapsule()` validates step chains; graph validation is migration-only (`validateGraphCapsuleForImport` on `@lorca/pipeline/legacyGraph`). Editor surfaces validation errors before lock/export; opaque capsule output bindings are checked against resolved interface ports when a resolver is available.

### 5. Native and legacy JSON parsing disagree — **Resolved**

~~`stepExecutor.ts` parses strict JSON or full fenced JSON only…~~

**Resolution:** Shared JSON parser extracted; native execution handles prose-wrapped JSON; tests cover parity.

### 6. Nested native execution drops run context — **Resolved**

~~`executeCapsuleStepChain()` does not forward the parent abort signal…~~

**Resolution:** Abort signal and params propagate through nested capsule and loop-group execution; focused tests added.

### 7. Persistence and import/export still have dual graph paths — **Resolved**

~~`prepareImportedCapsule()` remaps both `steps` and `nodes`…~~

**Resolution:** Graph fields stripped on save/export/import normalization; model remaps apply to `steps[]` only; content signatures use canonical fields; Dexie v2 migration rewrites stored records.

### 8. Built-in example capsules are still authored as V1 graphs — **Resolved**

~~`definitions.ts` defines graph nodes…~~

**Resolution:** Examples are step-chain-first; `graphFixtures.ts` holds narrow migration fixtures.

### 9. Legacy tests need sorting, not blanket deletion — **Resolved**

~~Some graph tests should stay as migration coverage…~~

**Resolution:** Native coverage in `nativePathSmoke.test.ts`, `capsuleInstance.test.ts`, etc.; migration coverage in `legacyGraph.test.ts`, `migration.test.ts`, `graphImportMigration.spec.ts`; V1 runtime tests removed.

### 10. Several UI/store modules are too large for safe maintenance — **Partially resolved**

Original hotspots (2026-05-25 review):

| File | Was | Now (approx.) |
|------|-----|---------------|
| `ChainEditor.vue` | 2183 | ~600 |
| `ChainStepCard.vue` | (inside ChainEditor) | ~330 + extracted subcomponents |
| `pipelineEditor.ts` | 1085 | ~490 + `snapshot`, `nestedStepEdits`, `capsuleStepEdits` |
| `CenterPane.vue` | 1066 | ~650 + `useModalDialogs` |
| `StepInspector.vue` | 850 | ~560 + config/bottom tabs |
| `LeftPane.vue` | 1246 | ~150 |

Follow-up: further splits only if new hotspots emerge; no 1000+ line chain-editing files remain.

### 11. Keep current planning in the tmp notes — **Current**

The older long-form planning docs and UI guide have been removed from `docs/`. The active planning surface is `tmp-*` notes plus short decision/review docs like this one.

Follow-up: `docs/tmp-notes.md` TODOs updated to reflect completed migration work; product backlog items (clear-all reset, inline collapse theme) stay open.

## Suggested cleanup order

Original order — **items 1–8 complete**, **item 9 partially complete**, **item 4 remains optional follow-up**:

1. ✅ Fix native JSON parsing parity.
2. ✅ Propagate abort/options/params through nested native execution.
3. ✅ Add `validateCapsule()` step-chain validation and tighten `validatePipeline()` where needed (capsule path done; deeper pipeline validators still optional).
4. ✅ Stop writing/syncing legacy graph fields; strip them on save/export for step-chain capsules.
5. ✅ Convert graph-only capsule execution to migration-first in both fallback sites.
6. ✅ Rewrite examples step-chain-first; isolate graph fixtures to migration tests.
7. ✅ Remove legacy executor, compiler, graph remap helpers, and graph runtime exports.
8. ✅ Trim legacy-only tests to migration coverage after native tests exist.
9. ✅ Split the largest UI/store files after runtime behavior is simpler (chain-editing hotspots; see finding 10).
10. ⏳ Optional: editor-time validation UX and capsule output-binding checks (see `docs/tmp-notes.md`).
