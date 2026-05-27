import {describe, expect, it} from 'vitest';
import type {DiscoveredModel, PipelineStep} from '@lorca/core';
import {
  ALL_SUGGESTIONS,
  buildRolePromptCatalog,
  instantiateSuggestion,
} from '@lorca/capsules';
import {
  buildStepsFromGeneratorPlan,
  parsePipelineGeneratorPlan,
  PIPELINE_GENERATOR_SCHEMA_VERSION,
  type GeneratorBuildContext,
} from '../../src/generator/index.js';
import {validateStepChainBody} from '../../src/stepChainValidation.js';

const roleTextById = new Map(
  buildRolePromptCatalog().map((entry) => [entry.id, entry.text]),
);

function productionLikeContext(overrides: Partial<GeneratorBuildContext> = {}): GeneratorBuildContext {
  const models: DiscoveredModel[] = [{
    id: 'llama',
    endpointId: 'ep-local',
    providerModelName: 'llama3.2:latest',
    displayName: 'Llama',
    buckets: ['general', 'thinking'],
    source: 'manual',
    enabled: true,
  }];

  return {
    allowCapsules: false,
    applyMode: 'replace',
    instantiateSuggestion(suggestionId, namespaces, existingSteps) {
      const suggestion = ALL_SUGGESTIONS.find((s) => s.id === suggestionId);
      if (!suggestion) return null;
      return instantiateSuggestion(suggestion, namespaces, existingSteps);
    },
    getRolePrompt: (id) => roleTextById.get(id) ?? null,
    resolveCapsule: () => undefined,
    resolveModelAssignments({steps, requests}) {
      void requests;
      void models;
      return {steps, unresolved: []};
    },
    ...overrides,
  };
}

const DEBATE_PLAN = {
  schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
  assumptions: ['Three-expert debate with two rounds'],
  steps: [
    {
      kind: 'custom',
      stepKey: 'hypothesis',
      label: 'Extract hypothesis',
      prompt: {
        mode: 'custom',
        text: 'Extract a clear hypothesis from the user question. Reply with the hypothesis only.',
      },
      modelBucket: 'general',
      outputType: 'text',
    },
    {
      kind: 'custom',
      stepKey: 'expert_pro',
      label: 'Expert — support',
      prompt: {mode: 'custom', text: 'Argue in support of the hypothesis.'},
      historyReads: [{ref: 'generated:hypothesis.text', tagName: 'hypothesis'}],
      modelBucket: 'thinking',
    },
    {
      kind: 'custom',
      stepKey: 'expert_con',
      label: 'Expert — oppose',
      prompt: {mode: 'custom', text: 'Argue against the hypothesis.'},
      historyReads: [{ref: 'generated:hypothesis.text', tagName: 'hypothesis'}],
      modelBucket: 'thinking',
    },
    {
      kind: 'custom',
      stepKey: 'expert_judge',
      label: 'Judge round one',
      prompt: {mode: 'custom', text: 'Judge which side was more compelling.'},
      historyReads: [
        {ref: 'generated:expert_pro.text', tagName: 'pro'},
        {ref: 'generated:expert_con.text', tagName: 'con'},
      ],
      modelBucket: 'general',
    },
    {
      kind: 'loop',
      stepKey: 'round_two',
      label: 'Second debate round',
      maxIterations: 1,
      exitCondition: {type: 'iterations'},
      steps: [
        {
          kind: 'custom',
          stepKey: 'expert_pro_r2',
          label: 'Pro — improve',
          prompt: {mode: 'custom', text: 'Improve your argument using the opposition.'},
          historyReads: [
            {ref: 'generated:expert_con.text', tagName: 'counter'},
            {ref: 'generated:hypothesis.text', tagName: 'hypothesis'},
          ],
          modelBucket: 'thinking',
        },
        {
          kind: 'custom',
          stepKey: 'expert_con_r2',
          label: 'Con — counter',
          prompt: {mode: 'custom', text: 'Counter the improved pro argument.'},
          historyReads: [{ref: 'generated:expert_pro_r2.text', tagName: 'pro'}],
          modelBucket: 'thinking',
        },
        {
          kind: 'custom',
          stepKey: 'judge_r2',
          label: 'Judge round two',
          prompt: {mode: 'custom', text: 'Judge round two.'},
          historyReads: [
            {ref: 'generated:expert_pro_r2.text', tagName: 'pro'},
            {ref: 'generated:expert_con_r2.text', tagName: 'con'},
          ],
          modelBucket: 'general',
        },
      ],
    },
    {
      kind: 'presentation',
      stepKey: 'summary',
      label: 'Debate summary',
      text: [
        'Hypothesis: {{generated:hypothesis.text}}',
        'Round 1 judge: {{generated:expert_judge.text}}',
        'Round 2 (loop output): {{generated:round_two.text}}',
      ].join('\n\n'),
    },
  ],
};

describe('debate pipeline generator fixture', () => {
  it('parses and builds a multi-round debate plan without LLM', () => {
    const raw = JSON.stringify(DEBATE_PLAN);
    const parsed = parsePipelineGeneratorPlan(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const built = buildStepsFromGeneratorPlan(parsed.plan, productionLikeContext());
    expect(built.errors, built.errors.join('; ')).toEqual([]);
    expect(built.ok).toBe(true);
    expect(built.steps.length).toBeGreaterThanOrEqual(6);

    const labels = built.steps.map((s) => s.label);
    expect(labels).toContain('Extract hypothesis');
    expect(labels.some((l) => l.includes('Expert'))).toBe(true);

    const summary = built.steps.find((s) => s.config.type === 'presentation');
    expect(summary?.config.type).toBe('presentation');
    if (summary?.config.type === 'presentation') {
      expect(summary.config.text).toContain('{{artifact.hypothesis.text}}');
      expect(summary.config.text).toContain('{{artifact.round_two.text}}');
      expect(summary.config.text).not.toContain('{{generated:');
    }

    const loop = built.steps.find((s) => s.config.type === 'loop-group');
    expect(loop?.config.type).toBe('loop-group');
    if (loop?.config.type === 'loop-group') {
      expect(loop.config.steps.length).toBe(3);
    }

    const validation = validateStepChainBody(built.steps, {resolveCapsule: () => undefined});
    expect(validation.ok, validation.ok ? '' : validation.error.message).toBe(true);
  });

  it('builds a suggestion-based plan with catalog role prompt', () => {
    const plan = {
      schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
      steps: [{
        kind: 'suggestion' as const,
        stepKey: 'intent',
        suggestionId: 'suggestion-intent-extraction',
        prompt: {mode: 'catalog' as const, rolePromptId: buildRolePromptCatalog()[0]!.id},
      }],
    };
    const built = buildStepsFromGeneratorPlan(plan, productionLikeContext());
    expect(built.ok).toBe(true);
    expect(built.steps.length).toBeGreaterThan(0);
    const step = built.steps[0] as PipelineStep;
    expect(step.type).toBe('model-call');
    expect(step.outputNamespace).toBe('intent');
  });
});
