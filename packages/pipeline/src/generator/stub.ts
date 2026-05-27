import type {PipelineDefinition, PipelineStep} from '@lorca/core';

const DEFAULT_PIPELINE_NAME = 'New Pipeline';
const DEFAULT_STEP_LABEL = 'Model Call';
const DEFAULT_OUTPUT_NAMESPACE = 'answer';

function isEmptyModelRef(step: PipelineStep): boolean {
  if (step.config.type !== 'model-call') return false;
  const ref = step.config.modelRef;
  if (ref.kind === 'fixed') return ref.endpointId === '' && ref.modelName === '';
  return false;
}

function hasCustomPrompt(step: PipelineStep): boolean {
  const blocks = step.prompt?.blocks ?? [];
  return blocks.some((block) => block.body.trim().length > 0);
}

/**
 * True only for the factory-default single model-call pipeline (not user-edited one-step flows).
 */
export function isDefaultPipelineStub(pipeline: PipelineDefinition): boolean {
  if (pipeline.name !== DEFAULT_PIPELINE_NAME) return false;

  const input = pipeline.input;
  if (input.raw !== '' || input.tagName !== 'user' || input.outputNamespace !== 'user_prompt') {
    return false;
  }

  if (pipeline.steps.length !== 1) return false;

  const step = pipeline.steps[0]!;
  if (step.type !== 'model-call') return false;
  if (step.label !== DEFAULT_STEP_LABEL) return false;
  if (step.outputNamespace !== DEFAULT_OUTPUT_NAMESPACE) return false;
  if (!isEmptyModelRef(step)) return false;
  if (hasCustomPrompt(step)) return false;

  return true;
}
