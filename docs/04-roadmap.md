# Lorca Roadmap & Prioritized Backlog

## Priority buckets

### 🔴 NOW

| # | Item | Rationale |
|---|------|-----------|
| N1 | ~~**Improve built-in step suggestion prompts**~~ ✅ | Shipped: semantic XML tag names, self-contained system prompts, pre-wired historyReads for cross-step context, and `createdFromTemplateStepId` remapping on insertion. |
| N2 | ~~**Polish live prompt preview: truncation + full-prompt modal**~~ ✅ | Shipped: 400-char truncation + `«not yet run»` placeholders in embedded preview; "Full prompt" modal with copy button and unresolved-slots banner; `promptPreview.ts` utility extracted and tested; no-trim contract enforced end-to-end. |
| N3 | ~~**"Run up to here" — visual boundary indicator**~~ ✅ | Shipped: `partialRunTargetStepId` in store (set on partial run, cleared on full execute, persisted); blue bottom-border + "▲ partial run boundary" label on the target step card. |
| N4 | ~~**Comment editing UX** — save/cancel + cursor fix~~ ✅ | Shipped: explicit Save/Cancel controls, no silent blur commit, Cancel restores the saved description, and comment header/textarea cursors match their interaction. |
| N5 | **JSON syntax highlighting + raw/pretty toggle** | Output areas render raw JSON strings. |

### 🟡 SOON

| # | Item | Rationale |
|---|------|-----------|
| S1a | **AI prompt improver** | ✨ per-block button; calls local model to rewrite. Result previewed and approved before applying; undo-tracked. Depends on N1. |
| S1b | **AI next-step advisor** | After a run, suggests 2-3 next steps with reasoning. Independent from S1a. |
| S1c | **NL pipeline generator (Capsule-based)** | "Describe it, build it." The generator logic lives in a user-editable built-in Capsule, revertible to the original. Depends on S1a + S1b validated. |
| S2a | **True dependency model for the compiler** | `compileActiveStepsToExecutionPlan` unconditionally adds the previous step as an input. Must fix before S2b. |
| S2b | **Concurrent step execution** | Once S2a correctly identifies independent steps, run them in parallel. |
| S3 | **Enhanced model filtering & sorting** | Sort by name/size/family; name search. |
| S4 | **Example pipelines + built-in system Capsules** | 2-3 importable starter pipelines; the `lorca-pipeline-generator` Capsule from S1c anchors a broader "ships-with-Lorca" Capsule library concept. |
| S5 | **Help button audit** | Update `HelpDialog` against current feature surface. Do last. |
| S6 | **Drift Fix suggestion** | New step suggestion: takes Drift Check output + original answer, produces a revised answer. Keeps Drift Check detection-only. |
| S7 | **Pipeline I/O overview panel** | Single view: user prompt in → final output out. No step details. |
| S8 | **Prompt Review Mode** | Before each step executes, show the fully resolved prompt for optional user editing. Edits are saved back to the step config (undo-tracked). |
| S9 | **Smart model requirements** | New `ModelRef` kind: specify family, size range, or capability tags; executor picks the first matching enabled model. Builds on existing `DiscoveredModel.family`, `parameterSize`, `sizeBytes`. |
| S10 | **Infrastructure retry** | Auto-retry on transport failures (endpoint unreachable, timeout, rate-limit). Configurable per step; no model involved. Currently the executor fails immediately on first transport error. |
| S11 | **`parseOutputAsJson` on model-call** | Add flag to `ModelCallStepConfig`; executor emits `{namespace}.json`, deprecates opportunistic `.parsedJson`. Small change, but S12 (structural retry) depends on it — ship before S12. Moved up from LATER. |
| S12 | **Structural auto-retry** | When a model-call is expected to produce JSON and the output can't be parsed, automatically retry with a repair prompt appended. No extra model or step needed. Path A (clean implementation) requires S11. |
| S13 | **Quick Validator suggestion** | A new suggestion using the `tiny` bucket: cheap, fast structural/semantic sanity check. Not the same as Answer Verification (no criteria needed) or Drift Check (no intent comparison). Designed as a lightweight loop-exit gate. |
| S14 | **Prompt artifacts** | Emit each step's fully resolved prompt as queryable artifacts — tagged XML, untagged body text, and tag list. Lets downstream steps analyze results in context of what was actually sent. Simple executor change; no config required. |

### 🟢 LATER

| # | Item | Notes |
|---|------|-------|
| L1 | **MCP integration** | Needs design for how tool results become artifacts. |
| L2 | **RAG / resource injection** | New input type above the step chain. |
| L3 | **Pipeline self-editing** | Zero urgency until core UX is solid. |
| L4 | **Chat/ACP pipeline** | Needs a concrete use case first. |
| L5 | **Settings view** | Colors, theme, default temperature/tokens, UI density. |
| L6 | **Prompt Experiments** | Automatically run multiple prompt variants on one or more steps, collect all outputs, and present a comparison with an optional LLM analysis of what changed and why. |

---

## Dependency map

```
N1 (improve prompts + tag wiring) ─────────────────────── S1a (AI prompt improver)
                                                                  │
N1 + run artifacts ───────────────────────────────────── S1b (next-step advisor)
                                                                  │
                                              S1a + S1b validated ▼
                                                         S1c (NL generator Capsule)
                                                                  │
                                                         S4 (built-in Capsule library)

N2 (live preview polish) ───────────────── S8 (Prompt Review Mode — same resolved-prompt infra)

N3, N4, N5 ─── independent

S2a (dependency model) ──────────────────────────────────── S2b (concurrent execution)
                                                   S2b ─► Multi-draft Synthesis showcase (in S4)

S3 (model filter/sort) ─── independent; shares metadata work with S9
S6 (Drift Fix suggestion) ─── independent; best done alongside N1
S7 (Pipeline I/O overview) ─── independent
S9 (smart model req) ─── independent; builds on DiscoveredModel.family/parameterSize/sizeBytes

S11 (parseOutputAsJson) ─────────────────────────── S12 (structural auto-retry Path A)
                                                     S11 also enables S12 Path A directly

S10 (infra retry) ── independent from S11; same executor layer; implement together with S12
S13 (Quick Validator suggestion) ─── independent; best done alongside N1/S6

S14 (prompt artifacts) ─── independent; does NOT help S8 pre-call review (artifacts are
                            post-completion only; S8 still calls renderPromptComposition()
                            directly before the model call); useful for post-run audit,
                            downstream meta-steps, and L6 experiment analysis

S5 (help audit) ─── do last
```

---

## Design notes

### Step taxonomy

There is exactly one atom: **`model-call`**. It is the only step that assembles a prompt and performs IO (sends to a model endpoint, receives text). Every other step type is either a composition over atoms, or plumbing that feeds into or out of them.

```
ATOM
  model-call
    input:  PromptCompositionConfig (blocks + history reads + previous output)
            ModelCallStepConfig     (modelRef, mode, temperature, maxTokens)
    output: {namespace}.text, {namespace}.rawResponse

COMPOSITIONS  (meta-structures over atoms)
  capsule-instance   named reusable group of steps; inner execution is delegated
  loop-group         iterates an inner step chain with a JSON-field exit condition

PLUMBING  (no model IO)
  prompt-wrapper     PromptCompositionConfig only — model-call with the call removed
  json-extract       text → JSON parse; no prompt, no model, no PromptCompositionConfig
  presentation       static text with {{artifact.X}} interpolation; fully inert
```

**The shared DNA is `PromptCompositionConfig`.** It is declared on `PipelineStep` (not inside any `StepConfig`), and only `model-call` and `prompt-wrapper` use it. `prompt-wrapper` is the atom projected to its input phase: prompt assembly without invocation. It exists so context can be pre-assembled once and consumed by multiple downstream steps via history reads.

**`json-extract` is the structurally odd one.** It shares no DNA with the atom — no prompt, no model, no `PromptCompositionConfig`. It is a general-purpose transformation utility (`text → JSON`) that happens to be most useful directly after a `model-call`. The pattern `model-call → json-extract` is by far the most common use.

**Simplification available:** add `parseOutputAsJson?: boolean` to `ModelCallStepConfig`. When set, the executor runs a shared three-strategy JSON parse on the model's text output and emits an additional `{namespace}.json` artifact — eliminating the need for a trailing `json-extract` step in the common case. (The full three-strategy parser currently exists only in `executor.ts`; S11 ports it to a shared utility used by both executors.) The standalone `json-extract` step remains for the edge case of parsing JSON from a non-adjacent source artifact. This reduces the visible step palette from 6 types to 5 for most pipelines. See **S11** in the backlog.

### JSON artifact contract

Several items — S11, S12, S14, and the existing `parsedJson` — all touch the JSON output surface of `model-call` steps. The coherent contract across all of them:

