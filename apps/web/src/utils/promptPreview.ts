import type {PipelineArtifact, PipelineStep} from '@lorca/core';

export const PREVIEW_TRUNCATE_CHARS = 400;

/**
 * Resolve a single artifact reference to its string value.
 * Returns null when the artifact is absent (caller decides whether to show a placeholder).
 * When truncateAt is set and the resolved string exceeds it, the value is sliced and
 * suffixed with '\n…(truncated)'.
 */
export function resolveArtifactValue(
  artifactRef: string,
  artifacts: Record<string, PipelineArtifact>,
  userPromptArtifacts: {raw: string | null; xml: string | null},
  truncateAt?: number,
): string | null {
  let raw: string | null;

  if (artifactRef === 'user_prompt.raw') {
    raw = userPromptArtifacts.raw;
  } else if (artifactRef === 'user_prompt.xml') {
    raw = userPromptArtifacts.xml;
  } else {
    const artifact = artifacts[artifactRef];
    if (!artifact) return null;
    raw =
      typeof artifact.value === 'string'
        ? artifact.value
        : JSON.stringify(artifact.value, null, 2);
  }

  if (raw === null) return null;

  if (truncateAt !== undefined && raw.length > truncateAt) {
    return raw.slice(0, truncateAt) + '\n…(truncated)';
  }
  return raw;
}

/**
 * Resolve the previous step's primary output for a given step.
 * Returns undefined when there is no prior enabled step and no user prompt available.
 * Falls back to user_prompt.xml when no prior step exists.
 */
export function resolvePreviousOutput(
  stepId: string,
  chainSteps: PipelineStep[],
  artifacts: Record<string, PipelineArtifact>,
  userPromptArtifacts: {raw: string | null; xml: string | null},
): string | undefined {
  const currentIdx = chainSteps.findIndex((s) => s.id === stepId);
  const priorSteps = currentIdx >= 0 ? chainSteps.slice(0, currentIdx) : chainSteps;
  const prevStep = [...priorSteps].reverse().find((s) => s.enabled);
  if (!prevStep) return userPromptArtifacts.xml ?? undefined;
  return (
    resolveArtifactValue(
      `${prevStep.outputNamespace}.${prevStep.primaryOutputName}`,
      artifacts,
      userPromptArtifacts,
    ) ?? undefined
  );
}
