import {defineStore} from 'pinia';
import {ref, computed, toRaw} from 'vue';
import type {CapsuleDefinition, PipelineDefinition, PipelineStep, StepType} from '@lorca/core';
import {ensureCapsuleStepChain, stripCapsuleLegacyGraphFields} from '@lorca/pipeline';
import {buildDefaultStep, newStepId} from '../utils/stepBuilders.js';
import {cloneForStorage} from '../utils/storage.js';

interface CapsuleEditorSnapshot {
  steps: PipelineStep[];
  inputRaw: string;
  capsuleName: string;
}

interface UndoEntry {
  label: string;
  before: CapsuleEditorSnapshot;
  after: CapsuleEditorSnapshot;
}

const MAX_UNDO = 30;

function applyStepChainUpdate(capsule: CapsuleDefinition): CapsuleDefinition {
  const input = capsule.input ?? {raw: '', tagName: 'user', outputNamespace: 'user_prompt'};
  const steps = capsule.steps ?? [];
  return stripCapsuleLegacyGraphFields({...capsule, input, steps, updatedAt: new Date().toISOString()});
}

export const useCapsuleStepEditorStore = defineStore('capsuleStepEditor', () => {
  const capsule = ref<CapsuleDefinition | null>(null);
  const selectedStepId = ref<string | null>(null);
  const selectedLoopInnerStepId = ref<string | null>(null);
  const undoStack = ref<UndoEntry[]>([]);
  const redoStack = ref<UndoEntry[]>([]);
  let pendingStepEdit: {stepId: string; before: CapsuleEditorSnapshot} | null = null;
  let pendingInputEdit: CapsuleEditorSnapshot | null = null;

  const steps = computed(() => capsule.value?.steps ?? []);
  const selectedStep = computed(() =>
    selectedStepId.value ? steps.value.find((s) => s.id === selectedStepId.value) ?? null : null,
  );

  const pipeline = computed((): PipelineDefinition => {
    const c = capsule.value;
    const input = c?.input ?? {raw: '', tagName: 'user', outputNamespace: 'user_prompt'};
    return {
      schemaVersion: 2,
      id: c?.id ?? 'capsule',
      name: c?.name ?? 'Capsule',
      input,
      steps: c?.steps ?? [],
      createdAt: c?.createdAt ?? new Date().toISOString(),
      updatedAt: c?.updatedAt ?? new Date().toISOString(),
    };
  });

  const canUndo = computed(() => undoStack.value.length > 0);
  const canRedo = computed(() => redoStack.value.length > 0);
  const lastUndoLabel = computed(() => undoStack.value.at(-1)?.label ?? null);
  const lastRedoLabel = computed(() => redoStack.value.at(-1)?.label ?? null);
  const isReadOnly = computed(() => capsule.value?.status === 'locked');

  function getExistingNamespaces(): ReadonlySet<string> {
    const ns = new Set<string>();
    for (const step of steps.value) {
      ns.add(step.outputNamespace);
      if (step.config.type === 'loop-group') {
        for (const inner of step.config.steps) ns.add(inner.outputNamespace);
      }
    }
    return ns;
  }

  function snapshot(): CapsuleEditorSnapshot {
    return {
      steps: JSON.parse(JSON.stringify(toRaw(capsule.value?.steps ?? []))),
      inputRaw: capsule.value?.input?.raw ?? '',
      capsuleName: capsule.value?.name ?? 'Capsule',
    };
  }

  function applySnapshot(snap: CapsuleEditorSnapshot) {
    if (!capsule.value) return;
    capsule.value = applyStepChainUpdate({
      ...capsule.value,
      name: snap.capsuleName,
      steps: snap.steps,
      input: {...(capsule.value.input ?? {raw: '', tagName: 'user', outputNamespace: 'user_prompt'}), raw: snap.inputRaw},
    });
    if (selectedStepId.value && !capsule.value.steps?.find((s) => s.id === selectedStepId.value)) {
      selectedStepId.value = null;
    }
  }

  function recordUndo(label: string, before: CapsuleEditorSnapshot) {
    const after = snapshot();
    undoStack.value = [...undoStack.value.slice(-MAX_UNDO + 1), {label, before, after}];
    redoStack.value = [];
  }

  function snapshotsEqual(a: CapsuleEditorSnapshot, b: CapsuleEditorSnapshot): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

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
    }
  }

  function beginInputEdit() {
    finishPendingStepEdit();
    pendingInputEdit = snapshot();
  }

  function updateUserPrompt(raw: string) {
    if (!capsule.value || isReadOnly.value) return;
    const input = {...(capsule.value.input ?? {raw: '', tagName: 'user', outputNamespace: 'user_prompt'}), raw};
    capsule.value = {...capsule.value, input, updatedAt: new Date().toISOString()};
  }

  function commitUserPrompt(raw: string) {
    updateUserPrompt(raw);
    if (pendingInputEdit) {
      const after = snapshot();
      if (!snapshotsEqual(pendingInputEdit, after)) {
        recordUndo('Edit test prompt', pendingInputEdit);
      }
      pendingInputEdit = null;
    }
  }

  function mutateSteps(mutator: (steps: PipelineStep[]) => PipelineStep[], label: string) {
    if (!capsule.value || isReadOnly.value) return;
    const before = snapshot();
    const next = mutator(JSON.parse(JSON.stringify(toRaw(capsule.value.steps ?? []))));
    capsule.value = applyStepChainUpdate({...capsule.value, steps: next});
    recordUndo(label, before);
  }

  function loadCapsule(def: CapsuleDefinition) {
    capsule.value = cloneForStorage(ensureCapsuleStepChain(def));
    selectedStepId.value = null;
    undoStack.value = [];
    redoStack.value = [];
    pendingStepEdit = null;
    pendingInputEdit = null;
  }

  function getCapsule(): CapsuleDefinition | null {
    return capsule.value ? cloneForStorage(capsule.value) : null;
  }

  function insertStepAfter(anchorStepId: string, stepDraft: PipelineStep): string {
    mutateSteps((list) => {
      const idx = list.findIndex((s) => s.id === anchorStepId);
      list.splice(idx + 1, 0, stepDraft);
      return list;
    }, `Insert "${stepDraft.label}"`);
    return stepDraft.id;
  }

  function insertStepBefore(anchorStepId: string, stepDraft: PipelineStep): string {
    mutateSteps((list) => {
      const idx = Math.max(0, list.findIndex((s) => s.id === anchorStepId));
      list.splice(idx, 0, stepDraft);
      return list;
    }, `Insert "${stepDraft.label}"`);
    return stepDraft.id;
  }

  function appendStep(stepDraft: PipelineStep): string {
    mutateSteps((list) => [...list, stepDraft], `Add "${stepDraft.label}"`);
    return stepDraft.id;
  }

  function moveStep(stepId: string, targetIndex: number) {
    mutateSteps((list) => {
      const fromIdx = list.findIndex((s) => s.id === stepId);
      if (fromIdx < 0) return list;
      const [step] = list.splice(fromIdx, 1);
      const clamped = Math.max(0, Math.min(targetIndex, list.length));
      list.splice(clamped, 0, step!);
      return list;
    }, 'Move step');
  }

  function duplicateStep(stepId: string): string | null {
    let newId: string | null = null;
    mutateSteps((list) => {
      const idx = list.findIndex((s) => s.id === stepId);
      if (idx < 0) return list;
      const original = list[idx]!;
      const dup: PipelineStep = {
        ...JSON.parse(JSON.stringify(toRaw(original))),
        id: newStepId(original.type.replace(/-/g, '_')),
        outputNamespace: buildDefaultStep(original.type, new Set(list.map((s) => s.outputNamespace))).outputNamespace,
        lastEditedAt: new Date().toISOString(),
      };
      list.splice(idx + 1, 0, dup);
      newId = dup.id;
      return list;
    }, 'Duplicate step');
    return newId;
  }

  function deleteStep(stepId: string) {
    const step = steps.value.find((s) => s.id === stepId);
    if (!step) return;
    mutateSteps((list) => list.filter((s) => s.id !== stepId), `Delete "${step.label}"`);
    if (selectedStepId.value === stepId) selectedStepId.value = null;
  }

  function setStepEnabled(stepId: string, enabled: boolean) {
    mutateSteps(
      (list) => list.map((s) =>
        s.id === stepId ? {...s, enabled, lastEditedAt: new Date().toISOString()} : s,
      ),
      enabled ? 'Enable step' : 'Disable step',
    );
  }

  function updateStepConfig(stepId: string, patch: Partial<PipelineStep>) {
    if (!capsule.value || isReadOnly.value) return;
    const next = (capsule.value.steps ?? []).map((s) =>
      s.id === stepId ? {...s, ...patch, lastEditedAt: new Date().toISOString()} : s,
    );
    capsule.value = applyStepChainUpdate({...capsule.value, steps: next});
  }

  function commitStepConfigEdit(stepId: string, patch: Partial<PipelineStep>, label = 'Edit step') {
    const before = snapshot();
    updateStepConfig(stepId, patch);
    recordUndo(label, before);
  }

  function selectStep(stepId: string | null) {
    if (stepId && stepId !== pendingStepEdit?.stepId) finishPendingStepEdit();
    if (!stepId) finishPendingStepEdit();
    selectedStepId.value = stepId;
    selectedLoopInnerStepId.value = null;
  }

  function selectLoopInnerStep(loopStepId: string, innerStepId: string) {
    if (loopStepId !== pendingStepEdit?.stepId) finishPendingStepEdit();
    selectedStepId.value = loopStepId;
    selectedLoopInnerStepId.value = innerStepId;
  }

  function updateCapsuleName(name: string) {
    if (!capsule.value || isReadOnly.value) return;
    const before = snapshot();
    capsule.value = applyStepChainUpdate({...capsule.value, name});
    recordUndo('Rename capsule', before);
  }

  function findLoopGroup(loopStepId: string): PipelineStep | undefined {
    const step = steps.value.find((s) => s.id === loopStepId);
    return step?.config.type === 'loop-group' ? step : undefined;
  }

  function contextStepsForLoopInner(loopStepId: string, innerStepId: string): PipelineStep[] {
    const loopIdx = steps.value.findIndex((s) => s.id === loopStepId);
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group' || loopIdx < 0) return steps.value;
    const innerIdx = loop.config.steps.findIndex((s) => s.id === innerStepId);
    const outerBefore = steps.value.slice(0, loopIdx);
    const innerBefore = innerIdx >= 0 ? loop.config.steps.slice(0, innerIdx) : loop.config.steps;
    return [...outerBefore, ...innerBefore];
  }

  function mutateLoopInnerSteps(
    loopStepId: string,
    mutate: (inner: PipelineStep[]) => PipelineStep[],
    label: string,
  ) {
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group') return;
    mutateSteps((list) => list.map((s) => {
      if (s.id !== loopStepId || s.config.type !== 'loop-group') return s;
      return {
        ...s,
        config: {...s.config, steps: mutate(s.config.steps.map((x) => JSON.parse(JSON.stringify(toRaw(x)))))},
      };
    }), label);
  }

  function updateLoopInnerStep(loopStepId: string, innerStepId: string, patch: Partial<PipelineStep>) {
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group') return;
    const innerSteps = loop.config.steps.map((s) =>
      s.id === innerStepId ? {...s, ...patch, lastEditedAt: new Date().toISOString()} : s,
    );
    updateStepConfig(loopStepId, {config: {...loop.config, steps: innerSteps}});
  }

  function commitLoopInnerStepEdit(loopStepId: string, innerStepId: string, patch: Partial<PipelineStep>, label: string) {
    const before = snapshot();
    updateLoopInnerStep(loopStepId, innerStepId, patch);
    recordUndo(label, before);
  }

  function appendLoopInnerStep(loopStepId: string, type: StepType): string | null {
    if (type === 'loop-group' || type === 'capsule-instance') return null;
    const draft = buildDefaultStep(type, getExistingNamespaces());
    mutateLoopInnerSteps(loopStepId, (inner) => [...inner, draft], `Add inner "${draft.label}"`);
    return draft.id;
  }

  function deleteLoopInnerStep(loopStepId: string, innerStepId: string) {
    const loop = findLoopGroup(loopStepId);
    const inner = loop?.config.type === 'loop-group'
      ? loop.config.steps.find((s) => s.id === innerStepId)
      : undefined;
    if (!inner) return;
    mutateLoopInnerSteps(loopStepId, (list) => list.filter((s) => s.id !== innerStepId), `Delete inner "${inner.label}"`);
  }

  function moveLoopInnerStep(loopStepId: string, innerStepId: string, direction: 'up' | 'down') {
    mutateLoopInnerSteps(loopStepId, (list) => {
      const idx = list.findIndex((s) => s.id === innerStepId);
      if (idx < 0) return list;
      const swap = direction === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= list.length) return list;
      const next = [...list];
      [next[idx], next[swap]] = [next[swap]!, next[idx]!];
      return next;
    }, 'Move inner step');
  }

  function undo() {
    const entry = undoStack.value.at(-1);
    if (!entry) return;
    undoStack.value = undoStack.value.slice(0, -1);
    redoStack.value = [...redoStack.value, entry];
    applySnapshot(entry.before);
  }

  function redo() {
    const entry = redoStack.value.at(-1);
    if (!entry) return;
    redoStack.value = redoStack.value.slice(0, -1);
    undoStack.value = [...undoStack.value, entry];
    applySnapshot(entry.after);
  }

  return {
    capsule,
    pipeline,
    steps,
    selectedStepId,
    selectedStep,
    canUndo,
    canRedo,
    lastUndoLabel,
    lastRedoLabel,
    isReadOnly,
    loadCapsule,
    getCapsule,
    insertStepAfter,
    insertStepBefore,
    appendStep,
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
    selectLoopInnerStep,
    selectedLoopInnerStepId,
    updateCapsuleName,
    contextStepsForLoopInner,
    mutateLoopInnerSteps,
    updateLoopInnerStep,
    commitLoopInnerStepEdit,
    appendLoopInnerStep,
    deleteLoopInnerStep,
    moveLoopInnerStep,
    undo,
    redo,
    buildDefaultStep: (type: StepType, overrides?: Partial<PipelineStep>) =>
      buildDefaultStep(type, getExistingNamespaces(), overrides),
  };
});
