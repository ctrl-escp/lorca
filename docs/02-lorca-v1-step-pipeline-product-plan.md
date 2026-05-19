# Lorca V1 Step Pipeline Product Plan

## Goal

Make Lorca a step-oriented pipeline workbench where the user starts with a simple input plus main model call, inserts modular steps before or after any step, inspects intermediate artifacts, iterates on prompts, and promotes a stable flow into a reusable Capsule.

The product contract for V1 is:

* A pipeline is edited and persisted as an ordered chain of steps.
* A Capsule is the same step-chain model behind a reusable boundary.
* Built-in examples become insertable step suggestions, not destructive project replacements.
* Every step can be inserted, reordered, disabled, duplicated, deleted, configured, and run up to.
* Prompt configuration is XML-tag based, not markdown-heading based.
* Each prompt-bearing step can place its own prompt before or after the previous active step’s output.
* Every step output is saved into ordered run history.
* Each step can explicitly read any prior step’s output from history without threading that value through every intermediate step.
* Run artifacts are compared against lightweight run snapshots, so stale downstream outputs are visibly marked after upstream edits without a formal revision system.
* Undo/redo works for pipeline editing actions, except creating a new pipeline.

## Current Architecture Fit

The existing architecture is already close to the required product shape:

* `@lorca/core` owns pipeline and Capsule types.
* `@lorca/prompt` owns XML/tag helpers and prompt rendering.
* `@lorca/pipeline` owns step-chain validation, execution-plan compilation, execution, run history, and artifacts.
* `@lorca/capsules` owns Capsule validation, execution, draft Capsule handling, and built-in suggestions.
* `@lorca/storage` owns IndexedDB persistence and import/export.
* `apps/web` owns the three-pane editing UI, chain editor, inspectors, trace, and stores.

The implementation should keep this package split, but the canonical pipeline model should change from persisted nodes/edges to a persisted step chain. If execution needs dependency planning, compile a temporary execution plan from the chain at runtime. Do not make the UI or storage model pay for graph semantics in V1.

## Product Vocabulary

Use these names consistently in the UI:

| Term                      | Meaning                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Step                      | A user-visible pipeline operation stored as one entry in the ordered `steps[]` array.                                                      |
| Step Suggestion           | A reusable insertable recipe for one or more steps. It never replaces the current pipeline by default.                                     |
| Capsule                   | A saved reusable step chain with a public interface.                                                                                       |
| Run Up To                 | Execute the active chain slice needed to produce a selected step’s output, including any earlier steps required by explicit history reads. |
| Affected                  | A step whose previous output is stale because one of its dependencies changed.                                                             |
| Disabled                  | A step preserved in the chain but excluded from execution.                                                                                 |
| Step History              | The ordered record of outputs produced by previous steps in a run.                                                                         |
| History Read              | A prompt input that includes a selected prior step output from step history.                                                               |
| Previous Output Placement | A prompt composition setting that places the previous active step’s output before or after the current step’s own prompt blocks.           |
| Output Step               | The step whose primary output is treated as the pipeline’s final output. If unset, the last enabled executable step is used.               |

Avoid using “Example” as the primary UI label. “Examples” implies disposable demo state; “Step Suggestions” implies insertable building blocks.

## Core Invariants

1. Pipeline and Capsule editing use the same step-chain editor surface.
2. Step order is the persisted source of truth. Any graph-like dependency structure is derived during validation/execution and is not stored as the canonical model.
3. Every step has a stable `id`; reorder operations do not recreate steps.
4. Every executable step has a clear input artifact contract and output artifact contract.
5. Disabled steps are never executed.
6. Downstream steps depending on stale artifacts are marked affected until rerun, based on current signatures versus the last run snapshot.
7. Suggestions are inserted into the current pipeline unless the user explicitly chooses “New pipeline from suggestion.”
8. Prompt templates use XML-tagged blocks. Markdown is allowed in generated answers, not as the default prompt-structure language.
9. Prompt-bearing steps can place previous output before or after the step’s own prompt blocks.
10. Step history is explicit ordered state: every step output is recorded, and a step may read outputs only from earlier active steps.
11. Undo/redo is action-based and excludes “new pipeline.”
12. `outputStepId` selects the final output producer. If it is unset, the final output is the last enabled executable step.
13. Suggestion provenance is internal metadata unless explicitly surfaced for debugging; it must not create extra UI work in V1.

## Target User Flow

1. User starts with a new pipeline containing:

   * editable user input prompt
   * a main model-call step
2. User opens Step Suggestions and inserts “Intent Extraction” before the main model call.
3. The inserted step consumes the user prompt and produces an `intent` artifact.
4. User inserts “Acceptance Criteria” after the intent step and before the main model call.
5. The intent and acceptance criteria outputs are saved into ordered step history.
6. A later prompt reformatter or main model step explicitly selects those prior outputs from history and renders them as XML-tagged prompt blocks.
7. The main model call receives the original user prompt, selected prior outputs, and the previous active output as XML-tagged inputs.
8. User chooses whether the current step’s own prompt appears before or after the previous active output.
9. User clicks “Run up to Acceptance Criteria” and inspects that step’s input/output without calling the final model.
10. User edits the intent prompt. Intent, acceptance criteria, history readers, and final model steps are marked affected.
11. User disables acceptance criteria. Later steps reading its output are blocked or marked affected until the read is removed or rebound.
12. User duplicates or reorders steps and reruns partial slices.
13. User extracts the final chain into a Capsule and inserts that Capsule into another pipeline.

