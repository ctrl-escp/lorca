import {defineStore} from 'pinia';
import {ref, computed, toRaw} from 'vue';
import type {PipelineDefinition, PipelineStep, StepType, StepConfig} from '@lorca/core';
import {getDb} from '@lorca/storage';
import {
  makeEmptyPipeline,
  extractStepsToCapsule,
  extractFullPipelineToCapsule,
} from '@lorca/pipeline';
import type {CapsuleExtractionResult} from '@lorca/pipeline';
import type {CapsuleDefinition} from '@lorca/core';
import {cloneForStorage} from '../utils/storage.js';

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

const MAX_UNDO = 50;

// ── Store ────────────────────────────────────────────────────────────────────

export const usePipelineEditorStore = defineStore('pipelineEditor', () => {
  const pipeline = ref<PipelineDefinition>(makeEmptyPipeline('default', 'New Pipeline'));
  const selectedStepId = ref<string | null>(null);
  const selectionAnchorId = ref<string | null>(null);
  const undoStack = ref<UndoEntry[]>([]);
  const redoStack = ref<UndoEntry[]>([]);

  const steps = computed(() => pipeline.value.steps);
  const selectedStep = computed(() =>
    selectedStepId.value ? pipeline.value.steps.find((s) => s.id === selectedStepId.value) ?? null : null,
  );
  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const lastUndoLabel = computed(() => undoStack.value.at(-1)?.label ?? null);
  const lastRedoLabel = computed(() => redoStack.value.at(-1)?.label ?? null);

  function getExistingNamespaces(): ReadonlySet<string> {
    return new Set(pipeline.value.steps.map((s) => s.outputNamespace));
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

  function persistPipeline() {
    const plain = cloneForStorage(pipeline.value);
    void getDb().pipelines.put(plain);
  }

  // ── Load ────────────────────────────────────────────────────────────────────

  function loadPipeline(def: PipelineDefinition) {
    // cloneForStorage strips Vue reactivity (toRaw + JSON round-trip) before storing
    pipeline.value = cloneForStorage(def);
    selectedStepId.value = null;
    selectionAnchorId.value = null;
    undoStack.value = [];
    redoStack.value = [];
  }

  // ── Step actions ─────────────────────────────────────────────────────────────

  function insertStepAfter(anchorStepId: string, stepDraft: PipelineStep): string {
    const before = snapshot();
    const idx = pipeline.value.steps.findIndex((s) => s.id === anchorStepId);
    const steps = [...pipeline.value.steps];
    steps.splice(idx + 1, 0, stepDraft);
    pipeline.value = {...pipeline.value, steps, updatedAt: new Date().toISOString()};
    recordUndo(`Insert "${stepDraft.label}"`, before);
    return stepDraft.id;
  }

  function insertStepBefore(anchorStepId: string, stepDraft: PipelineStep): string {
    const before = snapshot();
    const idx = pipeline.value.steps.findIndex((s) => s.id === anchorStepId);
    const insertAt = Math.max(0, idx);
    const steps = [...pipeline.value.steps];
    steps.splice(insertAt, 0, stepDraft);
    pipeline.value = {...pipeline.value, steps, updatedAt: new Date().toISOString()};
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
    const steps = [...pipeline.value.steps];
    const fromIdx = steps.findIndex((s) => s.id === stepId);
    if (fromIdx < 0) return;
    const [step] = steps.splice(fromIdx, 1);
    const clampedTarget = Math.max(0, Math.min(targetIndex, steps.length));
    steps.splice(clampedTarget, 0, step!);
    pipeline.value = {...pipeline.value, steps, updatedAt: new Date().toISOString()};
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
    const steps = [...pipeline.value.steps];
    steps.splice(idx + 1, 0, dup);
    pipeline.value = {...pipeline.value, steps, updatedAt: new Date().toISOString()};
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
    if (!stepId) {
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
      instanceLabel: options?.instanceLabel,
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

  function updateUserPrompt(raw: string) {
    pipeline.value = {
      ...pipeline.value,
      input: {...pipeline.value.input, raw},
      updatedAt: new Date().toISOString(),
    };
    persistPipeline();
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
    canUndo,
    canRedo,
    lastUndoLabel,
    lastRedoLabel,
    loadPipeline,
    insertStepAfter,
    insertStepBefore,
    appendStep,
    moveStep,
    duplicateStep,
    deleteStep,
    setStepEnabled,
    updateStepConfig,
    commitStepConfigEdit,
    selectStep,
    updatePipelineName,
    updateUserPrompt,
    undo,
    redo,
    buildDefaultStep: (type: StepType, overrides?: Partial<PipelineStep>) =>
      buildDefaultStep(type, getExistingNamespaces(), overrides),
  };
});
