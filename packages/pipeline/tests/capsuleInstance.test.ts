import {describe, it, expect} from 'vitest';
import type {LegacyPipelineDefinition, CapsuleDefinition, AiEndpointConfig} from '@lorca/core';
import {executePipeline} from '../src/executor.js';

const ENDPOINT: AiEndpointConfig = {
  id: 'ep1',
  name: 'Test',
  baseUrl: 'http://localhost:11434',
  kind: 'ollama',
  enabled: true,
  browserAccess: 'available',
  authKind: 'none',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

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
