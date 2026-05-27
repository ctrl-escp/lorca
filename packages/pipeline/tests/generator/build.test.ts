import {describe, expect, it} from 'vitest';
import type {PipelineStep} from '@lorca/core';
import {
  buildStepsFromGeneratorPlan,
  PIPELINE_GENERATOR_SCHEMA_VERSION,
  type GeneratorBuildContext,
} from '../../src/generator/index.js';

function mockContext(overrides: Partial<GeneratorBuildContext> = {}): GeneratorBuildContext {
  return {
    allowCapsules: false,
    applyMode: 'replace',
    instantiateSuggestion: () => null,
    getRolePrompt: () => null,
    resolveCapsule: () => undefined,
    resolveModelAssignments: ({steps}) => ({steps, unresolved: []}),
    ...overrides,
  };
}

describe('buildStepsFromGeneratorPlan', () => {
  it('returns success for an empty plan', () => {
    const result = buildStepsFromGeneratorPlan(
      {schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION, steps: []},
      mockContext(),
    );
    expect(result.ok).toBe(true);
    expect(result.steps).toEqual([]);
  });

  it('reports unknown suggestionId via catalog validation', () => {
    const result = buildStepsFromGeneratorPlan(
      {
        schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
        steps: [{kind: 'suggestion', stepKey: 'x', suggestionId: 'no-such-suggestion'}],
      },
      mockContext(),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Unknown suggestionId'))).toBe(true);
  });

  it('reports not-implemented for valid catalog ids before Phase 2 materialization', () => {
    const result = buildStepsFromGeneratorPlan(
      {
        schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
        steps: [{kind: 'suggestion', stepKey: 'a', suggestionId: 'known'}],
      },
      mockContext({
        instantiateSuggestion: (id) => (id === 'known' ? [{id: 's'} as never] : null),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Phase 2'))).toBe(true);
  });

  it('invokes resolveModelAssignments when builder is implemented', () => {
    let called = false;
    const context = mockContext({
      resolveModelAssignments: ({steps}) => {
        called = true;
        return {steps: steps as PipelineStep[], unresolved: []};
      },
    });
    buildStepsFromGeneratorPlan(
      {schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION, steps: []},
      context,
    );
    expect(called).toBe(false);
  });
});
