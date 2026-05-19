# Lorca — Local AI Orchestrator Implementation Plan

## 1. Product Contract

Lorca is a local-first browser application for designing, executing, inspecting, and iterating on AI pipelines. The MVP is orchestrated from the browser. A backend is optional and belongs to a later phase.

The MVP lets a user register local AI endpoints, discover available models where browser access permits it, build reusable pipeline components, run a target prompt through the pipeline, inspect every intermediate artifact, and save/load reusable definitions.

The application is not an autonomous assistant in the MVP. It is a pipeline workbench: the user controls the pipeline structure, model choices, prompt wrappers, intermediate transformations, reusable components, loops, and final model call.

## 2. Core Product Concepts

### Pipeline

A pipeline is the top-level flow that receives a target prompt and produces a final output. It is composed of nodes and edges.

The MVP UI may initially present a mostly linear editing experience, but the internal representation should be graph-shaped from the beginning.

### Capsule

A **Capsule** is a reusable mini pipeline.

A Capsule usually follows this shape:

```text
preprocess -> query LLM -> postprocess
```

The shape is intentionally flexible. A Capsule can contain one node or many nodes, but it must expose a stable external interface so it can be inserted into larger pipelines repeatedly.

Use **Capsule** as the product term, documentation term, and code-level domain term. Avoid introducing a separate internal name such as `SubpipelineDefinition` for the same concept.

### Pipeline and Capsule relationship

A Pipeline and a Capsule are built from the same core graph model: nodes, edges, inputs, outputs, artifacts, validation, execution, and traces.

The difference is lifecycle and boundary:

1. A **Pipeline** is the top-level runnable workspace flow.
2. A **Capsule** is a reusable graph with an explicit public interface.
3. A Pipeline can contain Capsule instances.
4. A Capsule can contain normal nodes and, later, nested Capsule instances if recursion limits and cycle checks are enforced.
5. A Pipeline can be converted/exported into a Capsule by defining its public inputs, public outputs, parameters, model slots, and version metadata.

This means Lorca should not maintain two unrelated runtime systems. The runtime should execute graph definitions consistently, whether the graph is being used as the main Pipeline or as a Capsule instance inside another Pipeline.

### Locked Capsule

A locked Capsule is a reusable versioned unit that can be inserted into a pipeline without accidental internal edits.

Locking means:

1. The internal nodes and edges are read-only by default.
2. The public inputs, outputs, model slots, and configurable parameters remain visible.
3. The user can duplicate/unlock the Capsule to create a new editable variant.
4. Existing pipeline instances keep using the version they were wired to unless the user upgrades them.

### Capsule Instance

A Capsule instance is a use of a Capsule inside a pipeline.

The same Capsule definition can be inserted many times into the same pipeline. Each instance has its own configuration, input bindings, output bindings, loop count, and execution trace.

### Artifact

An artifact is an immutable value produced during a pipeline run.

Artifacts use logical keys, not filesystem paths. In the browser-first MVP, artifact values are kept in memory during execution and persisted as structured records in browser storage when the run is saved.

Example artifact keys:

```text
user_prompt.raw
user_prompt.xml
intent.json
acceptance_criteria.json
candidate_answer.text
verification_result.json
```

Example keys use node prefixes (§2). The UI output panel shows whichever artifact `outputRef` resolves to—not a separate `final_output.*` producer.

Every pipeline node and Capsule instance should produce inspectable artifacts.

### Artifact namespacing

Artifact keys must be unique within a run. Lorca assigns keys using a stable prefix per producer so duplicate Capsules and multiple model calls cannot collide.

Rules:

1. Every `PipelineNode` and `CapsuleInstanceNode` has a stable `artifactPrefix`.
2. Default `artifactPrefix` is the node `id`. The user may set a short alias (for example `verifier`, `criteria`) when inserting a Capsule instance.
3. Node outputs are stored as `${artifactPrefix}.${outputName}`. There is no per-output override in MVP; `artifactPrefix` plus fixed output names is sufficient and keeps the validator simple.
4. `CapsuleInstanceNode.outputBindings` map Capsule public output port names to full artifact keys in the parent run. Default binding is `${instancePrefix}.${portName}`.
5. Loop iteration artifacts use `${instancePrefix}.iteration_${n}.${outputName}` and `${instancePrefix}.final.${outputName}` as documented in §8.
6. Global pipeline inputs such as `user_prompt.raw` and `user_prompt.xml` are owned by `InputNode` and keep stable names without a node prefix.
7. Validation must reject duplicate artifact keys before execution.
8. **Capsule internal artifacts** are stored in an instance-local namespace and are not visible in the parent run artifact store directly. Internal node artifacts use the prefix `${instancePrefix}.internal.${internalArtifactKey}` for non-looped instances, and `${instancePrefix}.iteration_${n}.internal.${internalArtifactKey}` for looped instances. Only declared public output port values — copied via `outputBindings` — are written into the parent artifact store.

Example: the same locked Capsule inserted twice with prefixes `criteria` and `criteria_retry`:

```text
criteria.extracted_json
criteria_retry.extracted_json
```

Internal artifacts from the first instance stay scoped:

```text
criteria.internal.extractor.text
criteria.internal.extractor.rawResponse
```

These are inspectable in the trace but do not pollute the parent run's flat artifact namespace.

## 3. MVP Scope

### Required MVP capabilities

1. Run entirely from the browser where endpoint CORS policy allows it.
2. Add and test AI endpoints.
3. Discover models from supported endpoints where available.
4. Let the user manually define models when discovery is blocked or unsupported.
5. Bucket models into suggested usage classes.
6. Let the user enter a target prompt.
7. Wrap the target prompt in a stable tagged envelope.
8. Let the user add prompt/instruction steps around or before the target prompt.
9. Let the user add model-call steps at any point in the pipeline.
10. Let later steps consume outputs from previous steps.
11. Let the user define, test, lock, and reuse Capsules.
12. Let the user insert the same Capsule multiple times into a top-level pipeline.
13. Let the user loop a Capsule instance a fixed number of times.
14. Execute the pipeline and show a trace of each step.
15. Show the final response in an output panel.
16. Save and load pipeline and Capsule definitions locally (IndexedDB).
17. Preserve a design path for converting a Pipeline into a Capsule, even if the conversion UI is added after the MVP.

### MVP tiers

Ship in two tiers so the workbench is usable before polish work lands.

**Core MVP** (Phases 1–11, DoD items 1–20):

1. Everything in Required MVP capabilities except JSON file export/import.
2. Save/load via browser storage only.

**MVP+** (Phases 12–13, DoD items 21–23):

1. Export and import pipeline and Capsule JSON files.
2. Built-in example Capsules users can duplicate.

Core MVP is the release gate. MVP+ can follow immediately after without changing runtime architecture.

### MVP non-goals

1. No mandatory backend.
2. No MCP execution.
3. No arbitrary shell/tool execution.
4. No multi-user server mode.
5. No cloud sync.
6. No autonomous agent loop.
7. No hidden profile system.
8. No automatic external network calls except user-configured model endpoints.
9. No sharing marketplace.
10. No public remote registry.
11. No automatic browser-CORS bypass.

## 4. Browser-Orchestrated MVP

### Browser-first runtime

The MVP runtime executes inside the browser:

1. Pipeline graph validation runs in the browser.
2. Prompt rendering runs in the browser.
3. Model endpoint requests are initiated by the browser.
4. Artifacts and traces are stored in browser-managed state.
5. Persistence uses browser storage and import/export files.

