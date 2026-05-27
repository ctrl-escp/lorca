import {describe, expect, it} from 'vitest';
import type {PipelineDefinition, PipelineStep} from '@lorca/core';
import {
  buildStepsFromGeneratorPlan,
  parsePipelineGeneratorPlan,
  PIPELINE_GENERATOR_SCHEMA_VERSION,
  type GeneratorBuildContext,
} from '../../src/generator/index.js';

function userPipeline(): PipelineDefinition {
  const step: PipelineStep = {
    id: 'existing_step',
    type: 'model-call',
    label: 'My custom answer step',
    enabled: true,
    outputNamespace: 'answer',
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00Z',
    config: {
      type: 'model-call',
      modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'llama3:latest'},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
    },
  };
  return {
    schemaVersion: 2,
    id: 'p-user',
    name: 'User pipeline',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [step],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function appendContext(existing: PipelineDefinition): GeneratorBuildContext {
  return {
    allowCapsules: false,
    applyMode: 'append',
    existingPipeline: existing,
    instantiateSuggestion: () => null,
    getRolePrompt: () => null,
    resolveCapsule: () => undefined,
    resolveModelAssignments: ({steps}) => ({steps, unresolved: []}),
  };
}

describe('append mode with current:* refs', () => {
  it('builds presentation that binds to an existing step namespace', () => {
    const existing = userPipeline();
    const raw = JSON.stringify({
      schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
      steps: [{
        kind: 'presentation',
        stepKey: 'followup',
        label: 'Follow-up summary',
        text: 'Prior answer: {{current:answer.text}}',
      }],
    });

    const parsed = parsePipelineGeneratorPlan(raw, {
      applyMode: 'append',
      hasPipelineContext: true,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const built = buildStepsFromGeneratorPlan(parsed.plan, appendContext(existing));
    expect(built.ok, built.errors.join('; ')).toBe(true);
    expect(built.steps).toHaveLength(1);
    const presentation = built.steps[0];
    expect(presentation?.config.type).toBe('presentation');
    if (presentation?.config.type === 'presentation') {
      expect(presentation.config.text).toContain('{{artifact.answer.text}}');
      expect(presentation.config.text).not.toContain('{{current:');
    }
  });
});
