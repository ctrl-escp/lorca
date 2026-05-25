# Code health review

Date: 2026-05-25

## Scope

This review focused on code smells, dead or stale paths, irrelevant tests, flows that no longer match the step-chain product, and opportunities to reduce project size without removing useful behavior.

## Findings

### 1. Legacy graph runtime still duplicates native step-chain execution

`packages/pipeline/src/executor.ts` keeps the V1 graph executor alive, including capsule instance execution and V1 capsule loop handling. Native execution still imports it through `packages/pipeline/src/stepExecutor.ts` for graph-only capsule fallback. This keeps two separate runtime models for model calls, templates, JSON parsing, traces, capsule output binding, abort behavior, and loops.

Impact: new runtime features must either be added twice or silently diverge. The legacy executor also keeps old `PipelineNode`, `manual-text`, and `template` runtime behavior looking production-grade even though V2 `PipelineStep` is canonical.

Follow-up: implement the migration sequence in `docs/05-legacy-graph-decision.md`. Remove production `executePipeline()` call sites only after native behavior, validation, persistence, fallback migration, and example fixtures are ready.

### 2. Capsules still write legacy graph fields even when `steps[]` exists

`syncCapsuleLegacyGraphFromSteps()` compiles V2 steps back to V1 graph fields. It is called when extracting capsules, loading capsule editor state, mutating capsule steps, and locking inline capsules. `ensureCapsuleStepChain()` also refreshes `nodes`, `edges`, and `outputRef` for already-migrated capsules.

Impact: the supposedly deprecated capsule graph fields remain actively maintained, which makes it hard to know whether graph data is compatibility data or live product state. `capsuleMigration.test.ts` currently asserts this behavior, including loop-group flattening into legacy graph nodes.

Follow-up: stop writing refreshed graph fields for step-chain capsules. Update tests to assert graph-only capsules migrate to `steps[]`, not that migrated capsules keep graph fields synchronized.

### 3. Capsule validation is still graph-era

`validateCapsule()` in `packages/capsules/src/validate.ts` validates `nodes`, `edges`, and `outputRef`. For capsules with `steps[]` and empty graph fields, validation does not meaningfully validate the canonical body, yet `lockCapsule()`, import, and capsule test runs all call it.

Impact: users can lock, export, or test structurally invalid step-chain capsules if the graph fields are missing or stale.

Follow-up: validate `steps[]` when present, reusing or extending `validatePipeline()` with capsule-specific checks. Demote graph validation to graph-only migration/import paths.

### 4. Step-chain validation is intentionally thin

`validatePipeline()` checks duplicate IDs and `primaryOutputName`, but not loop-group structure, history-read validity, capsule binding integrity, or whether referenced artifacts can exist.

Impact: "validated" currently means "basic shape looks sane," not "this step-chain can run." That is acceptable as a starting point, but cleanup work should not assume validation is complete.

Follow-up: add targeted validators for loop groups, history reads, capsule bindings, and output refs as native execution becomes the only runtime path.

### 5. Native and legacy JSON parsing disagree

`stepExecutor.ts` parses strict JSON or full fenced JSON only. `executor.ts` also extracts the first object or array from prose-wrapped model output.

Impact: JSON output can pass in legacy graph execution but fail in native step-chain execution, which is the path users actually use for current pipelines and loop groups.

Follow-up: extract a shared JSON parser, use it from native execution, and test prose-wrapped JSON for model-call JSON output and loop exit conditions.

### 6. Nested native execution drops run context

`executeCapsuleStepChain()` calls `executeStepChain()` for inner capsule steps but only forwards seed artifacts, params, and optional inner start step. It does not forward the parent abort signal. Loop-group inner execution also calls `executeStepInternal()` without forwarding `params`, so parameterized templates inside a capsule loop cannot render capsule params.

Impact: cancellation and parameter rendering can behave differently inside nested chains than they do in the parent chain.

