// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { PipelineDefinition, PipelineRunContext, AiEndpointConfig } from '@lorca/core';
import { buildUserPromptArtifacts } from '@lorca/prompt';
import { executePipeline } from '../src/executor.js';

const BASE = 'http://localhost:11434';

const endpoint: AiEndpointConfig = {
  id: 'ep', name: 'Test', baseUrl: BASE, kind: 'ollama', enabled: true,
  browserAccess: 'available', authKind: 'none',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

const server = setupServer(
  http.post(`${BASE}/api/generate`, () =>
    HttpResponse.json({ response: 'model answer', done: true, model: 'llama3' }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeCtx(overrides?: Partial<PipelineRunContext>): PipelineRunContext {
  const { raw, xml } = buildUserPromptArtifacts('What is 2+2?');
  return {
    runId: 'run-1',
    pipelineId: 'p1',
    startedAt: new Date().toISOString(),
    input: { userPromptRaw: raw, userPromptXml: xml },
    artifacts: {},
    trace: [],
    ...overrides,
  };
}

function makeDef(): PipelineDefinition {
  return {
    schemaVersion: 1,
    id: 'p1',
    name: 'Test',
    inputArtifactName: 'user_prompt',
    nodes: [
      { id: 'in', type: 'input' },
      { id: 'mc', type: 'model-call', artifactPrefix: 'answer', config: { modelRef: { kind: 'fixed', endpointId: 'ep', modelName: 'llama3' }, mode: 'generate', inputArtifactRef: 'user_prompt.xml' } },
    ],
    edges: [{ id: 'e1', fromNodeId: 'in', fromOutput: 'xml', toNodeId: 'mc', toInput: 'input' }],
    outputRef: { nodeId: 'mc', outputName: 'text' },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('executePipeline — full run', () => {
  it('executes input → model-call and returns final artifact key', async () => {
    const ctx = makeCtx();
    const trace: string[] = [];
    const result = await executePipeline(makeDef(), ctx, () => endpoint, {
      onTraceEvent: (e) => trace.push(`${e.nodeId}:${e.status}`),
      onArtifact: () => {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('answer.text');
    expect(ctx.artifacts['user_prompt.raw']).toBeDefined();
    expect(ctx.artifacts['user_prompt.xml']).toBeDefined();
    expect(ctx.artifacts['answer.text']?.value).toBe('model answer');
    expect(trace).toContain('in:started');
    expect(trace).toContain('in:completed');
    expect(trace).toContain('mc:completed');
  });

  it('stores rawResponse artifact', async () => {
    const ctx = makeCtx();
    await executePipeline(makeDef(), ctx, () => endpoint, { onTraceEvent: () => {}, onArtifact: () => {} });
    expect(ctx.artifacts['answer.rawResponse']).toBeDefined();
  });

  it('fails when endpoint is missing', async () => {
    const ctx = makeCtx();
    const result = await executePipeline(makeDef(), ctx, () => undefined, { onTraceEvent: () => {}, onArtifact: () => {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing_endpoint');
  });

  it('stops execution and marks remaining nodes skipped on failure', async () => {
    server.use(http.post(`${BASE}/api/generate`, () => HttpResponse.error()));
    const ctx = makeCtx();
    const statuses: string[] = [];
    await executePipeline(makeDef(), ctx, () => endpoint, {
      onTraceEvent: (e) => statuses.push(`${e.nodeId}:${e.status}`),
      onArtifact: () => {},
    });
    expect(statuses).toContain('mc:failed');
  });

  it('respects abort signal — marks node cancelled, others skipped', async () => {
    const controller = new AbortController();
    controller.abort(); // already aborted
    const ctx = makeCtx({ abortSignal: controller.signal });
    const statuses: string[] = [];
    const result = await executePipeline(makeDef(), ctx, () => endpoint, {
      onTraceEvent: (e) => statuses.push(`${e.nodeId}:${e.status}`),
      onArtifact: () => {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('run_cancelled');
  });

  it('executes a ManualTextNode', async () => {
    const def: PipelineDefinition = {
      schemaVersion: 1,
      id: 'p2',
      name: 'Manual',
      inputArtifactName: 'user_prompt',
      nodes: [
        { id: 'in', type: 'input' },
        { id: 'mt', type: 'manual-text', artifactPrefix: 'rules', text: 'Be concise.' },
      ],
      edges: [],
      outputRef: { nodeId: 'mt', outputName: 'text' },
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    server.use(http.post(`${BASE}/api/generate`, () => HttpResponse.json({ response: 'ok', done: true, model: 'm' })));
    const ctx = makeCtx();
    const result = await executePipeline(def, ctx, () => endpoint, { onTraceEvent: () => {}, onArtifact: () => {} });
    expect(result.ok).toBe(true);
    expect(ctx.artifacts['rules.text']?.value).toBe('Be concise.');
  });
});
