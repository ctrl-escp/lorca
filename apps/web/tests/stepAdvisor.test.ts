import {describe, it, expect, vi} from 'vitest';
import type {AiEndpointConfig, DiscoveredModel, PipelineDefinition} from '@lorca/core';
import type {PipelineSuggestion} from '@lorca/capsules';
import {
  buildStepAdvisorRequest,
  parseStepAdvisorResponse,
  selectStepAdvisorModel,
} from '../src/composables/useStepAdvisor.js';

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

const pipeline: PipelineDefinition = {
  schemaVersion: 2,
  id: 'pipe',
  name: 'Demo',
  input: {raw: 'Question', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
  steps: [
    {
      id: 'step-a',
      type: 'model-call',
      label: 'Candidate Answer',
      enabled: true,
      outputNamespace: 'candidate',
      primaryOutputName: 'text',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'general'},
        mode: 'chat',
        outputNames: ['text'],
      },
      lastEditedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const suggestions: PipelineSuggestion[] = [
  {
    id: 'suggestion-answer-verification',
    name: 'Answer Verification',
    description: 'Check an answer against criteria.',
    category: 'verification',
    preferredModelBucket: 'verify',
    insertableSteps: [],
    requiredBindings: [],
    outputHints: [],
  },
  {
    id: 'suggestion-summary',
    name: 'Summary',
    description: 'Summarize the final result.',
    category: 'utility',
    preferredModelBucket: 'summarize',
    insertableSteps: [],
    requiredBindings: [],
    outputHints: [],
  },
];

describe('step advisor model selection', () => {
  it('prefers enabled general models on enabled endpoints', () => {
    const disabledEndpoint = endpoint('disabled', false);
    const choice = selectStepAdvisorModel(
      [
        model('tiny', 'disabled', ['general']),
        model('rewrite', 'ep', ['rewrite']),
        model('general', 'ep', ['general']),
      ],
      [endpoint('ep'), disabledEndpoint],
    );

    expect(choice?.model.id).toBe('general');
    expect(choice?.endpoint.id).toBe('ep');
  });

  it('returns null when no enabled model and endpoint pair exists', () => {
    expect(selectStepAdvisorModel([model('general', 'ep', ['general'], false)], [endpoint('ep')])).toBeNull();
    expect(selectStepAdvisorModel([model('general', 'ep', ['general'])], [endpoint('ep', false)])).toBeNull();
  });
});

describe('step advisor prompt and parsing', () => {
  it('builds a compact prompt with steps, artifacts, and suggestion ids', () => {
    const request = buildStepAdvisorRequest(pipeline, ['candidate.text'], suggestions);

    expect(request.systemPrompt).toContain('Respond with JSON only');
    expect(request.userContent).toContain('1. Candidate Answer');
    expect(request.userContent).toContain('candidate.text');
    expect(request.userContent).toContain('suggestion-answer-verification');
    expect(request.userContent).toContain('Suggest 2-3 most useful next steps');
  });

  it('parses fenced JSON and filters unknown suggestion ids', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseStepAdvisorResponse([
      '```json',
      '[',
      '  {"id":"suggestion-answer-verification","reason":"Add a check after candidate generation."},',
      '  {"id":"unknown","reason":"Nope."},',
      '  {"id":"suggestion-summary","reason":"Give the user a concise final output."}',
      ']',
      '```',
    ].join('\n'), suggestions);

    expect(parsed).toEqual([
      {suggestionId: 'suggestion-answer-verification', reason: 'Add a check after candidate generation.'},
      {suggestionId: 'suggestion-summary', reason: 'Give the user a concise final output.'},
    ]);
    expect(warn).toHaveBeenCalledWith('Ignoring unknown AI step suggestion id: unknown');
    warn.mockRestore();
  });

  it('treats all-unknown suggestion ids as a parse failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const parsed = parseStepAdvisorResponse('[{"id":"suggestion-nonexistent","reason":"Nope."}]', suggestions);

    expect(parsed).toBeNull();
    expect(warn).toHaveBeenCalledWith('Ignoring unknown AI step suggestion id: suggestion-nonexistent');
    warn.mockRestore();
  });

  it('extracts the first complete JSON array before trailing bracketed prose', () => {
    const parsed = parseStepAdvisorResponse([
      '[{"id":"suggestion-summary","reason":"Summarize after checking [draft] output."}]',
      'Note: see [1] for details.',
    ].join('\n'), suggestions);

    expect(parsed).toEqual([
      {suggestionId: 'suggestion-summary', reason: 'Summarize after checking [draft] output.'},
    ]);
  });

  it('returns null for malformed JSON', () => {
    expect(parseStepAdvisorResponse('Answer Verification would help here.', suggestions)).toBeNull();
  });
});