### Endpoint limitation

Browser orchestration requires the target AI endpoint to allow browser requests. If an endpoint blocks CORS, Lorca must show a clear endpoint-access error and offer these options:

1. Configure the endpoint to allow local browser access.
2. Manually define models without discovery.
3. Use a later optional backend bridge.

Lorca must not silently imply that it can access endpoints the browser is not allowed to access.

### Persistence options

MVP persistence should use browser-native storage.

Recommended order:

1. In-memory state for the active run.
2. IndexedDB for saved app state, pipeline definitions, Capsule definitions, and saved run records.
3. Download/upload JSON for export/import.
4. Optional Origin Private File System support later for large run artifacts or file-like blobs.

Artifact keys are stored as fields/indexes inside persisted run records. They are not filenames unless the user explicitly exports a run bundle.

### Streaming

Browser model calls should support streaming where the endpoint exposes a browser-compatible streaming response. Streaming is useful but not required for the first working MVP.

### Operational limits (MVP defaults)

Apply conservative defaults in the browser runtime. Surface all limits in the UI and in structured errors when exceeded.

| Limit | Default | Notes |
| --- | --- | --- |
| Capsule loop count cap | `10` | Enforced by runtime constant `CAPSULE_LOOP_MAX_COUNT`; not persisted per instance; validation rejects `count > CAPSULE_LOOP_MAX_COUNT` |
| Model call timeout | `120_000` ms | Per `ModelCallNode`; abort via `AbortSignal` |
| Run cancellation | Immediate | Cancel button aborts in-flight `fetch()`; partial artifacts from completed nodes remain inspectable |
| Recent run retention | `20` runs | Oldest runs pruned from IndexedDB when exceeded; full artifact text kept for retained runs |
| Trace request/response preview | `32_768` chars | Longer bodies truncated in UI with expand-to-full from stored run record |

## 5. Optional Backend Later

The backend is an extension, not an MVP dependency.

Later backend responsibilities:

1. Work around endpoint CORS limitations when the user explicitly enables it.
2. Support larger local persistence.
3. Manage secrets outside browser storage.
4. Proxy streaming responses.
5. Provide local filesystem import/export.
6. Host MCP/tool integrations.
7. Support LAN access behind explicit binding and permission settings.

Security defaults for a later backend:

1. Bind to `127.0.0.1` by default.
2. Do not expose on LAN by default.
3. Do not call external services unless configured by the user.
4. Warn when adding non-local endpoints.
5. Store secrets separately from exported pipeline JSON.

## 6. Core UX

### Main screen layout

Use a three-pane layout:

1. **Left pane: Inputs, endpoints, and library**

   * Target prompt editor.
   * Endpoint list.
   * Model inventory.
   * Model bucket assignments.
   * Capsule library.

2. **Center pane: Pipeline builder**

   * Ordered chain view for MVP.
   * Graph-compatible internal representation.
   * Add step button.
   * Add Capsule button.
   * Step cards with type, model, input references, output name, status, and loop count.

3. **Right pane: Inspector and output**

   * Selected step configuration.
   * Capsule public interface configuration.
   * Rendered prompt preview.
   * Execution trace.
   * Final response output.

### User workflow

1. User adds endpoint: `http://localhost:11434`.
2. Lorca tests browser access to the endpoint.
3. Lorca fetches model inventory if the endpoint allows it.
4. User manually defines models if discovery is unavailable.
5. Lorca assigns advisory model buckets.
6. User enters target prompt.
7. Lorca creates the base artifact:

```xml
<user_prompt>
  ...user prompt...
</user_prompt>
```

8. User adds instruction wrappers, templates, model calls, transforms, and Capsules.
9. User configures Capsule instances, including fixed loop counts where needed.
10. User presses **Execute**.
11. Lorca executes each step in dependency order.
12. Lorca stores every intermediate output as a named artifact.
13. Lorca displays the final output and a step-by-step trace.

## 7. Capsule UX

### Capsule editor

A Capsule should use the same three-pane editing shell as the main Pipeline editor.

Navigation behavior:

1. Opening a Capsule replaces the center pane editor context rather than opening a modal.
2. The left pane switches the library selection to the active Capsule.
3. The right pane continues to act as the inspector/output panel.
4. Breadcrumbs show whether the user is editing a Pipeline or a Capsule.
5. A return action brings the user back to the parent Pipeline without losing unsaved edits.
6. This keeps Pipeline editing and Capsule editing on one shared node/edge editing surface.

The editor shows:

1. Capsule name.
2. Capsule description.
3. Public inputs.
4. Public outputs.
5. Public parameters.
6. Internal nodes.
7. Internal edges.
8. Test prompt/input panel.
9. Test output panel.
10. Lock/version controls.

### Capsule interface

A Capsule must define a public interface before it can be locked.

```ts
type CapsuleValueKind = 'text' | 'json' | 'model-response';

type CapsuleParameterKind = 'text' | 'boolean' | 'number' | 'json';

interface CapsuleInputPort {
  name: string;
  kind: CapsuleValueKind;
  required: boolean;
  description?: string;
  defaultArtifactKey?: string;
}

interface CapsuleOutputPort {
  name: string;
  kind: CapsuleValueKind;
  description?: string;
  sourceArtifactKey?: string;
}

interface CapsuleParameter {
  name: string;
  kind: CapsuleParameterKind;
  required: boolean;
  description?: string;
  default?: unknown;
}

interface CapsuleModelSlot {
  name: string;
  suggestedBuckets: ModelUsageBucket[];
  required: boolean;
  description?: string;
  defaultModelRef?: {
    endpointId: string;
    modelName: string;
  };
}

interface CapsuleInterface {
  inputs: CapsuleInputPort[];
  outputs: CapsuleOutputPort[];
  parameters: CapsuleParameter[];
  modelSlots: CapsuleModelSlot[];
}
```

Example public interface:

```text
Inputs:
- source_text: text

Parameters:
- extraction_goal: text
- strict_json: boolean

Model slots:
- extractor_model: bucket tiny | extract-json

Outputs:
- extracted_json: json
- raw_model_output: text
```

### Capsule lock flow

A user can lock a Capsule when:

1. The graph is valid.
2. Required public inputs are declared.
3. Required public outputs are declared.
4. Model slots are declared instead of hard-wiring every model, unless hard-wiring is intentional.
5. The Capsule has at least one **passing** test run (see below).

**Passing test run (MVP):** a Capsule test run that completes with no failed nodes and produces all declared public outputs. `expectedOutputs` on `CapsuleTestCase` are optional assertions; when present, they are compared after a successful run (text: exact match; json: deep equality). When absent, completion without node failure is sufficient. Nondeterministic model text is not compared unless the user adds explicit assertions.

Locking creates an immutable version.

Example:

```text
Intent Extractor v1
Acceptance Criteria Generator v3
Verifier v2
Prompt Compressor v1
```

### Capsule reuse

When a user inserts a locked Capsule into a pipeline, Lorca creates a Capsule instance.

The instance config includes:

1. Capsule definition ID.
2. Capsule version.
3. Input artifact bindings.
4. Output artifact names.
5. Parameter values.
6. Model slot assignments.
7. Loop mode.
8. Loop count.

## 8. Capsule Looping

### Fixed-count loop

The MVP should support fixed-count Capsule loops.

Example:

```text
Run this Capsule 3 times, feeding each iteration's output into the next iteration's input.
```

This supports iterative refinement without introducing open-ended agent behavior.

### Loop config