```
TIER 1 — OPPORTUNISTIC (current; deprecated by S11)
  model-call emits {namespace}.parsedJson silently when text parses as JSON.
  No error on failure; .parsedJson is simply absent.
  Listed in the artifact picker as 'parsed JSON (if available)' — label acknowledges unreliability.
  Not a stable contract. REMOVED when S11 ships.

TIER 2 — EXPLICIT STEP (existing; unchanged)
  json-extract step:
    input:   any text artifact (config.sourceArtifactRef — can be non-adjacent)
    output:  {namespace}.json
    error:   json_parse_failed on failure
    parser:  three-strategy (Strategy 3 currently in executor.ts only)
    use when: parsing a non-adjacent artifact, or pre-S11

TIER 3 — EXPLICIT FLAG (S11; moved from LATER to SOON)
  model-call with parseOutputAsJson: true:
    output (parse succeeds):  {namespace}.json
    on parse failure:         step stays 'completed'; .json absent;
                              jsonParseFailed: true on trace event → triggers S12 Path A retry
    parser:  three-strategy shared utility (ported in S11)
    use when: the model's own output must be JSON (the common case)

S12 RETRY — two paths, different dependencies
  Path A: model-call with parseOutputAsJson: true; jsonParseFailed: true on trace
          → retry the model-call with <format_reminder> (clean path; depends on S11)
  Path B: json-extract step fails; sourceArtifactRef is preceding model-call's .text
          → retry that model-call (independent of S11; more complex executor logic)
```

**Naming rule:** `.json` means a reliably-parsed JSON artifact, whether from `json-extract` or from `parseOutputAsJson: true`. `.parsedJson` was the old opportunistic name; nothing should reference it after S11.

---

## Plans

---

### N1 — Improve built-in step suggestion prompts

**File:** `packages/capsules/src/suggestions/definitions.ts`

Three classes of changes:

**A — Self-contained system prompts with semantic XML references**

Every suggestion is a standalone step. It should not say "the previous output" — it should name what it expects to receive. The `tagName` in `previousOutput` config and in `historyReads` must describe content, not position. The system prompt must reference those exact tag names so the model knows exactly where to look.

**B — Pre-wire history reads for cross-step context**

Suggestions that naturally consume outputs from other suggestions (Candidate Answer needs criteria; Answer Verification needs criteria; Drift Check needs original intent) should pre-populate `historyReads` with optional reads pointing to the conventional step IDs (`acceptance-criteria`, `intent-extraction`, etc.). These reads are `required: false` — they are silently skipped when the source step doesn't exist, and used automatically when it does.

**C — historyRead ID remapping on insertion (required for B to work)**

`instantiateSuggestion()` in `packages/capsules/src/suggestions/index.ts` replaces each step's `id` with a fresh generated ID but spreads `prompt.historyReads` verbatim. After insertion, `historyReads[*].sourceStepId` still points to the template ID (e.g. `'acceptance-criteria'`) which matches nothing in the pipeline. The optional reads silently produce no data.

Fix in two steps:

**Step 1 — Store the template ID on cloned steps.**
Add `createdFromTemplateStepId?: string` to `PipelineStep` in `packages/core/src/types/pipeline.ts`. In `cloneOne()`, set it to `step.id` (the original pre-clone ID) before overwriting `id`.

**Step 2 — Remap `sourceStepId` after cloning.**
`instantiateSuggestion` accepts an `existingSteps?: PipelineStep[]` parameter.
After all steps in the suggestion are cloned, walk every `historyRead` in the new steps and remap `sourceStepId`:

```
For each historyRead where sourceStepId = 'acceptance-criteria':
  1. Intra-suggestion remap:
     check if any step in THIS batch has createdFromTemplateStepId === 'acceptance-criteria'
     → replace with that step's new id

  2. Cross-suggestion remap (fallback):
     check if any step in existingSteps has createdFromTemplateStepId === 'acceptance-criteria'
     → replace with that step's id

  3. If neither matches: leave as-is (the Validation tab will flag it as a missing source,
     same as today — but now it only happens when the referenced suggestion genuinely
     hasn't been inserted)
```

**Test to add** in `packages/capsules/tests/suggestions.test.ts`:
- Insert Acceptance Criteria → insert Candidate Answer with existing steps → Candidate Answer's `historyRead` for `acceptance_criteria.text` resolves to the cloned criteria step's actual generated ID
- Insert Candidate Answer with no existing steps → `historyRead.sourceStepId` remains the template ID (unresolved, expected)

---

#### Intent Extraction

```
tagName:  user_request   (was: user_prompt)
historyReads: []

System prompt:
  You are an intent extractor. Read the user's request in <user_request> and
  identify what they are trying to accomplish.

  Rules:
  - intent: one concise sentence (≤20 words) describing the core goal
  - topics: 1–5 short noun phrases (e.g. "sorting algorithms", "TypeScript")
  - confidence: float 0.0–1.0; use ≤0.3 if the request is ambiguous
  - If the request is unclear or empty, still return valid JSON with low confidence

  Respond with JSON only, no commentary, no markdown fences:
  { "intent": string, "topics": string[], "confidence": number }
```

---

#### Acceptance Criteria

```
tagName:  user_request   (was: previous_output)
historyReads:
  - sourceStepId: intent-extraction
    sourceArtifactRef: intent_extraction.text
    tagName: intent_analysis
    required: false

System prompt:
  You are a requirements analyst. Generate testable acceptance criteria for the
  request in <user_request>.

  If <intent_analysis> is present, use it to sharpen your understanding of scope.

  Rules:
  - criteria: up to 8 items; each a testable boolean starting with "The output..."
    or "The system..."
  - assumptions: things NOT stated explicitly but assumed to be true
  - Return [] for any empty array; never return null

  Respond with JSON only, no commentary, no markdown fences:
  { "criteria": string[], "assumptions": string[] }
```

---

#### Constraint Extraction

```
tagName:  user_request   (was: previous_output)
historyReads: []

System prompt:
  You are a constraint extractor. Identify explicit constraints in the request
  found in <user_request>.

  Rules:
  - must: hard requirements; use imperative verbs ("Use X", "Include Y")
  - must_not: hard prohibitions ("Do not use Z", "Avoid W")
  - preferences: nice-to-haves, not hard constraints
  - Return [] for any empty array; never return null

  Respond with JSON only, no commentary, no markdown fences:
  { "must": string[], "must_not": string[], "preferences": string[] }
```

---

#### Prompt Rewrite

```
tagName:  content_to_rewrite   (was: previous_output)
historyReads: []

System prompt:
  You are a prompt engineer. Rewrite the content in <content_to_rewrite> to be
  clearer, more concise, and better structured for use in an LLM pipeline.

  Rules:
  - Preserve all constraints, requirements, and factual claims
  - Remove hedging, filler, and conversational preamble
  - Do NOT add any preamble to your response
  - Do NOT wrap the output in XML tags
  - Output the rewritten text only
```

---

#### Candidate Answer

```
previousOutput.enabled: false   (was: enabled, tagName: 'previous_output')
historyReads:
  - sourceStepId: pipeline-input
    sourceArtifactRef: user_prompt.xml
    tagName: task
    required: true
  - sourceStepId: acceptance-criteria
    sourceArtifactRef: acceptance_criteria.text
    tagName: acceptance_criteria
    required: false
  - sourceStepId: constraint-extraction
    sourceArtifactRef: constraint_extraction.text
    tagName: constraints
    required: false
  - sourceStepId: prompt-rewrite
    sourceArtifactRef: prompt_rewrite.text
    tagName: refined_task
    required: false

System prompt:
  You are a careful, thorough responder. Write a complete answer to the task
  described in <task> (use <refined_task> instead if present — it is a
  clarified version of the same request).

  Rules:
  - If <acceptance_criteria> is present, address each criterion explicitly
  - If <constraints> is present, honour every must/must_not item
  - Match the format implied by the criteria (JSON, prose, code, etc.)
  - Be specific — avoid vague or hedged language
```

---

#### Answer Verification

```
tagName:  candidate_answer   (was: candidate_answer — already correct)
historyReads:
  - sourceStepId: acceptance-criteria
    sourceArtifactRef: acceptance_criteria.text
    tagName: acceptance_criteria
    required: false
  - sourceStepId: pipeline-input
    sourceArtifactRef: user_prompt.xml
    tagName: original_request
    required: false

System prompt:
  You are a strict verifier. Evaluate whether the answer in <candidate_answer>
  satisfies the requirements.

  Check against <acceptance_criteria> if present; otherwise check against
  <original_request>.

  Rules:
  - passed: true only if ALL criteria are met
  - failures: list each unsatisfied criterion (empty array if passed)
  - notes: one sentence overall assessment

  Respond with JSON only, no commentary, no markdown fences:
  { "passed": boolean, "failures": string[], "notes": string }
```

---

#### Drift Check  *(detection only — see S6 for the paired fix step)*

```
tagName:  output_to_review   (was: previous_output)
historyReads:
  - sourceStepId: intent-extraction
    sourceArtifactRef: intent_extraction.text
    tagName: original_intent
    required: false
  - sourceStepId: pipeline-input
    sourceArtifactRef: user_prompt.xml
    tagName: original_request
    required: false

System prompt:
  You are a semantic drift detector. Compare the output in <output_to_review>
  against the original intent.

  Use <original_intent> as the reference if present; otherwise use
  <original_request>.

  Rules:
  - drifted: true if the output omits, contradicts, or significantly changes
    the original intent
  - severity: "none" | "minor" | "significant" | "critical"
  - differences: list SPECIFIC claims or requirements that diverge ([] if none)

  Respond with JSON only, no commentary, no markdown fences:
  { "drifted": boolean, "severity": "none"|"minor"|"significant"|"critical", "differences": string[] }
```

**Design decision — drift detection vs. fixing:** Drift Check stays detection-only. Merging fix logic into it would conflate two responsibilities and make it harder to use in a loop exit condition. A separate "Drift Fix" suggestion (S6) reads the drift analysis and produces a corrected output.

---

#### Summary

