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
  existingSteps?: PipelineStep[],
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

    const templateStepId = step.id;

    const cloned: PipelineStep = {
      ...step,
      id: uniqueId(step.type),
      outputNamespace,
      createdFromSuggestionId: suggestion.id,
      createdFromTemplateStepId: templateStepId,
      lastEditedAt: new Date().toISOString(),
    };

    if (step.prompt) {
      cloned.prompt = {
        ...step.prompt,
        historyReads: step.prompt.historyReads.map((hr) => ({...hr})),
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

  const cloned = suggestion.insertableSteps.map(cloneOne);

  // Remap historyRead sourceStepIds that reference template step IDs.
  // Priority: intra-suggestion batch first, then existingSteps, then leave as-is.
  function remapSteps(steps: PipelineStep[]): void {
    for (const step of steps) {
      if (step.prompt?.historyReads) {
        for (const hr of step.prompt.historyReads) {
          const templateId = hr.sourceStepId;
          const intra = cloned.find((s) => s.createdFromTemplateStepId === templateId);
          if (intra) {
            hr.sourceStepId = intra.id;
            continue;
          }
          const cross = existingSteps?.find((s) => s.createdFromTemplateStepId === templateId);
          if (cross) {
            hr.sourceStepId = cross.id;
          }
        }
      }
      if (step.config.type === 'loop-group') {
        remapSteps(step.config.steps);
      }
    }
  }

  remapSteps(cloned);

  return cloned;
}

export function getBuiltinSuggestion(id: string): PipelineSuggestion | undefined {
  return ALL_SUGGESTIONS.find((s) => s.id === id);
}

export {resolveModelCallSuggestedBuckets} from './modelBuckets.js';