```ts
interface CapsuleLoopConfig {
  enabled: boolean;
  count: number;
  inputCarryMode: 'first-input-then-previous-output';
  carriedInputName: string;
  carriedOutputName: string;
}
```

`carriedInputName` is the public input port that receives the prior iteration's output on each subsequent iteration. `carriedOutputName` is the public output port whose value is carried forward. Both must match declared ports in the Capsule interface.

The loop cap comes from the runtime constant `CAPSULE_LOOP_MAX_COUNT = 10` (§4). `maxCount` is not persisted in the config — the cap is enforced by the runtime validator. Validation rejects `count > CAPSULE_LOOP_MAX_COUNT`.

### Loop rules

1. Loop count must be explicit.
2. Loop count must be finite.
3. MVP should enforce a conservative max loop count.
4. Each iteration gets its own trace entries.
5. Each iteration gets its own artifacts.
6. Iteration artifacts must be addressable by index.
7. The Capsule instance exposes a final output after the last iteration.
8. Failed iteration stops the loop unless explicit continue-on-error is added later.

### Loop artifact keys

Example for a Capsule instance named `refine_answer`:

```text
refine_answer.iteration_1.output_text
refine_answer.iteration_2.output_text
refine_answer.iteration_3.output_text
refine_answer.final.output_text
```

## 9. Future Pipeline Overview

A future visual overview should show the full pipeline topology.

The overview should include:

1. Top-level pipeline nodes.
2. Capsule instances.
3. Expanded view of Capsule internals.
4. Collapsed view of locked Capsules.
5. Input/output ports.
6. Artifact flow between nodes.
7. Model calls.
8. Loop boundaries.
9. Failed nodes from the latest run.
10. Duration and token/cost metadata where available.

The overview is not required for the first MVP editor, but the internal graph model must preserve enough information to support it later.

## 10. Architecture

### Recommended repository shape

```text
lorca/
  package.json
  apps/
    web/
      src/
  packages/
    core/
      src/
    endpoints/
      src/
    pipeline/
      src/
    capsules/
      src/
    prompt/
      src/
    storage/
      src/
    ui-kit/
      src/
  tests/
```

### Monorepo tooling

Use **npm workspaces** as the monorepo package manager and workspace linker.

Initial constraints:

1. Do not add Turborepo for the MVP unless build/test orchestration becomes a real bottleneck.
2. Keep root scripts simple and explicit.
3. Use root `package.json` `workspaces` to define `apps/*` and `packages/*`.
4. Use workspace package names for cross-package imports.
5. Run the same validation commands from the repository root.

Root validation order:

```sh
eslint .
npm run build
npm test
```

### Package responsibilities

#### `packages/core`

Owns shared types, result objects, IDs, error shapes, and validation helpers.

#### `packages/endpoints`

Owns browser-compatible endpoint adapters.

Initial adapter:

* `ollama`

Later adapters:

* OpenAI-compatible local endpoints.
* LM Studio.
* llama.cpp server.
* Custom HTTP adapter.

#### `packages/pipeline`

Owns pipeline graph validation, execution ordering, artifact store, step execution, trace events, and runtime errors.

#### `packages/capsules`

Owns Capsule definitions, Capsule validation, Capsule locking/versioning, Capsule instances, Pipeline-to-Capsule conversion rules, loop execution, and public interface mapping.

#### `packages/prompt`

Owns prompt-envelope generation, XML-like wrapper composition, template rendering, escaping rules, and prompt preview rendering.

#### `packages/storage`

Owns browser persistence, import/export, endpoint configuration persistence, secret-reference metadata, and schema migrations.

**Schema migration policy:**

1. Every persisted document includes `schemaVersion` (starting at `1`).
2. Readers accept the current version and the immediately previous version when a migration exists.
3. On load, migrate forward in place to the latest version before the app uses the document.
4. Breaking shape changes bump `schemaVersion` and add a named migration function in `packages/storage`.
5. Export files always use the latest `schemaVersion`; import runs the same migration path as IndexedDB load.

Browser-first secret handling must be explicit:

1. Endpoint configs may reference secrets by logical key.
2. Exported pipeline and Capsule files must not include secret values.
3. The MVP may store local-only secrets in browser storage with clear warnings.
4. A later optional backend should move secret values out of browser storage.

#### `packages/ui-kit`

Owns shared Vue components that are not domain-specific enough to live in `apps/web`:

1. Buttons, panels, dialogs, tabs, split panes, forms, toasts, and empty states.
2. Shared CodeMirror wrappers.
3. Shared status badges and trace display primitives.
4. Theme tokens and layout utilities.

Domain-heavy components should stay in `apps/web` until reuse is proven.

#### `apps/web`

Owns the browser UI and executes the MVP runtime.

## 11. Endpoint Discovery

### Endpoint model

```ts
interface AiEndpointConfig {
  id: string;
  name: string;
  baseUrl: string;
  kind: 'ollama' | 'openai-compatible' | 'lmstudio' | 'custom-http';
  enabled: boolean;
  browserAccess: 'unknown' | 'available' | 'blocked';
  authKind: 'none' | 'bearer-token' | 'api-key';
  authSecretRef?: string;
  createdAt: string;
  updatedAt: string;
}

interface EndpointSecretRef {
  id: string;
  endpointId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}
```

Secret values must never be included in pipeline or Capsule exports. Browser-first MVP storage may keep local-only secret values in browser storage, but the UI must label this clearly and allow endpoints with `authKind: 'none'` for local Ollama-style usage.

### Model inventory model

```ts
interface DiscoveredModel {
  id: string;
  endpointId: string;
  providerModelName: string;
  displayName: string;
  sizeBytes?: number;
  parameterSize?: string;
  quantization?: string;
  family?: string;
  modifiedAt?: string;
  buckets: ModelUsageBucket[];
  userBuckets?: ModelUsageBucket[];
  source: 'discovered' | 'manual';
}

type ModelUsageBucket =
  | 'tiny'
  | 'thinking'
  | 'summarize'
  | 'rewrite'
  | 'extract-json'
  | 'verify'
  | 'general'
  | 'unknown';
```

### Model bucket rules

Start with heuristic bucketing, then make bucket assignments user-editable.

Initial heuristic inputs:

1. Model name.
2. Parameter size if available.
3. Quantization if available.
4. Context length if available.
5. Endpoint kind.
6. User override.

Rules must be advisory only. Execution must never depend on a bucket being perfectly correct.

## 12. Pipeline Model

Represent the pipeline as a typed graph from the beginning.

### Pipeline definition

```ts
interface PipelineDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  inputArtifactName: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  outputRef: PipelineOutputRef;
  createdAt: string;
  updatedAt: string;
}

interface PipelineOutputRef {
  nodeId: string;
  outputName: string;
}

interface PipelineEdge {
  id: string;
  fromNodeId: string;
  fromOutput: string;
  toNodeId: string;
  toInput: string;
}

interface NodeLayout {
  x: number;
  y: number;
}

interface PipelineNodeBase {
  id: string;
  title?: string;
  artifactPrefix?: string;
  layout?: NodeLayout;
}
```

`artifactPrefix` defaults to `id` when omitted. See §2 Artifact namespacing.

`inputArtifactName` defaults to `user_prompt`, but remains a string to preserve future multi-input pipeline support. `outputRef` selects the final output from an existing node output; Lorca should not also model a separate `FinalOutputNode` in stored graph definitions.

**Resolving `outputRef` to an artifact key:** stored definitions use `nodeId` + `outputName` only. The full artifact key is derived at validation and runtime (never persisted on `outputRef`):

