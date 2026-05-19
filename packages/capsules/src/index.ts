export type {
  CapsuleDefinition,
  CapsuleInterface,
  CapsuleInputPort,
  CapsuleOutputPort,
  CapsuleParameter,
  CapsuleModelSlot,
  CapsuleTestCase,
  CapsuleTestRunSummary,
  CapsuleLoopConfig,
  CapsuleInstanceConfig,
  CapsuleValueKind,
  CapsuleParameterKind,
} from '@lorca/core';

export {validateCapsule} from './validate.js';
export {executeCapsuleTestRun} from './executor.js';
export type {CapsuleTestInput} from './executor.js';
export {lockCapsule, nextVersion, createDraftFromLocked} from './lock.js';
export {
  BUILTIN_EXAMPLES,
  BUILTIN_EXAMPLE_IDS,
  getBuiltinExamples,
  getBuiltinExample,
  isBuiltinExampleId,
  duplicateExampleCapsule,
  collectExampleTemplateStrings,
} from './examples/index.js';
