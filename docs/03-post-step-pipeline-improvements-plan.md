# Lorca — Post-Step-Pipeline Improvements Plan

This document captures every finding from a full codebase review conducted after the V1 step-chain
pipeline was completed.  Items are grouped by category and then ordered within each category by
impact.  Each item names the exact file(s), describes what is wrong, gives a concrete fix, and
states the acceptance criteria.

---

## Table of contents

1. [Quick wins](#1-quick-wins)
2. [Logic and correctness](#2-logic-and-correctness)
3. [UX and product gaps](#3-ux-and-product-gaps)
4. [Code style and hygiene](#4-code-style-and-hygiene)
5. [Architecture](#5-architecture)
6. [Documentation](#6-documentation)
7. [Implementation order](#7-implementation-order)
8. [Definition of done](#8-definition-of-done)

---

## 1. Quick wins

These items touch one or two lines each.  Do them first to clear noise before deeper work.

---

### QW-1 — Remove dead `currentDef` ref from `App.vue`

**File:** `apps/web/src/App.vue`  
**Lines:** 111, 121, 126

**Problem:**  
`currentDef` is assigned in `onUpdateDef` and cleared in `onNewPipeline`, but nothing in the
component ever reads it.  It was left over from an earlier design where the right pane needed a
live snapshot of the editor state separate from the store.  Today both the store and the center
pane emit updates directly.

**Fix:**
1. Delete the declaration `const currentDef = ref<PipelineDefinition | null>(null)` and its import
   of `PipelineDefinition` if that type is no longer used elsewhere in the file.
2. Remove the line `currentDef.value = def` inside `onUpdateDef`.
3. Remove the line `currentDef.value = null` inside `onNewPipeline`.

**Acceptance criteria:**  
`grep currentDef apps/web/src/App.vue` returns nothing.  `npm run build` passes.

---

### QW-2 — Deduplicate `newId` in `pipelines.ts`

**Files:** `apps/web/src/stores/pipelines.ts` (lines 9–13),
`apps/web/src/utils/id.ts` (line 1)

**Problem:**  
`pipelines.ts` declares its own `newId(prefix)` function that is byte-for-byte identical to the
utility exported from `apps/web/src/utils/id.ts`.  A third copy also exists inline in
`pipelineEditor.ts`.  Having multiple copies means they can drift and makes the counter semantics
unclear (each file gets its own counter `_counter`).

**Fix:**
1. In `pipelines.ts` remove the local `let _counter` declaration and the local `newId` function.
2. Add `import {newId} from '../utils/id.js';` to `pipelines.ts`.
3. Verify `pipelineEditor.ts` also uses the shared utility; if it has its own copy, apply the same
   removal there.

**Acceptance criteria:**  
Only one definition of `newId` exists in the web app tree.  `npm test` passes.

---

### QW-3 — Move late `import {watch}` to the top of `RightPane.vue`

**File:** `apps/web/src/components/RightPane.vue`  
**Line:** 122

**Problem:**  
`watch` is imported after all the computed declarations and component logic.  ESLint, IDEs, and
human readers expect all imports at the top of `<script setup>`.  The late import can mask "used
before import" issues in future edits.

**Fix:**  
Add `watch` to the existing Vue destructure at the top of the script:

```ts
// Before (line 1):
import {computed} from 'vue';

// After:
import {computed, watch} from 'vue';
```

Delete the `import {watch} from 'vue';` at line 122.

**Acceptance criteria:**  
`npm run lint` passes with no import-order warnings on `RightPane.vue`.

---

### QW-4 — Add Cmd/Ctrl+Enter shortcut for Execute Pipeline

**File:** `apps/web/src/components/pipeline/CenterPane.vue`  
**Lines:** 114–122 (`onKeyDown`)

**Problem:**  
The existing `onKeyDown` handler wires Cmd+Z and Cmd+Y/Cmd+Shift+Z for undo/redo but does not
handle Cmd+Enter to run the pipeline.  Execute Pipeline is the single most-frequent user action;
a keyboard shortcut is a first-class workflow necessity.

**Fix:**  
Extend `onKeyDown`:

```ts
const onKeyDown = (e: KeyboardEvent) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (editorStore.canUndo) editorStore.undo();
  } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
    e.preventDefault();
    if (editorStore.canRedo) editorStore.redo();
  } else if (e.key === 'Enter') {
    // Cmd/Ctrl+Enter — run pipeline (or cancel if running)
    e.preventDefault();
    if (runStore.isRunning) {
      runStore.cancel();
    } else if (canRun.value) {
      handleRun();
    }
  }
};
```

Update the run button `title` tooltip to mention the shortcut:
```
title="Run the entire pipeline — ⌘↵"
```

**Acceptance criteria:**  
Pressing Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux) while the pipeline editor is focused
triggers the run.  Pressing it again while running cancels.  The run button tooltip shows the
shortcut.

---

### QW-5 — Add copy-to-clipboard button to `OutputPanel`

**File:** `apps/web/src/components/pipeline/OutputPanel.vue`

**Problem:**  
The output panel displays the final pipeline artifact but provides no way to copy it to the
clipboard.  Users must manually select all text in a `<pre>` block.  This is the primary way the
tool's output is consumed.

**Fix:**  
Add a copy button in the output header, next to the artifact key chip:

```vue
<template>
  <div class="output-header">
    <span class="output-state-label" :class="outputStale ? 'stale' : 'current'">
      {{ outputStale ? 'Last run output (stale)' : 'Current output' }}
    </span>
    <span v-if="outputKey" class="output-key">{{ outputKey }}</span>
    <button
      class="btn-copy"
      type="button"
      :title="copied ? 'Copied!' : 'Copy output to clipboard'"
      @click="copyOutput"
    >{{ copied ? '✓' : 'Copy' }}</button>
  </div>
</template>
```

Script addition:

```ts
import {computed, ref} from 'vue';

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyOutput() {
  if (!displayValue.value) return;
  await navigator.clipboard.writeText(displayValue.value);
  copied.value = true;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => { copied.value = false; }, 1800);
}
```

Style:
```css
.btn-copy {
  margin-left: auto;
  font-size: 0.65rem;
  padding: 2px 8px;
  background: #1a2a1a;
  border: 1px solid #2a4d2a;
  color: #6db86d;
  border-radius: 3px;
  cursor: pointer;
}
.btn-copy:hover { background: #1e381e; color: #8dda8d; }
```

**Acceptance criteria:**  
Clicking "Copy" writes `displayValue` to the clipboard.  The button briefly shows "✓" then reverts.
The button is only rendered when `output` is non-null.

---

## 2. Logic and correctness

---

### LC-1 — Remove or wire the dead `followRunLive` ref in `CenterPane.vue`

**File:** `apps/web/src/components/pipeline/CenterPane.vue`  
**Lines:** 105, 294

**Problem:**  
`followRunLive` is declared as `ref(true)` and the live-follow watcher guards on it, but there is
no code path that ever sets it to `false`.  The guard is therefore a no-op that misleads readers
into thinking a toggle exists.

**Two options — choose one:**

**Option A (wire it):**  
Add a toggle checkbox or icon button to the run-controls bar:

```vue
<label class="follow-run-label" title="Auto-scroll step selection to the running step">
  <input type="checkbox" v-model="followRunLive" />
  Follow
</label>
```

Style to match the compact toolbar.  This gives users a way to pin their step selection while a run
is in progress.

**Option B (remove it):**  
Delete the `const followRunLive = ref(true)` declaration.  In the watcher, remove the
`!followRunLive.value` guard, leaving only the `!runStore.isRunning` guard.

Option A is recommended — auto-follow is useful but power users may want to inspect an earlier step
mid-run.

**Acceptance criteria (Option A):**  
Unchecking "Follow" freezes step selection during a run.  Re-checking resumes follow.  State
persists for the lifetime of the page session (no need to persist across reloads).

---

### LC-2 — Extract `useStepStaleStateMap` composable

**Files:**  
- `apps/web/src/components/pipeline/CenterPane.vue` lines 169–175  
- `apps/web/src/components/RightPane.vue` lines 107–114  
- `apps/web/src/components/capsule/CapsuleCenterPane.vue` lines 175–181  
- `apps/web/src/components/inspector/StepInspector.vue`
- New: `apps/web/src/composables/useStepStaleStateMap.ts`

**Problem:**  
`computeStepStaleStates` is called independently in four places, each computing the full state
array from the same reactive inputs (pipeline, snapshots, userPrompt, capsule resolver).  Every
reactive change to any input can trigger redundant computations.  The call sites also encode
slightly different prompt-source assumptions, which makes it easy to regress live prompt staleness.

**Critical constraint — live prompt vs. committed prompt:**  
`CenterPane.vue` passes `userPrompt.value` (the local ref, uncommitted until blur) to
`computeStepStaleStates` at line 172.  `pipeline.value.input.raw` is only updated on textarea blur,
so it lags typed-but-unblurred text.  Moving the computation into the store and sourcing
`pipeline.value.input.raw` directly would make stale indicators lag behind the user's current
typing.  The live prompt **must** flow into the computation, which means a store-level computed
cannot own this call — it doesn't have access to the uncommitted textarea value.

**Fix — composable with live prompt parameter (not store computed):**  
Create a `useStepStaleStateMap` composable that accepts the live prompt as a
`MaybeRefOrGetter<string>`:

```ts
// apps/web/src/composables/useStepStaleStateMap.ts
import {computed, toValue} from 'vue';
import type {MaybeRefOrGetter} from 'vue';
import {computeStepStaleStates} from '@lorca/pipeline';
import type {StepStaleState} from '@lorca/pipeline';
import {useActiveRunStore} from '../stores/activeRun.js';
import {useCapsuleRunStore} from '../stores/capsuleRun.js';
import {useCapsulesStore} from '../stores/capsules.js';
import {useCapsuleStepEditorStore} from '../stores/capsuleStepEditor.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useUiStore} from '../stores/ui.js';

export function useStepStaleStateMap(
  livePrompt: MaybeRefOrGetter<string>,
): {
  map: ReturnType<typeof computed<Record<string, StepStaleState>>>;
  stateFor: (stepId: string) => StepStaleState | null;
} {
  const ui = useUiStore();
  const capsulesStore = useCapsulesStore();
  const pipelineEditorStore = usePipelineEditorStore();
  const capsuleEditorStore = useCapsuleStepEditorStore();
  const pipelineRunStore = useActiveRunStore();
  const capsuleRunStore = useCapsuleRunStore();

  const map = computed((): Record<string, StepStaleState> => {
    const editor = ui.editorContext === 'capsule' ? capsuleEditorStore : pipelineEditorStore;
    const runStore = ui.editorContext === 'capsule' ? capsuleRunStore : pipelineRunStore;
    const states = computeStepStaleStates(
      editor.pipeline,
      runStore.runSnapshotContext,
      toValue(livePrompt),
      (id, version) => capsulesStore.getCapsule(id, version),
    );
    return Object.fromEntries(states.map((s) => [s.stepId, s]));
  });

  function stateFor(stepId: string): StepStaleState | null {
    return map.value[stepId] ?? null;
  }

  return {map, stateFor};
}
```

**Usage in `CenterPane.vue` (replaces the local `stepStates` computed):**
```ts
const {map: stepStates} = useStepStaleStateMap(userPrompt);
```

The `userPrompt` ref is already defined in `CenterPane` as a local `ref<string>`.  Because it is
passed as a `MaybeRefOrGetter`, the composable's computed re-runs whenever `userPrompt` changes —
stale indicators update on every keystroke, not just on blur.

**Usage in `RightPane.vue` and `StepInspector.vue`:**  
These components do not own the live prompt ref.  They should source it from
`editorStore.pipeline.input.raw` (committed value) via the composable:
```ts
const {stateFor} = useStepStaleStateMap(() => editorStore.pipeline.input.raw);
```
This matches the behaviour they have today (both read the committed value).

**Usage in `CapsuleCenterPane.vue`:**  
The capsule editor has its own local `userPrompt` ref; pass it the same way as `CenterPane`.

**Context-switch note:**  
Do not use `useActiveStepEditor()` inside this composable.  It reads `ui.editorContext` at call time
and is not reactive to later mode changes.  Instead, instantiate both editor stores once and choose
between them inside the `map` computed, as shown above.  That keeps stale-state reads correct across
pipeline↔capsule context switches.

**Acceptance criteria:**  
Stale indicators update immediately while typing in the prompt textarea (before blur).  The
behaviour in `RightPane` and `StepInspector` is unchanged.  All UI call sites use
`useStepStaleStateMap` rather than calling `computeStepStaleStates` directly.  `npm test` passes.

---

### LC-3 — Ensure Export saves pending prompt edits first

**File:** `apps/web/src/components/pipeline/CenterPane.vue`  
**Function:** `handleExport` (line ~320)

**Problem:**  
The user prompt is bound to `userPrompt` (local ref) and is only committed to the store/pipeline on
`blur` of the textarea.  `handleExport` calls `importStore.exportCurrentPipeline(editorStore.pipeline)`
directly without committing the in-flight value.  If the user types a new prompt and immediately
clicks Export without leaving the textarea, the exported file captures the *previous* prompt.

**Fix:**  
Commit before exporting:

```ts
function handleExport() {
  // Flush any in-progress prompt edit before capturing the definition.
  editorStore.updateUserPrompt(userPrompt.value.trim());
  importStore.exportCurrentPipeline(editorStore.pipeline);
}
```

`editorStore.updateUserPrompt` already exists for this purpose.

**Acceptance criteria:**  
Typing a new prompt → immediately clicking Export → re-importing the file produces a pipeline whose
`input.raw` matches what was typed.

---

### LC-4 — Guard against missing model on new default pipeline step

**Files:**  
- `apps/web/src/stores/pipelines.ts` (`createDefaultPipeline`, line 15)
- `apps/web/src/components/pipeline/ChainEditor.vue` (step row rendering)

**Problem:**  
`createDefaultPipeline` inserts a model-call step with `endpointId: ''` and `modelName: ''`.  The
only signal to the user that this is unconfigured is that the "Execute Pipeline" button is disabled.
There is no in-chain indicator on the step row itself until the user selects the step and looks at
the Inspector.

**Fix — two parts:**

*Part 1 — Chain row warning badge.*  
In `ChainEditor.vue`, compute a `hasModelConfigError` boolean per step:

```ts
function stepHasModelError(step: PipelineStep): boolean {
  if (step.type !== 'model-call' || step.config.type !== 'model-call') return false;
  const ref = step.config.modelRef;
  return ref.kind === 'fixed' && (!ref.endpointId || !ref.modelName);
}
```

Render a small warning badge in the step row header when this returns true:

```vue
<span v-if="stepHasModelError(step)" class="step-badge step-badge-warn" title="No model selected">
  no model
</span>
```

*Part 2 — Auto-assign on load.*  
In `createDefaultPipeline`, the step is created before any models are known.  After models load in
`LeftPane.vue` `onMounted`, call `autoAssignModelToStep` on the active pipeline's steps if any have
an empty model ref.  Wire this through a `pipelinesStore.autoAssignModels(models)` action that
iterates enabled model-call steps and fills in the first available model.

**Acceptance criteria:**  
A new pipeline's model-call step shows a "no model" badge until a model is assigned.  After models
are discovered, the badge disappears if auto-assignment succeeds.

---

## 3. UX and product gaps

---

### UX-1 — Pipeline switcher (multi-pipeline UI)

**Files:**  
- `apps/web/src/stores/pipelines.ts` (store already supports multiple pipelines)
- `apps/web/src/components/pipeline/CenterPane.vue` (toolbar)
- `apps/web/src/components/LeftPane.vue` (optional — alternative placement)

**Problem:**  
The `pipelines` store holds an array, exposes `addPipeline`, `removePipeline`, `setActive`, and
`updatePipeline`, but the UI surfaces none of these.  Clicking "New" calls `resetActivePipeline`
which *replaces the active pipeline in-place* rather than creating a second one.  A user with more
than one pipeline in IndexedDB (e.g. from a previous session) has no way to switch.

**Fix:**  
Add a pipeline selector to the center toolbar, between the "New" button and the name input.

**Toolbar layout (after):**
```
[ New ] [ ▾ Pipeline name ▾ ] [ Extract to Capsule ] [ Convert ] [ Export ] [ Import ] [ Execute ]
```

The pipeline name input becomes a custom dropdown when multiple pipelines exist, and stays a plain
text input when only one exists.

**Component contract — important constraints:**

- A native `<select>` cannot host per-option delete buttons.  Use a **custom listbox** implemented
  as a `<div>` with `role="listbox"` / `role="option"` ARIA attributes, or a `<details>`/`<summary>`
  dropdown.  The listbox renders each pipeline name as a row with a `×` delete icon.
- `pipelineEditorKey` lives in `App.vue` at line 38 (it is the `:key` on `<CenterPane>`).
  `PipelineSelector` cannot increment it directly.  Instead, the selector emits events that
  `App.vue` handles:
  ```ts
  const emit = defineEmits<{
    select: [id: string];      // user chose a different pipeline
    delete: [id: string];      // user confirmed deletion of a pipeline
    'request-remount': [];     // parent should bump pipelineEditorKey
  }>();
  ```
  `App.vue` handles `@select` by calling `pipelinesStore.setActive(id)` and bumping
  `pipelineEditorKey`; handles `@delete` by calling `pipelinesStore.removePipeline(id)` then also
  bumping the key if the deleted pipeline was active.

Implementation steps:

1. **New pipeline action:** Change `handleNew` in `CenterPane.vue` to emit `new` (which it already
   does), and change `App.vue`'s `onNewPipeline` to call a new store action `addNewPipeline()`
   instead of `pipelinesStore.resetActivePipeline()`.  Keep the confirmation dialog via UX-2's
   `<ConfirmDialog>` (or the existing `window.confirm` until UX-2 lands).

2. **Store action `addNewPipeline`** in `pipelines.ts`:
   ```ts
   async function addNewPipeline(): Promise<PipelineDefinition> {
     const def = createDefaultPipeline();
     await save(def);
     activePipelineId.value = def.id;
     return def;
   }
   ```

3. **`PipelineSelector.vue`** (`apps/web/src/components/pipeline/PipelineSelector.vue`):
   - Renders a button showing the active pipeline name with a chevron.
   - On click, opens a dropdown panel listing all pipelines.
   - Each row has a click target for selection and a `×` icon-button for deletion.
   - Deletion requires a confirmation step (inline "Are you sure?" or UX-2's `<ConfirmDialog>`).
   - Hidden entirely when `pipelinesStore.pipelines.length <= 1`; `CenterPane` falls back to the
     plain text input.
   - Emits `select`, `delete`, and `request-remount` as defined above.
   - Closes the dropdown on outside click (`onClickOutside` pattern or a `<dialog>` anchor).

4. **`App.vue`** wires the events:
   ```ts
   function onPipelineSelect(id: string) {
     pipelinesStore.setActive(id);
     runStore.reset();
     pipelineEditorKey.value++;
   }
   function onPipelineDelete(id: string) {
     pipelinesStore.removePipeline(id);
     if (pipelinesStore.activePipelineId === null) {
       // Activate the next available, or create a default
       const first = pipelinesStore.pipelines[0];
       if (first) pipelinesStore.setActive(first.id);
       else void pipelinesStore.addNewPipeline();
     }
     runStore.reset();
     pipelineEditorKey.value++;
   }
   ```

5. **`LeftPane.vue` `onMounted`:** After `pipelinesStore.load()` resolves, check if multiple
   pipelines exist and expand a `pipelines` section if so.

**Acceptance criteria:**  
- Multiple pipelines survive a page reload and are all selectable.
- Switching pipelines resets the run store and reloads the editor with the selected definition.
- Deleting the active pipeline activates the next available one (or creates a fresh default).
- When only one pipeline exists the toolbar renders the plain text name input — no dropdown visible.
- `pipelineEditorKey` is only incremented from `App.vue`; `PipelineSelector` never touches it
  directly.

---

### UX-2 — Replace `window.prompt` / `window.confirm` / `window.alert` with inline UI

**File:** `apps/web/src/components/pipeline/CenterPane.vue`  
**Lines:** 190, 198, 202–204, 210, 220, 225–226, 228, 341–342

**Problem:**  
Six flows across two files use browser-native modal dialogs:

`apps/web/src/components/pipeline/CenterPane.vue`:
- Naming a new Capsule (`window.prompt`)  
- Confirming extraction to Capsule (`window.confirm`)  
- Confirming full-pipeline conversion to Capsule (`window.confirm`)  
- Error feedback for those flows (`window.alert`)  
- Confirming "New Pipeline" (`window.confirm`)

`apps/web/src/composables/useSuggestionInsert.ts` line 66:
- Confirming "Replace current pipeline with suggestion" (`window.confirm`)  

Browser dialogs block the event loop, cannot be styled, pause all animations, and are rejected by
some enterprise browser policies.  They are visually inconsistent with the dark-themed UI.

**Fix:**  
Build a minimal `<ConfirmDialog>` and `<PromptDialog>` (or a single `<InlineModal>`) in
`apps/web/src/components/common/` and replace all six flows.

**`ConfirmDialog.vue` contract:**
```ts
const props = defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;   // default "OK"
  destructive?: boolean;   // red confirm button
}>();
const emit = defineEmits<{confirm: []; cancel: []}>();
```

**`PromptDialog.vue` contract:**
```ts
const props = defineProps<{
  open: boolean;
  title: string;
  label: string;
  defaultValue?: string;
  confirmLabel?: string;
}>();
const emit = defineEmits<{confirm: [value: string]; cancel: []}>();
```

Use Vue's `<Teleport to="body">` to mount dialogs outside the pane stack so they are never
clipped.  Style to match the existing dark palette (`background: #141414`, `border: 1px solid
#2a2a2a`, etc.).

**Refactor checklist:**

| File | Current call | Replace with |
|---|---|---|
| `CenterPane.vue` | `window.prompt('Capsule name', …)` | `<PromptDialog>` with `title="Name this Capsule"` |
| `CenterPane.vue` | `window.confirm('Replace N selected step(s)…')` | `<ConfirmDialog destructive>` |
| `CenterPane.vue` | `window.confirm('Replace all N step(s)…')` | `<ConfirmDialog destructive>` |
| `CenterPane.vue` | `window.alert('Select steps…')` | Inline validation hint below the chain header |
| `CenterPane.vue` | `window.alert(result.message)` | Inline error banner (`<ImportErrorBanner>` pattern) |
| `CenterPane.vue` | `window.confirm('Start a new pipeline?…')` | `<ConfirmDialog destructive>` |
| `useSuggestionInsert.ts` | `window.confirm('Replace the current pipeline…')` | Callback prop `onConfirmReplace?: () => Promise<boolean>`, defaulting to a `<ConfirmDialog>` in `LeftPane.vue` where the Insert buttons live |

The `useSuggestionInsert` case is slightly different: the composable has no template context of its
own.  The cleanest fix is to have `insertSuggestion` accept an optional async `confirmReplace`
callback; the call site in `LeftPane.vue` passes a function that opens a `<ConfirmDialog>` and
returns a Promise resolving to the user's choice:

```ts
// useSuggestionInsert.ts — changed signature
function insertSuggestion(
  suggestion: PipelineSuggestion,
  mode: SuggestionInsertMode,
  options?: {index?: number; confirmReplace?: () => Promise<boolean>},
): Promise<boolean>
```

Default: if `confirmReplace` is not supplied, the existing `window.confirm` is used as a temporary
fallback to avoid breaking callers during migration.

Convert each handler from synchronous to `async` where needed; use a local `ref<boolean>` to
control dialog visibility and `await` a Promise that resolves/rejects on confirm/cancel.

**Acceptance criteria:**  
`grep -rn "window\.prompt\|window\.alert\|window\.confirm" apps/web/src/` returns no results.
All six flows function identically to today but rendered in styled Vue components.

---

### UX-3 — Persist pane widths across reloads

**File:** `apps/web/src/stores/ui.ts`

**Problem:**  
`leftPaneWidth` and `rightPaneWidth` reset to defaults (280 and 360) on every page reload.  A user
who widens the left pane to see long capsule names has to do it again on each session.

**Fix:**  
On store mount, read persisted widths from `localStorage`.  Write on every change.

```ts
const STORAGE_KEY = 'lorca:ui:paneSizes';

function readPersistedSizes(): {left: number; right: number} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {left: 280, right: 360};
    const parsed = JSON.parse(raw);
    return {
      left: typeof parsed.left === 'number' ? parsed.left : 280,
      right: typeof parsed.right === 'number' ? parsed.right : 360,
    };
  } catch {
    return {left: 280, right: 360};
  }
}

// At declaration time:
const sizes = readPersistedSizes();
const leftPaneWidth = ref(sizes.left);
const rightPaneWidth = ref(sizes.right);

// Add a watcher to persist on change (debounced to avoid thrashing during drag):
let persistTimer: ReturnType<typeof setTimeout> | null = null;
watch([leftPaneWidth, rightPaneWidth], ([l, r]) => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({left: l, right: r}));
  }, 250);
});
```

**Acceptance criteria:**  
Dragging the pane handle, reloading the page, and observing the panes start at the saved widths.
Invalid or missing `localStorage` data gracefully falls back to defaults.

---

### UX-4 — De-crowd the center toolbar

**File:** `apps/web/src/components/pipeline/CenterPane.vue`  
**Current state:** New · [name input] · Extract to Capsule · Convert to Capsule · Export · Import · Execute Pipeline · Cancel

**Problem:**  
Seven controls in one row cause wrapping at narrow viewports and make all buttons equally prominent,
hiding the relative importance of "Execute Pipeline."

**Fix:**  
Group secondary actions behind an overflow menu.

```
[ New ] [ pipeline selector / name ] ·············· [⋯ More ▾] [ ⌘↵ Execute Pipeline ] [ Cancel ]
```

The "More" dropdown contains: Extract to Capsule, Convert to Capsule, Export, Import.

Implement as a `<details>`/`<summary>` dropdown or a minimal Vue `v-show` popover anchored to the
button.  Use the existing `.btn-secondary` style for the dropdown items.

**Toolbar priority order (left → right):**
1. New (create context)
2. Pipeline name / selector (identity)
3. More (secondary actions — overflow)
4. Execute Pipeline (primary action — always visible, colored)
5. Cancel (only visible while running)

**Acceptance criteria:**  
All existing actions remain accessible.  On a 1280-wide viewport the toolbar does not wrap.
"Execute Pipeline" remains the visually dominant button.

---

### UX-5 — Add model-bucket color coding to the Capsule status badge

**File:** `apps/web/src/components/LeftPane.vue`  
**Lines:** capsule row rendering (`.capsule-row-meta`)

**Problem:**  
Capsule status (`draft` / `locked`) is shown as plain grey text.  `locked` Capsules are read-only;
users editing one must first duplicate it.  The visual difference is not obvious.

**Fix:**  
Add a CSS class per status:

```vue
<span class="capsule-row-meta">
  {{ cap.version }} ·
  <span class="capsule-status" :class="`cs-${cap.status}`">{{ cap.status }}</span>
</span>
```

```css
.capsule-status { font-size: 0.62rem; padding: 0 3px; border-radius: 2px; }
.cs-draft  { color: #c8a050; }
.cs-locked { color: #7ec8e3; background: #1a2a3a; border: 1px solid #2a4a6a; }
```

**Acceptance criteria:**  
Locked capsules show a blue chip; draft capsules show amber text.  The change is purely
presentational with no logic changes.

---

## 4. Code style and hygiene

---

### CS-1 — Decouple `paletteQuery` in `LeftPane.vue`

**File:** `apps/web/src/components/LeftPane.vue`

**Problem:**  
Both "Step Types" and "Step Suggestions" sections share the single `paletteQuery` ref.  The
suggestion section suppresses its own search input via `v-if="!isExpanded('stepTypes')"`, creating
a hidden coupling: if "Step Types" is also open, filtering step types also silently filters
suggestions.  The guard is a fragile workaround.

**Scope of this item:**  
CS-1 fixes the *filter coupling* only.  `leftPaneExpandedSection` in `ui.ts` is a
`LeftPaneSection | null` — it holds exactly one open section at a time.  Making both sections
simultaneously expandable requires changing the store model (single slot → `Set<LeftPaneSection>`)
and is a separate task beyond CS-1's scope.

**Fix:**  
Use two separate search refs:

```ts
const stepTypeQuery = ref('');
const suggestionQuery = ref('');
```

Update `filteredStepTypes` to use `stepTypeQuery` and `filteredSuggestions` to use
`suggestionQuery`.  Each section renders its own search input unconditionally (the input is inside
the `v-if="isExpanded(…)"` body, so it is only mounted when the section is actually open).  Remove
the `v-if="!isExpanded('stepTypes')"` guard from the suggestion search input.

**Acceptance criteria:**  
When both sections are expanded (manually or after a future multi-expand store change), typing in
the Step Types search does not filter the Suggestions list, and vice versa.  `npm run lint` passes.

---

### CS-2 — Replace `activeTab` reset in `StepInspector` with tab-group enum guard

**File:** `apps/web/src/components/inspector/StepInspector.vue`

**Problem:**  
The `watch(step, …)` at the bottom of the script resets `activeTab` to `'config'` whenever the
selected step changes and the current tab isn't in `visibleTabs`.  This is correct but fragile: if
a new tab is added to `visibleTabs` for a step type, it may still not appear in the existing guard.

**Fix:**  
Rewrite as:

```ts
watch(step, () => {
  if (!visibleTabs.value.some((t) => t.id === activeTab.value)) {
    activeTab.value = 'config';
  }
}, {flush: 'sync'});
```

The `{flush: 'sync'}` ensures the tab is reset before the template re-renders, preventing a
one-frame flash of a hidden tab panel.

**Acceptance criteria:**  
Switching from a `model-call` step (which shows the "Prompt" tab) while that tab is active to a
`manual-text` step resets to "Config" before the component re-renders.  No visible flash.

---

### CS-3 — Consistent `step.id` key in `TracePanel` event loop

**File:** `apps/web/src/components/pipeline/TracePanel.vue`

**Problem:**  
The `v-for` key is `` `${event.stepId ?? event.nodeId}-${event.status}-${event.timestamp}` ``.
If two events for the same step share the same timestamp (e.g. a very fast `started` + `completed`
pair), the key is not unique and Vue will log a warning.  The `timestamp` field is an ISO string
with millisecond precision, which is almost-unique but not guaranteed under fast execution.

**Fix:**  
Use a monotonically increasing index combined with the event identity:

```ts
// In the trace events loop — add index:
v-for="(event, idx) in displayTrace"
:key="`${idx}-${event.stepId ?? event.nodeId}-${event.status}`"
```

The index is stable within a single render (trace is append-only while running; it is fully
replaced on reset), so this produces stable keys.

**Acceptance criteria:**  
No Vue duplicate-key warnings appear in the browser console during fast pipeline runs.

---

## 5. Architecture

---

### ARCH-1 — Relax required graph fields on `CapsuleDefinition` (Phase 13 continuation)

**File:** `packages/core/src/types/pipeline.ts`  
**Lines:** 342–344

**Problem:**  
`CapsuleDefinition` requires `nodes: PipelineNode[]`, `edges: PipelineEdge[]`, and
`outputRef: PipelineOutputRef`.  These are the legacy V1 graph fields.  New Capsules created by the
step-chain editor populate the optional `steps?: PipelineStep[]` instead and leave `nodes` / `edges`
as empty arrays purely to satisfy the type.  The required graph fields will never carry meaningful
data for any Capsule created or edited after Phase 11.

This creates several downstream problems:
- Every Capsule serialization and validation path must handle both shapes.
- `extractStepsToCapsule` / `extractFullPipelineToCapsule` produce the step-chain shape but must
  also synthesise dummy graph fields to satisfy the type.
- New contributors see required fields that do nothing.

**Why this must be a single atomic batch:**  
`validateCapsule` in `packages/capsules/src/validate.ts` dereferences `def.nodes` at line 6
(`def.nodes.map(…)`) and `def.edges` without null-checks throughout the function.
`ensureCapsuleStepChain` in `packages/pipeline/src/capsuleExtraction.ts` dereferences
`capsule.nodes.length` at line 481.  Making the type fields optional without simultaneously adding
null-guards and updating all constructors causes TypeScript errors (dereferencing `T | undefined`)
*and* runtime crashes on existing Capsules.  There is no safe intermediate state.  The type change
and every call-site update must land in the same commit.

**Fix — single atomic change across seven files:**

*1. `packages/core/src/types/pipeline.ts` — make graph fields optional with deprecation JSDoc:*

```ts
export interface CapsuleDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  version: `v${number}`;
  status: 'draft' | 'locked';
  interface: CapsuleInterface;
  /**
   * V2 step-chain body. Present for all Capsules created/edited after Phase 11.
   * Preferred execution path; takes precedence over nodes/edges when present.
   */
  steps?: PipelineStep[];
  input?: PipelineInputConfig;
  /**
   * @deprecated Legacy graph representation. Kept for import compatibility only.
   * Will be removed once all persisted Capsules have been migrated.
   * New code must not write these fields; readers must guard with `?? []`.
   */
  nodes?: PipelineNode[];
  /** @deprecated See nodes. */
  edges?: PipelineEdge[];
  /** @deprecated See nodes. */
  outputRef?: PipelineOutputRef;
  tests: CapsuleTestCase[];
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
}
```

*2. `packages/capsules/src/validate.ts` — add null-guards before every dereference:*

```ts
export function validateCapsule(def: CapsuleDefinition): Result<void, PipelineError> {
  const nodes = def.nodes ?? [];
  const edges = def.edges ?? [];

  const nodeIds = new Set(nodes.map((n) => n.id));
  // … replace all def.nodes / def.edges references with the local `nodes` / `edges` bindings
  // … guard def.outputRef: only validate it when nodes.length > 0 && def.outputRef is defined
}
```

*3. `packages/capsules/src/executor.ts` — guard the legacy graph fallback path:*  
The executor already prefers `steps` when present.  In the legacy fallback branch, require
`nodes`, `edges`, and `outputRef` before constructing the synthetic V1 pipeline.  If `steps` is
absent and the graph fields are incomplete, return an `invalid_pipeline_graph` error instead of
dereferencing `undefined`.

*4. `packages/pipeline/src/capsuleExtraction.ts` — guard `capsule.nodes` in `ensureCapsuleStepChain`:*

```ts
if (!(capsule.nodes?.length ?? 0)) {
  return {...capsule, input, steps: []};
}
// legacy path: use capsule.nodes!, capsule.edges!, capsule.outputRef!
```

*5. `packages/pipeline/src/capsuleExtraction.ts` — stop emitting graph fields from `extractStepsToCapsule` / `extractFullPipelineToCapsule`:*  
Remove the `nodes`, `edges`, and `outputRef` properties from the returned Capsule object.  Callers
that needed them for legacy reasons should call `ensureCapsuleStepChain` explicitly.

*6. `apps/web/src/components/LeftPane.vue` — `onNewCapsule`:*  
Remove the `nodes: [{id: …, type: 'input'}]`, `edges: []`, and `outputRef` fields from the new
Capsule literal.

*7. `packages/storage/src/importExport.ts`:*  
When importing a Capsule that has `nodes` but no `steps`, call `ensureCapsuleStepChain` to migrate
the legacy graph before persisting.

**Acceptance criteria:**  
All Capsules created after this change have no `nodes`, `edges`, or `outputRef` fields in their
serialised form.  Capsules saved before this change still load and execute correctly via the
`ensureCapsuleStepChain` fallback path.  `validateCapsule` passes for both new-style (`steps`
only) and old-style (`nodes`/`edges` only) Capsules.  `npm run validate` passes.

---

### ARCH-2 — `useStepStaleStateMap` composable (renamed and expanded from original plan)

**Dependency:** LC-2 defines this composable.  ARCH-2 confirms the final contract and notes what
*not* to do.

**Files:**  
- New: `apps/web/src/composables/useStepStaleStateMap.ts` (defined in LC-2 above)

**Reactivity constraints to respect:**

*Problem with a static `stepId` parameter:*  
If a later helper is added as `useStepStaleState(stepId?: string)` with a plain string, a `state`
computed derived from that fixed string will not react when the selected step changes.  Either keep
the LC-2 `stateFor(stepId)` function and call it from the component's own computed, or make the
helper accept `MaybeRefOrGetter<string | null>` and call `toValue()` inside its computed.

*Problem with `useActiveStepEditor()` at call time:*  
`useActiveStepEditor()` at `useActiveStepEditor.ts:8` reads `ui.editorContext` once and returns
either `usePipelineEditorStore()` or `useCapsuleStepEditorStore()`.  The return value is a store
reference that does not change if `editorContext` later changes.  The composable therefore captures
the wrong store after a pipeline↔capsule context switch.

The LC-2 implementation avoids this by choosing both the editor store and run store inside the
`map` computed callback, reading `ui.editorContext` at each evaluation:

```ts
// Inside useStepStaleStateMap — derive editor reactively
const map = computed((): Record<string, StepStaleState> => {
  const editor = ui.editorContext === 'capsule' ? capsuleEditorStore : pipelineEditorStore;
  const runStore = ui.editorContext === 'capsule' ? capsuleRunStore : pipelineRunStore;

  const states = computeStepStaleStates(
    editor.pipeline,
    runStore.runSnapshotContext,
    toValue(livePrompt),
    (id, version) => capsulesStore.getCapsule(id, version),
  );
  return Object.fromEntries(states.map((s) => [s.stepId, s]));
});
```

Instantiate `pipelineEditorStore` and `capsuleEditorStore` once before the computed, then select
between those cached store references inside the computed.

**Acceptance criteria:**  
Switching from pipeline editor to capsule editor and back shows correct stale states for each
context without requiring a page reload.  The `stateFor` helper returns `null` for unknown step ids
rather than throwing.

---

### ARCH-3 — `ui-kit` package: promote `FieldLabel` and common form controls

**File:** `packages/ui-kit/src/index.ts` (currently a stub)

**Problem:**  
`FieldLabel.vue` lives at `apps/web/src/components/common/FieldLabel.vue` and is imported in
multiple inspector / form components.  The new `ConfirmDialog` and `PromptDialog` (UX-2) will be
additional common components.  These should live in `@lorca/ui-kit` so they are available to future
apps (e.g. a potential Electron shell or a separate settings panel).

**Fix:**  
1. Move `FieldLabel.vue` → `packages/ui-kit/src/components/FieldLabel.vue`.
2. Move new `ConfirmDialog.vue` and `PromptDialog.vue` (from UX-2) to the same location.
3. Export from `packages/ui-kit/src/index.ts`.
4. Update all import paths in `apps/web`.

This is a mechanical refactor; behaviour does not change.

---

## 6. Documentation

---

### DOC-1 — Update README architecture section to reflect actual package state

**File:** `README.md`

**Problem:**  
The Mermaid architecture diagram and the "Package responsibilities" table list `@lorca/ui-kit` with
a note that it contains "shared UI stubs".  The monorepo layout code block lists all seven
packages but does not distinguish which are fully implemented vs. which are stubs.  A new
contributor will be confused when they find `ui-kit/src/index.ts` contains only a comment.

**Fix:**  
1. Add a "Status" column to the package responsibilities table:

| Package | Role | Status |
|---|---|---|
| `@lorca/core` | Domain types | ✅ Implemented |
| `@lorca/prompt` | Prompt rendering, XML/tag helpers | ✅ Implemented |
| `@lorca/endpoints` | Ollama adapter, model discovery | ✅ Implemented |
| `@lorca/pipeline` | Validate, compile, execute step chains | ✅ Implemented |
| `@lorca/capsules` | Capsule execute/lock, built-in examples, suggestions | ✅ Implemented |
| `@lorca/storage` | Dexie DB, import/export | ✅ Implemented |
| `@lorca/ui-kit` | Shared Vue components | 🚧 Stub — Phase 6+ |

2. Add a note under the Mermaid diagram:  
   *`@lorca/ui-kit` is a package boundary placeholder; shared components will be promoted to it
   after initial UI stabilises.*

3. Replace `git clone <your-repo-url>` with the actual GitHub URL.

**Acceptance criteria:**  
A contributor reading the README can distinguish stub packages from implemented ones without
opening files.

---

### DOC-2 — Add LICENSE file

**File:** (new) `LICENSE`

**Problem:**  
The README explicitly notes: *"No project license file is checked in yet."*  Without a license,
the default copyright applies: nobody may use, copy, or distribute the code.  If the project is
public on GitHub this is almost certainly unintended.

**Fix:**  
Decide on a license (the owner must make this decision — do not assume MIT or any other) and add a
`LICENSE` file at the repository root.  Once the choice is made:

1. Create `LICENSE` with the full license text and the correct copyright holder and year.
2. Update the `README.md` "License" section to name the chosen license and link to `LICENSE`.
3. Remove the sentence *"No project license file is checked in yet."*

The dependency stack (Vue/MIT, Dexie/Apache-2.0, Vite/MIT, MSW/MIT) is compatible with both
permissive (MIT, Apache-2.0) and copyleft (LGPL-2.1) choices, but the final decision belongs to
the project owner.

**Acceptance criteria:**  
`ls LICENSE` succeeds.  The README states the license by name.  The caveat sentence is removed.

---

### DOC-3 — Document keyboard shortcuts in `HelpDialog`

**File:** `apps/web/src/components/help/HelpDialog.vue`

**Problem:**  
The help dialog (`?` button) covers the UI overview and workflow but does not list keyboard
shortcuts.  After QW-4 adds Cmd+Enter for Execute and the existing Cmd+Z / Cmd+Y are live, users
have no discoverable reference for them.

**Fix:**  
Add a "Keyboard shortcuts" section to the help dialog:

| Shortcut | Action |
|---|---|
| ⌘Z / Ctrl+Z | Undo last pipeline edit |
| ⌘⇧Z / Ctrl+Y | Redo |
| ⌘↵ / Ctrl+↵ | Execute Pipeline (or Cancel if running) |
| Shift+click step | Extend step selection range |
| Click step | Select step |

Render as a simple two-column table using the existing dialog style.

---

### DOC-4 — Add `CONTRIBUTING.md` with dev setup and test instructions

**File:** (new) `CONTRIBUTING.md`

**Problem:**  
The README has a "Development" section but a contributor needs to know more:
- How the workspace symlinks work (`npm install` at root only)
- How to run a single package's tests (`vitest run --project packages/core`)
- Playwright browser install step
- Ollama CORS setup for E2E tests
- How to run `knip` once it's adopted
- Commit message conventions

**Fix:**  
Create `CONTRIBUTING.md` with sections: Setup, Running tests, Running E2E, Linting, Adding a
package, Commit conventions, PR checklist.

---

## 7. Implementation order

Each batch can be landed as a single PR.  Items within a batch are independent of each other unless
noted.  The rationale column explains what makes a batch a natural unit and what it unlocks for the
next one.

### Batch 1 — Zero-risk cleanup
*No behaviour change in any of these.  All are mechanical single-file edits.  Safe to merge as one
commit; `npm run validate` is the only gate.*

1. QW-1 Remove dead `currentDef` from `App.vue`
2. QW-2 Deduplicate `newId` — import from `utils/id.ts`
3. QW-3 Move `watch` import to top of `RightPane.vue`
4. CS-1 Decouple `paletteQuery` into two refs in `LeftPane.vue`
5. CS-2 Add `{flush: 'sync'}` to `StepInspector` tab-reset watcher
6. CS-3 Fix duplicate `:key` in `TracePanel` event loop

*CS-2 belongs here — it is one word added to one watcher option, the same character of change as
QW-3.*

---

### Batch 2 — Self-contained single-file improvements
*Each item touches exactly one component or store and can be merged independently.  None requires
new shared infrastructure.  Together they deliver the highest-visibility quick wins.*

7. LC-3 Flush `userPrompt` before export in `handleExport`
8. QW-4 Cmd/Ctrl+Enter shortcut — extend existing `onKeyDown` in `CenterPane.vue`
9. QW-5 Copy-to-clipboard button in `OutputPanel.vue`
10. UX-3 Persist pane widths in `ui.ts` via `localStorage`
11. UX-5 Capsule status badge colour in `LeftPane.vue` (CSS + one template span)

---

### Batch 3 — In-component logic fixes
*These require a design decision (LC-1) or a slightly larger diff (LC-4) but still touch only the
web app and carry no cross-package risk.*

12. LC-1 Wire or remove the dead `followRunLive` toggle in `CenterPane.vue`
13. LC-4 Model-missing warning badge in `ChainEditor.vue` + auto-assign on model load

---

### Batch 4 — `useStepStaleStateMap` composable
*New file, no breaking changes, no UI dependencies.  Pulled here — before the dialog and toolbar
work — because the composable is self-contained and landing it early gives a clean, tested
foundation before the larger structural changes.*

14. LC-2 + ARCH-2 `useStepStaleStateMap` composable (new file) + update four call sites in
    `CenterPane.vue`, `RightPane.vue`, `CapsuleCenterPane.vue`, `StepInspector.vue`

---

### Batch 5 — UI infrastructure
*Builds the shared dialog components and declutters the toolbar.  Both items are prerequisites for
the pipeline switcher in Batch 6.*

15. UX-2 `ConfirmDialog.vue` + `PromptDialog.vue` — replace all six native-dialog call sites
    (five in `CenterPane.vue`, one in `useSuggestionInsert.ts`)
16. UX-4 Overflow "More" menu in the center toolbar

*UX-4 before UX-1: the toolbar needs the space freed by the overflow menu before a pipeline
selector can fit.*

---

### Batch 6 — Pipeline switcher
*Depends on UX-2 (confirm-delete dialog) and UX-4 (toolbar real estate).  Kept in its own batch
because it touches `App.vue`, `CenterPane.vue`, `pipelines.ts`, and a new `PipelineSelector.vue`
simultaneously — worth a focused review.*

17. UX-1 `PipelineSelector.vue` + `addNewPipeline` store action + `App.vue` event wiring

---

### Batch 7 — Cross-package architecture
*Highest blast radius.  ARCH-1 touches four packages in one atomic commit; ARCH-3 moves components
that must be stable before promotion.  Do these after the full UX layer is settled and E2E tests
are green.*

18. ARCH-1 Relax `CapsuleDefinition` graph fields — single atomic commit across
    `core`, `capsules/validate.ts`, `pipeline/capsuleExtraction.ts`, `capsules/executor.ts`,
    `storage/importExport.ts`, and `LeftPane.vue` `onNewCapsule` (must not be split)
19. ARCH-3 Promote `FieldLabel`, `ConfirmDialog`, `PromptDialog` to `@lorca/ui-kit`
    (after UX-2 components are stable and covered by E2E)

*ARCH-3 after ARCH-1: by the time graph fields are cleaned up, the type surface is settled and
`ui-kit` exports won't need immediate follow-up fixes.*

---

### Batch 8 — Documentation
*No code dependencies except DOC-3, which documents the QW-4 shortcut.  Reordered within the
batch so the highest-value items (contributor guide, shortcut reference) land first.*

20. DOC-4 `CONTRIBUTING.md` — setup, test, E2E, and commit conventions
21. DOC-3 Keyboard shortcuts table in `HelpDialog.vue` (completes QW-4's paper trail)
22. DOC-1 README architecture section — add Status column, fix clone URL
23. DOC-2 LICENSE — owner decides license; add file and update README caveat

---

## 8. Definition of done

This improvement plan is complete when all of the following are true:

### Functional
- [ ] Multiple pipelines can be created, named, and switched between without data loss.
- [ ] `grep -rn "window\.prompt\|window\.alert\|window\.confirm" apps/web/src/` returns no results.
- [ ] Cmd/Ctrl+Enter triggers Execute Pipeline (or Cancel if running).
- [ ] Output panel has a working copy-to-clipboard button.
- [ ] Pane widths survive a page reload.
- [ ] A model-call step with no model configured shows an inline warning badge.
- [ ] Exporting a pipeline captures the in-progress prompt correctly.

### Code quality
- [ ] `grep -rn "currentDef" apps/web/src/App.vue` returns nothing.
- [ ] Only one `newId` implementation exists in `apps/web/src/`.
- [ ] UI stale-state access is centralised through `useStepStaleStateMap`, preserving live prompt
  behaviour in `CenterPane`.
- [ ] `RightPane.vue` has all imports at the top of the script block.
- [ ] `LeftPane.vue` uses separate search refs for step types and suggestions.

### Architecture
- [ ] `CapsuleDefinition.nodes`, `.edges`, `.outputRef` are marked optional / deprecated.
- [ ] All Capsules created after this plan have no graph fields in their serialised form.
- [ ] Legacy-graph Capsules still execute via the fallback executor path.

### Documentation
- [ ] README accurately reflects which packages are implemented vs. stubs.
- [ ] README contains the actual GitHub clone URL.
- [ ] `LICENSE` file exists at the repository root.
- [ ] `HelpDialog` lists all keyboard shortcuts.
- [ ] `CONTRIBUTING.md` exists with setup instructions.

### Tests
- [ ] `npm run validate` (`lint` + `build` + `test`) passes with no errors.
- [ ] `npm run test:e2e` passes with coverage for: pipeline switching, all six replaced native
  dialogs, copy-to-clipboard, Cmd+Enter shortcut, and stale indicators updating on keystroke.
- [ ] **Testing infrastructure note:** `apps/web/tests/` contains only Playwright E2E specs.
  There are no Vitest component or composable unit tests for the web app today.  New composables
  (`useStepStaleStateMap`) and shared components (`ConfirmDialog`, `PromptDialog`,
  `PipelineSelector`) should be covered by Playwright scenarios in the happy-path spec.  A
  separate task to add a Vitest + `@vue/test-utils` setup for component-level unit tests is
  recommended before the architecture batch, but is not a blocker for the functional items.