1. Find the node by `nodeId`.
2. For `InputNode`, map `outputName` `raw` → `user_prompt.raw`, `xml` → `user_prompt.xml` (global keys per §2).
3. For all other nodes, `artifactKey` is `` `${prefix}.${outputName}` `` where `prefix` is `node.artifactPrefix ?? node.id`.

The output panel and `final_output_missing` checks use this derived key.

### Node types

```ts
type PipelineNode =
  | InputNode
  | PromptWrapperNode
  | TemplateNode
  | ModelCallNode
  | JsonExtractNode
  | ManualTextNode
  | CapsuleInstanceNode;
```

#### `InputNode`

Creates the base user prompt artifact.

Inputs:

* Raw user prompt.

Outputs:

* `user_prompt.raw`
* `user_prompt.xml`

#### `PromptWrapperNode`

Wraps an input artifact in a named XML-like instruction block.

Config:

```ts
interface PromptWrapperConfig {
  tagName: string;
  instructionText: string;
  includeInputArtifact: boolean;
  inputPlacement: 'before-instructions' | 'after-instructions' | 'inside-template';
  template?: string;
}
```

Output: fixed name `text` → `${artifactPrefix}.text`

`instructionText` may contain `{{param.name}}` placeholders when the node lives inside a Capsule (§15).

#### `TemplateNode`

Creates a new artifact from a template that references earlier artifacts. Template syntax is defined in §15.

Output: fixed name `text` → `${artifactPrefix}.text`

Example template:

```text
Use the acceptance criteria below to verify the candidate answer.

<acceptance_criteria>
{{artifact.acceptance_criteria.json}}
</acceptance_criteria>

<candidate_answer>
{{artifact.candidate_answer.text}}
</candidate_answer>
```

#### `ModelCallNode`

Sends a rendered prompt or message list to a selected model.

Config:

```ts
type ModelRef =
  | { kind: 'fixed'; endpointId: string; modelName: string }
  | { kind: 'slot'; slotName: string };

interface ModelCallConfig {
  modelRef: ModelRef;
  mode: 'generate' | 'chat';
  systemPrompt?: string;
  inputArtifactRef: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  expectedOutput?: 'text' | 'json';
  jsonSchema?: unknown;
}
```

`modelRef` is either a fixed endpoint+model pair or a reference to a named `CapsuleModelSlot`. When kind is `'slot'`, the runtime resolves the slot using `CapsuleInstanceConfig.modelSlotAssignments` before calling the adapter. Using `'slot'` inside a non-Capsule pipeline node is a validation error.

Outputs use fixed names stored under `${artifactPrefix}.{outputName}`, where `artifactPrefix` comes from `PipelineNodeBase`:

* `text` — primary model text output → `${artifactPrefix}.text`
* `rawResponse` — adapter-normalized response metadata and raw body reference → `${artifactPrefix}.rawResponse`
* `parsedJson` — only when `expectedOutput: 'json'` and parse succeeds → `${artifactPrefix}.parsedJson`

Set the node's `artifactPrefix` (e.g. `candidate_answer`) to produce human-readable keys like `candidate_answer.text`.

**Adapter contract (`packages/endpoints`):** each adapter implements `listModels`, `testBrowserAccess`, and `executeModelCall`. `executeModelCall` receives an already-resolved model reference (slot has been expanded before calling the adapter):

```ts
interface ModelCallRequest {
  mode: 'generate' | 'chat';
  endpointId: string;
  modelName: string;
  systemPrompt?: string;
  userContent: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}
```

Mapping rules:

1. **`generate`:** `userContent` is the full rendered prompt string (from `inputArtifactRef`). Ollama: `POST /api/generate` with `prompt`. When `systemPrompt` is set, send it as the request `system` field (Ollama supports `system` separately from `prompt` on `/api/generate`).
2. **`chat`:** `userContent` is the latest user message. `systemPrompt` is sent as the system role when present. Prior chat history is out of scope for MVP; only system + single user turn.
3. Adapters return `{ text, rawResponse }`. Optional `parsedJson` when `expectedOutput: 'json'`.

#### `JsonExtractNode`

Parses or extracts structured JSON from an existing text artifact (typically a prior model output). Use this when the model call should stay `expectedOutput: 'text'` or when extraction logic must be visible as its own pipeline step.

**`ModelCallNode` vs `JsonExtractNode`:**

| Approach | When to use |
| --- | --- |
| `ModelCallNode` with `expectedOutput: 'json'` | Single step; adapter parses JSON immediately after the call |
| `JsonExtractNode` after `ModelCallNode` | Inspect raw model text in the trace, reuse one model output for multiple extractions, or keep parsing explicit in the graph |

Do not chain both for the same output unless the intermediate text artifact is intentionally preserved.

MVP behavior:

1. Try strict JSON parse.
2. Try fenced-code extraction.
3. Try first complete JSON object/array extraction.
4. Fail with a visible structured error if parsing still fails.

No hidden model repair in MVP unless explicitly added as a separate `ModelCallNode`.

Output: fixed name `json` → `${artifactPrefix}.json`

#### `ManualTextNode`

Lets the user insert static reusable text into the pipeline.

Examples:

* Style rules.
* Verification rubric.
* Project constraints.
* System prompt fragments.

Output: fixed name `text` → `${artifactPrefix}.text`

#### `CapsuleInstanceNode`

Executes a reusable Capsule inside the current pipeline.

Config:

```ts
interface CapsuleInstanceConfig {
  capsuleDefinitionId: string;
  capsuleVersion: string;
  inputBindings: Record<string, string>;
  outputBindings: Record<string, string>;
  parameterValues: Record<string, unknown>;
  modelSlotAssignments: Record<string, { endpointId: string; modelName: string }>;
  loop?: CapsuleLoopConfig;
}
```

`artifactPrefix` for a `CapsuleInstanceNode` is set via `PipelineNodeBase.artifactPrefix` (not duplicated here). It scopes iteration and final artifacts for this instance (§2, §8).

#### Final output selection

Final output is selected by `PipelineDefinition.outputRef` or `CapsuleDefinition.outputRef`, resolved to an artifact key via the rules in §2, with one additional rule for Capsule instances:

For a `CapsuleInstanceNode`, `outputRef.outputName` names a public output port declared in the Capsule interface. Resolution:

1. If `outputBindings` contains that port name, use the bound full artifact key directly.
2. Otherwise default to `${artifactPrefix}.${outputName}`.

This ensures `outputRef` respects any custom binding the user has set on the instance, rather than always generating the default key.

Do not store a separate `FinalOutputNode` or a redundant `artifactKey` on `outputRef`. A single source of truth prevents drift between stored refs and namespaced keys.

## 13. Capsule Model

### Capsule definition

```ts
interface CapsuleDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  version: `v${number}`;
  status: 'draft' | 'locked';
  interface: CapsuleInterface;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  outputRef: PipelineOutputRef;
  tests: CapsuleTestCase[];
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
}
```

### Capsule test case

```ts
interface CapsuleTestCase {
  id: string;
  name: string;
  inputValues: Record<string, unknown>;
  parameterValues?: Record<string, unknown>;
  expectedOutputs?: Record<string, unknown>;
  lastRun?: CapsuleTestRunSummary;
}

interface CapsuleTestRunSummary {
  runId: string;
  ranAt: string;
  passed: boolean;
  failedNodeId?: string;
  error?: PipelineError; // defined in §14
}
```