```
tagName:  source_content   (was: source)
historyReads: []

System prompt:
  You are a precise summariser. Compress the content in <source_content> into a
  concise summary.

  Rules:
  - Target length: 3–5 sentences or one short paragraph
  - Preserve: numbers, proper nouns, decisions, and conclusions
  - Omit: hedging language, repetition, meta-commentary
  - Output the summary text only, no preamble
```

---

### N2 — Polish live prompt preview: truncation + full-prompt modal

**Current state (shipped):** `PromptCompositionEditor.vue:506` already renders live XML with real artifact values.

**Two remaining gaps:**

**1 — Truncate in the embedded preview**

The embedded preview is for structure review — seeing which tags are present and in what order. Long values destroy that. Add truncation in `artifactValue()`:

```ts
const PREVIEW_TRUNCATE_CHARS = 400;
// ...
return raw.length > PREVIEW_TRUNCATE_CHARS
  ? raw.slice(0, PREVIEW_TRUNCATE_CHARS) + '\n…(truncated)'
  : raw;
```

Placeholders (`«not yet run»`) stay for slots where no artifact exists yet. This keeps the embedded view useful as a structure check.

**2 — "View full prompt" modal button**

A second surface for complete review: fully resolved, untruncated, no placeholders.

Add a "🔍 Full prompt" button to the `PromptCompositionEditor` toolbar (next to "? References"). Clicking it opens a modal containing:
- The complete prompt XML produced by `renderPromptComposition()` with all real values, no truncation
- A note banner if any slot is still unresolved: "Some values not yet available — run the pipeline first"
- Syntax-highlighted XML (or at minimum line-wrapped monospace with a copy button)
- The modal is read-only — editing goes back through the block editor

This gives two distinct surfaces with clear purposes:
- **Embedded preview** → structure review: which tags, which order, are all wires connected?
- **Full prompt modal** → content review: exactly what gets sent to the model right now?

**3 — Extract resolution helpers and test them**

`artifactValue()` and `resolvedPreviousOutput()` are inlined in the component and close over Vue stores. Extract as pure functions into `apps/web/src/utils/promptPreview.ts`:

```ts
export function resolveArtifactValue(
  artifactRef: string,
  artifacts: Record<string, PipelineArtifact>,
  userPromptArtifacts: { raw: string | null; xml: string | null },
  truncateAt?: number,
): string | null

export function resolvePreviousOutput(
  stepId: string,
  chainSteps: PipelineStep[],
  artifacts: Record<string, PipelineArtifact>,
  userPromptArtifacts: { raw: string | null; xml: string | null },
): string | undefined
```

Tests in `apps/web/tests/promptPreview.test.ts` — cover what `promptPreview.ts` owns (artifact resolution and `ResolvedHistoryRead[]` construction):
- artifact present → resolved string, truncated at `truncateAt` chars with `…(truncated)` suffix
- artifact absent + user prompt present → user prompt XML injected
- artifact absent + no user prompt → `«not yet run»` placeholder
- optional history read with no artifact → constructs `{ sourceArtifactRef, omitted: true }`
- required history read with no artifact → constructs `{ sourceArtifactRef, omitted: false }` (render layer decides what to do; tested separately)
- full-prompt path: `truncateAt` not applied (unlimited)

The render behaviour of what happens when `omitted: true` ("block is dropped") is already `renderPromptComposition()` logic and belongs in `packages/prompt/tests/prompt.test.ts`, not here.

---

### N3 — "Run up to here" visual boundary indicator

**Goal:** After a partial run the target step is visually marked. Persists so users always know the last partial boundary.

**Lifecycle:**
- **Set** when "run up to step X" is invoked
- **Persists** through and after run completion
- **Cleared** only when a new full Execute starts (no partial boundary anymore)
- New "run up to Y" immediately replaces the marker

**State** (add to `activeRun.ts`):
```ts
partialRunTargetStepId: string | null = null
```

**`ChainEditor.vue` changes:**

New prop: `partialRunTargetStepId?: string`

Class binding: `'partial-run-target': step.id === props.partialRunTargetStepId`

```css
.chain-step.partial-run-target {
  border-bottom: 2px solid var(--color-run-accent, #4a9eff);
}
.chain-step.partial-run-target .step-card::after {
  content: '▲ partial run boundary';
  font-size: 0.65rem;
  color: var(--color-run-accent, #4a9eff);
  display: block;
  text-align: right;
  padding: 0.25rem 0.5rem;
  opacity: 0.8;
}
```

---

### N4 — Comment editing UX

**Current:** commits silently on textarea `blur` (`ChainEditor.vue:759`).

1. Remove `@blur="onCommentBlur"`.
2. Add explicit Save/Cancel below the textarea:

```html
<div v-if="isCommentExpanded(step.id)" class="step-comment-actions">
  <button class="btn btn-sm btn-primary" @click.stop="saveComment(step.id)">Save</button>
  <button class="btn btn-sm btn-ghost"   @click.stop="cancelComment(step.id)">Cancel</button>
</div>
```

3. `saveComment`: emit `update-step-comment` then collapse.
4. `cancelComment`: restore `commentDrafts[stepId] = step.description ?? ''` then collapse.
5. CSS: `cursor: pointer` on `.step-comment-header`; `cursor: text` on `.step-comment-textarea`.

---

### N5 — JSON syntax highlighting + raw/pretty toggle

**New file:** `packages/ui-kit/src/JsonViewer.vue`

**Props:**
```ts
value: unknown
initialMode?: 'pretty' | 'raw'   // default: 'pretty'
```

**Features:**
- **Pretty mode:** tokenised spans (`.jv-key`, `.jv-string`, `.jv-number`, `.jv-bool`, `.jv-null`), collapsible objects/arrays (▶/▼), key-count badge on collapsed nodes (`{ 12 keys }`)
- **Raw mode:** plain `<pre>` of the original text
- **Pretty/Raw toggle button** in the component header — switches between modes; useful when the user needs to select or copy unformatted output
- **Copy button:** always copies raw JSON (not HTML)
- If `value` is a string: attempt `JSON.parse`; fall back to raw mode if not valid JSON

```css
/* scoped */
.jv-key     { color: #7ec8e3; }
.jv-string  { color: #98c379; }
.jv-number  { color: #d19a66; }
.jv-bool    { color: #e06c75; }
.jv-null    { color: #abb2bf; }
```

Replace raw `<pre>` / `formatArtifact` renders in `OutputPanel.vue`, `TracePanel.vue`, `StepInspector.vue`.

---

### S1 — AI-assisted pipeline features: shared operational contract

**Model selection:**
- S1a: use the parent step's `modelRef`; if `kind === 'slot'` or the endpoint is disabled, fall back to any enabled model with bucket `general`
- S1b / S1c: use any enabled model from the models store, preferring `general` bucket
- No usable model → return `{ error: 'no_model' }` and show "No model available — enable an endpoint first" in the UI

**Cancellation and timeouts:**
- All composables accept an `AbortSignal`
- Components obtain it via `new AbortController()`; abort in `onUnmounted`
- Compose with `AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS)` (from `@lorca/core`)

**Malformed LLM responses:**
- S1a: free text — always usable; no parsing needed
- S1b: expects `[{ "id": string, "reason": string }]` — on parse failure show raw response with "Couldn't parse suggestions"; filter unknown IDs silently with `console.warn`
- S1c: expects a step array — on parse failure show raw response with a "Manual import" fallback that opens the standard Import dialog

**Error display:** inline dismissible banner; never a blocking modal.

---

### S1a — AI prompt improver

**Depends on:** N1.

**New composable:** `apps/web/src/composables/usePromptImprover.ts`

```ts
async function improvePromptBlock(
  stepLabel: string,
  blockLabel: string,
  currentBody: string,
  signal: AbortSignal,
): Promise<{ suggested: string } | { error: string }>
```

System prompt:
```
You are an expert prompt engineer specialising in LLM pipeline steps.
Rewrite the prompt block body to be more specific about expected output format,
more robust to edge cases, and concise but complete.
Reference the exact XML tag names used in the block's context.
Respond with ONLY the rewritten block body. No preamble, no explanation.
```

**UI in `PromptCompositionEditor.vue`:**

```html
<button class="pce-improve-btn" :disabled="isImproving(block.id)"
        @click="improveBlock(block)">✨</button>
```

Inline suggestion panel below the textarea:
```
┌── Suggested rewrite ────────────────────────┐
│ You are an intent extractor. Read the ...   │
│ [Use this]              [Dismiss]           │
└─────────────────────────────────────────────┘
```

**Undo integration:** "Use this" applies the block body update through the existing undo-tracked mutation path in `pipelineEditor` store — the same path used for any other block edit. This means ⌘Z immediately reverts an AI-applied suggestion, same as a manual edit.

---

### S1b — AI next-step advisor

**Depends on:** Nothing from S1a — parallel track.

**New composable:** `apps/web/src/composables/useStepAdvisor.ts`

```ts
async function getStepSuggestions(
  pipeline: PipelineDefinition,
  artifactKeys: string[],
  availableSuggestions: PipelineSuggestion[],
  signal: AbortSignal,
): Promise<Array<{ suggestionId: string; reason: string }>>
```

Context sent to model:
```
Current pipeline steps: [1. Intent Extraction, 2. Candidate Answer]
Available suggestions: [suggestion-acceptance-criteria: ..., ...]
Suggest 2-3 most useful next steps. Respond JSON only:
[{ "id": "...", "reason": "..." }]
```

**UI:** "✨ AI suggestions" sub-section at the bottom of the Step Suggestions accordion in `LeftPane.vue`. Spinner while loading; suggestion cards with reason line and ↓ Insert button.

