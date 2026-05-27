import {describe, expect, it} from 'vitest';
import type {DiscoveredModel} from '@lorca/core';
import {
  buildPipelineGeneratorRequest,
  formatPipelineGeneratorUserMessage,
} from '../src/pipelineGeneratorRequest.js';

const models: DiscoveredModel[] = [{
  id: 'm1',
  endpointId: 'ep',
  providerModelName: 'llama3.2:latest',
  displayName: 'Llama',
  buckets: ['general'],
  source: 'manual',
  enabled: true,
}];

const endpoints = [{
  id: 'ep',
  name: 'Local',
  baseUrl: 'http://localhost:11434',
  kind: 'ollama' as const,
  enabled: true,
  browserAccess: 'available' as const,
  authKind: 'none' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}];

describe('buildPipelineGeneratorRequest', () => {
  it('includes apply mode, model catalog, and omits capsules when disabled', () => {
    const payload = buildPipelineGeneratorRequest({
      description: 'Build a summarizer',
      applyMode: 'append',
      allowCapsules: false,
      models,
      endpoints,
    });
    expect(payload.applyMode).toBe('append');
    expect(payload.allowCapsules).toBe(false);
    expect(payload.capsuleCatalog).toEqual([]);
    expect(payload.modelCatalog[0]?.modelId).toBe('ep::llama3.2:latest');
    expect(payload.suggestionCatalog.length).toBeGreaterThan(0);
    expect(payload.rolePromptCatalog.length).toBeGreaterThan(0);
  });

  it('includes locked capsule catalog when allowCapsules is true', () => {
    const payload = buildPipelineGeneratorRequest({
      description: 'Verify flow',
      allowCapsules: true,
    });
    expect(payload.capsuleCatalog.length).toBeGreaterThan(0);
  });
});

describe('formatPipelineGeneratorUserMessage', () => {
  it('embeds description and JSON context', () => {
    const payload = buildPipelineGeneratorRequest({
      description: 'Debate pipeline',
      models,
      endpoints,
    });
    const text = formatPipelineGeneratorUserMessage(payload);
    expect(text.startsWith('Debate pipeline')).toBe(true);
    expect(text).toContain('Planning context (JSON):');
    expect(text).toContain('"modelCatalog"');
    expect(text).toContain('ep::llama3.2:latest');
  });
});