### Capsule versioning rules

Capsule versions use monotonically increasing integer labels in the format `v{n}`.

Examples:

```text
v1
v2
v3
```

Rules:

1. Draft Capsules are editable.
2. Locked Capsules are immutable.
3. Editing a locked Capsule creates a new draft derived from that version.
4. Locking the draft creates the next integer version.
5. Pipeline instances reference a specific Capsule version.
6. A pipeline should show when a newer Capsule version exists.
7. Upgrading a Capsule instance should be explicit.
8. A Pipeline converted into a Capsule becomes a draft Capsule first.
9. The converted draft must define public inputs, public outputs, parameters, and model slots before it can be locked.
10. Version comparison must parse the numeric suffix; string comparison is invalid.

## 14. Execution Semantics

### Execution context

```ts
interface PipelineRunContext {
  runId: string;
  pipelineId: string;
  startedAt: string;
  abortSignal?: AbortSignal;
  input: {
    userPromptRaw: string;
    userPromptXml: string;
  };
  artifacts: Record<string, PipelineArtifact>;
  trace: PipelineTraceEvent[];
}

interface PipelineArtifact {
  name: string;
  nodeId: string;
  kind: 'text' | 'json' | 'model-response' | 'error';
  value: unknown;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
```

### Execution rules

1. Validate graph before execution.
2. Reject cycles in the expanded graph.
3. Reject duplicate artifact keys (§2).
4. Reject unresolved artifact references.
5. Reject missing endpoint/model references.
6. Reject missing Capsule definitions.
7. Reject missing Capsule versions.
8. Execute nodes in dependency order.
9. Expand Capsule instances into internal execution plans at runtime.
10. Store every node output as an immutable artifact for that run.
11. Never overwrite an artifact within a run.
12. Stop execution on node failure unless the node explicitly allows failure.
13. Always emit trace events for started, completed, failed, skipped, and cancelled nodes.
14. Final output must reference an artifact produced by the run (via derived key from `outputRef`).
15. `abortSignal` must be passed through to browser `fetch()` calls.
16. User cancellation marks the active node with trace status `cancelled` and `PipelineError` code `run_cancelled` (see below).
17. Loop final artifacts are duplicate artifacts whose value equals the last successful iteration output value; they are not filesystem links or mutable aliases.

### Pipeline errors

```ts
type PipelineErrorCode =
  | 'invalid_pipeline_graph'
  | 'cycle_detected'
  | 'duplicate_artifact_key'
  | 'missing_artifact'
  | 'missing_endpoint'
  | 'missing_model'
  | 'endpoint_browser_access_blocked'
  | 'endpoint_unreachable'
  | 'model_call_failed'
  | 'template_render_failed'
  | 'json_parse_failed'
  | 'missing_capsule'
  | 'missing_capsule_version'
  | 'invalid_capsule_interface'
  | 'capsule_loop_limit_exceeded'
  | 'capsule_iteration_failed'
  | 'final_output_missing'
  | 'run_cancelled'
  | 'unknown_error';

interface PipelineError {
  code: PipelineErrorCode;
  message: string;
  nodeId?: string;
  capsuleInstanceId?: string;
  iteration?: number;
}
```

### Trace event model

```ts
interface PipelineTraceEvent {
  runId: string;
  nodeId: string;
  capsuleInstanceId?: string;
  capsuleIteration?: number;
  status: 'started' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  timestamp: string;
  durationMs?: number;
  inputArtifactNames?: string[];
  outputArtifactNames?: string[];
  error?: PipelineError;
}
```

When the user cancels a run, the in-flight node receives `status: 'cancelled'` and `error.code: 'run_cancelled'`. Downstream nodes that never started use `status: 'skipped'`.

## 15. Prompt Composition Rules

### Base envelope

Always preserve the raw user prompt separately from the rendered XML-like artifact.

```xml
<user_prompt>
  ...escaped user text...
</user_prompt>
```

### Escaping

Prompt XML is not a strict XML parser contract. It is a model-readable delimiter format. Still, escape user text consistently to prevent accidental tag collision.

Rules:

1. Escape `&` as `&amp;`.
2. Escape `<` as `&lt;`.
3. Escape `>` as `&gt;`.
4. Preserve whitespace where practical.
5. Keep raw text available for nodes that intentionally avoid escaping.

### Tag policy

1. Tags must match `/^[a-z][a-z0-9_\-]*$/`.
2. Tags must be lowercase by default.
3. Reserved tags cannot be redefined:

   * `user_prompt`
   * `system_prompt`
   * `pipeline_context`
   * `model_output`
   * `acceptance_criteria`
   * `candidate_answer`
   * `verification_result`

### Template reference syntax

Templates are plain text with `{{artifact.<key>}}` and `{{param.<name>}}` placeholders. This is not a logic language in MVP: no conditionals, loops, or filters.

Rules:

1. **Artifact syntax:** `{{artifact.<fullArtifactKey>}}` where `<fullArtifactKey>` matches a key in the current run (for example `acceptance_criteria.json`, `criteria.extracted_json`).
2. **Parameter syntax:** `{{param.<name>}}` where `<name>` is a declared `CapsuleParameter` name. Only valid inside a Capsule (validation rejects `{{param.*}}` in top-level pipeline templates). Parameter values are always treated as text at substitution time; JSON-kind parameters are serialized with `JSON.stringify`.
3. **Scope:** Parameters are available in `TemplateNode` template text and `PromptWrapperNode` instruction text. They are **not** available in numeric model-call settings (`temperature`, `maxTokens`); those remain static config.
4. **Resolution:** At render time, substitute artifact or parameter values. Text artifacts insert as-is. JSON artifacts insert using `JSON.stringify(value, null, 2)`.
5. **Missing reference:** Fail the node with `template_render_failed` and list the unresolved key. Do not substitute empty strings silently.
6. **Escaping:** Literal `{{` in static template text is written as `\{{` and is not treated as a placeholder opener.
7. **Whitespace:** Preserve newlines in the template file; trim only trailing whitespace on the final rendered artifact if configured.

### Looped Capsule output resolution

For a looped `CapsuleInstanceNode`, `outputRef.outputName` names a public output port in the Capsule interface (not an internal artifact key). Resolving it selects the final-iteration artifact:

```text
${instancePrefix}.final.${outputName}
```

Example: a `CapsuleInstanceNode` with `artifactPrefix: 'refiner'` and `outputRef.outputName: 'output_text'` resolves to `refiner.final.output_text`.

For looped Capsule instances, the final iteration value is first materialized as `${instancePrefix}.final.${outputName}`. If `outputBindings` maps that public port to a parent artifact key, the bound key receives a duplicate of that final value and `outputRef` resolves to the bound key. If no binding exists, `outputRef` resolves to `${instancePrefix}.final.${outputName}` directly.

Non-looped Capsule instances follow the standard `outputBindings` / default-key rules (§12).

## 16. UI Implementation Details

### MVP pipeline editor

Start with an ordered chain UI:

```text
[Input] -> [Prompt Wrapper] -> [Capsule: Intent Extractor] -> [Model Call] -> [Capsule: Verifier] -> [outputRef]
```

Internally store as nodes and edges. This avoids a later migration when branching and full topology overview are added.

### Chain editor invariants (MVP)

The ordered chain UI is an editor over a restricted graph shape:

