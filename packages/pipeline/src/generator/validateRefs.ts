import {parseGeneratorArtifactRef} from './refs.js';
import type {GeneratorApplyMode, GeneratorPlanEntry} from './types.js';

const TEMPLATE_REF_PATTERN = /\{\{\s*(generated|current):([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\s*\}\}/g;

export interface ValidatePlanRefsOptions {
  applyMode: GeneratorApplyMode;
  /** True when append mode and current pipeline context was sent (non-stub). */
  hasPipelineContext: boolean;
}

function collectExplicitRefs(entry: GeneratorPlanEntry): {ref: string; label: string}[] {
  const refs: {ref: string; label: string}[] = [];
  const key = entry.stepKey;

  if (entry.kind === 'custom') {
    for (const read of entry.historyReads ?? []) {
      refs.push({ref: read.ref, label: `${key}.historyReads`});
    }
  }

  if (entry.kind === 'capsule') {
    for (const [port, ref] of Object.entries(entry.inputBindings ?? {})) {
      refs.push({ref, label: `${key}.inputBindings.${port}`});
    }
    for (const [port, ref] of Object.entries(entry.outputBindings ?? {})) {
      refs.push({ref, label: `${key}.outputBindings.${port}`});
    }
  }

  if (entry.kind === 'presentation') {
    for (const match of entry.text.matchAll(TEMPLATE_REF_PATTERN)) {
      const scope = match[1]!;
      const part = match[2]!;
      const output = match[3]!;
      refs.push({ref: `${scope}:${part}.${output}`, label: `${key}.text`});
    }
  }

  return refs;
}

function validateOneRef(
  refStr: string,
  label: string,
  currentStepKey: string,
  availableStepKeys: ReadonlySet<string>,
  options: ValidatePlanRefsOptions,
): string | null {
  const parsed = parseGeneratorArtifactRef(refStr);
  if (!parsed) {
    return `Invalid artifact ref "${refStr}" (${label})`;
  }

  if (parsed.scope === 'generated') {
    const isSelf = parsed.stepKey === currentStepKey;
    if (!isSelf && !availableStepKeys.has(parsed.stepKey)) {
      return `Forward or unknown generated ref "${refStr}" (${label})`;
    }
    return null;
  }

  if (options.applyMode !== 'append') {
    return `current:* ref "${refStr}" requires append mode (${label})`;
  }
  if (!options.hasPipelineContext) {
    return `current:* ref "${refStr}" requires existing pipeline context (${label})`;
  }
  return null;
}

/**
 * Depth-first walk: refs must target earlier stepKeys (same-step generated refs allowed).
 */
export function validatePlanRefs(
  steps: readonly GeneratorPlanEntry[],
  options: ValidatePlanRefsOptions,
): string | null {
  const available = new Set<string>();

  function visit(entry: GeneratorPlanEntry): string | null {
    for (const {ref, label} of collectExplicitRefs(entry)) {
      const err = validateOneRef(ref, label, entry.stepKey, available, options);
      if (err) return err;
    }

    available.add(entry.stepKey);

    if (entry.kind === 'loop') {
      for (const inner of entry.steps) {
        const err = visit(inner);
        if (err) return err;
      }
    }

    return null;
  }

  for (const entry of steps) {
    const err = visit(entry);
    if (err) return err;
  }

  return null;
}
