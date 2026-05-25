import {defineStore} from 'pinia';
import {ref, computed, toRaw} from 'vue';
import type {PipelineDefinition, PipelineStep, StepType} from '@lorca/core';
import {makeEmptyPipeline} from '@lorca/pipeline';
import type {CapsuleDefinition} from '@lorca/core';
import {cloneForStorage} from '../utils/storage.js';
import {newId} from '../utils/id.js';
import {
  buildDefaultStep as buildDefaultStepCore,
  defaultOutputNamespace,
  defaultTemplateText,
} from '../utils/stepBuilders.js';
import {buildCapsuleInstanceStep as buildCapsuleInstanceStepCore} from '../utils/capsuleInstanceStep.js';
import {usePipelinesStore} from './pipelines.js';
import {useCapsulesStore} from './capsules.js';
import {reconcileInlineCapsuleSlotRefs} from '../utils/inlineCapsuleRun.js';
import {
  applyPipelineSnapshot,
  snapshotPipeline,
  snapshotsEqual,
  type PipelineEditorSnapshot,
} from './pipelineEditor/snapshot.js';
import {createNestedStepEditors} from './pipelineEditor/nestedStepEdits.js';
import {createCapsuleStepEditors} from './pipelineEditor/capsuleStepEdits.js';

export function buildDefaultStep(
  type: StepType,
  existingNamespaces: ReadonlySet<string>,
  overrides?: Partial<PipelineStep>,
): PipelineStep {
  return buildDefaultStepCore(type, existingNamespaces, overrides, newId);
}

// ── Undo/redo snapshot ───────────────────────────────────────────────────────

interface UndoEntry {
  label: string;
  before: PipelineEditorSnapshot;
  after: PipelineEditorSnapshot;
}

/** Measured ~80-120KB per snapshot with long prompts; cap depth to limit memory. */
const MAX_UNDO = 30;

// ── Store ────────────────────────────────────────────────────────────────────