1. **Single path:** MVP pipelines are one directed path from `InputNode` to `outputRef`. Validation rejects any node with more than one outgoing edge or more than one incoming edge (except merge points, which are disallowed in MVP).
2. **Edge generation:** Reordering steps rewrites `edges` so step *i* connects to step *i + 1*. Adding a step inserts a node and two edges (or one edge replacement). Removing a step bridges adjacent nodes.
3. **Port defaults:** `fromOutput` defaults to the source node's primary output (`text` for model calls, declared output port for Capsules). `toInput` defaults to the target node's primary input.
4. **No manual edge drawing in MVP:** Users do not draw edges; the chain order is the source of truth.
5. **Branching:** Reserved for post-MVP (§23). Graph storage already supports it; the MVP validator rejects non-chain graphs.

### Early vertical slice (Phase 6)

Before Capsule work (Phases 8–10), ship a minimal three-pane UI sufficient to run: target prompt → one `ModelCallNode` → output + trace. This validates browser orchestration, CORS messaging, and trace UX without waiting for Phase 11.

### Step card fields

Each step card should show:

1. Step type.
2. Short title.
3. Input artifact names.
4. Output artifact names.
5. Selected model if relevant.
6. Capsule name and version if relevant.
7. Loop count if relevant.
8. Last run status.
9. Duration from last run.

### Inspector fields

The inspector should show:

1. Node config form.
2. Input artifact picker.
3. Output artifact name.
4. Capsule public interface mapping.
5. Rendered prompt preview.
6. Last output preview.
7. Last error, if any.

### Execution trace UI

Trace should show:

1. Node order.
2. Capsule boundaries.
3. Loop iterations.
4. Status.
5. Duration.
6. Input artifacts.
7. Output artifacts.
8. Expandable raw request/response for model calls.
9. Error details.

Raw request/response visibility should be explicit to avoid clutter.

## 17. Persistence

### Local app state

Persist:

1. Endpoint configs.
2. Discovered model inventory.
3. Manually defined models.
4. User bucket overrides.
5. Pipeline definitions.
6. Capsule definitions.
7. Capsule versions.
8. Recent pipeline runs (retain last 20 by default; see §4).
9. UI layout preferences.

**Sensitive data:** saved runs and traces may contain full prompts and model responses. Label this in the UI. Offer clear-recent-runs action.

### Export format

Export pipeline and Capsule definitions as JSON.

Do not include secrets in exported files.

**Export scrubbing checklist** (enforced at export time):

1. Omit secret values; keep `authSecretRef` ids only when needed for remap hints.
2. Omit bearer tokens, API keys, and `Authorization` headers from any embedded trace blobs in definition exports (traces are not included in definition export by default).
3. Include endpoint `baseUrl` and model names so imports can remap on another machine.
4. Strip runtime-only fields (`lastRun`, in-memory artifact payloads) from definition exports.

```ts
interface PipelineExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'pipeline';
  pipeline: PipelineDefinition;
  includedCapsules?: CapsuleDefinition[];
}

interface CapsuleExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'capsule';
  capsule: CapsuleDefinition;
}
```

### Import behavior

On import:

1. Validate schema version.
2. Validate graph shape.
3. Validate node configs.
4. Validate Capsule interfaces.
5. Mark unresolved endpoints/models as missing.
6. Let the user remap missing model references.
7. Do not execute imported definitions automatically.

## 18. Suggested Tech Stack

### Frontend

1. Vue 3.
2. TypeScript.
3. Vite.
4. Pinia for application state management.
5. Vue Flow or equivalent node editor when the topology overview is added.
6. CodeMirror for prompt/template editing.
7. IndexedDB wrapper such as Dexie or a small internal storage abstraction.

### Browser runtime

1. TypeScript runtime packages.
2. Node.js 24+ for development tooling, tests, and local build scripts.
3. Web Workers for long pipeline runs later.
4. Fetch API for endpoint calls.
5. Web Streams where endpoint streaming is supported.
6. IndexedDB for durable browser-local state.

### Testing

The first validation command must always be:

```sh
eslint .
```

The user will provide the project `eslint.config.js`. Lorca should not generate or own the ESLint policy unless explicitly requested.

Recommended validation order:

```sh
eslint .
npm run build
npm test
```

1. Vitest for unit tests.
2. `@vue/test-utils` for Vue component tests.
3. MSW for browser `fetch()` mocking in tests.
4. `fake-indexeddb` for IndexedDB tests.
5. Playwright for UI smoke tests.
6. Fake browser-accessible endpoint server for deterministic model-call tests.
7. Snapshot tests for prompt rendering.
8. Capsule interface and versioning tests.

## 19. Implementation Phases

Phases 1–11 deliver **Core MVP**. Phases 12–13 deliver **MVP+** (§3).

Optional consolidation: until reuse is proven, `apps/web` may depend on `packages/core`, `packages/pipeline`, and `packages/endpoints` only; extract `prompt`, `capsules`, and `ui-kit` when imports cross-cut.

### Phase 1 — Scaffold and shared types

Deliverables:

1. npm workspace monorepo scaffold
2. Node.js 24+ development/tooling baseline.
3. Vue 3 + TypeScript + Vite web app scaffold.
4. Shared TypeScript config.
5. Core result/error types.
6. Pipeline schema types.
7. Capsule schema types.
8. Basic test setup with Vitest, `@vue/test-utils`, MSW, and `fake-indexeddb`.
9. Project scripts that run `eslint .` before build/test validation.
10. Pinia store scaffold for endpoints, models, pipelines, Capsules, active run state, and UI state.

Acceptance criteria:

1. `eslint .` passes.
2. `npm run build` passes.
3. `npm test` passes with core schema tests.
4. Pipeline schema validates a minimal input-to-output pipeline.
5. Capsule schema validates a minimal preprocess-model-postprocess Capsule.
6. Capsule interface subtype schemas validate input ports, output ports, parameters, and model slots.
7. Endpoint config schema validates `authKind` and optional `authSecretRef`.
8. `PipelineError`, `PipelineErrorCode`, and `CapsuleTestRunSummary` types are defined and used by trace/test schemas.

### Phase 2 — Browser endpoint registry

Deliverables:

1. Endpoint CRUD UI.
2. Browser endpoint test logic.
3. Browser-compatible Ollama adapter skeleton.
4. Manual model definition flow.
5. Endpoint access status reporting.

Acceptance criteria:

1. User can add `http://localhost:11434` as an endpoint.
2. User can test browser access to the endpoint.
3. CORS-blocked endpoints show a clear browser-access error.
4. User can manually define a model when discovery is unavailable.
5. Endpoint config persists across app reloads.

### Phase 3 — Model discovery and bucketing

Deliverables:

1. Browser-compatible model discovery where allowed.
2. Model inventory storage.
3. Advisory model bucket assignment.
4. UI for viewing and overriding buckets.

Acceptance criteria:

1. Lorca lists models from a reachable browser-accessible endpoint.
2. Each discovered or manually defined model receives at least one bucket.
3. User can change bucket assignments.
4. Bucket overrides persist.
5. Missing/unreachable endpoints do not crash the app.

### Phase 4 — Prompt envelope and prompt wrapper steps

Deliverables:

1. User prompt input panel.
2. Base `<user_prompt>` renderer.
3. Prompt wrapper node.
4. Rendered prompt preview.
5. Prompt escaping tests.

Acceptance criteria:

1. Raw user text is preserved.
2. Rendered prompt wraps user text in `<user_prompt>`.
3. Special characters are escaped in the rendered envelope.
4. User can add at least one wrapper step.
5. The preview updates when the prompt or wrapper changes.

### Phase 5 — Pipeline graph runtime

