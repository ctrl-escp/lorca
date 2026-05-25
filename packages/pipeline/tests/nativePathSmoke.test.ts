// @vitest-environment node
/**
 * Native-path smoke matrix (legacy cleanup Step 3).
 *
 * Covers executeStepChain flows that must pass before schema cutoff.
 * Related coverage elsewhere:
 * - Loop groups: loopGroup.test.ts
 * - Capsule instance opaque/inline: capsuleInstance.test.ts
 * - Inline lock / extract: apps/web/tests/pipelineEditorInlineCapsules.test.ts, capsuleExtraction.test.ts
 * - Capsule test run: packages/capsules/tests/executor.test.ts
 * - Model remap on import: packages/storage/tests/importExport.test.ts, apps/web/tests/nativePathSmoke.spec.ts
 * - Full/partial run UI: apps/web/tests/smoke.spec.ts, happy-path.spec.ts
 */
import {describe, it, expect, beforeAll, afterAll, afterEach} from 'vitest';
import {http, HttpResponse} from 'msw';
import {setupServer} from 'msw/node';
import type {AiEndpointConfig, PipelineDefinition, PipelineStep} from '@lorca/core';
import {executeStepChain} from '../src/stepExecutor.js';

const BASE = 'http://native-smoke-ollama.local';

const ENDPOINT: AiEndpointConfig = {
  id: 'ep-smoke',
  name: 'Smoke endpoint',
  baseUrl: BASE,
  kind: 'ollama',
  enabled: true,
  browserAccess: 'available',
  authKind: 'none',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const capturedPrompts: string[] = [];
const server = setupServer(
  http.post(`${BASE}/api/generate`, async ({request}) => {
    const body = await request.json() as {prompt?: string};
    capturedPrompts.push(body.prompt ?? '');
    return HttpResponse.json({response: 'model-answer', done: true, model: 'test'});
  }),
);

beforeAll(() => server.listen({onUnhandledRequest: 'error'}));
afterEach(() => {
  capturedPrompts.length = 0;
  server.resetHandlers();
});
afterAll(() => server.close());

function textStep(id: string, text: string, outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'presentation',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    config: {type: 'presentation', text, outputNames: ['text']},
  };
}

function makePipeline(steps: PipelineStep[]): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-smoke',
    name: 'Native Smoke Pipeline',
    input: {raw: 'hello', tagName: 'user', outputNamespace: 'user_prompt'},
    steps,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('native path smoke (executeStepChain)', () => {
  it('runs a full linear pipeline to completion', async () => {
    const pipeline = makePipeline([
      textStep('wrap', 'wrapped prompt', 'wrapped'),
      textStep('tail', '{{artifact.wrapped.text}}', 'answer'),
    ]);

    const artifacts: Record<string, unknown> = {};
    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact(a) { artifacts[a.name] = a.value; },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.partial).toBe(false);
    expect(result.value.executedStepIds).toEqual(['wrap', 'tail']);
    expect(result.value.finalOutputKey).toBe('answer.text');
    expect(String(artifacts['answer.text'] ?? '')).toContain('wrapped prompt');
  });

  it('stops at stopAtStepId and marks the run partial', async () => {
    const trace: string[] = [];
    const pipeline = makePipeline([
      textStep('a', 'step-a', 'a'),
      textStep('b', 'step-b', 'b'),
      textStep('c', 'step-c', 'c'),
    ]);

    const result = await executeStepChain(
      pipeline,
      'hello',
      {stopAtStepId: 'b'},
      () => undefined,
      {
        onTraceEvent(e) { trace.push(`${e.stepId}:${e.status}`); },
        onArtifact() {},
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.partial).toBe(true);
    expect(result.value.executedStepIds).toEqual(['a', 'b']);
    expect(result.value.snapshots.c).toBeUndefined();
    expect(trace.some((e) => e === 'a:completed')).toBe(true);
    expect(trace.some((e) => e === 'b:completed')).toBe(true);
    expect(trace.some((e) => e.startsWith('c:'))).toBe(false);
  });

  it('resolves prior-step history reads and records step snapshots', async () => {
    const intent = textStep('intent', '{"goal":"ship it"}', 'intent_extraction');
    const main: PipelineStep = {
      id: 'main',
      type: 'model-call',
      label: 'Main Model',
      enabled: true,
      outputNamespace: 'answer',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00.000Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: ENDPOINT.id, modelName: 'test'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [{
          sourceStepId: 'intent',
          sourceArtifactRef: 'intent_extraction.text',
          tagName: 'intent',
          required: true,
        }],
        blocks: [{
          id: 'blk-main',
          label: 'Instructions',
          tagName: 'system',
          body: 'Use the intent.',
          enabled: true,
          source: 'custom',
        }],
      },
    };

    const result = await executeStepChain(
      makePipeline([intent, main]),
      'hello',
      {},
      (id) => (id === ENDPOINT.id ? ENDPOINT : undefined),
      {onTraceEvent() {}, onArtifact() {}},
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(capturedPrompts).toHaveLength(1);
    expect(capturedPrompts[0]).toContain('<intent>');
    expect(capturedPrompts[0]).toContain('ship it');
    expect(result.value.snapshots.intent?.status).toBe('completed');
    expect(result.value.snapshots.main?.status).toBe('completed');
    expect(result.value.snapshots.main?.outputArtifactRefs).toContain('answer.text');
  });
});
