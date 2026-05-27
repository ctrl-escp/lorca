import type {PipelineDefinition} from '@lorca/core';
import {parseGeneratorArtifactRef} from './refs.js';
import type {StepKeyBinding} from './materializeState.js';

export const GENERATOR_TEMPLATE_REF_PATTERN =
  /\{\{\s*(generated|current):([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\s*\}\}/g;

export function uniqueNamespace(base: string, namespaces: Set<string>): string {
  let ns = base;
  let i = 2;
  while (namespaces.has(ns)) {
    ns = `${base}_${i++}`;
  }
  namespaces.add(ns);
  return ns;
}

export function resolveGeneratorRefToArtifactKey(
  ref: string,
  stepKeyMap: ReadonlyMap<string, StepKeyBinding>,
  existingPipeline: PipelineDefinition | undefined,
  currentStepKey: string,
): string | null {
  const parsed = parseGeneratorArtifactRef(ref);
  if (!parsed) return null;

  if (parsed.scope === 'generated') {
    const binding = stepKeyMap.get(parsed.stepKey);
    if (!binding) return null;
    return `${binding.outputNamespace}.${parsed.output}`;
  }

  if (!existingPipeline) return null;
  const knownNamespaces = new Set<string>([existingPipeline.input.outputNamespace]);
  for (const step of existingPipeline.steps) {
    knownNamespaces.add(step.outputNamespace);
    if (step.config.type === 'loop-group') {
      for (const inner of step.config.steps) knownNamespaces.add(inner.outputNamespace);
    }
    if (step.config.type === 'capsule-instance') {
      for (const inner of step.config.inlineSteps ?? []) knownNamespaces.add(inner.outputNamespace);
    }
  }
  if (!knownNamespaces.has(parsed.namespace)) return null;
  void currentStepKey;
  return `${parsed.namespace}.${parsed.output}`;
}

export function convertGeneratorTemplateText(
  text: string,
  stepKeyMap: ReadonlyMap<string, StepKeyBinding>,
  existingPipeline: PipelineDefinition | undefined,
  currentStepKey: string,
): {text: string; error?: string} {
  let error: string | undefined;
  const converted = text.replace(
    GENERATOR_TEMPLATE_REF_PATTERN,
    (match, scope: string, part: string, output: string) => {
      const ref = `${scope}:${part}.${output}`;
      const artifactKey = resolveGeneratorRefToArtifactKey(
        ref,
        stepKeyMap,
        existingPipeline,
        currentStepKey,
      );
      if (!artifactKey) {
        error = `Could not resolve template ref ${ref}`;
        return match;
      }
      return `{{artifact.${artifactKey}}}`;
    },
  );
  return error ? {text: converted, error} : {text: converted};
}
