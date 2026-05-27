import {describe, expect, it} from 'vitest';
import {parsePipelineGeneratorPlan, PIPELINE_GENERATOR_SCHEMA_VERSION} from '../../src/generator/index.js';

describe('parsePipelineGeneratorPlan', () => {
  it('accepts an empty v1 plan', () => {
    const raw = JSON.stringify({schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION, steps: []});
    const result = parsePipelineGeneratorPlan(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.steps).toEqual([]);
  });

  it('rejects legacy bare suggestion arrays', () => {
    const raw = JSON.stringify([{suggestionId: 'suggestion-intent-extraction'}]);
    const result = parsePipelineGeneratorPlan(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Legacy');
    }
  });

  it('rejects unknown schemaVersion', () => {
    const raw = JSON.stringify({schemaVersion: 99, steps: []});
    const result = parsePipelineGeneratorPlan(raw);
    expect(result.ok).toBe(false);
  });

  it('rejects capsule entries when allowCapsules is false', () => {
    const raw = JSON.stringify({
      schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
      steps: [{
        kind: 'capsule',
        stepKey: 'c1',
        capsuleId: 'example',
        capsuleVersion: 'v1',
      }],
    });
    const result = parsePipelineGeneratorPlan(raw, {allowCapsules: false});
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate stepKey across loop nesting', () => {
    const raw = JSON.stringify({
      schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
      steps: [{
        kind: 'loop',
        stepKey: 'loop',
        steps: [{kind: 'custom', stepKey: 'dup'}, {kind: 'custom', stepKey: 'dup'}],
      }],
    });
    const result = parsePipelineGeneratorPlan(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Duplicate stepKey');
  });
});
