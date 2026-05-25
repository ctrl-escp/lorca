// @vitest-environment node
import {describe, it, expect, beforeAll, afterAll, afterEach} from 'vitest';
import {http, HttpResponse} from 'msw';
import {setupServer} from 'msw/node';
import type {CapsuleDefinition, AiEndpointConfig, PipelineDefinition, PipelineStep} from '@lorca/core';
import {executeStepChain} from '../src/stepExecutor.js';

const BASE = 'http://localhost:11436';

const ENDPOINT: AiEndpointConfig = {
  id: 'ep1',
  name: 'Test',
  baseUrl: BASE,
  kind: 'ollama',
  enabled: true,
  browserAccess: 'available',
  authKind: 'none',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const modelCallBodies: unknown[] = [];
const server = setupServer(
  http.post(`${BASE}/api/generate`, async ({request}) => {
    modelCallBodies.push(await request.json());
    return HttpResponse.json({response: 'model output', done: true, model: 'bound-model'});
  }),
);

beforeAll(() => server.listen({onUnhandledRequest: 'error'}));
afterEach(() => {
  modelCallBodies.length = 0;
  server.resetHandlers();
});
afterAll(() => server.close());

function makeTextStep(id: string, text: string, outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'presentation',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2025-01-01T00:00:00.000Z',
    config: {type: 'presentation', text, outputNames: ['text']},
  };
}

function makeSlotModelStep(id: string, slotName: string, outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'model-call',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2025-01-01T00:00:00.000Z',
    config: {
      type: 'model-call',
      modelRef: {kind: 'slot', slotName},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
    },
  };
}

