import {defineStore} from 'pinia';
import {ref, computed, toRaw} from 'vue';
import type {ModelRef, PipelineDefinition, PipelineStep, StepType, StepConfig, PipelineInputConfig} from '@lorca/core';
import {
  makeEmptyPipeline,
  extractStepsToCapsule,
  computeCapsuleContentSignature,
  inferLoopExitCondition,
  wireRetryFeedbackOnFirstModelCall,
  listStepOutputArtifacts,
} from '@lorca/pipeline';
import {lockCapsule} from '@lorca/capsules';
import type {CapsuleExtractionResult} from '@lorca/pipeline';
import type {CapsuleDefinition} from '@lorca/core';
import {cloneForStorage} from '../utils/storage.js';
import {newId} from '../utils/id.js';
import {usePipelinesStore} from './pipelines.js';
import {useCapsulesStore} from './capsules.js';
import {reconcileInlineCapsuleSlotRefs} from '../utils/inlineCapsuleRun.js';

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
    case 'presentation':
      return {type: 'presentation', text: '', outputNames: ['text']};
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

function defaultPrimaryOutputName(_type: StepType): string {
  return 'text';
}

function defaultLabel(type: StepType): string {
  const labels: Record<StepType, string> = {
    'model-call': 'Model Call',
    'presentation': 'Text',
    'capsule-instance': 'Capsule',
    'loop-group': 'Loop',
  };
  return labels[type];
}

function defaultTemplateText(steps: readonly PipelineStep[], input: PipelineInputConfig): string {
  const lastModelCall = [...steps].reverse().find((s) => s.config.type === 'model-call');
  const inputRef = `{{artifact.${input.outputNamespace}.raw}}`;
  if (!lastModelCall) return inputRef;
  const responseRef = `{{artifact.${lastModelCall.outputNamespace}.text}}`;
  return `${inputRef}\n\n${responseRef}`;
}

function defaultNamespace(type: StepType, existingNamespaces: ReadonlySet<string>): string {
  const base = type.replace(/-/g, '_');
  return uniqueNamespace(base, existingNamespaces);
}

function uniqueNamespace(base: string, existingNamespaces: ReadonlySet<string>): string {
  let ns = base;
  let i = 2;
  while (existingNamespaces.has(ns)) {
    ns = `${base}_${i++}`;
  }
  return ns;
}

function defaultModelSlotBindings(capsule: CapsuleDefinition): Record<string, ModelRef> {
  const bindings: Record<string, ModelRef> = {};
  for (const slot of capsule.interface.modelSlots) {
    if (slot.defaultModelRef) {
      bindings[slot.name] = {
        kind: 'fixed',
        endpointId: slot.defaultModelRef.endpointId,
        modelName: slot.defaultModelRef.modelName,
      };
      continue;
    }
    const modelName = slot.preferredModelNames?.[0];
    if (modelName) bindings[slot.name] = {kind: 'any-enabled-endpoint', modelName};
  }
  return bindings;
}

