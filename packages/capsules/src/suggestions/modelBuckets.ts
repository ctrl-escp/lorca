import type {ModelUsageBucket, PipelineStep} from '@lorca/core';
import {BUILTIN_SUGGESTIONS} from './definitions.js';

/** Usage buckets to suggest when remapping or assigning a model for this step. */
export function resolveModelCallSuggestedBuckets(step: PipelineStep): ModelUsageBucket[] {
  if (step.type !== 'model-call') return ['general'];

  const fromId = step.createdFromSuggestionId;
  if (fromId) {
    const bucket = BUILTIN_SUGGESTIONS.find((s) => s.id === fromId)?.preferredModelBucket;
    if (bucket) return [bucket];
  }

  const label = step.label?.trim();
  if (label) {
    for (const suggestion of BUILTIN_SUGGESTIONS) {
      if (
        suggestion.name === label
        || suggestion.insertableSteps.some((s) => s.label === label)
      ) {
        if (suggestion.preferredModelBucket) return [suggestion.preferredModelBucket];
      }
    }
  }

  return ['general'];
}
