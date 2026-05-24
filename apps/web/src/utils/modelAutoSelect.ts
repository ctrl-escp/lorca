import type {ModelRef, PipelineStep} from '@lorca/core';
import {resolveModelCallSuggestedBuckets} from '@lorca/capsules';
import {autoSelectModelCallStep} from '@lorca/endpoints';

export {autoSelectCapsuleSlot} from '@lorca/endpoints';

export function tryAutoSelectModelCallStep(
  step: PipelineStep,
  models: Parameters<typeof autoSelectModelCallStep>[1],
) {
  return autoSelectModelCallStep(step, models, resolveModelCallSuggestedBuckets(step));
}

export function modelKeyFromRef(ref: {endpointId: string; modelName: string}): string {
  return `${ref.endpointId}::${ref.modelName}`;
}

export function modelKeyFromBinding(ref: ModelRef | undefined): string {
  if (!ref || ref.kind === 'slot') return '';
  if (ref.kind === 'fixed') return modelKeyFromRef(ref);
  return '';
}

export function bindingFromModelKey(key: string): ModelRef {
  const parts = key.split('::');
  return {kind: 'fixed', endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')};
}

export function slotKeysFromBindings(bindings: Record<string, ModelRef> | undefined): Record<string, string> {
  const keys: Record<string, string> = {};
  if (!bindings) return keys;
  for (const [slotName, ref] of Object.entries(bindings)) {
    const key = modelKeyFromBinding(ref);
    if (key) keys[slotName] = key;
  }
  return keys;
}

export function bindingsFromSlotKeys(keys: Record<string, string>): Record<string, ModelRef> {
  const bindings: Record<string, ModelRef> = {};
  for (const [slotName, key] of Object.entries(keys)) {
    if (key) bindings[slotName] = bindingFromModelKey(key);
  }
  return bindings;
}