function unsupportedInlineCapsuleLockStep(steps: readonly PipelineStep[]): PipelineStep | null {
  for (const step of steps) {
    if (step.config.type === 'loop-group' || step.config.type === 'capsule-instance') return step;
  }
  return null;
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

  function findLoopGroup(loopStepId: string): PipelineStep | undefined {
    const step = pipeline.value.steps.find((s) => s.id === loopStepId);
    return step?.config.type === 'loop-group' ? step : undefined;
  }

  function findInlineCapsuleStep(capsuleStepId: string): PipelineStep | undefined {
    const step = pipeline.value.steps.find((s) => s.id === capsuleStepId);
    return step?.config.type === 'capsule-instance' ? step : undefined;
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

  function contextStepsForInlineCapsuleInner(capsuleStepId: string, innerStepId: string): PipelineStep[] {
    const capsuleIdx = pipeline.value.steps.findIndex((s) => s.id === capsuleStepId);
    const capsule = findInlineCapsuleStep(capsuleStepId);
    if (!capsule || capsule.config.type !== 'capsule-instance' || capsuleIdx < 0) return pipeline.value.steps;

    const inlineSteps = capsule.config.inlineSteps ?? [];
    const innerIdx = inlineSteps.findIndex((s) => s.id === innerStepId);
    const outerBefore = pipeline.value.steps.slice(0, capsuleIdx);
    const innerBefore = innerIdx >= 0 ? inlineSteps.slice(0, innerIdx) : inlineSteps;
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

  function mutateInlineCapsuleSteps(
    capsuleStepId: string,
    mutate: (steps: PipelineStep[]) => PipelineStep[],
    label: string,
  ) {
    const capsule = findInlineCapsuleStep(capsuleStepId);
    if (!capsule || capsule.config.type !== 'capsule-instance') return;
    const before = snapshot();
    const inlineSteps = mutate((capsule.config.inlineSteps ?? []).map((s) => JSON.parse(JSON.stringify(toRaw(s)))));
    updateStepConfig(capsuleStepId, {
      config: {...capsule.config, inlineSteps, inlineModified: true},
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

  function updateInlineCapsuleInnerStep(
    capsuleStepId: string,
    innerStepId: string,
    patch: Partial<PipelineStep>,
  ) {
    const capsule = findInlineCapsuleStep(capsuleStepId);
    if (!capsule || capsule.config.type !== 'capsule-instance') return;
    const innerSteps = (capsule.config.inlineSteps ?? []).map((s) =>
      s.id === innerStepId ? {...s, ...patch, lastEditedAt: new Date().toISOString()} : s,
    );
    updateStepConfig(capsuleStepId, {config: {...capsule.config, inlineSteps: innerSteps, inlineModified: true}});
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

  function commitInlineCapsuleInnerStepEdit(
    capsuleStepId: string,
    innerStepId: string,
    patch: Partial<PipelineStep>,
    label: string,
  ) {
    const before = snapshot();
    updateInlineCapsuleInnerStep(capsuleStepId, innerStepId, patch);
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
      const suffix = port.sourceArtifactKey?.split('.').pop() ?? port.name;
      outputBindings[port.name] = `${ns}.${suffix}`;
    }
    const lastOut = capsule.interface.outputs.at(-1);
    const primaryOutputName = lastOut
      ? (lastOut.sourceArtifactKey?.split('.').pop() ?? 'text')
      : 'text';
    const modelSlotBindings = defaultModelSlotBindings(capsule);

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
        ...(Object.keys(modelSlotBindings).length > 0 ? {modelSlotBindings} : {}),
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
    const selected = selectedStepId.value ? pipeline.value.steps.find((s) => s.id === selectedStepId.value) : null;
    if (selected?.config.type !== 'loop-group') selectedLoopInnerStepId.value = null;
    if (selected?.config.type !== 'capsule-instance') selectedInlineCapsuleInnerStepId.value = null;
    if (selected?.config.type === 'loop-group' && selectedLoopInnerStepId.value) {
      if (!selected.config.steps.some((s) => s.id === selectedLoopInnerStepId.value)) selectedLoopInnerStepId.value = null;
    }
    if (selected?.config.type === 'capsule-instance' && selectedInlineCapsuleInnerStepId.value) {
      if (!(selected.config.inlineSteps ?? []).some((s) => s.id === selectedInlineCapsuleInnerStepId.value)) {
        selectedInlineCapsuleInnerStepId.value = null;
      }
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

  function spreadCapsule(stepId: string): {ok: true} | {ok: false; message: string} {
    const step = findInlineCapsuleStep(stepId);
    if (!step || step.config.type !== 'capsule-instance') return {ok: false, message: 'Capsule step not found'};
    const capsule = useCapsulesStore().getCapsule(step.config.capsuleId, step.config.capsuleVersion);
    if (!capsule) return {ok: false, message: 'Capsule definition not found'};

    const before = snapshot();
    let inlineSteps = step.config.inlineSteps?.length
      ? step.config.inlineSteps
      : JSON.parse(JSON.stringify(toRaw(capsule.steps ?? []))) as PipelineStep[];
    inlineSteps = reconcileInlineCapsuleSlotRefs(capsule, inlineSteps);
    updateStepConfig(stepId, {
      config: {
        ...step.config,
        displayMode: 'inline',
        inlineSteps,
        inlineModified: step.config.inlineSteps?.length ? step.config.inlineModified ?? false : false,
        boundContentSignature: computeCapsuleContentSignature(capsule),
      },
    });
    selectedStepId.value = stepId;
    selectionAnchorId.value = stepId;
    selectedLoopInnerStepId.value = null;
    selectedInlineCapsuleInnerStepId.value = inlineSteps[0]?.id ?? null;
    recordUndo(`Spread "${step.label}"`, before);
    return {ok: true};
  }

  function collapseInlineCapsule(stepId: string) {
    const step = findInlineCapsuleStep(stepId);
    if (!step || step.config.type !== 'capsule-instance') return;
    const before = snapshot();
    updateStepConfig(stepId, {config: {...step.config, displayMode: 'opaque'}});
    selectedInlineCapsuleInnerStepId.value = null;
    recordUndo(`Collapse "${step.label}"`, before);
  }

  function detachCapsule(stepId: string): {ok: true} | {ok: false; message: string} {
    const idx = pipeline.value.steps.findIndex((s) => s.id === stepId);
    const step = pipeline.value.steps[idx];
    if (!step || step.config.type !== 'capsule-instance') return {ok: false, message: 'Capsule step not found'};
    const inlineSteps = step.config.inlineSteps ?? [];
    if (inlineSteps.length === 0) return {ok: false, message: 'Spread the capsule before detaching it'};

    const before = snapshot();
    const parentNamespaces = new Set(
      pipeline.value.steps.filter((s) => s.id !== stepId).map((s) => s.outputNamespace),
    );
    const detachedSteps = remapDetachedSteps(inlineSteps, parentNamespaces);
    pipeline.value = {
      ...pipeline.value,
      steps: [
        ...pipeline.value.steps.slice(0, idx),
        ...detachedSteps,
        ...pipeline.value.steps.slice(idx + 1),
      ],
      updatedAt: new Date().toISOString(),
    };
    selectedStepId.value = detachedSteps[0]?.id ?? null;
    selectionAnchorId.value = selectedStepId.value;
    selectedLoopInnerStepId.value = null;
    selectedInlineCapsuleInnerStepId.value = null;
    recordUndo(`Detach "${step.label}"`, before);
    return {ok: true};
  }

  function lockInlineCapsuleAsCapsule(
    stepId: string,
    capsuleName: string,
    options?: {capsuleId?: string},
  ): {ok: true; capsule: CapsuleDefinition} | {ok: false; message: string} {
    const step = findInlineCapsuleStep(stepId);
    if (!step || step.config.type !== 'capsule-instance') return {ok: false, message: 'Capsule step not found'};
    const source = useCapsulesStore().getCapsule(step.config.capsuleId, step.config.capsuleVersion);
    if (!source) return {ok: false, message: 'Source capsule not found'};
    const inlineSteps = (step.config.inlineSteps ?? []).map((s) => JSON.parse(JSON.stringify(toRaw(s))) as PipelineStep);
    if (inlineSteps.length === 0) return {ok: false, message: 'Inline capsule has no steps to lock'};
    const unsupported = unsupportedInlineCapsuleLockStep(inlineSteps);
    if (unsupported) {
      return {
        ok: false,
        message: `Cannot lock inline Capsule because "${unsupported.label}" is a ${unsupported.config.type} step`,
      };
    }

    const outputRefs = new Set(inlineSteps.flatMap((s) => listStepOutputArtifacts(s).map((a) => a.ref)));
    for (const port of source.interface.outputs) {
      if (port.sourceArtifactKey && !outputRefs.has(port.sourceArtifactKey)) {
        return {ok: false, message: `Output "${port.name}" points to missing artifact ${port.sourceArtifactKey}`};
      }
    }

    const now = new Date().toISOString();
    const capsuleId = options?.capsuleId ?? newId('cap');
    const draft: CapsuleDefinition = {
      schemaVersion: 1,
      id: capsuleId,
      name: capsuleName,
      version: 'v1',
      status: 'draft',
      interface: JSON.parse(JSON.stringify(toRaw(source.interface))),
      steps: inlineSteps,
      input: source.input ?? pipeline.value.input,
      tests: [],
      createdAt: now,
      updatedAt: now,
    };
    const locked = lockCapsule(draft);
    if (!locked.ok) return {ok: false, message: locked.error.message};

    const before = snapshot();
    updateStepConfig(stepId, {
      label: capsuleName,
      config: {
        ...step.config,
        capsuleId: locked.value.id,
        capsuleVersion: locked.value.version,
        displayMode: 'opaque',
        inlineSteps,
        inlineModified: false,
        boundContentSignature: computeCapsuleContentSignature(locked.value),
      },
    });
    selectedInlineCapsuleInnerStepId.value = null;
    recordUndo(`Lock "${capsuleName}"`, before);
    return {ok: true, capsule: locked.value};
  }

  function remapDetachedSteps(sourceSteps: PipelineStep[], parentNamespaces: ReadonlySet<string>): PipelineStep[] {
    const namespaceMap = new Map<string, string>();
    const used = new Set(parentNamespaces);
    const detached = sourceSteps.map((s) => JSON.parse(JSON.stringify(toRaw(s))) as PipelineStep);

    for (const step of detached) {
      const original = step.outputNamespace;
      const next = used.has(original) ? uniqueNamespace(original, used) : original;
      namespaceMap.set(original, next);
      used.add(next);
      step.outputNamespace = next;
    }

    return detached.map((step) => remapStepArtifactRefs(step, namespaceMap));
  }

  function remapStepArtifactRefs(step: PipelineStep, namespaceMap: ReadonlyMap<string, string>): PipelineStep {
    const next: PipelineStep = {...step};
    if (step.prompt) {
      next.prompt = {
        ...step.prompt,
        historyReads: step.prompt.historyReads.map((read) => ({
          ...read,
          sourceArtifactRef: remapArtifactRef(read.sourceArtifactRef, namespaceMap),
        })),
      };
    }

    if (next.config.type === 'presentation') {
      next.config = {...next.config, text: remapArtifactRefsInText(next.config.text, namespaceMap)};
    } else if (next.config.type === 'capsule-instance') {
      const inlineSteps = next.config.inlineSteps?.map((inner) => remapStepArtifactRefs(inner, namespaceMap));
      next.config = {
        ...next.config,
        inputBindings: remapBindingRefs(next.config.inputBindings, namespaceMap),
        outputBindings: remapBindingRefs(next.config.outputBindings, namespaceMap),
        ...(inlineSteps ? {inlineSteps} : {}),
      };
    } else if (next.config.type === 'loop-group') {
      next.config = {
        ...next.config,
        steps: next.config.steps.map((inner) => remapStepArtifactRefs(inner, namespaceMap)),
      };
    }

    return next;
  }

  function remapBindingRefs(refs: Record<string, string>, namespaceMap: ReadonlyMap<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(refs).map(([key, artifactRef]) => [key, remapArtifactRef(artifactRef, namespaceMap)]));
  }

  function remapArtifactRef(artifactRef: string, namespaceMap: ReadonlyMap<string, string>): string {
    for (const [from, to] of namespaceMap) {
      if (from !== to && artifactRef.startsWith(`${from}.`)) return `${to}.${artifactRef.slice(from.length + 1)}`;
    }
    return artifactRef;
  }

  function remapArtifactRefsInText(text: string, namespaceMap: ReadonlyMap<string, string>): string {
    let next = text;
    for (const [from, to] of namespaceMap) {
      if (from === to) continue;
      next = next.replaceAll(`artifact.${from}.`, `artifact.${to}.`);
      next = next.replaceAll(`${from}.`, `${to}.`);
    }
    return next;
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

  function wrapSelectionInRetryLoop(
    loopLabel?: string,
  ): {ok: true; loopStepId: string} | {ok: false; message: string} {
    const range = getSelectionRange();
    if (!range) {
      return {ok: false, message: 'Select two or more steps. Shift+click another step to define a range.'};
    }
    const count = range.endIndex - range.startIndex + 1;
    if (count < 2) {
      return {ok: false, message: 'Select at least two steps: refine step(s) first, verification step last.'};
    }

    const selected = pipeline.value.steps.slice(range.startIndex, range.endIndex + 1);
    if (selected.some((s) => s.config.type === 'loop-group')) {
      return {ok: false, message: 'Cannot wrap a loop group inside another loop.'};
    }

    const innerSteps = wireRetryFeedbackOnFirstModelCall(
      selected.map((s) => JSON.parse(JSON.stringify(toRaw(s))) as PipelineStep),
    );
    const lastStep = innerSteps.at(-1)!;
    const exitCondition = inferLoopExitCondition(lastStep);
    const loopStep = buildDefaultStep('loop-group', getExistingNamespaces(), {
      label: loopLabel ?? `Retry: ${lastStep.label}`,
      config: {
        type: 'loop-group',
        maxIterations: 3,
        exitCondition,
        steps: innerSteps,
        outputNames: ['text'],
      },
    });

    const before = snapshot();
    pipeline.value = {
      ...pipeline.value,
      steps: [
        ...pipeline.value.steps.slice(0, range.startIndex),
        loopStep,
        ...pipeline.value.steps.slice(range.endIndex + 1),
      ],
      updatedAt: new Date().toISOString(),
    };
    selectedStepId.value = loopStep.id;
    selectionAnchorId.value = loopStep.id;
    selectedLoopInnerStepId.value = innerSteps[0]?.id ?? null;
    recordUndo(`Wrap retry loop "${loopStep.label}"`, before);
    return {ok: true, loopStepId: loopStep.id};
  }

  function lockSelectionAsCapsule(
    capsuleName: string,
    options?: {capsuleId?: string},
  ): {ok: true; capsule: CapsuleDefinition; replacedStepCount: number} | {ok: false; message: string} {
    const range = getSelectionRange() ?? (pipeline.value.steps.length > 0
      ? {startIndex: 0, endIndex: pipeline.value.steps.length - 1}
      : null);
    if (!range) return {ok: false, message: 'Add steps before locking a Capsule'};
    const capsuleId = options?.capsuleId ?? newId('cap');
    const result = extractStepsToCapsule({
      pipeline: pipeline.value,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      capsuleId,
      capsuleName,
    });
    if (!result.ok) return {ok: false, message: result.error.message};
    const locked = lockCapsule(result.value.capsule);
    if (!locked.ok) return {ok: false, message: locked.error.message};
    applyCapsuleExtraction(result.value, `Lock "${capsuleName}"`);
    return {
      ok: true,
      capsule: locked.value,
      replacedStepCount: range.endIndex - range.startIndex + 1,
    };
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
    getSelectionRange,
    applyCapsuleExtraction,
    wrapSelectionInRetryLoop,
    lockSelectionAsCapsule,
    contextStepsForLoopInner,
    contextStepsForInlineCapsuleInner,
    mutateLoopInnerSteps,
    mutateInlineCapsuleSteps,
    updateLoopInnerStep,
    updateInlineCapsuleInnerStep,
    commitLoopInnerStepEdit,
    commitInlineCapsuleInnerStepEdit,
    appendLoopInnerStep,
    deleteLoopInnerStep,
    moveLoopInnerStep,
    buildCapsuleInstanceStep,
    insertCapsuleInstance,
    spreadCapsule,
    collapseInlineCapsule,
    detachCapsule,
    lockInlineCapsuleAsCapsule,
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
