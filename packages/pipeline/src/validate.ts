import type {PipelineDefinition, PipelineError, Result} from '@lorca/core';
import {validateStepChainPipeline, type ValidateStepChainOptions} from './stepChainValidation.js';

export function validatePipeline(
  def: PipelineDefinition,
  options?: ValidateStepChainOptions,
): Result<void, PipelineError> {
  return validateStepChainPipeline(def, options);
}

export type {ValidateStepChainOptions} from './stepChainValidation.js';
