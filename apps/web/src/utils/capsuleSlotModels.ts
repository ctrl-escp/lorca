import type {CapsuleDefinition, ModelRef} from '@lorca/core';
import type {DiscoveredModel} from '@lorca/core';
import {pickModelRefForSlot} from '@lorca/endpoints';

export function buildCapsuleSlotBindings(
  capsule: CapsuleDefinition,
  enabledModels: DiscoveredModel[],
  existing: Record<string, ModelRef> = {},
): Record<string, ModelRef> {
  const modelSlotBindings: Record<string, ModelRef> = {...existing};
  for (const slot of capsule.interface.modelSlots) {
    const picked = pickModelRefForSlot(enabledModels, slot);
    if (picked) modelSlotBindings[slot.name] = picked;
  }
  return modelSlotBindings;
}
