import type {CapsuleDefinition, ModelRef, PipelineDefinition} from '@lorca/core';

export function isModelRefConfigured(ref: ModelRef): boolean {
  if (ref.kind === 'fixed') {
    return Boolean(ref.endpointId.trim() && ref.modelName.trim());
  }
  return Boolean(ref.slotName.trim());
}

export function pipelineHasConfiguredModel(
  def: PipelineDefinition,
  getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  const modelCalls = def.nodes.filter((n) => n.type === 'model-call');
  if (modelCalls.length > 0) {
    return modelCalls.every(
      (n) => n.type === 'model-call' && isModelRefConfigured(n.config.modelRef),
    );
  }

  const capsuleNodes = def.nodes.filter((n) => n.type === 'capsule-instance');
  if (capsuleNodes.length === 0 || !getCapsule) return false;

  return capsuleNodes.every((node) => {
    if (node.type !== 'capsule-instance') return false;
    const capsule = getCapsule(node.config.capsuleDefinitionId, node.config.capsuleVersion);
    if (!capsule) return false;
    const requiredSlots = capsule.interface.modelSlots.filter((s) => s.required);
    if (requiredSlots.length === 0) return false;
    return requiredSlots.every((slot) => {
      const assignment = node.config.modelSlotAssignments[slot.name];
      return Boolean(assignment?.endpointId.trim() && assignment?.modelName.trim());
    });
  });
}

export function pipelineRunReady(
  def: PipelineDefinition,
  userPrompt: string,
  getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  return userPrompt.trim().length > 0 && pipelineHasConfiguredModel(def, getCapsule);
}
