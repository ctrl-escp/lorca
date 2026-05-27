import type {
  CapsuleDefinition,
  LoopExitCondition,
  ModelUsageBucket,
  PipelineDefinition,
  PipelineStep,
} from '@lorca/core';

export const PIPELINE_GENERATOR_SCHEMA_VERSION = 1 as const;
export const PIPELINE_GENERATOR_HARD_ENTRY_CAP = 25;

export type GeneratorApplyMode = 'replace' | 'append';

export type GeneratorInputSource = 'user' | 'previous-step' | 'current-pipeline-last';

export type GeneratorPromptMode = 'catalog' | 'custom';

export interface GeneratorPlanPrompt {
  mode: GeneratorPromptMode;
  rolePromptId?: string;
  text?: string;
}

export interface GeneratorHistoryRead {
  ref: string;
  tagName: string;
}

export interface GeneratorPlanEntryBase {
  kind: 'suggestion' | 'custom' | 'capsule' | 'loop' | 'presentation';
  stepKey: string;
  label?: string;
}

export interface GeneratorSuggestionEntry extends GeneratorPlanEntryBase {
  kind: 'suggestion';
  suggestionId: string;
  prompt?: GeneratorPlanPrompt;
}

export interface GeneratorCustomEntry extends GeneratorPlanEntryBase {
  kind: 'custom';
  inputSource?: GeneratorInputSource;
  prompt?: GeneratorPlanPrompt;
  modelId?: string;
  modelBucket?: ModelUsageBucket;
  outputType?: 'text' | 'json';
  historyReads?: GeneratorHistoryRead[];
}

export interface GeneratorCapsuleEntry extends GeneratorPlanEntryBase {
  kind: 'capsule';
  capsuleId: string;
  capsuleVersion: string;
  inputBindings?: Record<string, string>;
  outputBindings?: Record<string, string>;
  slotModels?: Record<string, {modelId?: string; modelBucket?: ModelUsageBucket}>;
}

export interface GeneratorLoopEntry extends GeneratorPlanEntryBase {
  kind: 'loop';
  maxIterations?: number;
  exitCondition?: LoopExitCondition;
  steps: GeneratorPlanEntry[];
}

export interface GeneratorPresentationEntry extends GeneratorPlanEntryBase {
  kind: 'presentation';
  text: string;
}

export type GeneratorPlanEntry =
  | GeneratorSuggestionEntry
  | GeneratorCustomEntry
  | GeneratorCapsuleEntry
  | GeneratorLoopEntry
  | GeneratorPresentationEntry;

export interface PipelineGeneratorPlan {
  schemaVersion: typeof PIPELINE_GENERATOR_SCHEMA_VERSION;
  steps: GeneratorPlanEntry[];
  assumptions?: string[];
  warnings?: string[];
}

export interface UnresolvedModelRef {
  stepId: string;
  stepKey: string;
  slotName?: string;
  reason: string;
}

export interface GeneratorModelAssignmentRequest {
  stepId: string;
  stepKey: string;
  modelId?: string;
  modelBucket?: ModelUsageBucket;
  slotModels?: Record<string, {modelId?: string; modelBucket?: ModelUsageBucket}>;
}

export interface GeneratorBuildContext {
  allowCapsules: boolean;
  applyMode: GeneratorApplyMode;
  existingPipeline?: PipelineDefinition;

  instantiateSuggestion: (
    suggestionId: string,
    existingNamespaces: Set<string>,
    existingSteps: PipelineStep[],
  ) => PipelineStep[] | null;

  getRolePrompt: (rolePromptId: string) => string | null;

  resolveCapsule: (capsuleId: string, capsuleVersion: string) => CapsuleDefinition | undefined;

  resolveModelAssignments: (input: {
    steps: PipelineStep[];
    requests: GeneratorModelAssignmentRequest[];
  }) => {
    steps: PipelineStep[];
    unresolved: UnresolvedModelRef[];
  };
}

export type PipelineGeneratorParseResult =
  | {ok: true; plan: PipelineGeneratorPlan}
  | {ok: false; message: string};

export interface GeneratorBuildResult {
  ok: boolean;
  steps: PipelineStep[];
  errors: string[];
  unresolvedModels: UnresolvedModelRef[];
  assumptions: string[];
  warnings: string[];
}