Deliverables:

1. Pipeline graph validator.
2. Dependency execution order.
3. Artifact store.
4. Trace event generation.
5. `outputRef` resolution.
6. Abort/cancel propagation through `PipelineRunContext.abortSignal`.

Acceptance criteria:

1. Runtime rejects cycles.
2. Runtime rejects duplicate artifact keys.
3. Runtime rejects missing artifact references.
4. Runtime executes a valid linear chain.
5. Runtime stores every intermediate artifact.
6. Runtime returns a final output artifact through `outputRef`.
7. Runtime emits trace events for every node.
8. Runtime can cancel a run and stop pending browser fetches through `AbortSignal`.
9. Cancelled run marks the active node `cancelled` with `run_cancelled`; downstream nodes are `skipped`.

### Phase 6 — Model call node and shared chain editor

Deliverables:

1. Browser-executed model call node.
2. Ollama generate/chat execution where browser access permits it (§12 adapter contract).
3. Request/response trace capture.
4. Model-call error handling and timeout via `AbortSignal`.
5. Output artifact creation.
6. **Shared chain editor surface:** add, remove, and reorder steps in an ordered chain; generates edges automatically per §16 chain invariants. This surface is reused by both the pipeline editor (Phase 11) and the Capsule editor (Phase 8).
7. Vertical-slice UI using the shared chain editor: prompt input → single `ModelCallNode` → output + trace.

Acceptance criteria:

1. User can select endpoint and model for a model-call step.
2. Model-call step receives an input artifact.
3. Model-call step writes a text output artifact.
4. Failed model calls produce structured errors.
5. Final output can be a model response.
6. User can run prompt → model call → output in the browser without Capsules (vertical slice).
7. Steps can be added, removed, and reordered; edges regenerate correctly after each change.

### Phase 7 — Template and JSON extraction nodes

Deliverables:

1. Template node with artifact references and parameter placeholders (§15).
2. JSON extraction node.
3. Parse failure visibility.
4. Tests for artifact reference rendering and `{{param.*}}` substitution.

Acceptance criteria:

1. User can reference previous artifacts in a template.
2. User can reference Capsule parameters via `{{param.name}}` in templates inside a Capsule.
3. Template node fails clearly on unresolved artifact or parameter references.
4. JSON extraction succeeds for strict JSON.
5. JSON extraction succeeds for fenced JSON.
6. JSON extraction failure does not produce fake parsed output.

### Phase 8 — Capsule draft editor

Deliverables:

1. Capsule definition model.
2. Capsule editor UI — reuses the shared chain editor surface from Phase 6 within the same three-pane shell.
3. Capsule public input/output declaration.
4. Capsule parameter declaration.
5. Capsule model slot declaration and `modelRef: { kind: 'slot' }` resolution.
6. Capsule test-run flow.

Acceptance criteria:

1. User can create a draft Capsule.
2. User can build a Capsule with preprocess, model call, and postprocess steps using the shared chain editor.
3. User can declare public inputs, outputs, parameters, and model slots.
4. A `ModelCallNode` inside a Capsule can reference a model slot via `modelRef: { kind: 'slot', slotName }`.
5. User can test-run the Capsule independently.
6. Capsule test runs produce artifacts and traces.

### Phase 9 — Capsule locking and reuse

Deliverables:

1. Capsule lock/version behavior.
2. Capsule library.
3. Capsule instance node.
4. Capsule input/output binding UI.
5. Capsule instance trace expansion.

Acceptance criteria:

1. User can lock a valid Capsule.
2. Locked Capsule internals are read-only by default.
3. User can insert a locked Capsule into a pipeline.
4. User can insert the same Capsule more than once.
5. Each Capsule instance has independent bindings and trace output.
6. Editing a locked Capsule creates a new draft/version instead of mutating the locked version.

### Phase 10 — Capsule fixed-count loops

Deliverables:

1. Loop config on Capsule instances.
2. Fixed-count loop execution.
3. Iteration artifact key naming.
4. Iteration trace display.
5. Loop count validation.

Acceptance criteria:

1. User can configure a Capsule instance to run X times.
2. X must be finite and under the configured maximum.
3. Each iteration receives the prior iteration output when configured.
4. Each iteration produces inspectable artifacts.
5. Failed iteration stops the loop with a clear error.
6. Final Capsule output resolves to the last successful iteration output.

### Phase 11 — End-to-end MVP UI and persistence

Deliverables:

1. Main three-pane layout.
2. Ordered pipeline chain editor (§16 chain invariants).
3. Capsule library panel.
4. Node inspector.
5. Execute button and run cancellation control.
6. Output panel.
7. Trace panel.
8. Save pipeline and Capsule definitions to IndexedDB.
9. Load saved pipeline and Capsule definitions on app start.
10. Playwright smoke test harness (covers §22 UI smoke list through execute, inspect trace, save, and reload).

Acceptance criteria:

1. User can build a pipeline without editing JSON manually.
2. User can execute the pipeline from the UI.
3. User can inspect intermediate artifacts.
4. User can inspect rendered prompts before execution.
5. User can inspect Capsule instance traces.
6. User can see final output clearly.
7. User can diagnose endpoint/model/node/Capsule failures from the UI.
8. Saved pipelines and Capsules survive a browser refresh (IndexedDB).

### Phase 12 — Import/export (MVP+)

Deliverables:

1. Export pipeline JSON.
2. Export Capsule JSON.
3. Import pipeline JSON.
4. Import Capsule JSON.
5. Model remap flow for missing endpoints/models on import.

Acceptance criteria:

1. Exported pipeline can be imported into a fresh Lorca instance.
2. Exported Capsule can be imported into a fresh Lorca instance.
3. Invalid import files are rejected with clear errors.
4. Imported definitions do not execute automatically.
5. Missing model references are visible and remappable.
6. Playwright smoke tests cover export and import (§22 items 12–13).

### Phase 13 — Example Capsules (MVP+)

Deliverables:

Create built-in example Capsules that users can duplicate and modify:

1. Intent extraction.
2. Acceptance criteria generation.
3. Candidate answer generation.
4. Candidate answer verification.
5. Summary generation.
6. Prompt rewrite.
7. Constraint extraction.
8. Drift check.

Acceptance criteria:

1. Examples are normal Capsules, not special runtime paths.
2. User can insert an example Capsule into a pipeline.
3. User can edit a duplicated example Capsule.
4. Examples use artifact references instead of hidden state.
5. Examples are covered by snapshot tests for rendered prompts.

## 20. MVP Example Pipeline

### Goal

Use a tiny model to extract acceptance criteria, then use a larger model to answer, then use a reusable verifier Capsule to verify the answer against the criteria.

### Pipeline

```text
InputNode
  -> CapsuleInstanceNode: Acceptance Criteria Generator v1
  -> TemplateNode: build answer prompt using user prompt + criteria
  -> ModelCallNode: thinking/general model emits candidate answer
  -> CapsuleInstanceNode: Verifier v1 (instance prefix `verifier`)
  -> outputRef: { nodeId: <verifier-node>, outputName: verification_result.json }
```

Default `outputRef` resolves to artifact key `verifier.verification_result.json` (pass/fail JSON in the output panel). The user may change `outputRef` to the answer `ModelCallNode` (e.g. `outputName: text` → `candidate_answer.text`) in the inspector.

### Example looped Capsule

