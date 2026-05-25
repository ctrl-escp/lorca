import {toRaw} from 'vue';
import type {CapsuleDefinition, PipelineStep} from '@lorca/core';
import {
  computeCapsuleContentSignature,
  extractStepsToCapsule,
  inferLoopExitCondition,
  wireRetryFeedbackOnFirstModelCall,
  type CapsuleExtractionResult,
} from '@lorca/pipeline';
import {lockCapsule} from '@lorca/capsules';
import {newId} from '../../utils/id.js';
import {
  remapDetachedSteps,
  validateInlineCapsuleLock,
} from '../../utils/inlineCapsulePipelineOps.js';
import {reconcileInlineCapsuleSlotRefs} from '../../utils/inlineCapsuleRun.js';
import {useCapsulesStore} from '../capsules.js';
import type {PipelineEditorSelectionRefs} from './snapshot.js';
import type {NestedStepEditContext} from './nestedStepEdits.js';

export interface CapsuleStepEditContext extends NestedStepEditContext {
  selection: PipelineEditorSelectionRefs;
  buildCapsuleInstanceStep: (capsule: CapsuleDefinition, overrides?: Partial<PipelineStep>) => PipelineStep;
  findInlineCapsuleStep: (capsuleStepId: string) => PipelineStep | undefined;
}

