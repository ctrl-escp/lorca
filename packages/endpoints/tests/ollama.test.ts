// @vitest-environment node
import {describe, it, expect, beforeAll, afterAll, afterEach} from 'vitest';
import {http, HttpResponse} from 'msw';
import {setupServer} from 'msw/node';
import {ollamaAdapter} from '../src/ollama.js';
import type {AiEndpointConfig} from '@lorca/core';

const BASE = 'http://localhost:11434';

const endpoint: AiEndpointConfig = {
  id: 'ep-test',
  name: 'Test Ollama',
  baseUrl: BASE,
  kind: 'ollama',
  enabled: true,
  browserAccess: 'unknown',
  authKind: 'none',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const FAKE_MODELS = {
  models: [
    {
      name: 'llama3.2:3b',
      modified_at: '2026-01-01T00:00:00Z',
      size: 2_000_000_000,
      details: {parameter_size: '3b', quantization_level: 'Q4_K_M', family: 'llama'},
    },
    {
      name: 'mistral:7b',
      modified_at: '2026-01-01T00:00:00Z',
      size: 4_000_000_000,
      details: {parameter_size: '7b', quantization_level: 'Q4_K_M', family: 'mistral'},
    },
  ],
};

const server = setupServer(
  http.get(`${BASE}/api/tags`, () => HttpResponse.json(FAKE_MODELS)),
  http.post(`${BASE}/api/generate`, () =>
    HttpResponse.json({response: 'Hello from fake Ollama', done: true, model: 'llama3.2:3b'}),
  ),
  http.post(`${BASE}/api/chat`, () =>
    HttpResponse.json({
      message: {role: 'assistant', content: 'Hello from chat'},
      done: true,
      model: 'llama3.2:3b',
    }),
  ),
);

beforeAll(() => server.listen({onUnhandledRequest: 'error'}));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ollamaAdapter.testBrowserAccess', () => {
  it('returns ok when endpoint is reachable', async () => {
    const result = await ollamaAdapter.testBrowserAccess(endpoint);
    expect(result.ok).toBe(true);
  });

  it('returns endpoint_browser_access_blocked when fetch throws', async () => {
    server.use(
      http.get(`${BASE}/api/tags`, () => HttpResponse.error()),
    );
    const result = await ollamaAdapter.testBrowserAccess(endpoint);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('endpoint_browser_access_blocked');
    }
  });

  it('returns endpoint_unreachable on non-200 status', async () => {
    server.use(
      http.get(`${BASE}/api/tags`, () => new HttpResponse(null, {status: 503})),
    );
    const result = await ollamaAdapter.testBrowserAccess(endpoint);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('endpoint_unreachable');
    }
  });
});

describe('ollamaAdapter.listModels', () => {
  it('returns discovered models with buckets', async () => {
    const result = await ollamaAdapter.listModels(endpoint);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    const llama = result.value.find((m) => m.providerModelName === 'llama3.2:3b');
    expect(llama).toBeDefined();
    expect(llama!.source).toBe('discovered');
    expect(llama!.buckets.length).toBeGreaterThan(0);
    expect(llama!.parameterSize).toBe('3b');
    expect(llama!.endpointId).toBe('ep-test');
  });

  it('returns blocked error when CORS fails', async () => {
    server.use(http.get(`${BASE}/api/tags`, () => HttpResponse.error()));
    const result = await ollamaAdapter.listModels(endpoint);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('endpoint_browser_access_blocked');
  });

  it('model IDs are endpoint-scoped to prevent collisions', async () => {
    const result = await ollamaAdapter.listModels(endpoint);
    if (!result.ok) return;
    for (const m of result.value) {
      expect(m.id).toContain('ep-test');
    }
  });
});

describe('ollamaAdapter.executeModelCall — generate mode', () => {
  it('returns text from model response', async () => {
    const result = await ollamaAdapter.executeModelCall(endpoint, {
      mode: 'generate',
      endpointId: 'ep-test',
      modelName: 'llama3.2:3b',
      prompt: {blocks: [{tagName: 'user', body: 'Say hello', source: 'user-input'}], xmlText: '<user>\nSay hello\n</user>'},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('Hello from fake Ollama');
  });

  it('returns blocked error when CORS fails', async () => {
    server.use(http.post(`${BASE}/api/generate`, () => HttpResponse.error()));
    const result = await ollamaAdapter.executeModelCall(endpoint, {
      mode: 'generate',
      endpointId: 'ep-test',
      modelName: 'llama3.2:3b',
      prompt: {blocks: [{tagName: 'user', body: 'Say hello', source: 'user-input'}], xmlText: '<user>\nSay hello\n</user>'},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('endpoint_browser_access_blocked');
  });
});

describe('ollamaAdapter.executeModelCall — chat mode', () => {
  it('returns text from chat response', async () => {
    const result = await ollamaAdapter.executeModelCall(endpoint, {
      mode: 'chat',
      endpointId: 'ep-test',
      modelName: 'llama3.2:3b',
      prompt: {blocks: [{tagName: 'user', body: 'Hello', source: 'user-input'}], xmlText: '<user>\nHello\n</user>'},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe('Hello from chat');
  });
});
