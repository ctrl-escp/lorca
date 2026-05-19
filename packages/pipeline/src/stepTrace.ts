import type {PipelineArtifact, PipelineStep, TraceHistoryReadInput} from '@lorca/core';
import type {CompiledExecutionStep} from './chainCompiler.js';

export function truncatePreview(value: string, max = 120): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

export function primaryOutputPreview(
  step: PipelineStep,
  artifacts: Record<string, PipelineArtifact>,
): string | undefined {
  const key = `${step.outputNamespace}.${step.primaryOutputName}`;
  const artifact = artifacts[key];
  if (!artifact) return undefined;
  if (typeof artifact.value === 'string') return truncatePreview(artifact.value);
  return truncatePreview(JSON.stringify(artifact.value));
}

export function traceDetailFromCompiledStep(
  compiledStep: CompiledExecutionStep,
  inputArtifactRefs?: string[],
): Pick<import('@lorca/core').PipelineTraceEvent, 'inputArtifactNames' | 'historyReadInputs'> {
  return {
    inputArtifactNames: inputArtifactRefs ?? compiledStep.inputArtifactRefs,
  };
}

export function rawResponsePreview(raw: unknown): string {
  if (typeof raw === 'string') return truncatePreview(raw, 200);
  try {
    return truncatePreview(JSON.stringify(raw), 200);
  } catch {
    return '[unserializable response]';
  }
}

export function historyReadsForTrace(
  reads: TraceHistoryReadInput[],
): TraceHistoryReadInput[] {
  return reads.map((r) => ({
    ...r,
    ...(r.preview !== undefined ? {preview: truncatePreview(r.preview, 80)} : {}),
  }));
}
