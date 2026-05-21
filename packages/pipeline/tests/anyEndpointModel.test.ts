// @vitest-environment node
import {describe, it, expect, beforeAll, afterAll, afterEach} from 'vitest';
import {http, HttpResponse} from 'msw';
import {setupServer} from 'msw/node';
import type {AiEndpointConfig, PipelineDefinition} from '@lorca/core';
import {executeStepChain} from '../src/stepExecutor.js';

const BASE = 'http://localhost:11435';

const endpoint: AiEndpointConfig = {
  id: 'ep-2',
  name: 'Second endpoint',
  baseUrl: BASE,
  kind: 'ollama',
  enabled: true,
  browserAccess: 'available',
  authKind: 'none',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const server = setupServer(
  http.post(`${BASE}/api/generate`, () =>
    HttpResponse.json({response: 'answer from ep-2', done: true, model: 'llama3'}),
  ),
);

beforeAll(() => server.listen({onUnhandledRequest: 'error'}));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makePipeline(): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'p-any',
    name: 'Any endpoint',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [{
      id: 'mc',
      type: 'model-call',
      label: 'Model',
      enabled: true,
      outputNamespace: 'answer',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'any-enabled-endpoint', modelName: 'llama3'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    }],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('any-enabled-endpoint model refs', () => {
  it('runs the selected model on the resolver-picked endpoint', async () => {
    const artifacts: string[] = [];
    const result = await executeStepChain(
      makePipeline(),
      'hello',
      {},
      () => undefined,
      {
        onTraceEvent: () => {},
        onArtifact: (artifact) => artifacts.push(`${artifact.name}:${artifact.value}`),
      },
      undefined,
      (modelName) => modelName === 'llama3' ? endpoint : undefined,
    );

    expect(result.ok).toBe(true);
    expect(artifacts).toContain('answer.text:answer from ep-2');
  });

  it('fails clearly when no enabled endpoint has the model', async () => {
    const result = await executeStepChain(
      makePipeline(),
      'hello',
      {},
      () => undefined,
      {onTraceEvent: () => {}, onArtifact: () => {}},
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('missing_endpoint');
      expect(result.error.message).toContain('No enabled endpoint has model: llama3');
    }
  });
});