```text
InputNode
  -> ModelCallNode: draft answer
  -> CapsuleInstanceNode: Refiner v2, loop count = 3
  -> outputRef: { nodeId: <refiner-instance>, outputName: output_text }
     (resolves to `refiner.final.output_text` per §15 looped Capsule rule)
```

### Artifacts

```text
user_prompt.raw
user_prompt.xml
acceptance_criteria.raw
acceptance_criteria.json
answer_prompt.text
candidate_answer.text
verifier.verification_result.json
refiner.iteration_1.output_text
refiner.iteration_2.output_text
refiner.iteration_3.output_text
refiner.final.output_text
```

The output panel displays the artifact derived from `outputRef` (for this pipeline, `verifier.verification_result.json`). There is no separate `final_output.text` producer node.

## 21. Error Handling Requirements

All user-visible failures should include:

1. What failed.
2. Which node or Capsule instance failed.
3. Which loop iteration failed, if relevant.
4. Why it failed.
5. Whether execution stopped.
6. What the user can edit to fix it.

Error shape and codes are defined in §14 (`PipelineError`, `PipelineErrorCode`). User-visible messages must populate all fields on that type where applicable.

## 22. Testing Plan

### Unit tests

1. Prompt escaping.
2. Tag validation.
3. Pipeline graph validation.
4. Capsule graph validation.
5. Capsule interface validation.
6. Capsule lock/version behavior.
7. Capsule loop expansion.
8. Artifact reference resolution.
9. Template rendering.
10. JSON extraction.
11. Model bucket heuristic.
12. Import/export validation.
13. Artifact namespacing and duplicate-key rejection.
14. Capsule version numeric comparison (`v10` > `v9`).
15. Template reference resolution and missing-key failure.
16. `outputRef` → artifact key resolution (including `InputNode` global keys).
17. `PipelineError` / `CapsuleTestRunSummary` serialization in schema tests.

### Integration tests

1. Fake browser-accessible endpoint returns model list.
2. Fake browser-blocked endpoint produces endpoint-access error.
3. Fake model call returns deterministic text.
4. Full pipeline run produces expected artifact chain.
5. Capsule instance produces expected artifacts.
6. Same Capsule inserted twice produces independent prefixed artifacts.
7. Looped Capsule produces iteration artifacts.
8. Missing model blocks execution before calling endpoint.
9. Deterministic pipeline integration tests use MSW/fake endpoint (required from Phase 5 onward; no real LLM in CI).

### Validation gate

Every phase should use this command order before considering implementation complete:

```sh
eslint .
npm run build
npm test
```

### UI smoke tests

Run with Playwright. Phase 11 must cover items 1–11; Phase 12 must cover items 12–13.

1. Add endpoint.
2. Discover or manually define models.
3. Enter prompt.
4. Add wrapper step.
5. Add model-call step.
6. Create Capsule.
7. Lock Capsule.
8. Insert Capsule into pipeline.
9. Configure Capsule loop count.
10. Execute pipeline.
11. Inspect trace.
12. Save and reload pipeline.
13. Export and import Capsule.

## 23. Later Goals

### Optional backend bridge

Add only after the browser-first MVP is useful.

Capabilities:

1. Endpoint proxy for CORS-blocked local models.
2. Larger persistence.
3. Local filesystem access.
4. Secret management.
5. Backend-hosted streaming.
6. Optional LAN mode.

### MCP and tools

Add MCP only after the core pipeline and Capsule runtime are stable.

Required additions:

1. MCP server registry.
2. Tool/resource discovery.
3. Tool-call node.
4. Tool permission UI.
5. Tool-call trace records.
6. Per-run tool execution policy.
7. Capsule support for tool-call nodes.

### Visual topology overview

Add a graph overview for the current pipeline.

Capabilities:

1. Full graph view.
2. Collapse/expand Capsules.
3. Show loop boundaries.
4. Highlight latest-run path.
5. Highlight failed nodes.
6. Show artifact flow.
7. Show model assignments.
8. Show timing metadata.

### Advanced pipeline control flow

Add after MVP:

1. Branching.
2. Conditional nodes.
3. Retry nodes.
4. Loop nodes beyond Capsule-only loops.
5. Human approval nodes.
6. Parallel execution where graph dependencies allow it.

### Evaluation harness

Add a test harness for pipeline and Capsule quality:

1. Prompt fixtures.
2. Expected artifact assertions.
3. Model-call recording.
4. Replay mode.
5. Regression dashboard.
6. Score comparison across pipeline and Capsule versions.

### Shareable library

Add after import/export is stable:

1. Export single Capsule.
2. Export Capsule bundle.
3. Export full pipeline with included Capsules.
4. Convert/export a Pipeline as a Capsule for reuse inside another Pipeline.
5. Import with dependency review.
6. Import with model-slot remapping.
7. Optional signed/trusted Capsule metadata.
8. Optional public or private registry.

## 24. Smartazz-Derived Capsule Examples

Convert useful patterns into editable Capsules:

1. Intent extraction.
2. Context relevance extraction.
3. Constraint extraction.
4. Acceptance criteria generation.
5. Grounding check.
6. Answer verification.
7. Drift detection.
8. Summarization and compression.
9. Repair prompt generation.

These examples must remain normal Capsules. They should not require hardcoded runtime behavior.

## 25. Key Design Decisions

1. Browser-orchestrated MVP first.
2. Optional backend later.
3. Use a graph model internally from the beginning.
4. Present a mostly linear chain UI first.
5. Introduce Capsules as reusable, lockable mini pipelines.
6. Use locked Capsule versions for shareability and repeatability.
7. Let the same Capsule be inserted many times with independent bindings.
8. Support explicit fixed-count Capsule loops in the MVP.
9. Treat Pipeline and Capsule execution as the same graph runtime with different lifecycle boundaries.
10. Preserve a future Pipeline-to-Capsule conversion path.
11. Treat model buckets as advisory and user-editable.
12. Keep every intermediate result as an artifact.
13. Make prompt rendering visible before execution.
14. Make model request/response traces inspectable.
15. Do not hide repair, retry, loop, or verification behavior.
16. Keep examples editable instead of hardcoded.
17. Keep endpoint adapters isolated.
18. Keep MCP/tools out of the MVP runtime.
19. Namespace artifacts by producer prefix to allow duplicate Capsule instances.
20. Ship Core MVP before MVP+ export/import and example library.

## 26. Definition of Done

### Core MVP (Phases 1–11)

The Core MVP is complete when a user can:

1. Run Lorca in the browser.
2. Add a local AI endpoint.
3. Discover available models when browser access permits it.
4. Manually define models when discovery is unavailable.
5. Categorize or override model usage buckets.
6. Enter a target prompt.
7. Build a multi-step pipeline with prompt wrappers, templates, model calls, and Capsules.
8. Create a reusable Capsule.
9. Test a Capsule independently.
10. Lock a Capsule version.
11. Insert a locked Capsule into a pipeline.
12. Insert the same Capsule more than once.
13. Configure a Capsule instance to run a fixed number of iterations.
14. Execute the pipeline.
15. Inspect every intermediate artifact.
16. Inspect every rendered model prompt.
17. Inspect Capsule iteration artifacts.
18. Inspect execution trace and errors.
19. Save the pipeline and Capsules locally (IndexedDB).
20. Reload the pipeline and Capsules after a browser refresh.

### MVP+ (Phases 12–13)

MVP+ is complete when a user can also:

21. Export a pipeline as JSON.
22. Export a Capsule as JSON.
23. Import exported JSON into a fresh Lorca instance.
24. Duplicate and run at least one built-in example Capsule from the library.