---

### S1c — NL pipeline generator (Capsule-based)

**Depends on:** S1a and S1b validated.

**Design decision: the generator is a built-in editable Capsule**

The generator prompt lives in a Capsule named `lorca-pipeline-generator`, shipped locked with Lorca. This gives users:
- Full visibility into how the generator works (inspect the Capsule's steps and prompts)
- The ability to improve it: `⊕ Duplicate` creates an editable draft
- Revert path: delete the custom draft; the locked original is always available
- A template for future system Capsules (`lorca-code-reviewer`, `lorca-doc-summariser`, etc.)

**Capsule definition** (`packages/capsules/src/examples/definitions.ts`):
```
id:      lorca-pipeline-generator
status:  locked
inputs:  description (text, required)
outputs: pipeline_steps_json (json)
slots:   generator (preferred: general / thinking)
steps:   one model-call step with the generator system prompt
```

The generator system prompt (inside the Capsule):
```
You are a pipeline architect for Lorca, a local AI orchestration tool.
Given a description, produce a JSON step sequence using only these suggestions:
[serialised BUILTIN_SUGGESTIONS id + description]

Output format:
[
  { "suggestionId": "suggestion-intent-extraction" },
  { "wrapInLoop": true, "exitCondition": {...}, "inner": [...] }
]

Respond with JSON only.
```

**UI:** "✨ Build from description…" in the `⋯ More` menu of the center pane toolbar.

Flow:
```
[✨ Build from description]
        │
        ▼
  Modal: textarea + "Which generator?" capsule picker
         (defaults to lorca-pipeline-generator)
        │
        ▼  execute Capsule
  Preview: step labels in order, warning for unknown IDs
        │
        ├── parse failure → raw response + "Manual import" fallback
        ▼  success
  [Apply — replaces current pipeline]
  Instantiate via useSuggestionInsert + stepBuilders,
  then ImportRemapDialog for model assignment
```

**Note:** This is the first entry in a "ships-with-Lorca Capsule library." S4 formalises the broader concept.

---

### S2a — True dependency model for the compiler

**The problem** (`chainCompiler.ts:88–100`): every step unconditionally adds the previous step as an input, even when `prompt.previousOutput.enabled` is false. All plans are linearly dependent; S2b cannot produce parallel levels until this is fixed.

**New function:** `deriveStepDependencies(step, allSteps): Set<string>`

```
1. prompt.previousOutput.enabled === true
   → add nearest prior enabled step's id

2. prompt.historyReads[*].sourceStepId
   → add each directly

3. config.type === 'json-extract'
   → find step that produces config.sourceArtifactRef (match by outputNamespace)

4. config.type === 'presentation'
   → parse {{artifact.X}} refs from config.text; find producing steps

5. config.type === 'capsule-instance'
   → each inputBindings value → find producing step by outputNamespace prefix

6. config.type === 'loop-group'
   → apply rules to first inner step's inputs; loop-group step depends on those
```

Replace the unconditional `prevActiveStep` push with results from this function.

**Tests** (`packages/pipeline/tests/chainCompiler.test.ts`, new file):
- `previousOutput.enabled = false` → no dependency on prior step
- History read → depends on source step only
- `json-extract` → depends on artifact-producing step
- Presentation `{{artifact.X}}` → depends on X's producing step
- Loop-group → inner step deps bubble up

**Prerequisite for S2b. Do not implement concurrent execution until this test suite passes.**

---

### S2b — Concurrent step execution

**Depends on:** S2a.

```ts
export interface ExecutionLevel { steps: CompiledExecutionStep[]; }

// layered topological sort on S2a's dependency graph
function buildExecutionLevels(compiled: CompiledExecutionStep[]): ExecutionLevel[]
```

**Endpoint concurrency constraint**

Parallel execution must respect per-endpoint capacity. By default, Ollama and most local servers queue requests but perform poorly under concurrent load. A new field on `AiEndpointConfig` (in `packages/core/src/types/endpoints.ts`) controls this:

```ts
maxConcurrentRequests?: number   // default: 1 (no concurrent requests to this endpoint)
```

Default is 1 — parallelism only happens across *different* endpoints. Users can raise the limit per endpoint when the server supports it (e.g. a GPU server running multiple workers).

**Implementation: per-endpoint semaphore**

```ts
// Built once per run, keyed by endpointId
const endpointSemaphores = new Map<string, Semaphore>(
  endpoints.map(ep => [ep.id, new Semaphore(ep.maxConcurrentRequests ?? 1)])
);
```

`Semaphore` is a simple counter with a waiting-promise queue. Before each model call, acquire the semaphore for the target endpoint; release in a `finally` block. This means:
- Steps in a level targeting different endpoints start immediately in parallel
- Steps in a level targeting the same endpoint are serialized (or throttled to `maxConcurrentRequests`)

**Executor loop:**
```ts
for (const level of buildExecutionLevels(plan.steps)) {
  const levelResults = await Promise.all(
    level.steps.map((step) => executeCompiledStep(step, ctx, callbacks, endpointSemaphores))
  );
  // merge after full level to avoid within-level artifact races
  for (const result of levelResults) {
    if (!result.ok) { /* cancel, propagate */ break; }
    for (const artifact of result.value.artifacts) ctx.artifacts[artifact.name] = artifact;
  }
}
```

**UI:** "Max concurrent requests" number input in the endpoint editor (`AddEndpointForm.vue`, `EndpointCard.vue`). Default 1, range 1–20. Shown as a secondary setting, collapsed by default.

**S8 interaction (Review Mode):** When Review Mode is on, the `onBeforeStep` callback must be called before the step's semaphore is acquired. Within a parallel level, reviews are presented one at a time in step order (not batched) — the user sees "Step 1 of 2 in this parallel batch." After all steps in the level are reviewed, they execute together (subject to endpoint semaphores). This means review mode does not disable parallelism; it just serializes the *review* phase while keeping the *execution* phase parallel.

---

### S3 — Enhanced model filtering & sorting

```html
<div class="models-filter-bar">
  <!-- existing bucket chips -->
  <select v-model="modelSortBy">
    <option value="name">Name A→Z</option>
    <option value="size">Size (small→large)</option>
    <option value="endpoint">Endpoint</option>
  </select>
  <input v-model="modelNameFilter" placeholder="Search…" />
</div>
```

Sort by size: parse `:Nb` / `:NxNb` suffix from `providerModelName`; fall back to `parameterSize` field; fall back to string compare.

```ts
computed(() => {
  let list = [...allModels.value];   // copy — never sort a reactive array in place
  if (selectedBucket.value)
    list = list.filter(m => effectiveBuckets(m).includes(selectedBucket.value));
    // effectiveBuckets() from @lorca/endpoints returns m.userBuckets ?? m.buckets
  if (modelNameFilter.value)
    list = list.filter(m =>
      m.providerModelName.toLowerCase().includes(modelNameFilter.value.toLowerCase())
    );
  return list.sort(sortFnFor(modelSortBy.value));
})
```

---

### S4 — Example pipelines + built-in Capsule library

**Concept:** Lorca ships with a set of locked Capsules pre-installed (not requiring import). They serve two purposes: ready-to-use tools and reference implementations users can study and fork.

**Starter set:**

| Name | Kind | Demonstrates |
|------|------|--------------|
| `lorca-pipeline-generator` | Capsule | Powers S1c; user-forkable; revert to original always available |
| Code Review pipeline | Example pipeline | Full feedback loop with loop-group |
| Document Summary pipeline | Example pipeline | Simple 3-step linear pipeline |
| Multi-draft Synthesis pipeline | Example pipeline | Side-by-side model comparison; sequential now, parallel showcase after S2b |

**Implementation:**
1. Built-in Capsules: serialize as `CapsuleDefinition` JSON in `packages/capsules/src/examples/`; pre-install into the capsule store on first launch (merge, never overwrite user drafts)
2. Example pipelines: serialize as `PipelineExportFile` JSON; accessible via "Load example pipeline…" in the `⋯ More` menu
3. Revert path for forkable Capsules: a "Revert to original" action in the Capsule editor that replaces the user's draft with the shipped locked version (with confirmation)

---

### S5 — Help button audit

Review `HelpDialog.vue` content against the current feature surface (any-enabled-endpoint, model toggling, undo/redo, drag-and-drop, partial run boundary indicator, etc.). Update stale sections and add entries for recently shipped features. Do last — captures all N+S changes.

---

### S6 — Drift Fix suggestion

**Design decision:** Drift Check is a detector only. Merging fix logic into it would make it harder to use as a loop exit condition and harder to compose. Drift Fix is a separate rewrite step.

**New entry in `packages/capsules/src/suggestions/definitions.ts`:**

```
id:       suggestion-drift-fix
name:     Drift Fix
category: rewrite
preferred bucket: rewrite

previousOutput:
  tagName: output_to_revise
  enabled: true

historyReads:
  - sourceStepId: drift-check
    sourceArtifactRef: drift_check.text
    tagName: drift_analysis
    required: true
  - sourceStepId: pipeline-input
    sourceArtifactRef: user_prompt.xml
    tagName: original_request
    required: false

System prompt:
  You are a rewriter. The output in <output_to_revise> has been flagged by a
  drift analysis in <drift_analysis>.

  Rewrite <output_to_revise> to fix each issue listed in
  drift_analysis.differences while preserving everything that is already
  correct.

  If <original_request> is present, use it to verify alignment after rewriting.

  Output the revised text only. No preamble, no explanation.
```

**Typical loop pattern after this ships:**
```
candidate_answer
  ┌─ retry loop ──────────────────────────────────────────┐
  │  candidate_answer → drift_check → drift_fix           │  exit when drifted = false
  └───────────────────────────────────────────────────────┘
```

---

### S7 — Pipeline I/O overview panel

**Goal:** A single view of what went in and what came out, without navigating individual steps or reading the trace.

**New tab in the right pane:** "Overview" (shown in pipeline mode; sits alongside Inspector / Trace / Output).

```
┌─ Overview ──────────────────────────────────────┐
│  Input                                           │
│  ────────────────────────────────────────────── │
│  How do I implement a binary search tree in     │
│  Python?                                         │
│                                                  │
│  Output                                          │
│  ────────────────────────────────────────────── │
│  A binary search tree (BST) stores elements...  │
│                                                  │
│  Run stats                                       │
│  ────────────────────────────────────────────── │
│  Steps: 4 executed · 0 skipped                  │
│  Duration: 12.4s                                 │
│  Partial run: steps 1–3 only                    │
└─────────────────────────────────────────────────┘
```

**Implementation:**
- Input: `pipeline.input.raw` (accessed as `editorStore.pipeline.input.raw` — matches how `CenterPane.vue` binds the prompt bar)
- Output: the final artifact value from the last run (same source as the Output tab)
- Stats: computed from `activeRun` store (executedStepIds, duration, partial flag)
- Stale banner: same as Output tab when upstream changed
- Uses `JsonViewer` for output if the value is JSON (N5)

---

### S8 — Prompt Review Mode

**Goal:** Before each step executes, show the fully resolved prompt — including all history reads and previous output — and let the user edit it. Edits are saved to the step's prompt config and are undo-tracked.

**Depends on:** N2 (the full-prompt modal infrastructure provides the resolved-prompt display).

**New execution mode flag** (in `activeRun.ts`):
```ts
reviewMode: boolean = false
```

Toggle available in the pipeline toolbar (e.g. a "Review mode" toggle button).

**Execution flow with review mode on:**

```
[Execute Pipeline]
        │
        ▼ (for each step, before executing)
  modal: PromptReviewDialog
  ┌─────────────────────────────────────────────┐
  │  Step: "Candidate Answer"                   │
  │  ─────────────────────────────────────────  │
  │  <task>                                     │
  │    How do I sort a linked list in Python?   │
  │  </task>                                    │
  │  <system>                                   │
  │    You are a careful, thorough responder... │
  │  </system>                                  │
  │                                             │
  │  [Edit blocks ▾]  [Run step]  [Cancel run]  │
  └─────────────────────────────────────────────┘
```

**Editing:** The modal shows the full composed XML (read-only) for review. An "Edit blocks" disclosure below it expands the individual prompt blocks as editable textareas — the same controls as the Prompt tab in the Inspector, but inline in the modal. This avoids round-tripping XML parsing.

**On "Run step":**
1. If any block was edited: apply updates via the undo-tracked `pipelineEditor` store mutation (same path as typing in the Prompt tab — ⌘Z reverts)
2. Execute the step with the updated config
3. Close the modal; advance to the next step's review

**On "Cancel run":** abort the pipeline; modal closes; pipeline stays in partial-run state.

**Implementation notes:**
- The executor needs a `onBeforeStep` callback: `(stepId: string, resolvedPromptXml: string) => Promise<'run' | 'cancel'>`
- In review mode, this callback opens the modal and waits for the user's choice
- In normal mode, this callback resolves to `'run'` immediately (zero overhead)
- The resolved XML for the dialog comes from the same `renderPromptComposition()` path as the full-prompt modal (N2)

**Concurrency interaction (S2b):** When Review Mode and parallel execution are both active, reviews within a level are serialized — shown one at a time in step order ("Step 1 of 2 in this parallel batch") — but execution remains parallel once all steps in the level are approved. The `onBeforeStep` callback is invoked *before* the endpoint semaphore is acquired so the review phase doesn't hold endpoint capacity while the user is reading.

---

### S9 — Smart model requirements

**Goal:** Let step authors express what kind of model they need — by family, size range, or capability — without naming a specific model. The executor picks the first enabled model that satisfies the requirements.

**`DiscoveredModel` already has:** `family?: string`, `parameterSize?: string` (e.g. "3B"), `sizeBytes?: number`. No new fields required on the model side for basic matching; capability tags require one new optional field.

**New `ModelRef` kind** in `packages/core/src/types/pipeline.ts`:

```ts
| {
    kind: 'requirements';
    family?: string;           // e.g. "llama", "qwen", "mistral"
    sizeMinB?: number;         // minimum parameter count in billions
    sizeMaxB?: number;         // maximum parameter count in billions
    capabilities?: string[];   // e.g. ["json", "code", "fast"]
    fallbackBucket?: ModelUsageBucket;  // used if no match found
  }
```

**New optional field on `DiscoveredModel`:**
```ts
capabilities?: string[];   // user-assigned: "json", "code", "vision", "fast"
```

**Resolution in `modelResolution.ts`** — new `pickModelByRequirements()`:
```
1. Filter: enabled === true
2. Filter: family matches (case-insensitive prefix/substring) if set
3. Filter: parsed parameter count within [sizeMinB, sizeMaxB] if set
   (parse from parameterSize "3B", "7B", "8x7B" → 56 etc.; fallback to sizeBytes)
4. Filter: all required capabilities present in model.capabilities
5. Return first match, or fall back to pickModelRef(fallbackBucket) if no match
```

**UI in the step Config tab** (model-call steps):

A toggle between existing "Specific model" mode and new "Requirements" mode:

```
Model ─────────────────────────────────────────────
  ○ Specific model:   [llama3.2:3b ▾]
  ● Requirements:
    Family:  [llama          ]
    Size:    [   1 ] – [  13 ] B
    Needs:   [json ×] [fast ×] [+ add]
    → will use: llama3.2:3b  (first match)
```

The "will use" line shows live which model would be picked given current registry state.

**Capability tag editing** is added to `ModelBucketEditor.vue` — a freeform chip input alongside the existing bucket tags, so users can annotate their models once and reuse the requirements filter across many steps.

### S10 — Infrastructure retry with endpoint cycling

**Goal:** When a model call fails at the transport level, don't fail immediately. First cycle through other endpoints that carry the same model; only declare failure when all options are exhausted.

---

**Core type changes required first** (do before any executor work):

In `packages/core/src/types/pipeline.ts` — extend `PipelineTraceEvent.status` and add typed payload sub-objects:

```ts
// Extend the status union:
status: 'started' | 'completed' | 'failed' | 'skipped' | 'cancelled'
      | 'retrying'           // new: transport retry in progress
      | 'model-substituted'  // new: similar-model fallback fired

// New payload interfaces (add alongside PipelineTraceEvent):
export interface RetryTraceInfo {
  attempt: number;          // 1-based retry count
  endpoint: string;         // endpoint being tried in this attempt
  reason: string;           // why the previous attempt failed (human-readable)
}

export interface ModelSubstitutionInfo {
  requested: string;        // original model name the step requested
  actual: string;           // model name that was actually used
  reason: string;           // why substitution occurred (e.g. 'no endpoint available')
}

// New optional fields on PipelineTraceEvent:
retryInfo?: RetryTraceInfo;           // populated when status === 'retrying'
modelSubstitution?: ModelSubstitutionInfo;  // populated when status === 'model-substituted'
jsonParseFailed?: true;               // model call completed but output was not valid JSON
                                      // (used by S11/S12; not an error — step status stays 'completed')
```

The `traceEvent()` helper in `stepExecutor.ts` already accepts `extra?: Partial<PipelineTraceEvent>`. With these fields declared on the type, `{ retryInfo: {...} }` and `{ modelSubstitution: {...} }` become valid `extra` values without any helper changes.

In `packages/core/src/types/errors.ts` — add to `PipelineErrorCode`:
```ts
| 'endpoint_rate_limited'   // new: HTTP 429 from endpoint
```

The priority table mentions rate-limit retry; without this code the executor has no way to distinguish a 429 from other `model_call_failed` cases.

---

**Error codes to retry on:**
- `endpoint_unreachable` — server refused connection or DNS failure
- `model_call_failed` — the call reached the server but got a network-level error (not a bad response)
- `endpoint_rate_limited` — HTTP 429; wait for `Retry-After` seconds if the header is present, otherwise fall back to `initialDelayMs`; endpoint cycling still applies first (try a different endpoint before waiting)
- timeout — `AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS)` fired

**Error codes to NOT retry on** (fail immediately):
- `missing_endpoint`, `missing_artifact`, `invalid_pipeline_graph` — config problems; retrying won't help
- `json_parse_failed` — model responded but content was wrong; that's S11's domain
- `run_cancelled` — user-initiated; never retry

---

**Retry strategy: endpoint cycling first, then backoff on the same endpoint**

The retry order for a given model-call step:

```
Step 1 — Try other endpoints with the same model
  If modelRef is 'fixed' (bound to endpoint A):
    find all other enabled endpoints that also carry modelRef.modelName
    try each in turn — no delay needed, it's a different server
  If modelRef is 'any-enabled-endpoint':
    the resolver already picks one; on failure, exclude it and re-resolve
  If modelRef is 'requirements' (S9):
    re-run requirements matching, excluding the failed endpoint

Step 2 — Retry same endpoint with backoff (if no other endpoint succeeded)
  respects retryConfig.maxAttempts / initialDelayMs / strategy
```

This means a single transport failure cycles through N sibling endpoints before spending any wall-clock time on backoff. Only after exhausting alternatives does it start waiting.

**Per-step config** added to `ModelCallStepConfig`:
```ts
retryConfig?: {
  maxAttempts: number;                    // retries on the same endpoint; default 1 (no retry)
  initialDelayMs: number;                 // default 1000
  strategy: 'fixed' | 'exponential';
  allowSimilarModelFallback?: boolean;    // opt-in; see below; default false
}
```

A global default (all fields) lives in the settings panel (L5). Per-step config overrides it.

---

**When the model isn't available on any endpoint**

Default behaviour (no fallback): **fail with a rich, actionable error**. Silent substitution is dangerous — the user chose a model deliberately, a 3B and a 70B of the same family can produce meaningfully different outputs, and a silent swap in a pipeline with saved artifacts is hard to audit.

The error surface:
- Step card gets an error badge with the model name that was needed
- Inspector → Validation tab shows: "No endpoint has `llama3.2:3b`. Tried: endpoint-A, endpoint-B."
- Below that: a **"Similar available models"** list, ranked by family match then closest size, each with a one-click **"Use for this step"** button that updates the step's `modelRef` and marks it stale
- This is explicit user choice with zero friction

**Opt-in automatic fallback** (`allowSimilarModelFallback: true`):
For pipelines where approximate model equivalence is acceptable (batch exploration, draft generation), a per-step flag enables automatic substitution when no endpoint has the required model. When a fallback fires:
- The trace event records the original requested model and the actual model used: `{ status: 'model-substituted', requested: 'llama3.2:13b', actual: 'llama3.2:3b', reason: 'no endpoint available' }`
- The step card shows a persistent `⚠ substituted` badge after the run
- The fallback is never silently invisible

**"Most similar model" ranking** (used for both the suggestion list and auto-fallback):
1. Same `family` (from `DiscoveredModel.family`), exact name match preferred
2. Closest parameter count — parse from `parameterSize` ("3B" → 3, "8x7B" → 56) or derive from `sizeBytes`; pick the nearest value
3. Break ties by bucket overlap with the step's preferred bucket

This ranking uses fields already present on `DiscoveredModel` — no new metadata required.

---

**Executor change** (`stepExecutor.ts`):

Introduce a new helper `resolveEndpointsForModelRef(modelRef, registry): AiEndpointConfig[]` that returns all candidate endpoints in cycling order. The step executor iterates this list before falling back to backoff retry on the same endpoint.

Each attempt emits a trace sub-event with status `retrying` and a `retryInfo` payload:
```ts
{ status: 'retrying', retryInfo: { attempt: 2, endpoint: 'endpoint-B', reason: 'endpoint-A unreachable' } }
```

A substitution emits `model-substituted` with a `modelSubstitution` payload:
```ts
{ status: 'model-substituted', modelSubstitution: { requested: 'llama3.2:13b', actual: 'llama3.2:3b', reason: 'no endpoint available' } }
```

**UI:** retry config in the step Config tab (collapsible). Trace panel shows each attempt inline: `⟳ endpoint-A unreachable → trying endpoint-B...`

---

### S12 — Structural auto-retry

**Goal:** When a model-call step is expected to produce JSON and the output can't be parsed, automatically retry with a repair instruction appended to the prompt. No extra step or tiny model needed.

**Trigger paths — S11 has two, with different dependencies:**

**Path A — `parseOutputAsJson: true` (requires S11; this is the primary path):**
When `parseOutputAsJson: true` is set, a parse failure sets `jsonParseFailed: true` on the step's trace event and completes the step without `.json` (step status stays `completed`). S12 detects `jsonParseFailed: true` on the trace event and retries the model call with the repair prompt appended. This path is clean: the retry fires within the same step's execution context. Without S11, model-call parse failure is silent — no trace marker exists for S12 to intercept.

**Path B — adjacent `json-extract` failure (independent of S11):**
When a `json-extract` step fails with `json_parse_failed` and its `sourceArtifactRef` is the immediately preceding model-call step's `.text` output, S12 retries that model-call step instead of failing. The executor detects this pattern: `json-extract` step fails → look up the source artifact's producing step → if it's a model-call step with `retryOnParseFailure` enabled → re-run it.

Path B works with today's `model-call → json-extract` two-step pattern without requiring S11. It is, however, a more complex executor change (must re-execute a step that already completed, then re-execute the json-extract). Path A is cleaner — S11 ships first precisely to enable it.

**Config** added to `ModelCallStepConfig`:
```ts
retryOnParseFailure?: {
  maxAttempts: number;    // 1–3; default 1 (no retry)
}
```

Auto-detected candidates for enabling this: model-call steps with `parseOutputAsJson: true` (Path A), or whose next sibling is a `json-extract` step (Path B). The Config tab shows a suggestion badge when either condition is met.

**Retry prompt:** the original composed prompt is sent again with this appended block:
```xml
<format_reminder>
  Your previous response could not be parsed as JSON.
  Respond with valid JSON only. No prose, no explanation, no markdown fences.
</format_reminder>
```

The `<format_reminder>` block is injected at the executor level — it never appears in the prompt editor and doesn't affect the step's saved config. Each retry attempt emits a `retrying` trace event (same status introduced by S10) noting the parse failure.

**Relationship to S10:** S10 and S12 use the same retry infrastructure and `retrying` trace status but trigger on different conditions and apply different repair strategies. Implement together.

---

### S13 — Quick Validator suggestion

**Goal:** A cheap, fast loop-exit gate that checks whether an output is valid — structurally or semantically — without requiring pre-defined acceptance criteria or a capable model.

**How it differs from existing verifiers:**

| | Quick Validator | Answer Verification | Drift Check |
|---|---|---|---|
| Model size | `tiny` bucket | `verify` bucket | `verify` bucket |
| Needs prior criteria? | No | Yes | Yes (original intent) |
| Checks | Format + basic sanity | Criteria satisfaction | Semantic drift |
| Speed | Fast / cheap | Slow / capable | Slow / capable |

**New suggestion** in `packages/capsules/src/suggestions/definitions.ts`:

```
id:       suggestion-quick-validator
name:     Quick Validator
category: verification
preferred bucket: tiny

previousOutput:
  tagName: output_to_validate
  enabled: true

System prompt:
  You are a quick validator. Check whether the content in <output_to_validate>
  meets the format and quality bar described below.

  [USER FILLS IN: describe what "valid" means for this step —
   e.g. "valid JSON with fields: intent (string), topics (array), confidence (number)",
   or "a non-empty, on-topic response that directly addresses the question"]

  Rules:
  - valid: true only if ALL stated requirements are met
  - issues: list each specific problem found ([] if valid)

  Respond with JSON only, no commentary, no markdown fences:
  { "valid": boolean, "issues": string[] }
```

The body above the `[USER FILLS IN]` line ships as `source: 'system-default'`. The user's format description is a second block (`source: 'user-input'`) added below it.

**Typical usage — cheap format gate in a loop:**
```
┌─ retry loop ─────────────────────────────────────────────────┐
│  candidate_answer → quick_validator                          │  exit when valid = true
└──────────────────────────────────────────────────────────────┘
```

**Typical usage — output sanity check without a full loop:**
```
candidate_answer → quick_validator
```
If `valid` is false the pipeline continues but the Output panel highlights the failed validation. Whether to loop or just flag is up to the user.

**Relationship to S10/S12:** Quick Validator is a model-based check (loop-level); S12 is a mechanical parse-fail recovery (step-level). They address the same class of problem at different layers and can be combined: S12 catches parse failures before they reach the loop; Quick Validator catches content failures that did parse but didn't meet the bar.

---

### S14 — Prompt artifacts

**Goal:** Make each step's fully resolved prompt — the exact XML sent to the model — available as a queryable artifact. Downstream steps can then reference it via `historyReads`, just like any other artifact, enabling analysis, audit, and meta-reasoning use cases.

---

**The gap today:** `executePromptStep` already calls `renderPromptComposition()` and stores the result as `renderedPromptXml` on the trace event (line 487 of `stepExecutor.ts`). But the rendered prompt is *not* emitted into the artifact store. A downstream step that wants to reason about "what was actually sent to step X" has no way to reference it.

**Three new artifacts per prompt step** (emitted by both `model-call` and `prompt-wrapper`):

| Artifact key | Content | Kind |
|---|---|---|
| `{namespace}.prompt` | Full resolved XML — identical to `renderedPromptXml` in the trace | `text` |
| `{namespace}.prompt_text` | Block bodies concatenated with `\n\n`, no XML tags | `text` |
| `{namespace}.prompt_tags` | JSON array of tag names in document order | `json` |

Example for a `candidate_answer` step whose prompt assembled three blocks (`system`, `task`, `acceptance_criteria`):

```
candidate_answer.prompt       → "<system>\n...\n</system>\n\n<task>\n...\n</task>\n\n<acceptance_criteria>\n...\n</acceptance_criteria>"
candidate_answer.prompt_text  → "You are a careful responder...\n\nHow do I sort a linked list?\n\n[{\"criteria\": [...]}]"
candidate_answer.prompt_tags  → ["system", "task", "acceptance_criteria"]
```

---

**Executor change — `executePromptStep` in `packages/pipeline/src/stepExecutor.ts`:**

After the `renderPromptComposition()` call (currently line 478), append the three prompt artifacts to the returned artifact list for both `prompt-wrapper` and `model-call` branches:

```ts
const promptArtifacts: PipelineArtifact[] = [
  makeArtifact(`${step.outputNamespace}.prompt`,       step.id, 'text', renderedPrompt.xmlText),
  makeArtifact(`${step.outputNamespace}.prompt_text`,  step.id, 'text',
    renderedPrompt.blocks.map(b => b.body).join('\n\n')),
  makeArtifact(`${step.outputNamespace}.prompt_tags`,  step.id, 'json',
    renderedPrompt.blocks.map(b => b.tagName)),
];
```

For `prompt-wrapper`, the return becomes:
```ts
return stepOk([
  makeArtifact(key, step.id, 'text', renderedPrompt.xmlText),
  ...promptArtifacts,
], traceBase);
```

For `model-call`, add `...promptArtifacts` to the `produced` array alongside `.text` and `.rawResponse`.

Note: `prompt-wrapper`'s `.text` output IS the rendered XML, so `.prompt` is identical to `.text` for that step type. Both are emitted for uniformity — consumers that reference `.prompt` work regardless of whether the source step was a `model-call` or a `prompt-wrapper`.

**No changes to `ModelCallStepConfig.outputNames` or `PromptWrapperStepConfig.outputNames`** — those fields describe model-output names. Prompt artifacts are metadata produced unconditionally, not configurable outputs. The Validation tab's reference guide lists them separately (see below).

**`listStepOutputArtifacts` update** (`packages/pipeline/src/historyReads.ts:46`):

The artifact picker in the history-read UI calls `listStepOutputArtifacts(step)` to populate the dropdown. Currently the `model-call` case returns only `text`, `rawResponse`, and `parsedJson`. Without updating this, the three new artifacts are usable in the executor but invisible to the user — they can't select them when wiring a history read.

```ts
case 'model-call':
  return [
    mk('text'),
    mk('prompt',       'resolved prompt (XML)'),        // new
    mk('prompt_text',  'resolved prompt (untagged text)'),  // new
    mk('prompt_tags',  'prompt tag names (JSON)'),      // new
    mk('rawResponse', 'raw response'),
    mk('parsedJson', 'parsed JSON (if available)'),     // unchanged — S11 removes this later
  ];
case 'prompt-wrapper':
  return [
    mk('text'),
    mk('prompt',       'resolved prompt (XML)'),        // new
    mk('prompt_text',  'resolved prompt (untagged text)'),  // new
    mk('prompt_tags',  'prompt tag names (JSON)'),      // new
  ];
```

S14 does not touch `parsedJson` — it is still emitted by the executor and still listed in the picker. S11 removes it from both when it supersedes `.parsedJson` with the explicit `.json` artifact.

The `.prompt` entry is listed directly after `.text` — it is the primary new surface, and users will most often want to wire it as context for a downstream analysis step.

---

**No new config required.** Prompt artifacts are always emitted; there is no opt-in flag.

**Storage and export tradeoff.** "Three small strings per step" is only true for short prompts. A step that uses `previousOutput` with a large prior output, or several `historyReads` with full artifact values, will produce a `.prompt` artifact of comparable size to `.rawResponse`. For a 10-step pipeline where every step passes the full output forward, the total prompt artifact storage approaches the total model output storage — effectively doubling the size of each run's artifact set in IndexedDB.

Accepted tradeoffs:
- Storage: accepted; IndexedDB limits are high and runs are ephemeral
- Export: prompt artifacts are included in run exports — callers of the export function should be aware this increases file size meaningfully for long pipelines
- Display: the artifact viewer already handles large values with the `JsonViewer` scroll/truncation; no special handling needed for `.prompt` artifacts

**`outputNames` typing is unchanged** — `readonly ['text', 'rawResponse']` on `ModelCallStepConfig` stays as-is. Prompt artifacts don't appear in `outputNames` because they're not model outputs; they're resolved-prompt metadata.

---

**Timing: artifacts available after step completion, not before the model call.** The three artifacts are included in the `Result<StepExecutionResult>` returned by `executePromptStep`, so the outer executor loop adds them to `artifacts` at the same time as `.text` and `.rawResponse` — after the step completes. This means:

- Downstream steps (subsequent in the chain) can reference them via `historyReads`
- They are NOT available while the step itself is running (use `renderedPromptXml` from the trace for mid-step review in S8)
- For S8 (Prompt Review Mode), the `onBeforeStep` hook can still get the pre-call rendered XML from `renderPromptComposition()` directly; S13's artifacts are the persistent post-run reference

---

**Using prompt artifacts in downstream steps:**

A `historyRead` referencing another step's prompt is wired the same way as any other artifact read:

```ts
// In a meta-evaluator step's PromptCompositionConfig:
historyReads: [
  {
    sourceStepId: 'candidate-answer',
    sourceArtifactRef: 'candidate_answer.text',
    tagName: 'model_output',
    required: true,
  },
  {
    sourceStepId: 'candidate-answer',
    sourceArtifactRef: 'candidate_answer.prompt',
    tagName: 'prompt_that_produced_it',
    required: false,
  },
]
```

The meta-evaluator then sees both what was asked (`<prompt_that_produced_it>`) and what was answered (`<model_output>`) in its assembled XML.

---

**Reference guide update** (`HelpDialog.vue` and the Prompt References panel in `PromptCompositionEditor.vue`):

Add a "Prompt artifacts" entry to the available artifact reference tables:

```
{namespace}.prompt        Full resolved prompt XML (tagged)
{namespace}.prompt_text   Prompt body text without XML tags
{namespace}.prompt_tags   JSON array of tag names used
```

These are listed under "Step outputs" alongside `.text` / `.rawResponse` / `.json`.

---

**Example use cases enabled after this ships:**

| Use case | How |
|---|---|
| Meta-evaluator: "did the output match the prompt's intent?" | History-read `candidate_answer.prompt` + `candidate_answer.text` into a verifier step |
| Prompt audit trail | Export includes prompt artifacts alongside output artifacts; full prompt+response pair per step |
| Drift check with full prompt context | Drift Check reads `candidate_answer.prompt` as well as the output — no longer relies on intent extracted separately |
| Prompt Experiments analysis (L6) | Analyst Capsule receives `{variantId}.prompt` + `{variantId}.text` for each variant — can compare what changed and why |
| Debug why a step failed | Inspect `{namespace}.prompt` directly in the artifact viewer without reconstructing from trace |

---

### L6 — Prompt Experiments

**Vision:** The user runs a pipeline, tweaks prompts on one or two steps, and wonders whether the change was actually an improvement. Today that means manually re-running, mentally comparing outputs, and remembering which prompt produced which result. Prompt Experiments automates this: define N prompt variants, run them all, come back to a structured comparison — and optionally ask a model to explain what differed and why.

---

**Core concept: an Experiment**

An Experiment is attached to a specific pipeline + user prompt and defines a set of *variants*. Each variant overrides the prompt blocks on one or more target steps; everything else (model, other steps, user input) stays identical across variants. Running the experiment executes the pipeline once per variant and stores each run's artifacts independently.

```
Pipeline: "Code Review"
User prompt: "Review this function: ..."
Experiment: "Try 3 tones for Candidate Answer"

Variant A  — current prompt (baseline)
Variant B  — prompt rewritten to be more prescriptive
Variant C  — prompt with explicit output schema

→ run all three →

Comparison view:
  Variant A output | Variant B output | Variant C output
  [LLM analysis: "B produced more structured output because..."]
```

---

**Variant generation: manual first, AI-assisted later**

Two ways to populate variants:
1. **Manual**: user clicks "Add variant" and edits prompt blocks directly — same block editor as the Prompt tab. The baseline (current config) is always variant A.
2. **AI-generated**: a "Generate variants" button calls a model (using `lorca-experiment-analyst` Capsule — see below) to produce N alternative formulations of the current prompt. User reviews, edits, keeps the ones worth testing.

Manual covers the described use case (user already has ideas they want to test). AI-generated is the natural next step.

---

**Execution model**

Experiments reuse the parallel execution infrastructure from S2b — each variant is an independent pipeline run with overridden step configs. They can run concurrently (one variant per available endpoint slot) or sequentially, respecting `maxConcurrentRequests` per endpoint.

Each variant run produces a full `StepChainRunResult` with its own artifact set, stored in IndexedDB under `experiments/{experimentId}/variant/{variantId}/run`. Experiments persist across sessions — the user can kick one off, close the tab, and come back to the results.

---

**Comparison view**

A new "Experiments" section — either a right-pane tab or a dedicated modal accessible from the `⋯ More` menu.

Layout for a completed experiment:
```
┌─ Experiment: "Try 3 tones for Candidate Answer" ────────────────┐
│  Pipeline: Code Review · Prompt: "Review this function: ..."    │
│  3 variants · completed 2 min ago                               │
│                                                                  │
│  Step: Candidate Answer                                          │
│  ────────────────────────────────────────────────────────────── │
│  [Variant A — baseline] [Variant B — prescriptive] [Variant C]  │
│                                                                  │
│  ┌────────────────┬─────────────────┬────────────────┐          │
│  │  The function  │  Issues found:  │  ```json        │          │
│  │  has a bug...  │  1. Off-by-one  │  { "issues":   │          │
│  │                │  2. No null...  │    [...] }      │          │
│  └────────────────┴─────────────────┴────────────────┘          │
│                                                                  │
│  [LLM Analysis ▾]                                               │
│  "Variant C produced structured JSON because the prompt         │
│   explicitly specified a schema. Variant B was more             │
│   thorough but verbose. Variant A was closest to prose..."      │
│                                                                  │
│  [Apply variant B to pipeline]  [Export comparison]             │
└──────────────────────────────────────────────────────────────────┘
```

Key actions:
- **Apply variant X to pipeline**: replaces the target step's prompt blocks with the winning variant's config, undo-tracked
- **Export comparison**: exports a JSON or markdown summary of all variants + outputs + analysis

---

**LLM analysis: `lorca-experiment-analyst` Capsule**

The analysis step is modelled as a built-in locked Capsule (same pattern as `lorca-pipeline-generator` in S1c) so users can inspect and customise the analysis prompt.

Inputs:
- `variants_json`: array of `{ id, promptBlocks[], outputText }`
- `pipeline_context`: step label, pipeline name, user prompt snippet

Output: `analysis_text` — a structured narrative covering:
- Which variant produced the best output and the main reason
- What specific prompt differences caused observable output differences
- Suggestions for a further-improved variant

The analysis runs on demand (not automatically after every experiment) to avoid unnecessary model calls.

---

**Dependencies and natural ordering**

| Prerequisite | Why |
|---|---|
| N1 (better prompts) | Baseline variant quality matters; poor baselines make comparison noise-heavy |
| S1a (AI prompt improver) | The "Generate variants" feature is essentially `improvePromptBlock` run N times with different goals |
| S2b (concurrent execution) | Parallel variant runs |
| S4 (built-in Capsule library) | `lorca-experiment-analyst` follows the same locked-Capsule pattern |
| IndexedDB persistence already in place | Experiment results survive page reload |

Prompt Experiments is the natural convergence of the AI assist features (S1a, S1b) and the execution infrastructure (S2b) once both are stable.

---

### S11 — `parseOutputAsJson` on model-call

**Goal:** Eliminate the extremely common `model-call → json-extract` two-step pattern for the case where the model's own output should be parsed as JSON. Instead of needing a dedicated plumbing step, a single flag on the model-call step handles it.

**The problem today:** Every pipeline that needs structured JSON output requires two steps — a `model-call` that produces `{namespace}.text`, followed by a `json-extract` that consumes it and produces `{namespace}.json`. This is a one-way pipe with no branching; the `json-extract` step exists purely to drive the parse. Most users create it without thinking, but it clutters the step list and makes the step palette feel larger than it is.

**Collision with the existing `parsedJson` artifact:**

`stepExecutor.ts` already emits `{namespace}.parsedJson` opportunistically whenever a model-call's text happens to parse as JSON (lines 535–538). It is listed in `listStepOutputArtifacts` as `'parsed JSON (if available)'` — the label itself acknowledges its unreliable status (silent failure — `.parsedJson` simply absent when parse fails). S11 supersedes it:

- When `parseOutputAsJson: true`: emit `{namespace}.json` when parse succeeds; when parse fails, emit nothing for `.json`, set `jsonParseFailed: true` on the trace event, and complete the step normally (`.text` and `.rawResponse` still emitted). Do **not** also emit `.parsedJson`.
- When `parseOutputAsJson: false` (default): stop emitting `.parsedJson` — it was never a stable contract. Any code referencing `.parsedJson` must migrate to either `parseOutputAsJson: true` or an explicit `json-extract` step.

This means S11 removes the opportunistic `.parsedJson` emission entirely. The `listStepOutputArtifacts` entry `mk('parsedJson', 'parsed JSON (if available)')` is removed from the `model-call` case; `mk('json')` is added when the step has `parseOutputAsJson: true`.

**Change to `ModelCallStepConfig`** (`packages/core/src/types/pipeline.ts`):

```ts
parseOutputAsJson?: boolean;   // default: false
```

When `true`, the executor attempts the JSON parse on the model's text output. The model call and the parse are two separate operations with different failure semantics:

```
{namespace}.text          — always emitted (model call succeeded)
{namespace}.rawResponse   — always emitted (model call succeeded)
{namespace}.json          — emitted only when parse succeeds
```

**Parse failure is a soft failure (step stays `completed`).** The model call succeeded; the model responded with text. That text has value even if it isn't JSON, and failing the entire step would destroy `.text` and `.rawResponse` — the only artifacts that could tell you why the model didn't produce JSON. When the parse fails:
- `.text` and `.rawResponse` are still emitted
- `.json` is not emitted
- The trace event for the step gets `jsonParseFailed: true` (a new optional field on `PipelineTraceEvent`, added in the S10 type changes above)
- Step status stays `completed`

S12 Path A detects `jsonParseFailed: true` on the trace event and retries the model call with the repair prompt. If retries are exhausted or none are configured, the step stays completed-without-json. Downstream steps that have a required history read referencing `{namespace}.json` will then fail with `missing_artifact` — which is the correct error origin.

**Contrast with `json-extract`:** that step's entire purpose is JSON parsing; it has no other output. If it can't parse, failing the step is the right call. `model-call` with `parseOutputAsJson: true` is different — the model response is the primary output; JSON is a derived view of it.

**Parser: port Strategy 3 from `executor.ts` first.**

`stepExecutor.ts`'s `tryParseJson()` is only two strategies: strip code fence → parse, then raw parse. The legacy `executor.ts` has a full three-strategy version that additionally extracts the first complete `{…}` or `[…]` block via regex (Strategy 3). S11 must extract this into a shared utility (e.g. `packages/pipeline/src/parseJson.ts`) and use it in both executors. Without Strategy 3, many real model responses that wrap JSON in prose will fail to parse.

```ts
// packages/pipeline/src/parseJson.ts — shared by both executors
export function tryParseJson(text: string): unknown | null {
  // Strategy 1: strict parse
  try { return JSON.parse(text); } catch { /* fall through */ }
  // Strategy 2: fenced code block
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/);
  if (fenced?.[1]) { try { return JSON.parse(fenced[1]); } catch { /* fall through */ } }
  // Strategy 3: first complete object or array  (ported from executor.ts)
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { /* fall through */ } }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ } }
  return null;
}
```

Replace the local `tryParseJson` in both `stepExecutor.ts` and `executor.ts` with imports from this shared module.

**The standalone `json-extract` step is NOT removed.** It stays for parsing JSON from a non-adjacent source artifact — e.g. a history-read value or a presentation output. That use case can't be handled by a flag on the producing step.

**UI:** In the model-call Config tab, a checkbox below the output settings:
```
☐ Parse output as JSON
   Emits {namespace}.json in addition to {namespace}.text.
   Steps that read JSON (loop exit conditions, json-extract
   source steps) can reference {namespace}.json directly.
