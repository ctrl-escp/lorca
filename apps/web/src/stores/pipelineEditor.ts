import {defineStore} from 'pinia';
import {ref, computed, toRaw} from 'vue';
import type {PipelineDefinition, PipelineStep, StepType, StepConfig} from '@lorca/core';
import {
  makeEmptyPipeline,
  extractStepsToCapsule,
  extractFullPipelineToCapsule,
  computeCapsuleContentSignature,
} from '@lorca/pipeline';
import type {CapsuleExtractionResult} from '@lorca/pipeline';
import type {CapsuleDefinition} from '@lorca/core';
import {cloneForStorage} from '../utils/storage.js';
import {usePipelinesStore} from './pipelines.js';

// ── ID helpers ───────────────────────────────────────────────────────────────

let _counter = 0;
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

// ── Default step builders ────────────────────────────────────────────────────

function defaultStepConfig(type: StepType): StepConfig {
  switch (type) {
    case 'model-call':
      return {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      };
    case 'prompt-wrapper':
      return {type: 'prompt-wrapper', outputNames: ['text']};
    case 'template':
      return {type: 'template', template: '', outputNames: ['text']};
    case 'json-extract':
      return {type: 'json-extract', sourceArtifactRef: '', outputNames: ['json']};
    case 'manual-text':
      return {type: 'manual-text', text: '', outputNames: ['text']};
    case 'capsule-instance':
      return {
        type: 'capsule-instance',
        capsuleId: '',
        capsuleVersion: 'v1',
        inputBindings: {},
        outputBindings: {},
      };
    case 'loop-group':
      return {
        type: 'loop-group',
        maxIterations: 3,
        exitCondition: {type: 'json-field-equals', fieldPath: 'passed', value: true},
        steps: [],
        outputNames: ['text'],
      };
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown step type: ${_exhaustive}`);
    }
  }
}

function defaultPrimaryOutputName(type: StepType): string {
  switch (type) {
    case 'json-extract': return 'json';
    default: return 'text';
  }
}

function defaultLabel(type: StepType): string {
  const labels: Record<StepType, string> = {
    'model-call': 'Model Call',
    'prompt-wrapper': 'Prompt Wrapper',
    'template': 'Template',
    'json-extract': 'JSON Extract',
    'manual-text': 'Manual Text',
    'capsule-instance': 'Capsule',
    'loop-group': 'Loop Group',
  };
  return labels[type];
}

function defaultNamespace(type: StepType, existingNamespaces: ReadonlySet<string>): string {
  const base = type.replace(/-/g, '_');
  let ns = base;
  let i = 2;
  while (existingNamespaces.has(ns)) {
    ns = `${base}_${i++}`;
  }
  return ns;
}

export function buildDefaultStep(
  type: StepType,
  existingNamespaces: ReadonlySet<string>,
  overrides?: Partial<PipelineStep>,
): PipelineStep {
  const ns = defaultNamespace(type, existingNamespaces);
  return {
    id: newId(type.replace(/-/g, '_')),
    type,
    label: defaultLabel(type),
    enabled: true,
    outputNamespace: ns,
    primaryOutputName: defaultPrimaryOutputName(type),
    lastEditedAt: new Date().toISOString(),
    config: defaultStepConfig(type),
    ...overrides,
  };
}

// ── Undo/redo snapshot ───────────────────────────────────────────────────────

interface PipelineEditorSnapshot {
  steps: PipelineStep[];
  outputStepId?: string;
  pipelineName: string;
  inputRaw: string;
}

interface UndoEntry {
  label: string;
  before: PipelineEditorSnapshot;
  after: PipelineEditorSnapshot;
}

/** Measured ~80–120KB per snapshot with long prompts; cap depth to limit memory. */
const MAX_UNDO = 30;

// ── Store ────────────────────────────────────────────────────────────────────

export const usePipelineEditorStore = defineStore('pipelineEditor', () => {
  const pipeline = ref<PipelineDefinition>(makeEmptyPipeline('default', 'New Pipeline'));
  const selectedStepId = ref<string | null>(null);
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
    }
    return ns;
  }

  function findLoopGroup(loopStepId: string): PipelineStep | undefined {
    const step = pipeline.value.steps.find((s) => s.id === loopStepId);
    return step?.config.type === 'loop-group' ? step : undefined;
  }

  function contextStepsForLoopInner(loopStepId: string, innerStepId: string): PipelineStep[] {
    const loopIdx = pipeline.value.steps.findIndex((s) => s.id === loopStepId);
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group' || loopIdx < 0) return pipeline.value.steps;

    const innerIdx = loop.config.steps.findIndex((s) => s.id === innerStepId);
    const outerBefore = pipeline.value.steps.slice(0, loopIdx);
    const innerBefore = innerIdx >= 0 ? loop.config.steps.slice(0, innerIdx) : loop.config.steps;
    return [...outerBefore, ...innerBefore];
  }

  function mutateLoopInnerSteps(
    loopStepId: string,
    mutate: (steps: PipelineStep[]) => PipelineStep[],
    label: string,
  ) {
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group') return;
    const before = snapshot();
    const innerSteps = mutate(loop.config.steps.map((s) => JSON.parse(JSON.stringify(toRaw(s)))));
    updateStepConfig(loopStepId, {
      config: {...loop.config, steps: innerSteps},
    });
    recordUndo(label, before);
  }

  function updateLoopInnerStep(
    loopStepId: string,
    innerStepId: string,
    patch: Partial<PipelineStep>,
  ) {
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group') return;
    const innerSteps = loop.config.steps.map((s) =>
      s.id === innerStepId ? {...s, ...patch, lastEditedAt: new Date().toISOString()} : s,
    );
    updateStepConfig(loopStepId, {config: {...loop.config, steps: innerSteps}});
  }

  function commitLoopInnerStepEdit(
    loopStepId: string,
    innerStepId: string,
    patch: Partial<PipelineStep>,
    label: string,
  ) {
    const before = snapshot();
    updateLoopInnerStep(loopStepId, innerStepId, patch);
    recordUndo(label, before);
  }

  function appendLoopInnerStep(loopStepId: string, type: StepType): string | null {
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group') return null;
    if (type === 'loop-group' || type === 'capsule-instance') return null;
    const draft = buildDefaultStep(type, getExistingNamespaces());
    mutateLoopInnerSteps(loopStepId, (innerSteps) => [...innerSteps, draft], `Add inner "${draft.label}"`);
    return draft.id;
  }

  function deleteLoopInnerStep(loopStepId: string, innerStepId: string) {
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group') return;
    const inner = loop.config.steps.find((s) => s.id === innerStepId);
    if (!inner) return;
    mutateLoopInnerSteps(
      loopStepId,
      (innerSteps) => innerSteps.filter((s) => s.id !== innerStepId),
      `Delete inner "${inner.label}"`,
    );
  }

  function moveLoopInnerStep(loopStepId: string, innerStepId: string, direction: 'up' | 'down') {
    mutateLoopInnerSteps(loopStepId, (innerSteps) => {
      const idx = innerSteps.findIndex((s) => s.id === innerStepId);
      if (idx < 0) return innerSteps;
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= innerSteps.length) return innerSteps;
      const next = [...innerSteps];
      [next[idx], next[swap]] = [next[swap]!, next[idx]!];
      return next;
    }, 'Move inner step');
  }

  function buildCapsuleInstanceStep(
    capsule: CapsuleDefinition,
    overrides?: Partial<PipelineStep>,
  ): PipelineStep {
    const ns = defaultNamespace('capsule-instance', getExistingNamespaces());
    const inputBindings: Record<string, string> = {};
    for (const port of capsule.interface.inputs) {
      inputBindings[port.name] = port.defaultArtifactKey
        ?? (port.name === 'user_prompt' ? 'user_prompt.xml' : `${port.name}.text`);
    }
    const outputBindings: Record<string, string> = {};
    for (const port of capsule.interface.outputs) {
      outputBindings[port.name] = port.sourceArtifactKey ?? `${ns}.${port.name}`;
    }
    const lastOut = capsule.interface.outputs.at(-1);
    const primaryOutputName = lastOut
      ? (lastOut.sourceArtifactKey?.split('.').pop() ?? 'text')
      : 'text';

    return {
      id: newId('cap_inst'),
      type: 'capsule-instance',
      label: capsule.name,
      enabled: true,
      outputNamespace: ns,
      primaryOutputName,
      lastEditedAt: new Date().toISOString(),
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings,
        outputBindings,
        boundContentSignature: computeCapsuleContentSignature(capsule),
      },
      ...overrides,
    };
  }

  function insertCapsuleInstance(capsule: CapsuleDefinition): string | null {
    const draft = buildCapsuleInstanceStep(capsule);
    const anchorId = selectedStepId.value;
    if (anchorId) return insertStepAfter(anchorId, draft);
    return appendStep(draft);
  }

  function snapshot(): PipelineEditorSnapshot {
    return {
      steps: JSON.parse(JSON.stringify(toRaw(pipeline.value.steps))),
      pipelineName: pipeline.value.name,
      inputRaw: pipeline.value.input.raw,
      ...(pipeline.value.outputStepId !== undefined ? {outputStepId: pipeline.value.outputStepId} : {}),
    };
  }

  function applySnapshot(snap: PipelineEditorSnapshot) {
    pipeline.value = {
      ...pipeline.value,
      steps: snap.steps,
      name: snap.pipelineName,
      input: {...pipeline.value.input, raw: snap.inputRaw},
      updatedAt: new Date().toISOString(),
    };
    if (snap.outputStepId !== undefined) pipeline.value.outputStepId = snap.outputStepId;
    else delete (pipeline.value as Partial<PipelineDefinition>).outputStepId;
    if (selectedStepId.value && !pipeline.value.steps.find((s) => s.id === selectedStepId.value)) {
      selectedStepId.value = null;
    }
  }

  function recordUndo(label: string, before: PipelineEditorSnapshot) {
    const after = snapshot();
    undoStack.value = [...undoStack.value.slice(-MAX_UNDO + 1), {label, before, after}];
    redoStack.value = [];
    persistPipeline();
  }

  function snapshotsEqual(a: PipelineEditorSnapshot, b: PipelineEditorSnapshot): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
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

  function loadPipeline(def: PipelineDefinition) {
    // cloneForStorage strips Vue reactivity (toRaw + JSON round-trip) before storing
    pipeline.value = cloneForStorage(def);
    selectedStepId.value = null;
    selectionAnchorId.value = null;
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
    const ns = defaultNamespace(original.type, getExistingNamespaces());
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

  function selectStep(stepId: string | null, options?: {extendRange?: boolean}) {
    if (stepId && stepId !== pendingStepEdit?.stepId) finishPendingStepEdit();
    if (!stepId) {
      finishPendingStepEdit();
      selectedStepId.value = null;
      selectionAnchorId.value = null;
      return;
    }
    if (options?.extendRange && selectionAnchorId.value) {
      selectedStepId.value = stepId;
    } else {
      selectionAnchorId.value = stepId;
      selectedStepId.value = stepId;
    }
  }

  function getSelectionRange(): {startIndex: number; endIndex: number} | null {
    const anchor = selectionAnchorId.value;
    const end = selectedStepId.value;
    if (!anchor || !end) return null;
    const startIndex = pipeline.value.steps.findIndex((s) => s.id === anchor);
    const endIndex = pipeline.value.steps.findIndex((s) => s.id === end);
    if (startIndex < 0 || endIndex < 0) return null;
    return {
      startIndex: Math.min(startIndex, endIndex),
      endIndex: Math.max(startIndex, endIndex),
    };
  }

  function applyCapsuleExtraction(result: CapsuleExtractionResult, undoLabel: string) {
    const before = snapshot();
    pipeline.value = result.pipeline;
    pipeline.value.updatedAt = new Date().toISOString();
    selectedStepId.value = result.instanceStep.id;
    selectionAnchorId.value = result.instanceStep.id;
    recordUndo(undoLabel, before);
  }

  function extractSelectionToCapsule(
    capsuleName: string,
    options?: {capsuleId?: string; instanceLabel?: string},
  ): {ok: true; capsule: CapsuleDefinition} | {ok: false; message: string} {
    const range = getSelectionRange();
    if (!range) return {ok: false, message: 'Select one or more steps (Shift+click for a range)'};
    const capsuleId = options?.capsuleId ?? newId('cap');
    const result = extractStepsToCapsule({
      pipeline: pipeline.value,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      capsuleId,
      capsuleName,
      ...(options?.instanceLabel !== undefined ? {instanceLabel: options.instanceLabel} : {}),
    });
    if (!result.ok) return {ok: false, message: result.error.message};
    applyCapsuleExtraction(result.value, `Extract "${capsuleName}"`);
    return {ok: true, capsule: result.value.capsule};
  }

  function convertPipelineToCapsule(
    capsuleName: string,
    options?: {capsuleId?: string},
  ): {ok: true; capsule: CapsuleDefinition} | {ok: false; message: string} {
    const capsuleId = options?.capsuleId ?? newId('cap');
    const result = extractFullPipelineToCapsule(pipeline.value, capsuleId, capsuleName);
    if (!result.ok) return {ok: false, message: result.error.message};
    applyCapsuleExtraction(result.value, `Convert pipeline to "${capsuleName}"`);
    return {ok: true, capsule: result.value.capsule};
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
    selectionAnchorId,
    steps,
    selectedStep,
    getSelectionRange,
    applyCapsuleExtraction,
    extractSelectionToCapsule,
    convertPipelineToCapsule,
    contextStepsForLoopInner,
    mutateLoopInnerSteps,
    updateLoopInnerStep,
    commitLoopInnerStepEdit,
    appendLoopInnerStep,
    deleteLoopInnerStep,
    moveLoopInnerStep,
    buildCapsuleInstanceStep,
    insertCapsuleInstance,
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
    updateUserPrompt,
    commitUserPrompt,
    selectStep,
    updatePipelineName,
    undo,
    redo,
    buildDefaultStep: (type: StepType, overrides?: Partial<PipelineStep>) =>
      buildDefaultStep(type, getExistingNamespaces(), overrides),
  };
});
