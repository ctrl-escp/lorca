import type {PipelineStep} from '@lorca/core';

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
  insertableSteps: PipelineStep[];
  requiredBindings: SuggestionBinding[];
  outputHints: SuggestionOutputHint[];
}
