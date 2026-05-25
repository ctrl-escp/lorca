import type {PipelineStep} from '@lorca/core';
import {listPipelineInputArtifacts, listStepOutputArtifacts} from '@lorca/pipeline';

export function artifactRefsBeforeStep(steps: readonly PipelineStep[], stepId: string): string[] {
  const refs = listPipelineInputArtifacts().map((artifact) => artifact.ref);
  for (const step of steps) {
    if (step.id === stepId) break;
    refs.push(...listStepOutputArtifacts(step).map((artifact) => artifact.ref));
  }
  return [...new Set(refs)];
}