function makeStepChainCapsule(text: string): CapsuleDefinition {
  return {
    schemaVersion: 1,
    id: 'cap-chain',
    name: 'Step Chain Capsule',
    version: 'v1',
    status: 'locked',
    interface: {
      inputs: [],
      outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'body.text'}],
      parameters: [],
      modelSlots: [],
    },
    nodes: [],
    edges: [],
    outputRef: {nodeId: 'body', outputName: 'text'},
    steps: [makeTextStep('body', text, 'body')],
    input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeStepChainPipeline(step: PipelineStep): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-chain',
    name: 'Step Chain Pipeline',
    input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
    steps: [step],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('capsule-instance step-chain execution', () => {
  it('runs the saved capsule body in opaque mode', async () => {
    const capsule = makeStepChainCapsule('saved body');
    const instance: PipelineStep = {
      id: 'inst-inline',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
        displayMode: 'opaque',
        inlineSteps: [makeTextStep('body', 'inline body', 'body')],
        inlineModified: true,
      },
    };
    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};

    const result = await executeStepChain(
      makeStepChainPipeline(instance),
      'hello',
      {},
      () => ENDPOINT,
      {onArtifact(a) { artifacts[a.name] = a; }, onTraceEvent() {}},
      () => capsule,
    );

    expect(result.ok).toBe(true);
    expect(artifacts['cap.text']?.value).toBe('saved body');
  });

  it('runs inlineSteps in inline mode while keeping public output bindings', async () => {
    const capsule = makeStepChainCapsule('saved body');
    const instance: PipelineStep = {
      id: 'inst-inline',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
        displayMode: 'inline',
        inlineSteps: [makeTextStep('body', 'inline body', 'body')],
        inlineModified: true,
      },
    };
    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};

    const result = await executeStepChain(
      makeStepChainPipeline(instance),
      'hello',
      {},
      () => ENDPOINT,
      {onArtifact(a) { artifacts[a.name] = a; }, onTraceEvent() {}},
      () => capsule,
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.finalOutputKey : '').toBe('cap.text');
    expect(artifacts['cap.text']?.value).toBe('inline body');
  });

  it('resolves legacy internal outputBindings to namespaced parent artifact keys', async () => {
    const capsule = makeStepChainCapsule('saved body');
    const instance: PipelineStep = {
      id: 'inst-legacy-bindings',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap_inst',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {},
        outputBindings: {result: 'body.text'},
        displayMode: 'inline',
        inlineSteps: [makeTextStep('body', 'inline body', 'body')],
      },
    };
    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};

    const result = await executeStepChain(
      makeStepChainPipeline(instance),
      'hello',
      {},
      () => ENDPOINT,
      {onArtifact(a) { artifacts[a.name] = a; }, onTraceEvent() {}},
      () => capsule,
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.finalOutputKey : '').toBe('cap_inst.text');
    expect(artifacts['cap_inst.text']?.value).toBe('inline body');
    expect(artifacts['body.text']).toBeUndefined();
  });

  it('applies model slot bindings before running inlineSteps', async () => {
    const capsule = makeStepChainCapsule('saved body');
    const instance: PipelineStep = {
      id: 'inst-inline',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
        modelSlotBindings: {main: {kind: 'fixed', endpointId: ENDPOINT.id, modelName: 'bound-model'}},
        displayMode: 'inline',
        inlineSteps: [makeSlotModelStep('body', 'main', 'body')],
      },
    };
    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};

    const result = await executeStepChain(
      makeStepChainPipeline(instance),
      'hello',
      {},
      (id) => id === ENDPOINT.id ? ENDPOINT : undefined,
      {onArtifact(a) { artifacts[a.name] = a; }, onTraceEvent() {}},
      () => capsule,
    );

    expect(result.ok).toBe(true);
    expect(artifacts['cap.text']?.value).toBe('model output');
    expect(modelCallBodies).toHaveLength(1);
    expect(modelCallBodies[0]).toMatchObject({model: 'bound-model'});
  });

  it('forwards inner step trace and namespaced artifacts for inline capsule chains', async () => {
    const capsule = makeStepChainCapsule('saved body');
    const instance: PipelineStep = {
      id: 'inst-inline',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
        displayMode: 'inline',
        inlineSteps: [makeTextStep('body', 'inline body', 'body')],
      },
    };
    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};
    const trace: import('@lorca/core').PipelineTraceEvent[] = [];

    const result = await executeStepChain(
      makeStepChainPipeline(instance),
      'hello',
      {},
      () => ENDPOINT,
      {
        onArtifact(a) { artifacts[a.name] = a; },
        onTraceEvent(e) { trace.push(e); },
      },
      () => capsule,
    );

    expect(result.ok).toBe(true);
    expect(trace.some((e) => e.stepId === 'body' && e.capsuleInstanceId === 'inst-inline')).toBe(true);
    expect(artifacts['cap.internal.body.text']?.value).toBe('inline body');
    expect(result.ok ? result.value.snapshots['inst-inline:body'] : undefined).toMatchObject({
      stepId: 'body',
      status: 'completed',
      outputArtifactRefs: ['cap.internal.body.text'],
    });
  });

  it('forwards abort signals into nested step-chain capsules', async () => {
    const capsule = makeStepChainCapsule('saved body');
    const instance: PipelineStep = {
      id: 'inst-inline',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
        displayMode: 'inline',
        inlineSteps: [makeTextStep('body', 'inline body', 'body')],
      },
    };
    const controller = new AbortController();

    const result = await executeStepChain(
      makeStepChainPipeline(instance),
      'hello',
      {abortSignal: controller.signal},
      () => ENDPOINT,
      {
        onArtifact() {},
        onTraceEvent(e) {
          if (e.stepId === 'inst-inline' && e.status === 'started') controller.abort();
        },
      },
      () => capsule,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('run_cancelled');
  });

  it('renders capsule params inside native loop groups', async () => {
    const loopStep: PipelineStep = {
      id: 'loop',
      type: 'loop-group',
      label: 'Loop',
      enabled: true,
      outputNamespace: 'loop',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'loop-group',
        maxIterations: 1,
        exitCondition: {type: 'iterations'},
        steps: [makeTextStep('inner', 'Goal: {{param.goal}}', 'inner')],
        outputNames: ['text'],
      },
    };
    const capsule: CapsuleDefinition = {
      ...makeStepChainCapsule('unused'),
      interface: {
        inputs: [],
        outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'loop.text'}],
        parameters: [{name: 'goal', kind: 'text', required: true}],
        modelSlots: [],
      },
      steps: [loopStep],
      outputRef: {nodeId: 'loop', outputName: 'text'},
    };
    const instance: PipelineStep = {
      id: 'inst-inline',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2025-01-01T00:00:00.000Z',
      config: {
        type: 'capsule-instance',
        capsuleId: capsule.id,
        capsuleVersion: capsule.version,
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
        parameterValues: {goal: 'extract JSON'},
        displayMode: 'opaque',
      },
    };
    const artifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};

    const result = await executeStepChain(
      makeStepChainPipeline(instance),
      'hello',
      {},
      () => ENDPOINT,
      {onArtifact(a) { artifacts[a.name] = a; }, onTraceEvent() {}},
      () => capsule,
    );

    expect(result.ok).toBe(true);
    expect(artifacts['cap.text']?.value).toBe('Goal: extract JSON');
  });
});
