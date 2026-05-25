import type {CapsuleDefinition, PipelineStep} from '@lorca/core';
import {BUILTIN_EXAMPLES, BUILTIN_EXAMPLE_IDS} from './definitions.js';

export {
  BUILTIN_EXAMPLES,
  BUILTIN_EXAMPLE_IDS,
  LORCA_PIPELINE_GENERATOR_ID,
  LORCA_PIPELINE_GENERATOR,
  EXAMPLE_INTENT_EXTRACTION,
  EXAMPLE_ACCEPTANCE_CRITERIA,
  EXAMPLE_CANDIDATE_ANSWER,
  EXAMPLE_ANSWER_VERIFICATION,
  EXAMPLE_SUMMARY,
  EXAMPLE_PROMPT_REWRITE,
  EXAMPLE_CONSTRAINT_EXTRACTION,
  EXAMPLE_DRIFT_CHECK,
  EXAMPLE_BEST_OF_TWO,
  EXAMPLE_EXPERT,
} from './definitions.js';
export {
  buildExampleCapsule,
  modelCallStep,
  withAnswerVerifyRetryLoop,
  EXAMPLE_TIMESTAMP,
} from './build.js';
export type {ExampleCapsuleSpec, ModelCallStepSpec} from './build.js';

export function isBuiltinExampleId(id: string): boolean {
  return (BUILTIN_EXAMPLE_IDS as readonly string[]).includes(id);
}

export function getBuiltinExamples(): CapsuleDefinition[] {
  return BUILTIN_EXAMPLES;
}

export function getBuiltinExample(id: string, version = 'v1'): CapsuleDefinition | undefined {
  return BUILTIN_EXAMPLES.find((c) => c.id === id && c.version === version);
}

/** Clone a built-in example into a new user-owned draft Capsule. */
export function duplicateExampleCapsule(example: CapsuleDefinition, newId: string): CapsuleDefinition {
  const now = new Date().toISOString();
  const {lockedAt: _lockedAt, ...rest} = example;
  return {
    ...structuredClone(rest),
    id: newId,
    name: `${example.name} (copy)`,
    status: 'draft',
    version: 'v1',
    createdAt: now,
    updatedAt: now,
  };
}

/** Collect prompt template strings from example Capsule steps (for snapshot tests). */
export function collectExampleTemplateStrings(def: CapsuleDefinition): string[] {
  if (def.id === 'lorca-pipeline-generator') return [];
  const collect = (steps: PipelineStep[]): string[] => steps.flatMap((step) => {
    if (step.config.type === 'loop-group') return collect(step.config.steps);
    return step.prompt?.blocks
      .filter((block) => block.label !== 'Retry feedback')
      .map((block) => block.body) ?? [];
  });
  return [...new Set(collect(def.steps ?? []))];
}
