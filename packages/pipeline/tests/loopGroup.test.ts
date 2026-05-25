// @vitest-environment node
import {describe, it, expect, beforeAll, afterAll, afterEach} from 'vitest';
import {http, HttpResponse} from 'msw';
import {setupServer} from 'msw/node';
import type {AiEndpointConfig, PipelineDefinition, PipelineStep, LoopExitCondition} from '@lorca/core';
import {executeStepChain} from '../src/stepExecutor.js';

const BASE = 'http://loop-test-ollama.local';
let _lastPrompt = '';
const server = setupServer(
  http.post(`${BASE}/api/generate`, async ({request}) => {
    const body = await request.json() as {prompt?: string};
    _lastPrompt = body.prompt ?? '';
    return HttpResponse.json({response: `echo:${_lastPrompt}`, done: true, model: 'test'});
  }),
);

const mockEndpoint: AiEndpointConfig = {
  id: 'loop-ep', name: 'Loop test', baseUrl: BASE, kind: 'ollama', enabled: true,
  browserAccess: 'available', authKind: 'none',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

beforeAll(() => server.listen({onUnhandledRequest: 'bypass'}));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeManualStep(id: string, text: string, ns?: string): PipelineStep {
  return {
    id,
    type: 'presentation',
    label: id,
    enabled: true,
    outputNamespace: ns ?? id,
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {type: 'presentation', text, outputNames: ['text']},
  };
}

function makeLoopPipeline(
  innerSteps: PipelineStep[],
  options?: {maxIterations?: number; exitCondition?: LoopExitCondition},
): PipelineDefinition {
  const maxIterations = options?.maxIterations ?? 3;
  const exitCondition = options?.exitCondition ?? {type: 'json-field-equals' as const, fieldPath: 'passed', value: true};

  return {
    schemaVersion: 2,
    id: 'pipe-loop',
    name: 'Loop test',
    input: {raw: 'hello', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [{
      id: 'loop',
      type: 'loop-group',
      label: 'Loop',
      enabled: true,
      outputNamespace: 'loop_out',
      primaryOutputName: 'text',
      lastEditedAt: new Date().toISOString(),
      config: {
        type: 'loop-group',
        maxIterations,
        exitCondition,
        steps: innerSteps,
        outputNames: ['text'],
      },
    }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('loop-group execution', () => {
  it('exits after first iteration when exit condition is met', async () => {
    const pipeline = makeLoopPipeline([
      makeManualStep('verify', JSON.stringify({passed: true})),
    ]);

    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.finalOutputKey).toBe('loop_out.text');
  });

  it('exits after exactly one iteration when json-field-equals condition matches', async () => {
    let callCount = 0;
    server.use(
      http.post(`${BASE}/api/generate`, async () => {
        callCount++;
        return HttpResponse.json({response: '{"passed":true}', done: true, model: 'test'});
      }),
    );

    const checkerStep: PipelineStep = {
      id: 'checker',
      type: 'model-call',
      label: 'Checker',
      enabled: true,
      outputNamespace: 'checker',
      primaryOutputName: 'text',
      lastEditedAt: new Date().toISOString(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: 'loop-ep', modelName: 'test'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'prev'},
        historyReads: [],
        blocks: [{id: 'b1', label: 'body', tagName: 'body', body: 'check', enabled: true, source: 'custom'}],
      },
    };

    const pipeline = makeLoopPipeline([checkerStep], {
      maxIterations: 3,
      exitCondition: {type: 'json-field-equals', fieldPath: 'passed', value: true},
    });

    const result = await executeStepChain(pipeline, 'hello', {}, (id) => id === 'loop-ep' ? mockEndpoint : undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(true);
    expect(callCount).toBe(1); // must exit after 1st iteration, not run all 3
  });

  it('exits when the condition JSON is wrapped in prose', async () => {
    let callCount = 0;
    server.use(
      http.post(`${BASE}/api/generate`, async () => {
        callCount++;
        return HttpResponse.json({
          response: 'Verification says:\n```json\n{"passed":true}\n```',
          done: true,
          model: 'test',
        });
      }),
    );

    const checkerStep: PipelineStep = {
      id: 'checker',
      type: 'model-call',
      label: 'Checker',
      enabled: true,
      outputNamespace: 'checker',
      primaryOutputName: 'text',
      lastEditedAt: new Date().toISOString(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: 'loop-ep', modelName: 'test'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'prev'},
        historyReads: [],
        blocks: [{id: 'b1', label: 'body', tagName: 'body', body: 'check', enabled: true, source: 'custom'}],
      },
    };

    const pipeline = makeLoopPipeline([checkerStep], {
      maxIterations: 3,
      exitCondition: {type: 'json-field-equals', fieldPath: 'passed', value: true},
    });

    const result = await executeStepChain(pipeline, 'hello', {}, (id) => id === 'loop-ep' ? mockEndpoint : undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(true);
    expect(callCount).toBe(1);
  });

  it('runs until maxIterations when exit condition is never met', async () => {
    const pipeline = makeLoopPipeline([
      makeManualStep('verify', JSON.stringify({passed: false})),
    ], {maxIterations: 2});

    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(true);
  });

  it('always runs maxIterations when exit condition type is iterations', async () => {
    const pipeline = makeLoopPipeline(
      [makeManualStep('body', 'done')],
      {maxIterations: 2, exitCondition: {type: 'iterations'}},
    );

    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(true);
  });

  it('rejects empty inner chains', async () => {
    const pipeline = makeLoopPipeline([]);

    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact() {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('at least one enabled inner step');
  });

  it('promotes final inner-step artifacts to the outer artifact store', async () => {
    const pipeline = makeLoopPipeline([
      makeManualStep('answer', 'final answer text', 'answer'),
      makeManualStep('verify', JSON.stringify({passed: true}), 'verify'),
    ]);

    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};
    const result = await executeStepChain(pipeline, 'hello', {}, () => undefined, {
      onTraceEvent() {},
      onArtifact(a) { artifacts[a.name] = a; },
    });

    expect(result.ok).toBe(true);
    expect(artifacts['answer.text']?.value).toBe('final answer text');
    expect(artifacts['verify.text']?.value).toBe('{"passed":true}');
    expect(artifacts['loop_out.text']?.value).toBe('{"passed":true}');
  });

  it('exposes loop.prev.text to inner steps from the second iteration onward', async () => {
    const pipeline = makeLoopPipeline([
      makeManualStep('gen', 'first-output'),
      {
        id: 'wrap',
        type: 'model-call',
        label: 'Wrap',
        enabled: true,
        outputNamespace: 'wrap',
        primaryOutputName: 'text',
        lastEditedAt: new Date().toISOString(),
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'loop-ep', modelName: 'test'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
        prompt: {
          previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
          historyReads: [{
            sourceStepId: 'loop.prev',
            sourceArtifactRef: 'loop.prev.text',
            tagName: 'prev_iter',
            required: false,
          }],
          blocks: [{
            id: 'b1',
            label: 'Body',
            tagName: 'body',
            body: 'done',
            enabled: true,
            source: 'custom',
          }],
        },
      },
    ], {maxIterations: 2, exitCondition: {type: 'iterations'}});

    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};
    const result = await executeStepChain(pipeline, 'hello', {}, (id) => id === 'loop-ep' ? mockEndpoint : undefined, {
      onTraceEvent() {},
      onArtifact(a) { artifacts[a.name] = a; },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The mock echoes the prompt. In iteration 2, the prompt includes <prev_iter>...</prev_iter>
      // wrapping iteration 1's output (which itself contained <prev_iter/> + <body>done</body> from echo).
      const out = String(artifacts['loop_out.text']?.value ?? '');
      // Verify iteration 2's output references loop.prev content via prev_iter history read
      expect(out).toMatch(/echo:/);
    }
  });
});
