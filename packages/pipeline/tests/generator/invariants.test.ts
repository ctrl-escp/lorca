import {describe, expect, it} from 'vitest';
import {
  buildStepsFromGeneratorPlan,
  parsePipelineGeneratorPlan,
  PIPELINE_GENERATOR_SCHEMA_VERSION,
  type GeneratorBuildContext,
} from '../../src/generator/index.js';

const SCHEMA = PIPELINE_GENERATOR_SCHEMA_VERSION;

function planJson(steps: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({schemaVersion: SCHEMA, steps, ...extra});
}

function mockContext(overrides: Partial<GeneratorBuildContext> = {}): GeneratorBuildContext {
  return {
    allowCapsules: false,
    applyMode: 'replace',
    instantiateSuggestion: (id) => (id === 'suggestion-intent-extraction' ? [{id: 'stub'} as never] : null),
    getRolePrompt: (id) => (id === 'role-known' ? 'You are a test role.' : null),
    resolveCapsule: () => undefined,
    resolveModelAssignments: ({steps}) => ({steps, unresolved: []}),
    ...overrides,
  };
}

describe('parse invariants', () => {
  it('rejects bare legacy array', () => {
    const r = parsePipelineGeneratorPlan('[{"suggestionId":"x"}]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Legacy');
  });

  it('rejects unknown schemaVersion', () => {
    expect(parsePipelineGeneratorPlan(planJson([], {schemaVersion: 99})).ok).toBe(false);
  });

  it('rejects duplicate stepKey in loop nesting', () => {
    const r = parsePipelineGeneratorPlan(planJson([
      {kind: 'loop', stepKey: 'loop', steps: [
        {kind: 'custom', stepKey: 'dup'},
        {kind: 'custom', stepKey: 'dup'},
      ]},
    ]));
    expect(r.ok).toBe(false);
  });

  it('rejects more than 25 recursive entries', () => {
    const inner = Array.from({length: 26}, (_, i) => ({kind: 'custom', stepKey: `s${i}`}));
    const r = parsePipelineGeneratorPlan(planJson([{kind: 'loop', stepKey: 'loop', steps: inner}]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('25');
  });

  it('rejects capsule when allowCapsules is false', () => {
    const r = parsePipelineGeneratorPlan(planJson([
      {kind: 'capsule', stepKey: 'c', capsuleId: 'x', capsuleVersion: 'v1'},
    ]), {allowCapsules: false});
    expect(r.ok).toBe(false);
  });

  it('rejects forward generated ref', () => {
    const r = parsePipelineGeneratorPlan(planJson([
      {
        kind: 'custom',
        stepKey: 'later',
        historyReads: [{ref: 'generated:earlier.text', tagName: 'e'}],
      },
      {kind: 'custom', stepKey: 'earlier'},
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/Forward|unknown generated/i);
  });

  it('rejects current:* in replace mode', () => {
    const r = parsePipelineGeneratorPlan(planJson([
      {kind: 'presentation', stepKey: 's', text: 'Prior: {{current:answer.text}}'},
    ]), {applyMode: 'replace'});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('append');
  });

  it('rejects current:* in append mode without pipeline context', () => {
    const r = parsePipelineGeneratorPlan(planJson([
      {kind: 'presentation', stepKey: 's', text: '{{current:answer.text}}'},
    ]), {applyMode: 'append', hasPipelineContext: false});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('pipeline context');
  });

  it('allows current:* in append mode with pipeline context', () => {
    const r = parsePipelineGeneratorPlan(planJson([
      {kind: 'presentation', stepKey: 's', text: '{{current:answer.text}}'},
    ]), {applyMode: 'append', hasPipelineContext: true});
    expect(r.ok).toBe(true);
  });

  it('rejects invalid ref grammar in historyReads', () => {
    const r = parsePipelineGeneratorPlan(planJson([
      {
        kind: 'custom',
        stepKey: 's',
        historyReads: [{ref: 'not-a-valid-ref', tagName: 'x'}],
      },
    ]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Invalid artifact ref');
  });

  it('accepts valid generated ref order', () => {
    const r = parsePipelineGeneratorPlan(planJson([
      {kind: 'custom', stepKey: 'first'},
      {
        kind: 'custom',
        stepKey: 'second',
        historyReads: [{ref: 'generated:first.text', tagName: 'first'}],
      },
    ]));
    expect(r.ok).toBe(true);
  });
});

describe('build catalog invariants', () => {
  it('errors on unknown suggestionId', () => {
    const plan = {
      schemaVersion: SCHEMA,
      steps: [{kind: 'suggestion' as const, stepKey: 'x', suggestionId: 'missing-id'}],
    };
    const built = buildStepsFromGeneratorPlan(plan, mockContext());
    expect(built.ok).toBe(false);
    expect(built.errors.some((e) => e.includes('Unknown suggestionId'))).toBe(true);
  });

  it('errors on unknown rolePromptId', () => {
    const plan = {
      schemaVersion: SCHEMA,
      steps: [{
        kind: 'custom' as const,
        stepKey: 'c',
        prompt: {mode: 'catalog' as const, rolePromptId: 'role-missing'},
      }],
    };
    const built = buildStepsFromGeneratorPlan(plan, mockContext());
    expect(built.ok).toBe(false);
    expect(built.errors.some((e) => e.includes('Unknown rolePromptId'))).toBe(true);
  });

  it('errors on capsule when allowCapsules is false at build', () => {
    const plan = {
      schemaVersion: SCHEMA,
      steps: [{kind: 'capsule' as const, stepKey: 'c', capsuleId: 'x', capsuleVersion: 'v1'}],
    };
    const built = buildStepsFromGeneratorPlan(plan, mockContext({allowCapsules: false}));
    expect(built.ok).toBe(false);
    expect(built.errors.some((e) => e.includes('Capsule step'))).toBe(true);
  });

  it('errors on unresolved generated ref in presentation text', () => {
    const plan = {
      schemaVersion: SCHEMA,
      steps: [{
        kind: 'presentation' as const,
        stepKey: 'out',
        text: 'Missing: {{generated:never_defined.text}}',
      }],
    };
    const built = buildStepsFromGeneratorPlan(plan, mockContext());
    expect(built.ok).toBe(false);
    expect(built.errors.some((e) => e.includes('Could not resolve template ref'))).toBe(true);
  });

  it('errors on invalid capsule output binding ref', () => {
    const plan = {
      schemaVersion: SCHEMA,
      steps: [{
        kind: 'capsule' as const,
        stepKey: 'cap',
        capsuleId: 'test-cap',
        capsuleVersion: 'v1',
        outputBindings: {result: 'generated:missing.text'},
      }],
    };
    const built = buildStepsFromGeneratorPlan(plan, mockContext({
      allowCapsules: true,
      resolveCapsule: () => ({
        id: 'test-cap',
        version: 'v1',
        name: 'Test',
        status: 'locked',
        schemaVersion: 2,
        interface: {
          inputs: [],
          outputs: [{name: 'result', kind: 'text' as const}],
          parameters: [],
          modelSlots: [],
        },
        steps: [],
        tests: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    }));
    expect(built.ok).toBe(false);
    expect(built.errors.some((e) => e.includes('Could not resolve output binding'))).toBe(true);
  });
});
