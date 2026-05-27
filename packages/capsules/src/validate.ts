import type {CapsuleDefinition, PipelineError, PipelineStep, Result} from '@lorca/core';
import {ok, err} from '@lorca/core';
import {validateStepChainPipeline} from '@lorca/pipeline';

export function validateCapsule(def: CapsuleDefinition): Result<void, PipelineError> {
  if (def.steps.length === 0) {
    return err({
      code: 'invalid_pipeline_graph',
      message: 'Capsule must define at least one step',
    });
  }
  return validateStepChainCapsule(def);
}

function capsuleInputArtifactRefs(def: CapsuleDefinition): string[] {
  const refs: string[] = [];
  for (const port of def.interface.inputs) {
    const ref = port.defaultArtifactKey
      ?? (port.name === 'user_prompt' ? 'user_prompt.xml' : `${port.name}.text`);
    refs.push(ref);
    if (port.name === 'user_prompt') {
      refs.push('user_prompt.raw', 'user_prompt.xml');
    }
  }
  return refs;
}

function validateStepChainCapsule(def: CapsuleDefinition): Result<void, PipelineError> {
  const pipelineResult = validateStepChainPipeline({
    schemaVersion: 2,
    id: def.id,
    name: def.name,
    input: def.input ?? {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
    steps: def.steps,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  }, {extraArtifactRefs: capsuleInputArtifactRefs(def)});
  if (!pipelineResult.ok) return pipelineResult;

  const slotErr = validateStepModelSlots(def.steps ?? [], new Set(def.interface.modelSlots.map((s) => s.name)));
  if (slotErr) return slotErr;

  const outputKeys = new Set(stepOutputKeys(def.steps ?? []));
  for (const output of def.interface.outputs) {
    if (output.sourceArtifactKey && !outputKeys.has(output.sourceArtifactKey)) {
      return err({
        code: 'invalid_capsule_interface',
        message: `Capsule output "${output.name}" references unknown artifact: ${output.sourceArtifactKey}`,
      });
    }
  }

  return ok(undefined);
}

function validateStepModelSlots(
  steps: PipelineStep[],
  declaredSlots: Set<string>,
): Result<never, PipelineError> | null {
  for (const step of steps) {
    if (step.config.type === 'model-call' && step.config.modelRef.kind === 'slot' && !declaredSlots.has(step.config.modelRef.slotName)) {
      return err({
        code: 'invalid_capsule_interface',
        message: `Model call step references undeclared model slot: ${step.config.modelRef.slotName}`,
        nodeId: step.id,
      });
    }
    if (step.config.type === 'loop-group') {
      const nested = validateStepModelSlots(step.config.steps, declaredSlots);
      if (nested) return nested;
    }
  }
  return null;
}

function stepOutputKeys(steps: PipelineStep[]): string[] {
  const keys: string[] = [];
  for (const step of steps) {
    switch (step.config.type) {
      case 'presentation':
        keys.push(`${step.outputNamespace}.text`);
        break;
      case 'model-call':
        keys.push(`${step.outputNamespace}.text`, `${step.outputNamespace}.rawResponse`);
        if (step.config.outputType === 'json' || step.config.outputType === 'auto') {
          keys.push(`${step.outputNamespace}.json`, `${step.outputNamespace}.jsonValid`);
        }
        break;
      case 'loop-group':
        keys.push(`${step.outputNamespace}.${step.primaryOutputName}`);
        keys.push(...stepOutputKeys(step.config.steps));
        break;
      case 'capsule-instance':
        for (const ref of Object.values(step.config.outputBindings)) keys.push(ref);
        break;
      default: {
        const _exhaustive: never = step.config;
        throw new Error(`Unknown step type: ${String((_exhaustive as {type: string}).type)}`);
      }
    }
  }
  return keys;
}
