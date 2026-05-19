import type {PipelineSuggestion} from './types.js';
import {BUILTIN_SUGGESTIONS} from './definitions.js';
import type {PipelineStep} from '@lorca/core';

export type {PipelineSuggestion, SuggestionCategory} from './types.js';
export {BUILTIN_SUGGESTIONS} from './definitions.js';

let _counter = 0;

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

/** Clone insertable steps with fresh IDs and namespaces to avoid collisions. */
export function instantiateSuggestion(
  suggestion: PipelineSuggestion,
  existingNamespaces: ReadonlySet<string>,
): PipelineStep[] {
  return suggestion.insertableSteps.map((step) => {
    let ns = step.outputNamespace;
    let attempt = 0;
    while (existingNamespaces.has(ns)) {
      attempt++;
      ns = `${step.outputNamespace}_${attempt}`;
    }

    const cloned: PipelineStep = {
      ...step,
      id: uniqueId(step.type),
      outputNamespace: ns,
      createdFromSuggestionId: suggestion.id,
      lastEditedAt: new Date().toISOString(),
    };
    if (step.prompt) {
      cloned.prompt = {
        ...step.prompt,
        blocks: step.prompt.blocks.map((b) => ({
          ...b,
          id: uniqueId('block'),
        })),
      };
    }
    return cloned;
  });
}

export function getBuiltinSuggestion(id: string): PipelineSuggestion | undefined {
  return BUILTIN_SUGGESTIONS.find((s) => s.id === id);
}
