import type {PipelineStep} from '@lorca/core';
import {resolveModelCallSuggestedBuckets} from '@lorca/capsules';
import type {MissingModelReference} from '@lorca/storage';

export function collectGeneratorMissingModelRefs(steps: PipelineStep[]): MissingModelReference[] {
  const refs: MissingModelReference[] = [];

  function visit(step: PipelineStep) {
    if (step.config.type === 'model-call') {
      const ref = step.config.modelRef;
      const configured = ref.kind === 'fixed'
        ? Boolean(ref.endpointId && ref.modelName)
        : ref.kind === 'any-enabled-endpoint'
          ? Boolean(ref.modelName)
          : false;
      if (!configured) {
        refs.push({
          key: step.id,
          nodeId: step.id,
          endpointId: ref.kind === 'fixed' ? ref.endpointId : '',
          modelName: ref.kind === 'slot' ? '' : ref.modelName,
          label: step.label || step.id,
          suggestedBuckets: resolveModelCallSuggestedBuckets(step),
        });
      }
    }

    if (step.config.type === 'capsule-instance' && step.config.modelSlotBindings) {
      for (const [slotName, modelRef] of Object.entries(step.config.modelSlotBindings)) {
        const configured = modelRef.kind === 'fixed'
          ? Boolean(modelRef.endpointId && modelRef.modelName)
          : modelRef.kind === 'any-enabled-endpoint'
            ? Boolean(modelRef.modelName)
            : false;
        if (!configured) {
          refs.push({
            key: `${step.id}::${slotName}`,
            nodeId: step.id,
            endpointId: modelRef.kind === 'fixed' ? modelRef.endpointId : '',
            modelName: modelRef.kind === 'slot' ? '' : modelRef.modelName,
            label: `${step.label} · ${slotName}`,
            suggestedBuckets: ['general'],
          });
        }
      }
    }

    if (step.config.type === 'loop-group') {
      for (const inner of step.config.steps) visit(inner);
    }
  }

  for (const step of steps) visit(step);
  return refs;
}
