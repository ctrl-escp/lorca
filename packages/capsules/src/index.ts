export type {
  CapsuleDefinition,
  CapsuleInterface,
  CapsuleInputPort,
  CapsuleOutputPort,
  CapsuleParameter,
  CapsuleModelSlot,
  CapsuleTestCase,
  CapsuleTestRunSummary,
  CapsuleValueKind,
  CapsuleParameterKind,
} from '@lorca/core';

export {validateCapsule} from './validate.js';
export {executeCapsuleTestRun} from './executor.js';
export type {CapsuleTestInput, CapsuleTestRunResult} from './executor.js';
export {lockCapsule, nextVersion, createDraftFromLocked} from './lock.js';
export {
  BUILTIN_EXAMPLES,
  BUILTIN_EXAMPLE_IDS,
  LORCA_PIPELINE_GENERATOR_ID,
  LORCA_PIPELINE_GENERATOR,
  getBuiltinExamples,
  getBuiltinExample,
  isBuiltinExampleId,
  duplicateExampleCapsule,
  collectExampleTemplateStrings,
} from './examples/index.js';

export {
  BUILTIN_SUGGESTIONS,
  ALL_SUGGESTIONS,
  instantiateSuggestion,
  getBuiltinSuggestion,
  resolveModelCallSuggestedBuckets,
} from './suggestions/index.js';
export type {PipelineSuggestion, SuggestionCategory} from './suggestions/index.js';
export {buildRolePromptCatalog} from './rolePromptCatalog.js';
export type {BuildRolePromptCatalogOptions} from './rolePromptCatalog.js';
export {
  buildPipelineGeneratorRequest,
} from './pipelineGeneratorRequest.js';
export type {
  BuildPipelineGeneratorRequestInput,
  PipelineGeneratorRequestPayload,
} from './pipelineGeneratorRequest.js';