Follow-up: pass abort signal and relevant run options through native nested execution, pass params into loop inner steps, add focused tests for cancellation and `{{param.*}}` inside capsule loop groups, and remove stale user-facing "V1" wording from native loop errors.

### 7. Persistence and import/export still have dual graph paths

`prepareImportedCapsule()` remaps both `steps` and `nodes`. Exports deep-clone the capsule, so graph fields continue to flow through exported files when present. `computeCapsuleContentSignature()` also hashes `outputRef` and falls back to `nodes`, which can make stale detection drift once graph fields stop syncing.

Impact: removing the legacy executor is not enough. Graph fields can still persist, export, and affect stale detection unless save/export/signature code is cleaned up too.

Follow-up: strip graph fields for step-chain capsules on save/export, remove node remapping from the normal import path, and base content signatures on canonical `steps[]`, input, and interface data.

### 8. Built-in example capsules are still authored as V1 graphs

`packages/capsules/src/examples/definitions.ts` defines graph nodes, and `packages/capsules/src/examples/build.ts` derives step chains from those nodes. That keeps legacy `template`/`manual-text` node logic alive in the example builder and hides the real canonical shape of examples.

Impact: example maintenance still requires understanding graph-era concepts. It also keeps graph fixtures broad when the useful compatibility surface should be narrow.

Follow-up: rewrite built-in examples as step-chain definitions first. Keep a minimal graph-only fixture set for migration tests.

### 9. Legacy tests need sorting, not blanket deletion

Some graph tests should stay as migration coverage; others should move to native step-chain execution. The keep set is `migration.test.ts`, graph-only branches in `capsuleMigration.test.ts`, and import tests in `packages/storage/tests/importExport.test.ts`. Capsule instance, loop, inline-capsule, and executor scenarios should be rewritten toward native execution before deleting V1 runtime tests.

Impact: deleting legacy tests too early would remove behavioral coverage; keeping all of them forever keeps V1 looking live.

Follow-up: rewrite native coverage first, then trim `executor.test.ts`, most of `capsuleLoop.test.ts`, and graph-runtime branches in `capsuleInstance.test.ts`.

### 10. Several UI/store modules are too large for safe maintenance

Current largest hotspots include `ChainEditor.vue` (2183 lines), `LeftPane.vue` (1246), `pipelineEditor.ts` (1085), `CenterPane.vue` (1066), and `StepInspector.vue` (850). These files mix rendering, command orchestration, drag-and-drop, context menus, execution state display, inline capsule logic, and persistence-adjacent behavior.

Impact: small UI changes have high review cost and higher regression risk. This is not dead code, but it is a strong refactor target after the graph cleanup.

Follow-up: split by ownership rather than by aesthetics: command menus, drag/drop helpers, step-card rendering, capsule lock/extract flows, and inspector subpanels.

### 11. Keep current planning in the tmp notes

The older long-form planning docs and UI guide have been removed from `docs/`. The active planning surface is now the `tmp-*` notes plus short decision/review docs like this one.

Impact: recreating broad plan docs would reintroduce stale acceptance criteria. Current cleanup should stay in focused TODOs and short decision notes.

Follow-up: leave `tmp-*` notes as the source of active follow-up work, and add new short docs only for decisions or audits that need more context.

## Suggested cleanup order

1. Fix native JSON parsing parity.
2. Propagate abort/options/params through nested native execution.
3. Add `validateCapsule()` step-chain validation and tighten `validatePipeline()` where needed.
4. Stop writing/syncing legacy graph fields; strip them on save/export for step-chain capsules.
5. Convert graph-only capsule execution to migration-first in both fallback sites.
6. Rewrite examples step-chain-first; isolate graph fixtures to migration tests.
7. Remove legacy executor, compiler, graph remap helpers, and graph runtime exports.
8. Trim legacy-only tests to migration coverage after native tests exist.
9. Split the largest UI/store files after runtime behavior is simpler.