```

When checked, the step card gains a `JSON` badge alongside any existing source badges.

**Migration:** Existing pipelines with `model-call → json-extract` pairs continue to work without changes. Users can optionally consolidate them: enable `parseOutputAsJson` on the model-call and delete the trailing `json-extract`. A migration hint ("This step feeds a json-extract with no other consumers — consider using 'Parse output as JSON' instead") can be surfaced in the Validation tab as a suggestion, not an error. Any pipeline referencing `{namespace}.parsedJson` must update the reference to `{namespace}.json` and enable the flag.

**Effect on step palette:** From the user's perspective, `json-extract` becomes a rarely-used advanced step rather than a routine companion step. The visible complexity of the common case drops from 2 steps to 1. The full 6-type taxonomy remains for completeness.

---

## Quick reference

```
NOW   N1  Improve suggestion prompts + semantic tags  ✅ done
      N2  Live preview polish + full-prompt modal      ✅ done
      N3  Run-to visual indicator                      ✅ done
      N4  Comment save/cancel + cursor                 ✅ done
      N5  JSON highlighting + raw/pretty toggle        new JsonViewer.vue, OutputPanel, TracePanel

SOON  S1a AI prompt improver (undo-tracked)           new usePromptImprover.ts + PCE.vue
      S1b AI next-step advisor                        new useStepAdvisor.ts + LeftPane.vue
      S1c NL generator (built-in Capsule)             new lorca-pipeline-generator + modal
      S2a Dependency model fix                        chainCompiler.ts + new chainCompiler.test.ts
      S2b Concurrent step execution                   stepExecutor.ts (requires S2a)
      S3  Model filter & sort                         LeftPane.vue (computed only)
      S4  Example pipelines + Capsule library         packages/capsules/src/examples/
      S5  Help button audit                           HelpDialog.vue (do last)
      S6  Drift Fix suggestion                        definitions.ts (alongside or after N1)
      S7  Pipeline I/O overview panel                 new Overview tab in RightPane
      S8  Prompt Review Mode                          activeRun.ts + PromptReviewDialog.vue
      S9  Smart model requirements                    core/types/pipeline.ts + modelResolution.ts
      S10 Infrastructure retry                        stepExecutor.ts + ModelCallStepConfig
      S11 parseOutputAsJson on model-call             ModelCallStepConfig + shared parseJson.ts utility
      S12 Structural auto-retry                       stepExecutor.ts (Path A requires S11)
      S13 Quick Validator suggestion                  definitions.ts (alongside N1/S6)
      S14 Prompt artifacts                            stepExecutor.ts executePromptStep (~20 lines)

LATER L1  MCP integration
      L2  RAG / resource injection
      L3  Pipeline self-editing
      L4  Chat/ACP pipeline
      L5  Settings view (colors, theme, defaults)
      L6  Prompt Experiments                          new data model + comparison UI + analyst Capsule
```
