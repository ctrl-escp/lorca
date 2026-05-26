import type {PipelineStep} from '@lorca/core';

export function stepArtifactKey(step: PipelineStep, outputName?: string): string {
  return `${step.outputNamespace}.${outputName ?? step.primaryOutputName}`;
}
