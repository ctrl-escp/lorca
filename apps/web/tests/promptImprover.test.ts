import {describe, it, expect, beforeEach} from 'vitest';
import type {DiscoveredModel, PromptBlock} from '@lorca/core';
import {
  buildPromptImproverRequest,
  DEFAULT_PROMPT_IMPROVER_PROMPT,
  loadPromptImproverModelKey,
  loadPromptImproverPrompt,
  isLikelyExecutedPromptOutput,
  isLikelyUnchangedPromptOutput,
  normalizeImprovedPrompt,
  parsePromptImproverModelKey,
  promptImproverModelKey,
  promptImproverModelLabel,
  savePromptImproverModelKey,
  savePromptImproverPrompt,
  selectPromptImproverModel,
} from '../src/utils/promptImprover.js';

function model(id: string, buckets: DiscoveredModel['buckets'], patch: Partial<DiscoveredModel> = {}): DiscoveredModel {
  return {
    id,
    endpointId: 'ep',
    providerModelName: `${id}:latest`,
    displayName: id,
    buckets,
    source: 'manual',
    ...patch,
  };
}

const block: PromptBlock = {
  id: 'blk',
  label: 'System',
  tagName: 'system',
  body: 'Answer the user.',
  enabled: true,
  source: 'custom',
};

beforeEach(() => {
  localStorage.clear();
});

describe('prompt improver model selection', () => {
  it('uses the saved model when it is available', () => {
    const models = [model('general', ['general']), model('rewrite', ['rewrite-prose'])];
    expect(selectPromptImproverModel(models, promptImproverModelKey(models[0]!))).toBe(models[0]);
  });

  it('defaults to the first prose rewrite model, then a general model', () => {
    const models = [model('general', ['general']), model('rewrite', ['rewrite-prose'])];
    expect(selectPromptImproverModel(models, null)).toBe(models[1]);
    expect(selectPromptImproverModel([models[0]!], null)).toBe(models[0]);
  });

  it('deprioritizes stale saved code models when prose models are available', () => {
    const coder = model('coder', ['rewrite-code', 'extract-json'], {
      providerModelName: 'deepseek-coder-v2:16b',
      displayName: 'deepseek-coder-v2:16b',
    });
    const prose = model('llama', ['general', 'rewrite-prose'], {
      providerModelName: 'llama3.2:3b',
      displayName: 'llama3.2:3b',
    });

    expect(selectPromptImproverModel([coder, prose], promptImproverModelKey(coder))).toBe(prose);
  });

  it('parses keys with model names containing separators', () => {
    expect(parsePromptImproverModelKey('ep::vendor::model')).toEqual({
      endpointId: 'ep',
      modelName: 'vendor::model',
    });
  });

  it('includes the endpoint in model labels', () => {
    expect(promptImproverModelLabel(model('rewrite', ['rewrite-prose'], {parameterSize: '7B'}), 'Local Ollama'))
      .toBe('rewrite — Local Ollama (7B)');
  });
});

describe('prompt improver persistence', () => {
  it('keeps model selection global and prompt text scoped by step id', () => {
    savePromptImproverModelKey('ep::rewrite');
    savePromptImproverPrompt('step-a', 'custom A');
    savePromptImproverPrompt('step-b', 'custom B');

    expect(loadPromptImproverModelKey()).toBe('ep::rewrite');
    expect(loadPromptImproverPrompt('step-a')).toBe('custom A');
    expect(loadPromptImproverPrompt('step-b')).toBe('custom B');
    expect(loadPromptImproverPrompt('step-c')).toBeNull();
  });

});

describe('prompt improver request shaping', () => {
  it('builds a request prompt around the selected block and editable instructions', () => {
    const request = buildPromptImproverRequest(block, 'Tighten this.');

    expect(request.systemPrompt).toContain('You rewrite prompt instructions');
    expect(request.userContent).toContain('Tighten this.');
    expect(request.userContent).toContain('tagName: system');
    expect(request.userContent).toContain('SOURCE PROMPT BLOCK START\nAnswer the user.\nSOURCE PROMPT BLOCK END');
    expect(request.userContent).toContain('Bad output examples');
    expect(request.userContent).toContain('Start with instruction text, not "{"');
  });

  it('falls back to the default instructions when the editable prompt is blank', () => {
    expect(buildPromptImproverRequest(block, '   ').userContent).toContain(DEFAULT_PROMPT_IMPROVER_PROMPT);
  });

  it('includes rejected output when building a retry request', () => {
    const request = buildPromptImproverRequest(block, 'Tighten this.', {
      previousBadOutput: '{ "intent": string }',
      rejectionReason: 'You copied the prompt.',
    });
    expect(request.userContent).toContain('You copied the prompt.');
    expect(request.userContent).toContain('> { "intent": string }');
  });

  it('can include a previous suggestion as iterative context', () => {
    const request = buildPromptImproverRequest(block, 'Make it sharper.', {
      previousSuggestion: 'Answer clearly.',
    });

    expect(request.userContent).toContain('Improve the previous suggestion');
    expect(request.userContent).toContain('PREVIOUS SUGGESTION START\nAnswer clearly.\nPREVIOUS SUGGESTION END');
    expect(request.userContent).toContain('SOURCE PROMPT BLOCK START\nAnswer the user.\nSOURCE PROMPT BLOCK END');
  });

  it('can omit the current block when improving an existing suggestion', () => {
    const request = buildPromptImproverRequest(block, 'Make it sharper.', {
      includeCurrentBlock: false,
      previousSuggestion: 'Answer clearly.',
    });

    expect(request.userContent).toContain('PREVIOUS SUGGESTION START\nAnswer clearly.\nPREVIOUS SUGGESTION END');
    expect(request.userContent).not.toContain('SOURCE PROMPT BLOCK START');
  });

  it('strips a single enclosing markdown fence from model output', () => {
    expect(normalizeImprovedPrompt('```text\nBetter prompt.\n```')).toBe('Better prompt.');
    expect(normalizeImprovedPrompt('Better prompt.')).toBe('Better prompt.');
  });

  it('detects pure JSON answers as executed prompt output', () => {
    expect(isLikelyExecutedPromptOutput('{ "intent": "Extract the user intent" }')).toBe(true);
    expect(isLikelyExecutedPromptOutput('{ "intent": string, "topics": string[], "confidence": number }')).toBe(true);
    expect(isLikelyExecutedPromptOutput('["Read the user request.", "Return JSON only."]')).toBe(false);
    expect(isLikelyExecutedPromptOutput('Extract the user intent and return JSON.')).toBe(false);
  });

  it('detects unchanged or near-unchanged prompt outputs', () => {
    const source = [
      'You are a requirements analyst.',
      'Generate testable acceptance criteria for the request.',
      'Respond with JSON only.',
    ].join('\n');
    const nearCopy = [
      'You are a requirements analyst.',
      'Generate testable acceptance criteria for the request.',
      'Respond with JSON only!',
    ].join('\n');

    expect(isLikelyUnchangedPromptOutput(source, [source])).toBe(true);
    expect(isLikelyUnchangedPromptOutput(nearCopy, [source])).toBe(true);
    expect(isLikelyUnchangedPromptOutput('Extract user intent and topics from the request.', [source])).toBe(false);
  });
});