export const usePipelineEditorStore = defineStore('pipelineEditor', () => {
  const pipeline = ref<PipelineDefinition>(makeEmptyPipeline('default', 'New Pipeline'));
  const selectedStepId = ref<string | null>(null);
  const selectedLoopInnerStepId = ref<string | null>(null);
  const selectedInlineCapsuleInnerStepId = ref<string | null>(null);
  const selectionAnchorId = ref<string | null>(null);
  const undoStack = ref<UndoEntry[]>([]);
  const redoStack = ref<UndoEntry[]>([]);
  let pendingStepEdit: {stepId: string; before: PipelineEditorSnapshot} | null = null;
  let pendingInputEdit: PipelineEditorSnapshot | null = null;

  const steps = computed(() => pipeline.value.steps);
  const selectedStep = computed(() =>
    selectedStepId.value ? pipeline.value.steps.find((s) => s.id === selectedStepId.value) ?? null : null,
  );
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const lastUndoLabel = computed(() => undoStack.value.at(-1)?.label ?? null);
  const lastRedoLabel = computed(() => redoStack.value.at(-1)?.label ?? null);

  function getExistingNamespaces(): ReadonlySet<string> {
    const ns = new Set<string>();
    for (const step of pipeline.value.steps) {
      ns.add(step.outputNamespace);
      if (step.config.type === 'loop-group') {
        for (const inner of step.config.steps) ns.add(inner.outputNamespace);
      }
      if (step.config.type === 'capsule-instance') {
        for (const inner of step.config.inlineSteps ?? []) ns.add(inner.outputNamespace);
      }
    }
    return ns;
  }

  const selectionRefs = {
    selectedStepId,
    selectionAnchorId,
    selectedLoopInnerStepId,
    selectedInlineCapsuleInnerStepId,
  };

  function buildCapsuleInstanceStep(
    capsule: CapsuleDefinition,
    overrides?: Partial<PipelineStep>,
  ): PipelineStep {
    return buildCapsuleInstanceStepCore(capsule, getExistingNamespaces(), newId, overrides);
  }

  function insertCapsuleInstance(capsule: CapsuleDefinition): string | null {
    const draft = buildCapsuleInstanceStep(capsule);
    const anchorId = selectedStepId.value;
    if (anchorId) return insertStepAfter(anchorId, draft);
    return appendStep(draft);
  }

  function snapshot(): PipelineEditorSnapshot {
    return snapshotPipeline(pipeline.value);
  }

  function applySnapshot(snap: PipelineEditorSnapshot) {
    pipeline.value = applyPipelineSnapshot(pipeline.value, snap, selectionRefs);
  }

  function recordUndo(label: string, before: PipelineEditorSnapshot) {
    const after = snapshot();
    undoStack.value = [...undoStack.value.slice(-MAX_UNDO + 1), {label, before, after}];
    redoStack.value = [];
    persistPipeline();
  }

  /** Finish a batched text edit (one undo entry if the pipeline changed). */
  function finishPendingStepEdit(label = 'Edit step') {
    if (!pendingStepEdit) return;
    const after = snapshot();
    if (!snapshotsEqual(pendingStepEdit.before, after)) {
      recordUndo(label, pendingStepEdit.before);
    }
    pendingStepEdit = null;
  }

  function beginStepEdit(stepId: string) {
    if (pendingStepEdit?.stepId === stepId) return;
    finishPendingStepEdit();
    pendingInputEdit = null;
    pendingStepEdit = {stepId, before: snapshot()};
  }

  function updateStepDuringEdit(stepId: string, patch: Partial<PipelineStep>) {
    if (!pendingStepEdit || pendingStepEdit.stepId !== stepId) beginStepEdit(stepId);
    updateStepConfig(stepId, patch);
  }

  function commitStepEdit(stepId: string, patch: Partial<PipelineStep>, label: string) {
    updateStepConfig(stepId, patch);
    if (pendingStepEdit?.stepId === stepId) {
      const after = snapshot();
      if (!snapshotsEqual(pendingStepEdit.before, after)) {
        recordUndo(label, pendingStepEdit.before);
      }
      pendingStepEdit = null;
    } else {
      persistPipeline();
    }
  }

  function beginInputEdit() {
    finishPendingStepEdit();
    pendingInputEdit = snapshot();
  }

  function updateUserPrompt(raw: string) {
    pipeline.value = {
      ...pipeline.value,
      input: {...pipeline.value.input, raw},
      updatedAt: new Date().toISOString(),
    };
    persistPipeline();
  }

  function updateUserPromptDuringEdit(raw: string) {
    pipeline.value = {
      ...pipeline.value,
      input: {...pipeline.value.input, raw},
      updatedAt: new Date().toISOString(),
    };
  }

  function commitUserPrompt(raw: string) {
    updateUserPrompt(raw);
    if (pendingInputEdit) {
      const after = snapshot();
      if (!snapshotsEqual(pendingInputEdit, after)) {
        recordUndo('Edit user prompt', pendingInputEdit);
      }
      pendingInputEdit = null;
    }
  }

  function persistPipeline() {
    void usePipelinesStore().save(cloneForStorage(pipeline.value));
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  function reconcileAllInlineCapsuleSlotRefs(pipelineSteps: readonly PipelineStep[]): PipelineStep[] {
    const capsulesStore = useCapsulesStore();
    return pipelineSteps.map((step) => {
      if (step.config.type !== 'capsule-instance' || step.config.displayMode !== 'inline') return step;
      const inline = step.config.inlineSteps;
      if (!inline?.length) return step;
      const capsule = capsulesStore.getCapsule(step.config.capsuleId, step.config.capsuleVersion);
      if (!capsule?.steps?.length) return step;
      const reconciled = reconcileInlineCapsuleSlotRefs(capsule, inline);
      if (JSON.stringify(reconciled) === JSON.stringify(inline)) return step;
      return {...step, config: {...step.config, inlineSteps: reconciled}};
    });
  }

  function loadPipeline(def: PipelineDefinition) {
    // cloneForStorage strips Vue reactivity (toRaw + JSON round-trip) before storing
    pipeline.value = cloneForStorage({
      ...def,
      steps: reconcileAllInlineCapsuleSlotRefs(def.steps),
    });
    selectedStepId.value = null;
    selectionAnchorId.value = null;
    selectedLoopInnerStepId.value = null;
    selectedInlineCapsuleInnerStepId.value = null;
    undoStack.value = [];
    redoStack.value = [];
    pendingStepEdit = null;
    pendingInputEdit = null;
  }

  // ── Step actions ─────────────────────────────────────────────────────────────

  function insertStepAfter(anchorStepId: string, stepDraft: PipelineStep): string {
    const before = snapshot();
    const idx = pipeline.value.steps.findIndex((s) => s.id === anchorStepId);
    const nextSteps = [...pipeline.value.steps];
    nextSteps.splice(idx + 1, 0, stepDraft);
    pipeline.value = {...pipeline.value, steps: nextSteps, updatedAt: new Date().toISOString()};
    recordUndo(`Insert "${stepDraft.label}"`, before);
    return stepDraft.id;
  }

  function insertStepBefore(anchorStepId: string, stepDraft: PipelineStep): string {
    const before = snapshot();
    const idx = pipeline.value.steps.findIndex((s) => s.id === anchorStepId);
    const insertAt = Math.max(0, idx);
    const nextSteps = [...pipeline.value.steps];
    nextSteps.splice(insertAt, 0, stepDraft);
    pipeline.value = {...pipeline.value, steps: nextSteps, updatedAt: new Date().toISOString()};
    recordUndo(`Insert "${stepDraft.label}"`, before);
    return stepDraft.id;
  }

  function appendStep(stepDraft: PipelineStep): string {
    const before = snapshot();
    pipeline.value = {
      ...pipeline.value,
      steps: [...pipeline.value.steps, stepDraft],
      updatedAt: new Date().toISOString(),
    };
    recordUndo(`Add "${stepDraft.label}"`, before);
    return stepDraft.id;
  }

  function moveStep(stepId: string, targetIndex: number) {
    const before = snapshot();
    const nextSteps = [...pipeline.value.steps];
    const fromIdx = nextSteps.findIndex((s) => s.id === stepId);
    if (fromIdx < 0) return;
    const [step] = nextSteps.splice(fromIdx, 1);
    const clampedTarget = Math.max(0, Math.min(targetIndex, nextSteps.length));
    nextSteps.splice(clampedTarget, 0, step!);
    pipeline.value = {...pipeline.value, steps: nextSteps, updatedAt: new Date().toISOString()};
    recordUndo(`Move "${step!.label}"`, before);
  }

  function duplicateStep(stepId: string): string | null {
    const before = snapshot();
    const idx = pipeline.value.steps.findIndex((s) => s.id === stepId);
    if (idx < 0) return null;
    const original = pipeline.value.steps[idx]!;
    const ns = defaultOutputNamespace(original.type, getExistingNamespaces());
    const dup: PipelineStep = {
      ...JSON.parse(JSON.stringify(toRaw(original))),
      id: newId(original.type.replace(/-/g, '_')),
      outputNamespace: ns,
      lastEditedAt: new Date().toISOString(),
    };
    const nextSteps = [...pipeline.value.steps];
    nextSteps.splice(idx + 1, 0, dup);
    pipeline.value = {...pipeline.value, steps: nextSteps, updatedAt: new Date().toISOString()};
    recordUndo(`Duplicate "${original.label}"`, before);
    return dup.id;
  }

  function deleteStep(stepId: string) {
    const before = snapshot();
    const step = pipeline.value.steps.find((s) => s.id === stepId);
    if (!step) return;
    pipeline.value = {
      ...pipeline.value,
      steps: pipeline.value.steps.filter((s) => s.id !== stepId),
      updatedAt: new Date().toISOString(),
    };
    if (selectedStepId.value === stepId) selectedStepId.value = null;
    selectedLoopInnerStepId.value = null;
    selectedInlineCapsuleInnerStepId.value = null;
    recordUndo(`Delete "${step.label}"`, before);
  }

  function setStepEnabled(stepId: string, enabled: boolean) {
    const before = snapshot();
    pipeline.value = {
      ...pipeline.value,
      steps: pipeline.value.steps.map((s) =>
        s.id === stepId ? {...s, enabled, lastEditedAt: new Date().toISOString()} : s,
      ),
      updatedAt: new Date().toISOString(),
    };
    recordUndo(enabled ? 'Enable step' : 'Disable step', before);
  }

  function updateStepConfig(stepId: string, patch: Partial<PipelineStep>) {
    pipeline.value = {
      ...pipeline.value,
      steps: pipeline.value.steps.map((s) =>
        s.id === stepId
          ? {...s, ...patch, lastEditedAt: new Date().toISOString()}
          : s,
      ),
      updatedAt: new Date().toISOString(),
    };
    persistPipeline();
  }

  function commitStepConfigEdit(stepId: string, patch: Partial<PipelineStep>, label = 'Edit step') {
    const before = snapshot();
    updateStepConfig(stepId, patch);
    recordUndo(label, before);
  }

  const storeBuildDefaultStep = (type: StepType, overrides?: Partial<PipelineStep>) =>
    buildDefaultStep(type, getExistingNamespaces(), overrides);

  const stepEditCtx = {
    getPipeline: () => pipeline.value,
    setPipeline: (next: PipelineDefinition) => { pipeline.value = next; },
    getExistingNamespaces,
    snapshot,
    recordUndo,
    updateStepConfig,
    buildDefaultStep: storeBuildDefaultStep,
  };

  const nestedStepEdits = createNestedStepEditors(stepEditCtx);
  const capsuleStepEdits = createCapsuleStepEditors({
    ...stepEditCtx,
    selection: selectionRefs,
    buildCapsuleInstanceStep,
    findInlineCapsuleStep: nestedStepEdits.findInlineCapsuleStep,
  });

  function selectStep(stepId: string | null, options?: {extendRange?: boolean}) {
    if (stepId && stepId !== pendingStepEdit?.stepId) finishPendingStepEdit();
    if (!stepId) {
      finishPendingStepEdit();
      selectedStepId.value = null;
      selectionAnchorId.value = null;
      selectedLoopInnerStepId.value = null;
      selectedInlineCapsuleInnerStepId.value = null;
      return;
    }
    if (options?.extendRange && selectionAnchorId.value) {
      selectedStepId.value = stepId;
    } else {
      selectionAnchorId.value = stepId;
      selectedStepId.value = stepId;
    }
    selectedLoopInnerStepId.value = null;
    selectedInlineCapsuleInnerStepId.value = null;
  }

  function selectLoopInnerStep(loopStepId: string, innerStepId: string) {
    if (loopStepId !== pendingStepEdit?.stepId) finishPendingStepEdit();
    selectionAnchorId.value = loopStepId;
    selectedStepId.value = loopStepId;
    selectedLoopInnerStepId.value = innerStepId;
    selectedInlineCapsuleInnerStepId.value = null;
  }

  function selectInlineCapsuleInnerStep(capsuleStepId: string, innerStepId: string) {
    if (capsuleStepId !== pendingStepEdit?.stepId) finishPendingStepEdit();
    selectionAnchorId.value = capsuleStepId;
    selectedStepId.value = capsuleStepId;
    selectedLoopInnerStepId.value = null;
    selectedInlineCapsuleInnerStepId.value = innerStepId;
  }

  function updatePipelineName(name: string) {
    const before = snapshot();
    pipeline.value = {...pipeline.value, name, updatedAt: new Date().toISOString()};
    recordUndo('Rename pipeline', before);
  }

  function replaceSteps(newSteps: PipelineStep[], label = 'Replace steps') {
    const before = snapshot();
    pipeline.value = {
      ...pipeline.value,
      steps: newSteps,
      updatedAt: new Date().toISOString(),
    };
    selectedStepId.value = newSteps.at(-1)?.id ?? null;
    selectionAnchorId.value = selectedStepId.value;
    recordUndo(label, before);
  }

  // ── Undo/redo ─────────────────────────────────────────────────────────────────

  function undo() {
    const entry = undoStack.value.at(-1);
    if (!entry) return;
    undoStack.value = undoStack.value.slice(0, -1);
    redoStack.value = [...redoStack.value, entry];
    applySnapshot(entry.before);
    persistPipeline();
  }

  function redo() {
    const entry = redoStack.value.at(-1);
    if (!entry) return;
    redoStack.value = redoStack.value.slice(0, -1);
    undoStack.value = [...undoStack.value, entry];
    applySnapshot(entry.after);
    persistPipeline();
  }

  return {
    pipeline,
    selectedStepId,
    selectedLoopInnerStepId,
    selectedInlineCapsuleInnerStepId,
    selectionAnchorId,
    steps,
    selectedStep,
    getSelectionRange: capsuleStepEdits.getSelectionRange,
    applyCapsuleExtraction: capsuleStepEdits.applyCapsuleExtraction,
    wrapSelectionInRetryLoop: capsuleStepEdits.wrapSelectionInRetryLoop,
    lockSelectionAsCapsule: capsuleStepEdits.lockSelectionAsCapsule,
    contextStepsForLoopInner: nestedStepEdits.contextStepsForLoopInner,
    contextStepsForInlineCapsuleInner: nestedStepEdits.contextStepsForInlineCapsuleInner,
    mutateLoopInnerSteps: nestedStepEdits.mutateLoopInnerSteps,
    mutateInlineCapsuleSteps: nestedStepEdits.mutateInlineCapsuleSteps,
    updateLoopInnerStep: nestedStepEdits.updateLoopInnerStep,
    updateInlineCapsuleInnerStep: nestedStepEdits.updateInlineCapsuleInnerStep,
    commitLoopInnerStepEdit: nestedStepEdits.commitLoopInnerStepEdit,
    commitInlineCapsuleInnerStepEdit: nestedStepEdits.commitInlineCapsuleInnerStepEdit,
    appendLoopInnerStep: nestedStepEdits.appendLoopInnerStep,
    deleteLoopInnerStep: nestedStepEdits.deleteLoopInnerStep,
    moveLoopInnerStep: nestedStepEdits.moveLoopInnerStep,
    buildCapsuleInstanceStep,
    insertCapsuleInstance,
    spreadCapsule: capsuleStepEdits.spreadCapsule,
    collapseInlineCapsule: capsuleStepEdits.collapseInlineCapsule,
    detachCapsule: capsuleStepEdits.detachCapsule,
    lockInlineCapsuleAsCapsule: capsuleStepEdits.lockInlineCapsuleAsCapsule,
    canUndo,
    canRedo,
    lastUndoLabel,
    lastRedoLabel,
    loadPipeline,
    insertStepAfter,
    insertStepBefore,
    appendStep,
    replaceSteps,
    moveStep,
    duplicateStep,
    deleteStep,
    setStepEnabled,
    updateStepConfig,
    commitStepConfigEdit,
    beginStepEdit,
    updateStepDuringEdit,
    commitStepEdit,
    beginInputEdit,
    updateUserPromptDuringEdit,
    updateUserPrompt,
    commitUserPrompt,
    selectStep,
    selectLoopInnerStep,
    selectInlineCapsuleInnerStep,
    updatePipelineName,
    undo,
    redo,
    buildDefaultStep: (type: StepType, overrides?: Partial<PipelineStep>) => {
      const step = buildDefaultStep(type, getExistingNamespaces(), overrides);
      if (type === 'presentation' && step.config.type === 'presentation' && !step.config.text) {
        const tmpl = defaultTemplateText(pipeline.value.steps, pipeline.value.input);
        return {...step, config: {...step.config, text: tmpl}};
      }
      return step;
    },
  };
});
