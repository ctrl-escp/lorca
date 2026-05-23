import type {
  CapsuleDefinition,
  CapsuleInstanceStepConfig,
  ModelCallStepConfig,
  ModelRef,
  PipelineDefinition,
  PipelineStep,
} from '@lorca/core';

export function isModelRefConfigured(ref: ModelRef): boolean {
  if (ref.kind === 'fixed') {
    return Boolean(ref.endpointId.trim() && ref.modelName.trim());
  }
  if (ref.kind === 'any-enabled-endpoint') {
    return Boolean(ref.modelName.trim());
  }
  return Boolean(ref.slotName.trim());
}

export function isCapsuleInstanceRunReady(
  config: CapsuleInstanceStepConfig,
  getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  const bindings = config.modelSlotBindings ?? {};
  const boundSlots = Object.entries(bindings);
  if (boundSlots.length > 0) {
    return boundSlots.every(([, ref]) => isModelRefConfigured(ref));
  }

  if (!getCapsule) return false;

  const capsule = getCapsule(config.capsuleId, config.capsuleVersion);
  if (!capsule) return false;

  const requiredSlots = capsule.interface.modelSlots.filter((slot) => slot.required !== false);
  return requiredSlots.length === 0;
}

function stepsHaveRunnableModelPath(
  steps: readonly PipelineStep[],
  getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  for (const step of steps) {
    if (!step.enabled) continue;

    if (step.config.type === 'model-call') {
      const cfg = step.config as ModelCallStepConfig;
      if (isModelRefConfigured(cfg.modelRef)) return true;
      continue;
    }

    if (step.config.type === 'capsule-instance') {
      if (isCapsuleInstanceRunReady(step.config, getCapsule)) return true;
      continue;
    }

    if (step.config.type === 'loop-group') {
      if (stepsHaveRunnableModelPath(step.config.steps, getCapsule)) return true;
    }
  }
  return false;
}

export function pipelineHasConfiguredModel(
  def: PipelineDefinition,
  getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  return pipelineStepChainRunReady(def, 'x', getCapsule);
}

export function pipelineRunReady(
  def: PipelineDefinition,
  userPrompt: string,
  getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  return userPrompt.trim().length > 0 && pipelineHasConfiguredModel(def, getCapsule);
}

// ── V2 step-chain helpers ────────────────────────────────────────────────────

export function pipelineStepChainRunReady(
  def: PipelineDefinition,
  userPrompt: string,
  getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  if (!userPrompt.trim()) return false;
  return stepsHaveRunnableModelPath(def.steps, getCapsule);
}
