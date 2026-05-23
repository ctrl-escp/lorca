import {describe, it, expect, vi} from 'vitest';
import type {AiEndpointConfig, DiscoveredModel} from '@lorca/core';
import type {PipelineSuggestion} from '@lorca/capsules';
import {
  buildStepsFromGeneratorPlan,
  generatorCapsuleCompatible,
  parsePipelineGeneratorResponse,
  selectPipelineGeneratorModel,
} from '../src/composables/usePipelineGenerator.js';
import {LORCA_PIPELINE_GENERATOR} from '@lorca/capsules';

function endpoint(id: string, enabled = true): AiEndpointConfig {
  return {
    id,
    name: id,
    kind: 'ollama',
    baseUrl: 'http://localhost:11434',
    enabled,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function model(id: string, endpointId: string, buckets: DiscoveredModel['buckets'], enabled = true): DiscoveredModel {
  return {
    id,
    endpointId,
    providerModelName: `${id}:latest`,
    displayName: id,
    buckets,
    source: 'manual',
    enabled,
  };
}

const suggestions: PipelineSuggestion[] = [
  {
    id: 'suggestion-a',
    name: 'Step A',
    description: 'First generated step.',
    category: 'planning',
    preferredModelBucket: 'general',
    requiredBindings: [],
    outputHints: [],
    insertableSteps: [
      {
        id: 'a-template',
        type: 'model-call',
        label: 'Step A',
        enabled: true,
        outputNamespace: 'step_a',
        primaryOutputName: 'text',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
        lastEditedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
  {
    id: 'suggestion-b',
    name: 'Step B',
    description: 'Second generated step.',
    category: 'generation',
    requiredBindings: [],
    outputHints: [],
    insertableSteps: [
      {
        id: 'b-template',
        type: 'model-call',
        label: 'Step B',
        enabled: true,
        outputNamespace: 'step_b',
        primaryOutputName: 'text',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
        lastEditedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  },
];

describe('pipeline generator parsing', () => {
  it('parses fenced JSON and skips unknown suggestion ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parsePipelineGeneratorResponse([
      '```json',
      '[',
      '  {"suggestionId":"suggestion-a"},',
      '  {"suggestionId":"unknown"},',
      '  {"id":"suggestion-b"}',
      ']',
      '```',
    ].join('\n'), suggestions);

    expect(parsed).toEqual({
      ok: true,
      entries: [{suggestionId: 'suggestion-a'}, {suggestionId: 'suggestion-b'}],
      unknownSuggestionIds: ['unknown'],
    });
    expect(warn).toHaveBeenCalledWith('Ignoring unknown generated pipeline suggestion id: unknown');
    warn.mockRestore();
  });

  it('builds generated steps and loop groups from a plan', () => {
    const steps = buildStepsFromGeneratorPlan([
      {suggestionId: 'suggestion-a'},
      {
        wrapInLoop: true,
        maxIterations: 2,
        exitCondition: {type: 'iterations'},
        inner: [{suggestionId: 'suggestion-b'}],
      },
    ], suggestions);

    expect(steps).toHaveLength(2);
    expect(steps[0]?.label).toBe('Step A');
    expect(steps[1]?.config.type).toBe('loop-group');
    if (steps[1]?.config.type === 'loop-group') {
      expect(steps[1].config.maxIterations).toBe(2);
      expect(steps[1].config.steps.map((step) => step.label)).toEqual(['Step B']);
    }
  });

  it('returns a parse failure for non-array responses', () => {
    const parsed = parsePipelineGeneratorResponse('Make an intent extractor.', suggestions);
    expect(parsed.ok).toBe(false);
  });
});

describe('pipeline generator model and capsule selection', () => {
  it('prefers general models on enabled endpoints', () => {
    const choice = selectPipelineGeneratorModel(
      [
        model('rewrite', 'ep', ['rewrite']),
        model('general', 'ep', ['general']),
      ],
      [endpoint('ep')],
    );

    expect(choice?.model.id).toBe('general');
  });

  it('recognizes the shipped generator capsule shape', () => {
    expect(generatorCapsuleCompatible(LORCA_PIPELINE_GENERATOR)).toBe(true);
  });
});
