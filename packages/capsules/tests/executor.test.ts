// @vitest-environment node
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {setupServer} from 'msw/node';
import {http, HttpResponse} from 'msw';
import type {CapsuleDefinition, AiEndpointConfig} from '@lorca/core';
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

function buildCapsule(overrides: Partial<CapsuleDefinition> = {}): CapsuleDefinition {
  const nodeId = 'mc-1';
  return {
    schemaVersion: 1,
    id: 'cap-1',
    name: 'Test',
    version: 'v1',
    status: 'draft',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes: [
      {id: 'in', type: 'input'},
      {id: nodeId, type: 'model-call', artifactPrefix: 'answer',
        config: {modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'test'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}},
    ],
    edges: [
      {id: 'e1', fromNodeId: 'in', fromOutput: 'xml', toNodeId: nodeId, toInput: 'input'},
    ],
    outputRef: {nodeId, outputName: 'text'},
    tests: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('executeCapsuleTestRun', () => {
  it('produces artifacts and trace for a simple capsule', async () => {
    const def = buildCapsule();
    const artifacts: string[] = [];
    const trace: string[] = [];

    const result = await executeCapsuleTestRun(
      def,
      {userPromptRaw: 'test prompt', inputValues: {}, paramValues: {}, slotAssignments: {}},
      (id) => (id === 'ep-1' ? ENDPOINT : undefined),
      {
        onArtifact(a) { artifacts.push(a.name); },
        onTraceEvent(e) { trace.push(`${e.nodeId}:${e.status}`); },
      },
    );

    expect(result.ok).toBe(true);
    expect(artifacts).toContain('answer.text');
    if (result.ok) expect(result.value.finalOutputKey).toBe('answer.text');
  });

  it('resolves model slot assignments before running', async () => {
    const def = buildCapsule({
      interface: {
        inputs: [],
        outputs: [],
        parameters: [],
        modelSlots: [{name: 'main_model', suggestedBuckets: ['general'], required: true}],
      },
      nodes: [
        {id: 'in', type: 'input'},
        {id: 'mc-slot', type: 'model-call', artifactPrefix: 'answer',
          config: {modelRef: {kind: 'slot', slotName: 'main_model'}, mode: 'generate', inputArtifactRef: 'user_prompt.xml'}},
      ],
      edges: [{id: 'e1', fromNodeId: 'in', fromOutput: 'xml', toNodeId: 'mc-slot', toInput: 'input'}],
      outputRef: {nodeId: 'mc-slot', outputName: 'text'},
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

  it('resolves model slot assignments for step-chain capsules before running', async () => {
    const def = buildCapsule({
      interface: {
        inputs: [],
        outputs: [{name: 'answer', kind: 'text', sourceArtifactKey: 'answer.text'}],
        parameters: [],
        modelSlots: [{name: 'main_model', suggestedBuckets: ['general'], required: true}],
      },
      nodes: [],
      edges: [],
      input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
      steps: [{
        id: 'intent',
        type: 'model-call',
        label: 'Intent',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: new Date().toISOString(),
        config: {
          type: 'model-call',
          modelRef: {kind: 'slot', slotName: 'main_model'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      }],
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

  it('substitutes params in template nodes', async () => {
    let capturedPrompt = '';
    server.use(
      http.post('http://localhost:11434/api/generate', async ({request}) => {
        const body = await request.json() as {prompt?: string};
        capturedPrompt = body.prompt ?? '';
        return HttpResponse.json({model: 'test', response: 'ok', done: true});
      }),
    );

    const templateId = 'tmpl-1';
    const mcId = 'mc-2';
    const def = buildCapsule({
      interface: {
        inputs: [],
        outputs: [],
        parameters: [{name: 'goal', kind: 'text', required: true}],
        modelSlots: [],
      },
      nodes: [
        {id: 'in', type: 'input'},
        {id: templateId, type: 'template', artifactPrefix: 'rendered',
          template: 'Goal: {{param.goal}}\nPrompt: {{artifact.user_prompt.raw}}'},
        {id: mcId, type: 'model-call', artifactPrefix: 'answer',
          config: {modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'test'}, mode: 'generate', inputArtifactRef: 'rendered.text'}},
      ],
      edges: [
        {id: 'e1', fromNodeId: 'in', fromOutput: 'xml', toNodeId: templateId, toInput: 'input'},
        {id: 'e2', fromNodeId: templateId, fromOutput: 'text', toNodeId: mcId, toInput: 'input'},
      ],
      outputRef: {nodeId: mcId, outputName: 'text'},
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
});
