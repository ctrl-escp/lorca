// @vitest-environment node
import {describe, it, expect, beforeAll, afterAll, afterEach} from 'vitest';
import {setupServer} from 'msw/node';
import {http, HttpResponse} from 'msw';
import type {CapsuleDefinition, AiEndpointConfig, PipelineStep} from '@lorca/core';
import {executeCapsuleTestRun} from '../src/executor.js';

const ENDPOINT: AiEndpointConfig = {
  id: 'ep-1', name: 'Local Ollama', baseUrl: 'http://localhost:11434',
  kind: 'ollama', enabled: true, browserAccess: 'available',
  authKind: 'none', createdAt: '', updatedAt: '',
};

const server = setupServer(
  http.post('http://localhost:11434/api/generate', () =>
    HttpResponse.json({model: 'test', response: 'Hello from Capsule!', done: true}),
  ),
);

beforeAll(() => server.listen({onUnhandledRequest: 'error'}));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

function modelCallStep(
  id: string,
  options?: {
    outputNamespace?: string;
    slotName?: string;
    endpointId?: string;
    prompt?: string;
  },
): PipelineStep {
  const promptBody = options?.prompt ?? '';
  return {
    id,
    type: 'model-call',
    label: id,
    enabled: true,
    outputNamespace: options?.outputNamespace ?? 'answer',
    primaryOutputName: 'text',
    lastEditedAt: new Date().toISOString(),
    config: {
      type: 'model-call',
      modelRef: options?.slotName
        ? {kind: 'slot', slotName: options.slotName}
        : {kind: 'fixed', endpointId: options?.endpointId ?? 'ep-1', modelName: 'test'},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
    },
    prompt: {
      previousOutput: {
        enabled: promptBody.length === 0,
        placement: 'afterOwnPrompt',
        tagName: 'user_prompt',
      },
      historyReads: [],
      blocks: promptBody
        ? [{
          id: `prompt-${id}`,
          label: 'Prompt',
          tagName: 'system',
          body: promptBody,
          enabled: true,
          source: 'custom',
        }]
        : [],
    },
  };
}

function buildCapsule(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  return {
    schemaVersion: 2,
    id: 'cap-1',
    name: 'Test',
    version: 'v1',
    status: 'draft',
    interface: {
      inputs: [],
      outputs: [{name: 'answer', kind: 'text', sourceArtifactKey: 'answer.text'}],
      parameters: [],
      modelSlots: [],
    },
    steps: [modelCallStep('mc-1')],
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('executeCapsuleTestRun', () => {
  it('produces artifacts and trace for a step-chain capsule', async () => {
    const def = buildCapsule();
    const artifacts: string[] = [];
    const trace: string[] = [];

    const result = await executeCapsuleTestRun(
      def,
      {userPromptRaw: 'test prompt', inputValues: {}, paramValues: {}, slotAssignments: {}},
      (id) => (id === 'ep-1' ? ENDPOINT : undefined),
      {
        onArtifact(a) { artifacts.push(a.name); },
        onTraceEvent(e) { trace.push(`${e.stepId}:${e.status}`); },
      },
    );

    expect(result.ok).toBe(true);
    expect(artifacts).toContain('answer.text');
    if (result.ok) expect(result.value.finalOutputKey).toBe('answer.text');
    expect(trace.some((entry) => entry.startsWith('mc-1:'))).toBe(true);
  });

  it('resolves model slot assignments before running', async () => {
    const def = buildCapsule({
      interface: {
        inputs: [],
        outputs: [{name: 'answer', kind: 'text', sourceArtifactKey: 'answer.text'}],
        parameters: [],
        modelSlots: [{name: 'main_model', suggestedBuckets: ['general'], required: true}],
      },
      steps: [modelCallStep('mc-slot', {slotName: 'main_model'})],
    });

    const result = await executeCapsuleTestRun(
      def,
      {
        userPromptRaw: 'hello',
        inputValues: {},
        paramValues: {},
        slotAssignments: {main_model: {endpointId: 'ep-1', modelName: 'test'}},
      },
      (id) => (id === 'ep-1' ? ENDPOINT : undefined),
      {onArtifact() {}, onTraceEvent() {}},
    );

    expect(result.ok).toBe(true);
  });

  it('pre-seeds input port artifacts from inputValues', async () => {
    const def = buildCapsule({
      interface: {
        inputs: [{name: 'source_text', kind: 'text', required: true}],
        outputs: [],
        parameters: [],
        modelSlots: [],
      },
    });

    const artifactNames: string[] = [];
    await executeCapsuleTestRun(
      def,
      {
        userPromptRaw: 'prompt',
        inputValues: {source_text: 'some text'},
        paramValues: {},
        slotAssignments: {},
      },
      (id) => (id === 'ep-1' ? ENDPOINT : undefined),
      {onArtifact(a) { artifactNames.push(a.name); }, onTraceEvent() {}},
    );

    expect(artifactNames).toContain('source_text.text');
  });

  it('substitutes params in model-call prompt blocks', async () => {
    let capturedPrompt = '';
    server.use(
      http.post('http://localhost:11434/api/generate', async ({request}) => {
        const body = await request.json() as {prompt?: string};
        capturedPrompt = body.prompt ?? '';
        return HttpResponse.json({model: 'test', response: 'ok', done: true});
      }),
    );

    const def = buildCapsule({
      interface: {
        inputs: [],
        outputs: [],
        parameters: [{name: 'goal', kind: 'text', required: true}],
        modelSlots: [],
      },
      steps: [modelCallStep('mc-2', {
        prompt: 'Goal: {{param.goal}}\nPrompt: {{artifact.user_prompt.raw}}',
      })],
    });

    await executeCapsuleTestRun(
      def,
      {userPromptRaw: 'my prompt', inputValues: {}, paramValues: {goal: 'extract JSON'}, slotAssignments: {}},
      (id) => (id === 'ep-1' ? ENDPOINT : undefined),
      {onArtifact() {}, onTraceEvent() {}},
    );

    expect(capturedPrompt).toContain('Goal: extract JSON');
    expect(capturedPrompt).toContain('my prompt');
  });

  it('rejects capsules with empty steps at execution time', async () => {
    const def = buildCapsule({steps: []});
    const result = await executeCapsuleTestRun(
      def,
      {userPromptRaw: 'hello', inputValues: {}, paramValues: {}, slotAssignments: {}},
      (id) => (id === 'ep-1' ? ENDPOINT : undefined),
      {
        onArtifact() {},
        onTraceEvent() {},
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('at least one step');
  });
});