## Phase 1 — Step Editing Contract MVP

### Objective

Make “add another step” a first-class operation in both pipeline and Capsule editors.

### Data model

Introduce a canonical step-chain model:

```ts
type StepType =
  | 'model-call'
  | 'prompt-wrapper'
  | 'template'
  | 'json-extract'
  | 'manual-text'
  | 'capsule-instance';

interface PipelineDefinition {
  id: string;
  name: string;
  input: PipelineInputConfig;
  steps: PipelineStep[];
  outputStepId?: string;
}

interface PipelineInputConfig {
  raw: string;
  tagName: string;
  outputNamespace: 'user_prompt';
}

interface PipelineStep {
  id: string;
  type: StepType;
  label: string;
  description?: string;
  enabled: boolean;
  collapsed?: boolean;
  createdFromSuggestionId?: string;
  outputNamespace: string;
  primaryOutputName: string;
  config: StepConfig;
  prompt?: PromptCompositionConfig;
  historyReads?: StepHistoryReadConfig[];
  lastEditedAt: string;
}

type StepConfig =
  | ModelCallStepConfig
  | PromptWrapperStepConfig
  | TemplateStepConfig
  | JsonExtractStepConfig
  | ManualTextStepConfig
  | CapsuleInstanceStepConfig;

interface ModelCallStepConfig {
  type: 'model-call';
  modelRef: ModelRef;
  mode: 'generate' | 'chat';
  temperature?: number;
  maxTokens?: number;
  outputNames: ['text', 'rawResponse'];
}

interface PromptWrapperStepConfig {
  type: 'prompt-wrapper';
  sourceArtifactRef?: string;
  outputNames: ['text'];
}

interface TemplateStepConfig {
  type: 'template';
  template: string;
  outputNames: ['text'];
}

interface JsonExtractStepConfig {
  type: 'json-extract';
  sourceArtifactRef: string;
  outputNames: ['json'];
}

interface ManualTextStepConfig {
  type: 'manual-text';
  text: string;
  outputNames: ['text'];
}

interface CapsuleInstanceStepConfig {
  type: 'capsule-instance';
  capsuleId: string;
  inputBindings: Record<string, string>;
  outputBindings: Record<string, string>;
  parameterValues?: Record<string, string>;
  modelSlotBindings?: Record<string, ModelRef>;
}
```

Every step must declare `primaryOutputName`, and that name must be a member of the step config’s `outputNames` array (or, for `capsule-instance` steps, a member of the declared Capsule output bindings). This invariant must be enforced at schema validation time — not only at runtime — so that a mismatch is caught on load/save and cannot produce a silent bug during execution. The validator lives in `@lorca/core` and must reject any `PipelineStep` where `primaryOutputName` is absent from `outputNames`.

Previous-output composition resolves through:

```ts
const previousOutputRef = resolvePrimaryOutputRef(previousActiveStep);
```

For V1, step insertion defaults `primaryOutputName` as follows:

* `model-call`: `text`
* `prompt-wrapper`: `text`
* `template`: `text`
* `json-extract`: `json`
* `manual-text`: `text`
* `capsule-instance`: the Capsule’s default public output, or the first bound output only if the Capsule declares exactly one public output

If a Capsule has multiple public outputs and no default output, the user must choose the instance’s `primaryOutputName` before previous-output placement can consume it.

````

Do not persist `nodes[]` and `edges[]` as the canonical model for V1. If existing saved data uses nodes/edges, migrate it into `steps[]` during load/import.

`createdFromSuggestionId` is internal provenance metadata. It can be shown in a debug/details view later, but V1 should not build dedicated user-facing features around it.

### Store actions

Implement structured actions in the pipeline editor store:

- `insertStepAfter(anchorStepId, stepDraft)`
- `insertStepBefore(anchorStepId, stepDraft)`
- `appendStep(stepDraft)`
- `moveStep(stepId, targetIndex)`
- `duplicateStep(stepId)`
- `deleteStep(stepId)`
- `setStepEnabled(stepId, enabled)`
- `updateStepConfig(stepId, patch)`
- `selectStep(stepId)`

Each action must update:

- `steps[]`
- selected step where applicable
- derived affected/stale UI state
- undo stack entry
- persisted pipeline state

Create the undo/redo infrastructure in Phase 1 before these actions are implemented. Phase 8 expands the UI affordances and text-field batching behavior, but the store actions should not be retrofitted later.

### UI

Update `ChainEditor.vue` to expose:

- Add step button between every pair of steps.
- Add step button at the end.
- Step action menu: move up, move down, duplicate, disable/enable, delete.
- Inline disabled state.
- Inline affected state.
- Per-step “Run up to here.”

### Acceptance criteria

- A user can insert an intent-extraction step between the input and main model call.
- A user can insert acceptance criteria between intent extraction and the main model call.
- Reordering preserves step identity and inspector selection.
- Duplicating creates a new step id, new output namespace, and copied config.
- Deleting removes the step from `steps[]`; later steps keep explicit history reads or show unresolved reads when their source was deleted.
- Disabling preserves the step in the UI and excludes it from execution.

## Phase 2 — Step Suggestions Instead of Destructive Examples

### Objective

Replace the destructive example-loading behavior with insertable suggestions.

### Product behavior

Left pane should have a section named **Step Suggestions**.

Clicking a suggestion opens an insert menu:

- Insert before selected step
- Insert after selected step
- Append to pipeline
- Create new pipeline from suggestion

Only “Create new pipeline from suggestion” may replace the current editing surface, and only after an explicit confirmation if the current pipeline has unsaved or dirty state.

### Internal model

Introduce a suggestion definition layer:

```ts
interface PipelineSuggestion {
  id: string;
  name: string;
  description: string;
  category: 'extraction' | 'planning' | 'generation' | 'verification' | 'rewrite' | 'utility';
  insertableSteps: PipelineStep[];
  requiredBindings: SuggestionBinding[];
  outputHints: SuggestionOutputHint[];
}
````

For MVP, suggestions may wrap the current built-in Capsule examples, but the UI must not expose them as examples. Internally, keep compatibility helpers if needed, then migrate names later.

### Binding behavior

When inserting a suggestion:

1. Generate new step ids and output namespaces.
2. Bind default previous-output input to the previous active step’s primary output, or to `user_prompt.xml` when inserted after the input step.
3. Let the user adjust bindings in the inspector.
4. Preserve current pipeline content.
5. Mark newly inserted and downstream steps affected.

### Suggested built-ins for V1

* Intent Extraction
* Acceptance Criteria
* Constraint Extraction
* Prompt Rewrite
* Candidate Answer
* Answer Verification
* Drift Check
* Summary

### Acceptance criteria

* Clicking a suggestion does not replace the current pipeline.
* Suggestions can be inserted before, after, or at the end of the chain.
* “New pipeline from suggestion” exists but requires explicit intent.
* Existing built-ins remain available under the new UI name.
* Inserted suggestions produce unique output namespaces and do not collide with existing steps.

## Phase 3 — XML Prompt Block System

### Objective

Make every prompt-bearing step editable as XML-tagged blocks, with editable tag names.

### Prompt block model

Add a reusable prompt block type:

```ts
interface PromptBlock {
  id: string;
  label: string;
  tagName: string;
  body: string;
  enabled: boolean;
  source?: 'system-default' | 'user-input' | 'custom' | 'history-read' | 'previous-output';
}
```

Add prompt composition settings to prompt-bearing steps:

```ts
interface PromptCompositionConfig {
  previousOutput: {
    enabled: boolean;
    placement: 'beforeOwnPrompt' | 'afterOwnPrompt';
    tagName: string;
  };
  historyReads: StepHistoryReadConfig[];
  blocks: PromptBlock[];
}

