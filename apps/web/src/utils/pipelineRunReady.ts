import type {CapsuleDefinition, ModelRef, PipelineDefinition, ModelCallStepConfig} from '@lorca/core';

export function isModelRefConfigured(ref: ModelRef): boolean {
  if (ref.kind === 'fixed') {
    return Boolean(ref.endpointId.trim() && ref.modelName.trim());
  }
  return Boolean(ref.slotName.trim());
}

export function pipelineHasConfiguredModel(
  def: PipelineDefinition,
  _getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  return pipelineStepChainRunReady(def, 'x'); // delegate to V2 check
}

export function pipelineRunReady(
  def: PipelineDefinition,
  userPrompt: string,
  getCapsule?: (id: string, version: string) => CapsuleDefinition | undefined,
): boolean {
  return userPrompt.trim().length > 0 && pipelineHasConfiguredModel(def, getCapsule);
}

// ── V2 step-chain helpers ────────────────────────────────────────────────────

export function pipelineStepChainRunReady(def: PipelineDefinition, userPrompt: string): boolean {
  if (!userPrompt.trim()) return false;
  const activeSteps = def.steps.filter((s) => s.enabled);
  return activeSteps.some((s) => {
    if (s.config.type !== 'model-call') return false;
    const cfg = s.config as ModelCallStepConfig;
    return isModelRefConfigured(cfg.modelRef);
  });
}
