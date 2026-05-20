import type {ModelUsageBucket, PipelineStep} from '@lorca/core';

export type SuggestionCategory =
  | 'extraction'
  | 'planning'
  | 'generation'
  | 'verification'
  | 'rewrite'
  | 'utility';

export interface SuggestionBinding {
  name: string;
  description: string;
  required: boolean;
}

export interface SuggestionOutputHint {
  stepId: string;
  outputName: string;
  description: string;
}

export interface PipelineSuggestion {
  id: string;
  name: string;
  description: string;
  category: SuggestionCategory;
  /** Preferred model usage bucket when auto-assigning a model on insert. */
  preferredModelBucket?: ModelUsageBucket;
  insertableSteps: PipelineStep[];
  requiredBindings: SuggestionBinding[];
  outputHints: SuggestionOutputHint[];
}
