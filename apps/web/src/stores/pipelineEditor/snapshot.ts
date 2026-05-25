import {toRaw} from 'vue';
import type {PipelineDefinition, PipelineStep} from '@lorca/core';

export interface PipelineEditorSnapshot {
  steps: PipelineStep[];
  outputStepId?: string;
  pipelineName: string;
  inputRaw: string;
}

export interface PipelineEditorSelectionRefs {
  selectedStepId: {value: string | null};
  selectionAnchorId: {value: string | null};
  selectedLoopInnerStepId: {value: string | null};
  selectedInlineCapsuleInnerStepId: {value: string | null};
}

export function snapshotPipeline(pipeline: PipelineDefinition): PipelineEditorSnapshot {
  return {
    steps: JSON.parse(JSON.stringify(toRaw(pipeline.steps))),
    pipelineName: pipeline.name,
    inputRaw: pipeline.input.raw,
    ...(pipeline.outputStepId !== undefined ? {outputStepId: pipeline.outputStepId} : {}),
  };
}

export function applyPipelineSnapshot(
  pipeline: PipelineDefinition,
  snap: PipelineEditorSnapshot,
  selection: PipelineEditorSelectionRefs,
): PipelineDefinition {
  const next: PipelineDefinition = {
    ...pipeline,
    steps: snap.steps,
    name: snap.pipelineName,
    input: {...pipeline.input, raw: snap.inputRaw},
    updatedAt: new Date().toISOString(),
  };
  if (snap.outputStepId !== undefined) next.outputStepId = snap.outputStepId;
  else delete (next as Partial<PipelineDefinition>).outputStepId;

  if (selection.selectedStepId.value && !next.steps.find((s) => s.id === selection.selectedStepId.value)) {
    selection.selectedStepId.value = null;
  }
  const selected = selection.selectedStepId.value
    ? next.steps.find((s) => s.id === selection.selectedStepId.value)
    : null;
  if (selected?.config.type !== 'loop-group') selection.selectedLoopInnerStepId.value = null;
  if (selected?.config.type !== 'capsule-instance') selection.selectedInlineCapsuleInnerStepId.value = null;
  if (selected?.config.type === 'loop-group' && selection.selectedLoopInnerStepId.value) {
    if (!selected.config.steps.some((s) => s.id === selection.selectedLoopInnerStepId.value)) {
      selection.selectedLoopInnerStepId.value = null;
    }
  }
  if (selected?.config.type === 'capsule-instance' && selection.selectedInlineCapsuleInnerStepId.value) {
    if (!(selected.config.inlineSteps ?? []).some((s) => s.id === selection.selectedInlineCapsuleInnerStepId.value)) {
      selection.selectedInlineCapsuleInnerStepId.value = null;
    }
  }
  return next;
}

export function snapshotsEqual(a: PipelineEditorSnapshot, b: PipelineEditorSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
