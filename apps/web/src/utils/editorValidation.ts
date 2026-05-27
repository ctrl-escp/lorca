import type {CapsuleDefinition, PipelineDefinition} from '@lorca/core';
import {validatePipeline, type ValidateStepChainOptions} from '@lorca/pipeline';
import {validateCapsule} from '@lorca/capsules';

export function formatPipelineValidationError(
  def: PipelineDefinition,
  options?: ValidateStepChainOptions,
): string | null {
  const result = validatePipeline(def, options);
  return result.ok ? null : result.error.message;
}

export function formatCapsuleValidationError(def: CapsuleDefinition): string | null {
  const result = validateCapsule(def);
  return result.ok ? null : result.error.message;
}