export function createCapsuleStepEditors(ctx: CapsuleStepEditContext) {
  function getSelectionRange(): {startIndex: number; endIndex: number} | null {
    const pipeline = ctx.getPipeline();
    const anchor = ctx.selection.selectionAnchorId.value;
    const end = ctx.selection.selectedStepId.value;
    if (!anchor || !end) return null;
    const startIndex = pipeline.steps.findIndex((s) => s.id === anchor);
    const endIndex = pipeline.steps.findIndex((s) => s.id === end);
    if (startIndex < 0 || endIndex < 0) return null;
    return {
      startIndex: Math.min(startIndex, endIndex),
      endIndex: Math.max(startIndex, endIndex),
    };
  }

  function applyCapsuleExtraction(result: CapsuleExtractionResult, undoLabel: string) {
    const before = ctx.snapshot();
    const pipeline = {...result.pipeline, updatedAt: new Date().toISOString()};
    ctx.setPipeline(pipeline);
    ctx.selection.selectedStepId.value = result.instanceStep.id;
    ctx.selection.selectionAnchorId.value = result.instanceStep.id;
    ctx.recordUndo(undoLabel, before);
  }

  function spreadCapsule(stepId: string): {ok: true} | {ok: false; message: string} {
    const step = ctx.findInlineCapsuleStep(stepId);
    if (!step || step.config.type !== 'capsule-instance') return {ok: false, message: 'Capsule step not found'};
    const capsule = useCapsulesStore().getCapsule(step.config.capsuleId, step.config.capsuleVersion);
    if (!capsule) return {ok: false, message: 'Capsule definition not found'};

    const before = ctx.snapshot();
    let inlineSteps = step.config.inlineSteps?.length
      ? step.config.inlineSteps
      : JSON.parse(JSON.stringify(toRaw(capsule.steps ?? []))) as PipelineStep[];
    inlineSteps = reconcileInlineCapsuleSlotRefs(capsule, inlineSteps);
    ctx.updateStepConfig(stepId, {
      config: {
        ...step.config,
        displayMode: 'inline',
        inlineSteps,
        inlineModified: step.config.inlineSteps?.length ? step.config.inlineModified ?? false : false,
        boundContentSignature: computeCapsuleContentSignature(capsule),
      },
    });
    ctx.selection.selectedStepId.value = stepId;
    ctx.selection.selectionAnchorId.value = stepId;
    ctx.selection.selectedLoopInnerStepId.value = null;
    ctx.selection.selectedInlineCapsuleInnerStepId.value = inlineSteps[0]?.id ?? null;
    ctx.recordUndo(`Spread "${step.label}"`, before);
    return {ok: true};
  }

  function collapseInlineCapsule(stepId: string) {
    const step = ctx.findInlineCapsuleStep(stepId);
    if (!step || step.config.type !== 'capsule-instance') return;
    const before = ctx.snapshot();
    ctx.updateStepConfig(stepId, {config: {...step.config, displayMode: 'opaque'}});
    ctx.selection.selectedInlineCapsuleInnerStepId.value = null;
    ctx.recordUndo(`Collapse "${step.label}"`, before);
  }

  function detachCapsule(stepId: string): {ok: true} | {ok: false; message: string} {
    const pipeline = ctx.getPipeline();
    const idx = pipeline.steps.findIndex((s) => s.id === stepId);
    const step = pipeline.steps[idx];
    if (!step || step.config.type !== 'capsule-instance') return {ok: false, message: 'Capsule step not found'};
    const inlineSteps = step.config.inlineSteps ?? [];
    if (inlineSteps.length === 0) return {ok: false, message: 'Spread the capsule before detaching it'};

    const before = ctx.snapshot();
    const parentNamespaces = new Set(
      pipeline.steps.filter((s) => s.id !== stepId).map((s) => s.outputNamespace),
    );
    const detachedSteps = remapDetachedSteps(inlineSteps, parentNamespaces);
    ctx.setPipeline({
      ...pipeline,
      steps: [
        ...pipeline.steps.slice(0, idx),
        ...detachedSteps,
        ...pipeline.steps.slice(idx + 1),
      ],
      updatedAt: new Date().toISOString(),
    });
    ctx.selection.selectedStepId.value = detachedSteps[0]?.id ?? null;
    ctx.selection.selectionAnchorId.value = ctx.selection.selectedStepId.value;
    ctx.selection.selectedLoopInnerStepId.value = null;
    ctx.selection.selectedInlineCapsuleInnerStepId.value = null;
    ctx.recordUndo(`Detach "${step.label}"`, before);
    return {ok: true};
  }

  function lockInlineCapsuleAsCapsule(
    stepId: string,
    capsuleName: string,
    options?: {capsuleId?: string},
  ): {ok: true; capsule: CapsuleDefinition} | {ok: false; message: string} {
    const step = ctx.findInlineCapsuleStep(stepId);
    if (!step || step.config.type !== 'capsule-instance') return {ok: false, message: 'Capsule step not found'};
    const source = useCapsulesStore().getCapsule(step.config.capsuleId, step.config.capsuleVersion);
    if (!source) return {ok: false, message: 'Source capsule not found'};
    const inlineSteps = (step.config.inlineSteps ?? []).map((s) => JSON.parse(JSON.stringify(toRaw(s))) as PipelineStep);
    const validation = validateInlineCapsuleLock(source, inlineSteps);
    if (!validation.ok) return validation;

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
      input: source.input ?? ctx.getPipeline().input,
      tests: [],
      createdAt: now,
      updatedAt: now,
    };
    const locked = lockCapsule(draft);
    if (!locked.ok) return {ok: false, message: locked.error.message};

    const before = ctx.snapshot();
    ctx.updateStepConfig(stepId, {
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
    ctx.selection.selectedInlineCapsuleInnerStepId.value = null;
    ctx.recordUndo(`Lock "${capsuleName}"`, before);
    return {ok: true, capsule: locked.value};
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

    const pipeline = ctx.getPipeline();
    const selected = pipeline.steps.slice(range.startIndex, range.endIndex + 1);
    if (selected.some((s) => s.config.type === 'loop-group')) {
      return {ok: false, message: 'Cannot wrap a loop group inside another loop.'};
    }

    const innerSteps = wireRetryFeedbackOnFirstModelCall(
      selected.map((s) => JSON.parse(JSON.stringify(toRaw(s))) as PipelineStep),
    );
    const lastStep = innerSteps.at(-1)!;
    const exitCondition = inferLoopExitCondition(lastStep);
    const loopStep = ctx.buildDefaultStep('loop-group', {
      label: loopLabel ?? `Retry: ${lastStep.label}`,
      config: {
        type: 'loop-group',
        maxIterations: 3,
        exitCondition,
        steps: innerSteps,
        outputNames: ['text'],
      },
    });

    const before = ctx.snapshot();
    ctx.setPipeline({
      ...pipeline,
      steps: [
        ...pipeline.steps.slice(0, range.startIndex),
        loopStep,
        ...pipeline.steps.slice(range.endIndex + 1),
      ],
      updatedAt: new Date().toISOString(),
    });
    ctx.selection.selectedStepId.value = loopStep.id;
    ctx.selection.selectionAnchorId.value = loopStep.id;
    ctx.selection.selectedLoopInnerStepId.value = innerSteps[0]?.id ?? null;
    ctx.recordUndo(`Wrap retry loop "${loopStep.label}"`, before);
    return {ok: true, loopStepId: loopStep.id};
  }

  function lockSelectionAsCapsule(
    capsuleName: string,
    options?: {capsuleId?: string},
  ): {ok: true; capsule: CapsuleDefinition; replacedStepCount: number} | {ok: false; message: string} {
    const pipeline = ctx.getPipeline();
    const range = getSelectionRange() ?? (pipeline.steps.length > 0
      ? {startIndex: 0, endIndex: pipeline.steps.length - 1}
      : null);
    if (!range) return {ok: false, message: 'Add steps before locking a Capsule'};
    const capsuleId = options?.capsuleId ?? newId('cap');
    const result = extractStepsToCapsule({
      pipeline,
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

  return {
    getSelectionRange,
    applyCapsuleExtraction,
    spreadCapsule,
    collapseInlineCapsule,
    detachCapsule,
    lockInlineCapsuleAsCapsule,
    wrapSelectionInRetryLoop,
    lockSelectionAsCapsule,
  };
}