interface StepHistoryReadConfig {
  sourceStepId: string;
  sourceArtifactRef: string;
  tagName: string;
  required: boolean;
}
```

`previousOutput` always means the immediately preceding active step’s primary output. It is implicit and does not store an arbitrary artifact ref. Arbitrary prior outputs are handled through explicit `historyReads`. If the previous active step has multiple outputs, `primaryOutputName` is the required tiebreaker.

Default behavior:

* Built-in step instructions use `tagName: 'system'`.
* The user’s input prompt uses `tagName: 'user'`.
* Custom blocks can use custom XML tag names.
* Tag names are editable.
* Body text is editable.
* Blocks can be added, removed, reordered, disabled, and duplicated.

### Rendering rule

Every block renders as:

```xml
<tag_name>
block body
</tag_name>
```

Nested artifact and history references should render as their own tagged blocks where possible:

```xml
<intent>
{{history.#03-intent-extraction.text}}
</intent>

<acceptance_criteria>
{{history.#04-acceptance-criteria.text}}
</acceptance_criteria>
```

When previous output is enabled, the renderer places the immediately preceding active step’s primary output before or after the step’s own prompt blocks according to `previousOutput.placement`:

```xml
<previous_output>
{{artifact.previous.text}}
</previous_output>

<system>
step instruction text
</system>
```

or:

```xml
<system>
step instruction text
</system>

<previous_output>
{{artifact.previous.text}}
</previous_output>
```

Prompt templates should avoid markdown headings as structural syntax. Use XML tags for structure. Markdown can still be requested inside generated answers where relevant.

### UI

In `NodeInspector.vue`, prompt-bearing steps should show:

* Prompt block list
* Tag name input per block
* Body editor per block
* Add custom block
* Enable/disable block
* Preview rendered XML
* Previous output placement: before prompt, after prompt, or disabled
* Previous output tag name
* History read blocks for prior step outputs
* Validation errors for invalid tag names, unavailable prior outputs, or duplicate semantic fields where applicable

### Package responsibilities

* `@lorca/core`: prompt block types in step config schemas.
* `@lorca/prompt`: XML tag validation, escaping, rendering, preview helpers, and provider-neutral prompt assembly. It must not import endpoint adapters, provider SDKs, or provider-specific request types.
* `@lorca/pipeline`: execution consumes rendered prompt payloads, not raw ad hoc strings, and coordinates adapter-specific prompt submission.
* `@lorca/endpoints`: owns conversion from `RenderedPromptPayload` to provider-specific request bodies or message arrays.
* `apps/web`: prompt-block editor, rendered preview, dirty/affected marking.

### Adapter contract

Prompt blocks remain provider-neutral in core. The renderer produces a structured prompt payload:

```ts
interface RenderedPromptPayload {
  blocks: RenderedPromptBlock[];
  xmlText: string;
}

interface RenderedPromptBlock {
  tagName: string;
  body: string;
  source: PromptBlock['source'];
}
```

Adapters decide how to submit that payload. The adapter boundary is explicit: `@lorca/prompt` renders structured prompt data; `@lorca/endpoints` converts it to provider-specific request bodies; `@lorca/pipeline` orchestrates execution without embedding provider-specific prompt conversion logic.

Adapters decide how to submit that payload:

* chat-capable adapters may map blocks tagged `system` and `user` to native chat roles when the adapter supports that safely
* generate-style adapters may submit `xmlText` as a single prompt
* adapters must not parse arbitrary XML back into roles after rendering; role mapping uses the structured block list
* provider SDK imports are forbidden outside endpoint adapter packages

This resolves the V1 decision: prompt composition is provider-neutral, but adapters receive structured blocks so native chat roles remain possible.

### Acceptance criteria

* User prompt defaults to `<user>...</user>`.
* Built-in instruction prompts default to `<system>...</system>`.
* User can rename any tag.
* Invalid XML tag names are blocked before execution.
* Default built-in prompts are not markdown-structured.
* Rendered preview matches the payload sent to the model adapter.
* Previous output can be rendered before the step prompt.
* Previous output can be rendered after the step prompt.
* Prior step outputs can be rendered as XML-tagged history read blocks.

## Phase 4 — Step History and Prior Output Access

### Objective

Save every step output into ordered run history and let later steps explicitly include any previous step output without passing it through every intermediate step.

### History model

Add a per-run ordered step history:

```ts
interface StepHistoryEntry {
  stepId: string;
  stepOrderAtRun: number;
  stepLabel: string;
  artifactRefs: string[];
  primaryArtifactRef?: string;
  status: 'completed' | 'failed' | 'skipped';
  startedAt: string;
  completedAt?: string;
}
```

The history is derived from run artifacts and trace events. It is not a separate mutable memory store.

Before any step executes, a synthetic history entry for the pipeline input is prepended at `stepOrderAtRun: 0`:

```ts
{
  stepId: 'pipeline-input',       // reserved id, never used by a PipelineStep
  stepOrderAtRun: 0,
  stepLabel: 'Pipeline Input',
  artifactRefs: ['user_prompt.text'],
  primaryArtifactRef: 'user_prompt.text',
  status: 'completed',
  startedAt: runStartedAt,
}
```

This means every step — including the very first — can reference the original user prompt via a `historyReads` entry pointing to `sourceStepId: 'pipeline-input'`. The `pipeline-input` id is a reserved constant; no `PipelineStep` may use it.

### Read contract

A step may declare reads from previous step history:

```ts
interface StepHistoryReadConfig {
  sourceStepId: string;
  sourceArtifactRef: string;
  tagName: string;
  required: boolean;
}
```

Rules:

1. The pipeline input is saved as the zeroth history entry before execution begins. Every step output is saved as history when the step runs.
2. A step may read the pipeline input (`sourceStepId: 'pipeline-input'`) or any output from an earlier active step.
3. A step may not read from itself.
4. A step may not read from a later active step.
5. Reordering a step can invalidate history reads that now point forward.
6. Disabling a source step blocks required downstream history reads.
7. Deleting a source step blocks required downstream history reads until the user removes or rebinds them.
8. Optional history reads may be omitted during execution if unavailable, but the rendered prompt preview must show that the block is omitted.

### Prompt integration

History reads render as XML prompt blocks using the configured tag name:

```xml
<intent>
{{history.#03-intent-extraction.text}}
</intent>
```

History read blocks are explicit prompt inputs. They should appear in the inspector and rendered prompt preview, not as hidden context.

### UI

Each step inspector gets a **History Inputs** section:

* Add prior step output
* Select source step
* Select source artifact/output
* Configure XML tag name
* Required/optional toggle
* Preview included value
* Show current/stale/unavailable status

The chain editor should show a compact indicator when a step reads prior history.

### Affected/stale behavior

History participates in dependency tracking:

* Editing a source step marks downstream steps that read that step’s history affected.
* Editing the pipeline input (`user_prompt`) marks any step with a history read on `pipeline-input` affected, in addition to the standard downstream staleness cascade.
* Editing a history read config marks that step and downstream consumers affected.
* Reordering can make history reads invalid if they point to a later step.
* Deleting or disabling a source step blocks required readers.
* A stale source output makes the consuming step stale even if the consuming step’s own config did not change.

### Acceptance criteria

* A prompt reformatter step can read the output of Intent Extraction.
* A final model step can read both Intent Extraction and Acceptance Criteria outputs without intermediate passthrough bindings.
* Any step — including the first — can read the original pipeline input via `sourceStepId: 'pipeline-input'`.
* The pipeline-input history entry is available in every run, including partial runs.
* A step cannot read from a later active step.
* Disabling a source step blocks required downstream history reads.
* History values are visible in trace and inspector.
* History reads are included in partial runs up to the selected step.
* History reads render as XML prompt blocks.

## Phase 5 — Run Up To Any Step

### Objective

Allow partial execution up to a selected step without executing the rest of the chain.

### Runtime API

Extend pipeline execution options and add a compiler boundary:

```ts
interface ExecutePipelineOptions {
  stopAtStepId?: string;
  includeDisabled?: boolean;
  reuseValidArtifacts?: boolean;
}

interface ExecutionPlan {
  steps: CompiledExecutionStep[];
  stopAtStepId?: string;
  requiredHistorySources: string[];
}

interface CompiledExecutionStep {
  stepId: string;
  stepOrder: number;
  type: StepType;
  inputArtifactRefs: string[];
  historyReads: StepHistoryReadConfig[];
  previousOutputArtifactRef?: string;
  outputNamespace: string;
  execute: 'run' | 'skip' | 'blocked';
  blockedReason?: string;
}
```

The execution plan is derived from `PipelineDefinition.steps` and is not persisted.

```ts
const executionPlan = compileStepChainToExecutionPlan(pipeline, options);
```

Execution should:

1. Build the active step chain.
2. Exclude disabled steps.
3. Compile a temporary execution plan for `stopAtStepId`.
4. Include prior steps required by selected history reads.
5. Execute only that slice.
6. Emit trace events only for executed steps.
7. Save every executed step output into step history.
8. Preserve previous run artifacts for non-executed steps but mark them stale when dependencies changed.

### UI

Each step row gets:

* Run up to here
* Last run status
* Last output preview
* Inputs used in last run
* Outputs produced in last run
* Affected/stale indicator

Right pane trace should support filtering by selected step and showing only the partial run slice.

### Output semantics

When running up to a step:

* The selected step’s primary output becomes the temporary displayed output.
* The pipeline’s configured final output is not overwritten unless the selected step is the final output producer.
* The run record is tagged as `partial`.

### Acceptance criteria

* Running up to intent extraction does not call acceptance criteria or final model.
* Running up to acceptance criteria calls only input, intent, and acceptance criteria dependencies.
* Running up to a step with history reads includes required prior source steps.
* Disabled steps are skipped.
* Partial run traces clearly show that the run is partial.
* Final pipeline output is not silently replaced by an intermediate output.

## Phase 6 — Affected/Stale Output Tracking

### Objective

Make stale downstream state visible after any edit without introducing a formal revision or locking system.

### Run snapshot model

Each successful step run stores a lightweight snapshot of what the step actually consumed and produced:

```ts
interface StepRunSnapshot {
  stepId: string;
  inputSignature: string;
  configSignature: string;
  historyReadSignatures: Record<string, string>;
  outputArtifactRefs: string[];
  completedAt: string;
  status: 'completed' | 'failed' | 'skipped';
}
```

A step is current when its present signatures match the last successful run snapshot. A step is stale when any relevant signature differs.

Signatures should cover:

* rendered step config
* prompt blocks and tag names
* previous-output placement
* direct input artifact refs
* selected history reads
* enabled/disabled state that changes execution behavior
* Capsule instance reference and Capsule content signature

Affected/stale state is derived from the current pipeline and the last run snapshot. Do not maintain separate revision counters as source of truth.

When a step config or upstream input changes:

1. Recompute signatures for the step and its dependency slice.
2. Compare each step against its last run snapshot.
3. Mark mismatched steps as affected/stale in the UI.
4. Keep old outputs visible but labeled stale.
5. Clear stale state only after the step reruns successfully against current signatures.

### Affected rules

A step is affected when:

* its current config signature differs from the last run snapshot
* any active upstream dependency signature differs from the last run snapshot
* an upstream step was inserted, deleted, duplicated, reordered, enabled, or disabled in a way that changes its consumed inputs
* the target user prompt changed
* a Capsule instance points to Capsule content whose signature differs from the last run snapshot
* a prior step output read by this step changed
* a history read config changed

A disabled step can be marked affected but should visually indicate that it is disabled and not currently executable.

### UI states

Use distinct states:

* Not run
* Running
* Completed/current
* Completed/stale
* Failed/current
* Failed/stale
* Disabled
* Skipped by partial run

### Acceptance criteria

* Editing the user prompt marks all downstream active steps affected.
* Editing intent extraction marks intent, acceptance criteria, and final model affected.
* Editing final model only marks final model affected.
* Reordering steps marks only dependency-affected steps stale.
* Previous outputs remain inspectable and clearly labeled stale.

## Phase 7 — Disable and Active Chain Semantics

### Objective

Make disabling useful without corrupting downstream prompt composition or history-read refs.

### MVP rule

For V1 step chains, disabling a step removes it from the active chain. The next active step receives the previous active output when it uses previous-output placement.

For steps with required history reads from a disabled source:

* disabling is allowed
* downstream steps with unresolved bindings are marked blocked
* UI shows exactly which input is unresolved
* user can rebind manually

### Internal behavior

Do not mutate the user’s saved step configs destructively when disabling. Compute the active chain from `steps[]`:

```ts
const activeSteps = buildActiveStepChain(pipeline.steps, { skipDisabled: true });
const executionPlan = compileStepChainToExecutionPlan({ ...pipeline, steps: activeSteps });
```

The stored chain remains editable and restorable. Enabling a step restores it to the active chain.

### Acceptance criteria

* Disabling intent extraction removes it from the active chain and blocks required history readers that depend on it.
* Disabling acceptance criteria does not delete it and does not lose its prompt config.
* Enabling a disabled step restores it to the chain.
* Blocked downstream steps explain which artifact is missing.

## Phase 8 — Undo/Redo for Pipeline Actions

### Objective

Add undo-redo buttons for pipeline editing actions, excluding new pipeline creation.

### Scope

Undoable actions:

* insert step
* delete step
* duplicate step
* reorder step
* enable/disable step
* update step config
* edit prompt blocks
* edit artifact bindings
* extract selected chain into Capsule, if performed inside an existing pipeline and reversible before persistence boundary

Not undoable:

* create new pipeline
* import replacing entire workspace
* endpoint discovery
* model inventory changes
* execution runs

### Implementation strategy

Use a command stack or patch stack in the pipeline editor store:

```ts
interface PipelineHistoryEntry {
  label: string;
  before: PipelineEditorSnapshot;
  after: PipelineEditorSnapshot;
  createdAt: string;
}
```

`PipelineEditorSnapshot` must include only editable pipeline state, not run artifact bodies, trace bodies, model responses, or large derived previews. Undo snapshots should be measured against realistic prompt content before the Phase 8 UI ships. If snapshots are too large, switch to patch entries for large text fields or cap the undo depth.

For text fields:

* begin draft edit on focus
* update local field during typing
* commit one undo entry on blur or explicit save
* cancel restores the focused-field draft

This matches the desired “focus change” undo granularity while avoiding one undo entry per keystroke.

### UI

Top-center pipeline toolbar:

* Undo button with last action label
* Redo button with next action label
* Disabled state when stack is empty
* Keyboard shortcuts: `Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z`, `Cmd/Ctrl+Y`

### Acceptance criteria

* Insert step then undo removes only that inserted step.
* Delete step then undo restores config, id, order, and bindings.
* Reorder then undo restores original order.
* Prompt typing creates one history entry on blur, not per keystroke.
* Execute does not affect undo stack.
* New pipeline is not undoable.
* Undo snapshots do not include run artifact bodies, trace bodies, or model responses.
* Snapshot memory size is measured with realistic long prompt content before enabling the final undo/redo toolbar.

## Phase 9 — Convert Pipeline or Selection to Capsule

### Objective

Let a satisfactory pipeline become a reusable Capsule.

### Product behavior

Add actions:

* Convert full pipeline to Capsule
* Extract selected steps to Capsule
* Insert Capsule instance into current pipeline
* Duplicate Capsule as a separate editable copy when the user wants to branch it

### Extraction algorithm

For selected steps, include history-read dependencies in boundary detection. A selected step that reads an unselected earlier step output requires a Capsule input port unless the source step is also extracted.

For selected steps:

1. Find external input artifact refs used by selected steps.
2. Create Capsule input ports for those refs.
3. Find selected-step outputs used outside the selection.
4. Create Capsule output ports for those outputs.
5. Move selected `PipelineStep[]` entries into a Capsule definition.
6. Replace selected range with a `capsule-instance` step.
7. Bind parent inputs to Capsule inputs.
8. Bind Capsule outputs back to parent artifact refs.
9. Mark downstream steps affected.

### Public interface editor

Capsule editor should expose:

* input ports
* output ports
* parameter fields
* model slots
* default prompt blocks
* test input values
* run-up-to inside Capsule

### Acceptance criteria

* Full pipeline can be saved as a draft Capsule.
* Selected middle steps can be extracted into a Capsule and replaced by one Capsule instance step.
* Capsule instances can be inserted via Step Suggestions or Capsule library.
* Capsule internal artifacts are visible in trace but do not pollute parent namespace except public outputs.
* Capsules are editable drafts in V1; editing a Capsule marks dependent Capsule instances stale through signature mismatch.

## Phase 10 — Product-Level UI Hardening

### Objective

Move from functional MVP to a coherent product surface.

### Needed UI surfaces

1. **Step palette**

   * Step Suggestions
   * Basic step types: prompt block, model call, JSON extract, manual text, Capsule instance
   * Search/filter

2. **Pipeline toolbar**

   * Execute full pipeline
   * Run selected step / run up to selected step
   * Cancel
   * Undo/redo
   * Save as Capsule

3. **Step row status**

   * current/stale/not-run/failed/running/disabled
   * primary output preview
   * quick actions

4. **Inspector tabs**

   * Config
   * Prompt
   * Inputs
   * Outputs
   * Last run
   * Validation

5. **Trace panel**

   * full run vs partial run label
   * per-step expand/collapse
   * rendered prompt preview
   * raw model response
   * produced artifacts
   * step history entries and history-read inputs

6. **Warning and confirmation UX**

   * replacing current pipeline requires confirmation
   * editing a Capsule used by existing pipelines marks dependent instances stale
   * duplicating a Capsule is available when the user wants a safe branch
   * unresolved downstream bindings are explicit
   * stale output is never presented as current

### Acceptance criteria

* User can understand the current chain without opening every inspector panel.
* Replacing current work cannot happen accidentally.
* Every execution result indicates whether it is full, partial, current, or stale.
* Prompt preview exactly matches rendered model input.

## Phase 11 — Persistence, Migration, Import/Export

### Objective

Persist step metadata, prompt blocks, history-neutral state, and Capsule extraction safely.

### Storage changes

Persist:

* step editor metadata
* enabled/disabled state
* prompt blocks
* prompt previous-output placement settings
* history read configs
* suggestion provenance
* Capsule extraction metadata if useful
* last run summaries and step run snapshots

Do not persist:

* undo/redo stack across browser reload for V1
* focused field draft state
* in-flight execution state
* derived stale/affected UI state

### Schema migration

Add a migration that converts older graph-shaped data into the step-chain model:

* if the graph is a simple linear path, convert it directly to `steps[]`
* if the graph is a DAG but not a simple linear path, topologically sort nodes and mark the migrated pipeline with a warning that manual review is required
* if the graph contains cycles or ambiguous disconnected branches, block automatic migration and show an import/load error with a recoverable export of the original data
* node config becomes `PipelineStep.config`
* old single `outputName` fields on a step become `outputNames: [outputName], primaryOutputName: outputName`
* missing `enabled` defaults to `true`
* missing `label` derives from step type
* old examples remain importable
* old raw prompt config is converted to one or more `PromptBlock`s
* missing history read config defaults to no history reads
* missing previous-output placement defaults to current behavior

### Import behavior

When importing a pipeline or Capsule:

* validate schema version
* preview missing models/Capsules
* preserve step metadata
* do not auto-run imported content
* mark all imported outputs as not run

### Acceptance criteria

* Existing saved pipelines load without crashing.
* Old example Capsules remain usable as Step Suggestions.
* Export/import round trip preserves step order, prompt blocks, previous-output placement, history read configs, disabled state, and Capsule bindings.
* Undo stack is clean after import.

## Phase 12 — Testing Plan

### Unit tests

Add or extend tests in:

* `packages/core/tests/pipeline-schema.test.ts`
* `packages/prompt/tests/prompt.test.ts`
* `packages/pipeline/tests/executor.test.ts`
* `packages/pipeline/tests/validate.test.ts`
* `packages/capsules/tests/suggestions.test.ts`
* `packages/capsules/tests/executor.test.ts`
* `packages/storage/tests/importExport.test.ts`

Required test cases:

1. Step-chain schema validation and graph-to-chain migration.
2. Prompt block XML rendering and invalid tag rejection.
3. Suggestion insertion creates unique ids/prefixes.
4. Every step has a valid `primaryOutputName`; multi-output steps cannot be used as previous output until primary output is resolved.
5. Disabled previous-output step is skipped by the active chain compiler.
6. Disabled history-source step blocks downstream required history reads with an explicit validation error.
7. Partial execution stops at selected step.
8. Partial execution does not call downstream model adapters.
9. Editing upstream config marks downstream stale.
10. History reads resolve only from earlier active steps.
11. Disabling a source step blocks required history readers.
12. Previous output placement renders before and after prompt blocks correctly.
13. Adapter conversion uses structured prompt blocks and does not parse XML back into chat roles.
14. A step with `sourceStepId: 'pipeline-input'` resolves correctly to the pipeline input artifact in both full and partial runs.
15. Import/export preserves prompt blocks, enabled flags, previous-output placement, primary output names, and history read configs.
16. Capsule extraction creates correct public inputs/outputs, including history-read boundaries.

### E2E tests

Extend Playwright smoke coverage:

1. Start new pipeline.
2. Insert Intent Extraction suggestion before main model call.
3. Insert Acceptance Criteria suggestion before main model call.
4. Run up to Acceptance Criteria.
5. Verify final model was not called.
6. Configure Prompt Rewrite or final model to read Intent Extraction from step history.
7. Configure final model to read Acceptance Criteria from step history.
8. Toggle previous output placement before and after the prompt.
9. Edit intent prompt.
10. Verify downstream stale indicators, including history readers.
11. Disable acceptance criteria.
12. Verify required history readers are blocked or affected.
13. Run full pipeline.
14. Undo disable.
15. Convert pipeline to Capsule.
16. Insert Capsule into a new pipeline.

### Validation command

Final gate:

```bash
npm run validate
npm run test:e2e
```

## Phase 13 — Cleanup and Dead Code Removal

### Objective

Remove obsolete files, functions, tests, fixtures, and UI elements after the new step-chain implementation is complete and migration coverage is green. Cleanup is part of the V1 implementation, not optional follow-up work.

### Removal targets

Remove or replace:

* old graph-backed `nodes[]` / `edges[]` helpers that are no longer needed after `steps[]` migration
* old graph mutation helpers for insert/delete/reorder/edge repair
* old example-loading code that replaces the current pipeline
* obsolete “Examples” UI labels, buttons, and store actions after Step Suggestions are active
* Capsule locking/version compatibility code that is not used in V1
* unused Capsule duplicate-to-edit lock flows
* obsolete tests and fixtures tied to persisted graph behavior
* compatibility shims that are only needed during migration once migration tests pass
* unused imports, exports, types, components, composables, and store actions
* dead CSS/selectors tied to removed UI elements

### Rules

1. Do not keep old graph code “just in case” after the step-chain path is the only supported V1 path.
2. Keep migration code only where it is required to load old saved/exported data.
3. Any retained compatibility function must have a current test proving why it still exists.
4. Remove UI affordances that expose old behavior, even if the underlying code remains temporarily for import/migration.
5. Update README/docs terminology from “Examples” and graph-backed pipeline language to “Step Suggestions” and step-chain pipeline language.

### Static checks

Add a dead-code check if practical:

```bash
npx knip
```

If `knip` is adopted, add a committed config and include it in validation. If it produces too much noise initially, document the ignored categories and keep the cleanup phase focused on known removed architecture paths.

### Acceptance criteria

* No UI path can accidentally replace the current pipeline by clicking a suggestion.
* No V1 runtime path depends on persisted `nodes[]` / `edges[]` as canonical pipeline state.
* Remaining graph-to-chain code is limited to migration/import compatibility.
* No unused Capsule locking/versioning UI is visible in V1.
* Removed behavior has no stale tests asserting it.
* `npm run lint`, `npm run build`, `npm test`, and `npm run test:e2e` pass after cleanup.
* If adopted, `npx knip` passes or has an explicit reviewed ignore list.

## MVP Cut Line

The smallest useful V1 MVP should include:

1. Insert/reorder/disable/delete/duplicate steps.
2. Step Suggestions that insert into the current pipeline.
3. XML prompt block editor for model-call and prompt-wrapper steps.
4. Previous-output placement before or after each step prompt.
5. Step history with explicit reads from prior outputs.
6. Run up to selected step.
7. Affected/stale indicators.
8. Undo/redo for pipeline actions.
9. Basic Capsule extraction from full pipeline.
10. Unit and E2E coverage for the happy path.

Defer until after MVP:

* arbitrary visual graph editing
* persisted graph model
* marketplace/sharing
* multi-user collaboration
* backend execution
* external tools/MCP
* cross-device sync
* advanced step dependency diffing beyond active graph dependencies
* Capsule publish/lock/version compatibility system

## Implementation Order

1. Introduce `PipelineDefinition.steps[]`, core type contracts, and graph-to-chain migration in core/storage.
2. Add undo/redo store infrastructure and editor store actions for insert/move/delete/duplicate/enable.
3. Update ChainEditor UI to use actions.
4. Rename Examples UI to Step Suggestions and change click behavior to insert.
5. Add prompt block type and XML renderer.
6. Add structured `RenderedPromptPayload` adapter boundary and provider-specific conversion in endpoint adapters.
7. Update built-in suggestion prompts to XML-tag style.
8. Add `primaryOutputName` validation and previous-output placement to prompt composition.
9. Add step history read types, validation, and renderer integration.
10. Add history input UI in the step inspector.
11. Add `compileStepChainToExecutionPlan` and `stopAtStepId` partial execution.
12. Add stale/affected tracking for artifacts and history reads.
13. Measure undo snapshot size with realistic long prompt content; switch to patch entries or cap depth if needed.
14. Add undo/redo toolbar, keyboard shortcuts, and text-field focus/blur batching.
15. Add full-pipeline-to-Capsule extraction.
16. Add selection-to-Capsule extraction.
17. Harden persistence and import/export migration.
18. Expand unit tests.
19. Expand Playwright tests.
20. Run validation and fix regressions.
21. Remove obsolete graph/example/locking code and UI after migration tests pass.
22. Run final cleanup validation and fix regressions.

## Open Design Decisions

1. Whether `StepSuggestion` should live in `@lorca/capsules` for V1 or move to a new `@lorca/suggestions` package later.
2. Whether disabled steps with required history readers should support manual fallback values in V1 or only block downstream execution.
3. Whether run artifacts should be cached per step for reuse during partial execution in V1 or only used for display/stale status.
4. Whether Capsule extraction should support arbitrary non-contiguous selections in V1. Recommendation: contiguous selection only for V1.
5. Whether stale history reads can ever be allowed in V1. Recommendation: block required stale reads by default and add an explicit optional/stale toggle later.
6. Whether history reads should default to the source step’s primary output or require explicit artifact selection. Recommendation: default to primary output but keep the artifact selector visible.
7. Whether undo history should use full snapshots, structural patches, or a hybrid. Recommendation: start with snapshots that exclude run artifacts, measure size, then switch large text edits to patches if needed.

## Recommended Decisions

* Keep suggestions inside `@lorca/capsules` for the first implementation to minimize package churn.
* Keep prompt blocks provider-neutral in core, but pass structured blocks to adapters so chat-capable adapters can map `system` and `user` blocks to native roles without reparsing XML.
* Keep the persisted model as `steps[]`; compile any runtime dependency plan from the chain.
* Do not persist user-authored edges in V1.
* Disabled steps are skipped by the active chain; required history reads from disabled steps are blocked unless explicitly made optional.
* Store run artifacts and lightweight run snapshots for display and staleness first; add artifact reuse only after correctness is solid.
* Avoid formal revision counters for V1; derive staleness from signatures against the last successful run snapshot.
* Treat Capsules as editable drafts in V1; defer publish/lock/version compatibility until reuse semantics require it.
* Restrict Capsule extraction to the full pipeline and contiguous step ranges in V1; non-contiguous extraction is explicitly out of scope.
* Treat step history as explicit dependency state, not hidden global context.
* Save every step output into ordered history.
* Allow history reads only from earlier active steps.
* Make previous-output placement a prompt composition setting, not a separate step type.
* Require every step to declare a valid `primaryOutputName`; previous-output placement always consumes that primary output.
* Keep provider-specific prompt request/message conversion inside endpoint adapters, never inside `@lorca/prompt`.

## Definition of Done for V1

Lorca V1 is done when a user can:

1. Start with user input and one main model call.
2. Insert Intent Extraction and Acceptance Criteria from Step Suggestions without replacing the pipeline.
3. Edit every step prompt as XML-tagged blocks.
4. Place previous output before or after a step’s prompt.
5. Read intent and acceptance criteria from prior step history without passing them through every intermediate step.
6. Run up to each intermediate step and inspect exact inputs, outputs, and history reads.
7. See stale downstream indicators after any upstream edit or history source change.
8. Disable, duplicate, delete, and reorder steps safely.
9. Undo and redo pipeline edit actions.
10. Convert the working pipeline into a Capsule.
11. Insert that Capsule into another pipeline.
12. Export/import the result without losing step order, prompt blocks, history reads, previous-output placement, or Capsule bindings.
13. Obsolete graph-backed editor code, destructive example-loading behavior, and unused Capsule locking/versioning UI are removed or limited to tested migration compatibility.
