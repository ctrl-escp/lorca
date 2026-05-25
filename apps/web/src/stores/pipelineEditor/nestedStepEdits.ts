import {toRaw} from 'vue';
import type {PipelineDefinition, PipelineStep, StepType} from '@lorca/core';
import type {PipelineEditorSnapshot} from './snapshot.js';

export interface NestedStepEditContext {
  getPipeline: () => PipelineDefinition;
  setPipeline: (next: PipelineDefinition) => void;
  getExistingNamespaces: () => ReadonlySet<string>;
  snapshot: () => PipelineEditorSnapshot;
  recordUndo: (label: string, before: PipelineEditorSnapshot) => void;
  updateStepConfig: (stepId: string, patch: Partial<PipelineStep>) => void;
  buildDefaultStep: (type: StepType, overrides?: Partial<PipelineStep>) => PipelineStep;
}

export function createNestedStepEditors(ctx: NestedStepEditContext) {
  function findLoopGroup(loopStepId: string): PipelineStep | undefined {
    const step = ctx.getPipeline().steps.find((s) => s.id === loopStepId);
    return step?.config.type === 'loop-group' ? step : undefined;
  }

  function findInlineCapsuleStep(capsuleStepId: string): PipelineStep | undefined {
    const step = ctx.getPipeline().steps.find((s) => s.id === capsuleStepId);
    return step?.config.type === 'capsule-instance' ? step : undefined;
  }

  function contextStepsForLoopInner(loopStepId: string, innerStepId: string): PipelineStep[] {
    const pipeline = ctx.getPipeline();
    const loopIdx = pipeline.steps.findIndex((s) => s.id === loopStepId);
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group' || loopIdx < 0) return pipeline.steps;

    const innerIdx = loop.config.steps.findIndex((s) => s.id === innerStepId);
    const outerBefore = pipeline.steps.slice(0, loopIdx);
    const innerBefore = innerIdx >= 0 ? loop.config.steps.slice(0, innerIdx) : loop.config.steps;
    return [...outerBefore, ...innerBefore];
  }

  function contextStepsForInlineCapsuleInner(capsuleStepId: string, innerStepId: string): PipelineStep[] {
    const pipeline = ctx.getPipeline();
    const capsuleIdx = pipeline.steps.findIndex((s) => s.id === capsuleStepId);
    const capsule = findInlineCapsuleStep(capsuleStepId);
    if (!capsule || capsule.config.type !== 'capsule-instance' || capsuleIdx < 0) return pipeline.steps;

    const inlineSteps = capsule.config.inlineSteps ?? [];
    const innerIdx = inlineSteps.findIndex((s) => s.id === innerStepId);
    const outerBefore = pipeline.steps.slice(0, capsuleIdx);
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
    const before = ctx.snapshot();
    const innerSteps = mutate(loop.config.steps.map((s) => JSON.parse(JSON.stringify(toRaw(s)))));
    ctx.updateStepConfig(loopStepId, {
      config: {...loop.config, steps: innerSteps},
    });
    ctx.recordUndo(label, before);
  }

  function mutateInlineCapsuleSteps(
    capsuleStepId: string,
    mutate: (steps: PipelineStep[]) => PipelineStep[],
    label: string,
  ) {
    const capsule = findInlineCapsuleStep(capsuleStepId);
    if (!capsule || capsule.config.type !== 'capsule-instance') return;
    const before = ctx.snapshot();
    const inlineSteps = mutate((capsule.config.inlineSteps ?? []).map((s) => JSON.parse(JSON.stringify(toRaw(s)))));
    ctx.updateStepConfig(capsuleStepId, {
      config: {...capsule.config, inlineSteps, inlineModified: true},
    });
    ctx.recordUndo(label, before);
  }

  function updateLoopInnerStep(loopStepId: string, innerStepId: string, patch: Partial<PipelineStep>) {
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group') return;
    const innerSteps = loop.config.steps.map((s) =>
      s.id === innerStepId ? {...s, ...patch, lastEditedAt: new Date().toISOString()} : s,
    );
    ctx.updateStepConfig(loopStepId, {config: {...loop.config, steps: innerSteps}});
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
    ctx.updateStepConfig(capsuleStepId, {config: {...capsule.config, inlineSteps: innerSteps, inlineModified: true}});
  }

  function commitLoopInnerStepEdit(
    loopStepId: string,
    innerStepId: string,
    patch: Partial<PipelineStep>,
    label: string,
  ) {
    const before = ctx.snapshot();
    updateLoopInnerStep(loopStepId, innerStepId, patch);
    ctx.recordUndo(label, before);
  }

  function commitInlineCapsuleInnerStepEdit(
    capsuleStepId: string,
    innerStepId: string,
    patch: Partial<PipelineStep>,
    label: string,
  ) {
    const before = ctx.snapshot();
    updateInlineCapsuleInnerStep(capsuleStepId, innerStepId, patch);
    ctx.recordUndo(label, before);
  }

  function appendLoopInnerStep(loopStepId: string, type: StepType): string | null {
    const loop = findLoopGroup(loopStepId);
    if (!loop || loop.config.type !== 'loop-group') return null;
    if (type === 'loop-group' || type === 'capsule-instance') return null;
    const step = ctx.buildDefaultStep(type);
    mutateLoopInnerSteps(loopStepId, (innerSteps) => [...innerSteps, step], `Add inner "${step.label}"`);
    return step.id;
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

  return {
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
    findLoopGroup,
    findInlineCapsuleStep,
  };
}
