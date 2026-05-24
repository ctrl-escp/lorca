// @vitest-environment node
import {describe, it, expect, beforeAll, afterAll, afterEach} from 'vitest';
import {http, HttpResponse} from 'msw';
import {setupServer} from 'msw/node';
import type {LegacyPipelineDefinition, CapsuleDefinition, AiEndpointConfig, PipelineDefinition, PipelineStep} from '@lorca/core';
import {executePipeline} from '../src/executor.js';
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

function makePipeline(nodes: LegacyPipelineDefinition['nodes'], outputNodeId: string, outputName = 'text'): LegacyPipelineDefinition {
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]!;
    const to = nodes[i + 1]!;
    edges.push({id: `e-${i}`, fromNodeId: from.id, fromOutput: 'text', toNodeId: to.id, toInput: 'input'});
  }
  return {
    schemaVersion: 1 as const,
    id: 'pipe1',
    name: 'Test',
    inputArtifactName: 'user_prompt',
    nodes,
    edges,
    outputRef: {nodeId: outputNodeId, outputName},
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeCapsule(id: string, text: string): CapsuleDefinition {
  return {
    schemaVersion: 1 as const,
    id,
    name: 'My Capsule',
    version: 'v1',
    status: 'locked',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes: [
      {id: `${id}-input`, type: 'input'},
      {id: `${id}-text`, type: 'manual-text', artifactPrefix: `${id}-text`, text},
    ],
    edges: [{id: 'e1', fromNodeId: `${id}-input`, fromOutput: 'xml', toNodeId: `${id}-text`, toInput: 'input'}],
    outputRef: {nodeId: `${id}-text`, outputName: 'text'},
    tests: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeCtx(runId = 'run1') {
  return {
    runId,
    pipelineId: 'pipe1',
    startedAt: new Date().toISOString(),
    input: {userPromptRaw: 'hello', userPromptXml: '<user_prompt>hello</user_prompt>'},
    artifacts: {} as Record<string, import('@lorca/core').PipelineArtifact>,
    trace: [] as import('@lorca/core').PipelineTraceEvent[],
  };
}

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

describe('CapsuleInstanceNode execution', () => {
  it('executes capsule nodes and exposes primary output in parent store', async () => {
    const capsule = makeCapsule('cap1', 'capsule output value');
    const pipeline = makePipeline(
      [
        {id: 'input-1', type: 'input'},
        {id: 'inst-1', type: 'capsule-instance', artifactPrefix: 'mycap', config: {
          capsuleDefinitionId: 'cap1',
          capsuleVersion: 'v1',
          inputBindings: {},
          outputBindings: {},
          parameterValues: {},
          modelSlotAssignments: {},
        }},
      ],
      'inst-1',
      'text',
    );

    const ctx = makeCtx();
    const artifacts: string[] = [];
    const trace: import('@lorca/core').PipelineTraceEvent[] = [];

    const result = await executePipeline(
      pipeline,
      ctx,
      () => ENDPOINT,
      {
        onArtifact(a) { artifacts.push(a.name); ctx.artifacts[a.name] = a; },
        onTraceEvent(e) { trace.push(e); ctx.trace.push(e); },
      },
      (_id, _ver) => capsule,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Primary output exposed as mycap.text
    expect(result.value).toBe('mycap.text');
    expect(ctx.artifacts['mycap.text']?.value).toBe('capsule output value');
  });

  it('namespaces internal artifacts under instancePrefix.internal.*', async () => {
    const capsule = makeCapsule('cap2', 'internal value');
    const pipeline = makePipeline(
      [
        {id: 'input-1', type: 'input'},
        {id: 'inst-2', type: 'capsule-instance', artifactPrefix: 'inst', config: {
          capsuleDefinitionId: 'cap2',
          capsuleVersion: 'v1',
          inputBindings: {},
          outputBindings: {},
          parameterValues: {},
          modelSlotAssignments: {},
        }},
      ],
      'inst-2',
      'text',
    );

    const ctx = makeCtx('run2');

    await executePipeline(
      pipeline,
      ctx,
      () => ENDPOINT,
      {onArtifact(a) { ctx.artifacts[a.name] = a; }, onTraceEvent(e) { ctx.trace.push(e); }},
      (_id, _ver) => capsule,
    );

    // Internal artifacts are namespaced
    expect('inst.internal.cap2-text.text' in ctx.artifacts).toBe(true);
  });

  it('returns missing_capsule error when resolver returns undefined', async () => {
    const pipeline = makePipeline(
      [
        {id: 'input-1', type: 'input'},
        {id: 'inst-3', type: 'capsule-instance', artifactPrefix: 'missing', config: {
          capsuleDefinitionId: 'nonexistent',
          capsuleVersion: 'v1',
          inputBindings: {},
          outputBindings: {},
          parameterValues: {},
          modelSlotAssignments: {},
        }},
      ],
      'inst-3',
      'text',
    );

    const ctx = makeCtx('run3');
    const result = await executePipeline(
      pipeline,
      ctx,
      () => ENDPOINT,
      {onArtifact() {}, onTraceEvent(e) { ctx.trace.push(e); }},
      () => undefined,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('missing_capsule');
  });

  it('returns missing_capsule error when no resolver is provided', async () => {
    const pipeline = makePipeline(
      [
        {id: 'input-1', type: 'input'},
        {id: 'inst-4', type: 'capsule-instance', config: {
          capsuleDefinitionId: 'cap1',
          capsuleVersion: 'v1',
          inputBindings: {},
          outputBindings: {},
          parameterValues: {},
          modelSlotAssignments: {},
        }},
      ],
      'inst-4',
      'text',
    );

    const ctx = makeCtx('run4');
    const result = await executePipeline(
      pipeline,
      ctx,
      () => ENDPOINT,
      {onArtifact() {}, onTraceEvent(e) { ctx.trace.push(e); }},
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('missing_capsule');
  });

  it('pre-seeds input ports from parent artifacts via inputBindings', async () => {
    const capsule: CapsuleDefinition = {
      schemaVersion: 1 as const,
      id: 'cap3',
      name: 'Input Capsule',
      version: 'v1',
      status: 'locked',
      interface: {
        inputs: [{name: 'context_text', kind: 'text', required: true}],
        outputs: [],
        parameters: [],
        modelSlots: [],
      },
      nodes: [
        {id: 'cap3-input', type: 'input'},
        {id: 'cap3-tmpl', type: 'template', artifactPrefix: 'cap3-tmpl', template: '{{artifact.context_text}}'},
      ],
      edges: [{id: 'e1', fromNodeId: 'cap3-input', fromOutput: 'xml', toNodeId: 'cap3-tmpl', toInput: 'input'}],
      outputRef: {nodeId: 'cap3-tmpl', outputName: 'text'},
      tests: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };

    const pipeline = makePipeline(
      [
        {id: 'input-1', type: 'input'},
        {id: 'manual-1', type: 'manual-text', artifactPrefix: 'manual-1', text: 'seeded value'},
        {id: 'inst-5', type: 'capsule-instance', artifactPrefix: 'ctx-cap', config: {
          capsuleDefinitionId: 'cap3',
          capsuleVersion: 'v1',
          inputBindings: {context_text: 'manual-1.text'},
          outputBindings: {},
          parameterValues: {},
          modelSlotAssignments: {},
        }},
      ],
      'inst-5',
      'text',
    );

    const ctx = makeCtx('run5');
    const result = await executePipeline(
      pipeline,
      ctx,
      () => ENDPOINT,
      {onArtifact(a) { ctx.artifacts[a.name] = a; }, onTraceEvent(e) { ctx.trace.push(e); }},
      (_id, _ver) => capsule,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ctx.artifacts['ctx-cap.text']?.value).toBe('seeded value');
  });
});

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
});
