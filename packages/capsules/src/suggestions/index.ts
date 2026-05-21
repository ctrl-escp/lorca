import type {PipelineSuggestion} from './types.js';
import {BUILTIN_SUGGESTIONS} from './definitions.js';
import {RETRY_LOOP_SUGGESTIONS} from './retryLoops.js';
import type {PipelineStep} from '@lorca/core';

export type {PipelineSuggestion, SuggestionCategory} from './types.js';
export {BUILTIN_SUGGESTIONS} from './definitions.js';
export {RETRY_LOOP_SUGGESTIONS} from './retryLoops.js';

export const ALL_SUGGESTIONS: PipelineSuggestion[] = [...BUILTIN_SUGGESTIONS, ...RETRY_LOOP_SUGGESTIONS];

let _counter = 0;

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}`;
}

/** Clone insertable steps with fresh IDs and namespaces to avoid collisions. */
export function instantiateSuggestion(
  suggestion: PipelineSuggestion,
  existingNamespaces: ReadonlySet<string>,
): PipelineStep[] {
  const ns = new Set(existingNamespaces);

  function cloneOne(step: PipelineStep): PipelineStep {
    let outputNamespace = step.outputNamespace;
    let attempt = 0;
    while (ns.has(outputNamespace)) {
      attempt++;
      outputNamespace = `${step.outputNamespace}_${attempt}`;
    }
    ns.add(outputNamespace);

    const cloned: PipelineStep = {
      ...step,
      id: uniqueId(step.type),
      outputNamespace,
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

    if (step.config.type === 'loop-group') {
      cloned.config = {
        ...step.config,
        steps: step.config.steps.map((inner) => cloneOne(inner)),
      };
    }

    return cloned;
  }

  return suggestion.insertableSteps.map(cloneOne);
}

export function getBuiltinSuggestion(id: string): PipelineSuggestion | undefined {
  return ALL_SUGGESTIONS.find((s) => s.id === id);
}

export {resolveModelCallSuggestedBuckets} from './modelBuckets.js';
