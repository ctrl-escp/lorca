import type {CapsuleDefinition, PipelineStep} from '@lorca/core';
import {toRaw} from 'vue';
import {listStepOutputArtifacts} from '@lorca/pipeline';

export function unsupportedInlineCapsuleLockStep(steps: readonly PipelineStep[]): PipelineStep | null {
  for (const step of steps) {
    if (step.config.type === 'loop-group' || step.config.type === 'capsule-instance') return step;
  }
  return null;
}

export function validateInlineCapsuleLock(
  source: CapsuleDefinition,
  inlineSteps: readonly PipelineStep[],
): {ok: true} | {ok: false; message: string} {
  if (inlineSteps.length === 0) return {ok: false, message: 'Inline capsule has no steps to lock'};
  const unsupported = unsupportedInlineCapsuleLockStep(inlineSteps);
  if (unsupported) {
    return {
      ok: false,
      message: `Cannot lock inline Capsule because "${unsupported.label}" is a ${unsupported.config.type} step`,
    };
  }
  const outputRefs = new Set(inlineSteps.flatMap((s) => listStepOutputArtifacts(s).map((a) => a.ref)));
  for (const port of source.interface.outputs) {
    if (port.sourceArtifactKey && !outputRefs.has(port.sourceArtifactKey)) {
      return {ok: false, message: `Output "${port.name}" points to missing artifact ${port.sourceArtifactKey}`};
    }
  }
  return {ok: true};
}

export function remapDetachedSteps(
  sourceSteps: PipelineStep[],
  parentNamespaces: ReadonlySet<string>,
): PipelineStep[] {
  const namespaceMap = new Map<string, string>();
  const used = new Set(parentNamespaces);
  const detached = sourceSteps.map((s) => structuredClone(toRaw(s)) as PipelineStep);

  for (const step of detached) {
    const original = step.outputNamespace;
    const next = used.has(original) ? uniqueNamespaceForRemap(original, used) : original;
    namespaceMap.set(original, next);
    used.add(next);
    step.outputNamespace = next;
  }

  return detached.map((step) => remapStepArtifactRefs(step, namespaceMap));
}

function uniqueNamespaceForRemap(base: string, used: ReadonlySet<string>): string {
  let ns = base;
  let i = 2;
  while (used.has(ns)) ns = `${base}_${i++}`;
  return ns;
}

export function remapStepArtifactRefs(step: PipelineStep, namespaceMap: ReadonlyMap<string, string>): PipelineStep {
  const next: PipelineStep = {...step};
  if (step.prompt) {
    next.prompt = {
      ...step.prompt,
      historyReads: step.prompt.historyReads.map((read) => ({
        ...read,
        sourceArtifactRef: remapArtifactRef(read.sourceArtifactRef, namespaceMap),
      })),
    };
  }

  if (next.config.type === 'presentation') {
    next.config = {...next.config, text: remapArtifactRefsInText(next.config.text, namespaceMap)};
  } else if (next.config.type === 'capsule-instance') {
    const inlineSteps = next.config.inlineSteps?.map((inner) => remapStepArtifactRefs(inner, namespaceMap));
    next.config = {
      ...next.config,
      inputBindings: remapBindingRefs(next.config.inputBindings, namespaceMap),
      outputBindings: remapBindingRefs(next.config.outputBindings, namespaceMap),
      ...(inlineSteps ? {inlineSteps} : {}),
    };
  } else if (next.config.type === 'loop-group') {
    next.config = {
      ...next.config,
      steps: next.config.steps.map((inner) => remapStepArtifactRefs(inner, namespaceMap)),
    };
  }

  return next;
}

function remapBindingRefs(refs: Record<string, string>, namespaceMap: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(refs).map(([key, artifactRef]) => [key, remapArtifactRef(artifactRef, namespaceMap)]));
}

function remapArtifactRef(artifactRef: string, namespaceMap: ReadonlyMap<string, string>): string {
  for (const [from, to] of namespaceMap) {
    if (from !== to && artifactRef.startsWith(`${from}.`)) return `${to}.${artifactRef.slice(from.length + 1)}`;
  }
  return artifactRef;
}

function remapArtifactRefsInText(text: string, namespaceMap: ReadonlyMap<string, string>): string {
  let next = text;
  for (const [from, to] of namespaceMap) {
    if (from === to) continue;
    next = next.replaceAll(`artifact.${from}.`, `artifact.${to}.`);
    next = next.replaceAll(`${from}.`, `${to}.`);
  }
  return next;
}
