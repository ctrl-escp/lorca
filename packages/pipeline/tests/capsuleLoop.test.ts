import {describe, it, expect} from 'vitest';
import type {LegacyPipelineDefinition, CapsuleDefinition, PipelineArtifact, PipelineTraceEvent} from '@lorca/core';
import {executePipeline} from '../src/executor.js';

const ENDPOINT = {
  id: 'ep1', name: 'Test', baseUrl: 'http://localhost:11434', kind: 'ollama' as const,
  enabled: true, browserAccess: 'available' as const, authKind: 'none' as const,
  createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
};

// A capsule that echoes its carried input as output via a template
// interface input: carried_text (text); outputRef → template node's .text output
function makeRefinerCapsule(id: string): CapsuleDefinition {
  return {
    schemaVersion: 1 as const,
    id,
    name: 'Refiner',
    version: 'v1',
    status: 'locked',
    interface: {
      inputs: [{name: 'carried_text', kind: 'text', required: true}],
      outputs: [{name: 'output_text', kind: 'text'}],
      parameters: [],
      modelSlots: [],
    },
    nodes: [
      {id: `${id}-input`, type: 'input'},
      {id: `${id}-tmpl`, type: 'template', artifactPrefix: `${id}-tmpl`, template: 'iter:{{artifact.carried_text}}'},
    ],
    edges: [{id: 'e1', fromNodeId: `${id}-input`, fromOutput: 'xml', toNodeId: `${id}-tmpl`, toInput: 'input'}],
    outputRef: {nodeId: `${id}-tmpl`, outputName: 'text'},
    tests: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makePipelineWithLoop(capsule: CapsuleDefinition, count: number): LegacyPipelineDefinition {
  return {
    schemaVersion: 1 as const,
    id: 'pipe1',
    name: 'Test',
    inputArtifactName: 'user_prompt',
    nodes: [
      {id: 'input-1', type: 'input'},
      {id: 'seed', type: 'manual-text', artifactPrefix: 'seed', text: 'start'},
      {
        id: 'refiner',
        type: 'capsule-instance',
        artifactPrefix: 'refiner',
        config: {
          capsuleDefinitionId: capsule.id,
          capsuleVersion: capsule.version,
          inputBindings: {carried_text: 'seed.text'},
          outputBindings: {},
          parameterValues: {},
          modelSlotAssignments: {},
          loop: {
            enabled: true,
            count,
            inputCarryMode: 'first-input-then-previous-output',
            carriedInputName: 'carried_text',
            carriedOutputName: 'output_text',
          },
        },
      },
    ],
    edges: [
      {id: 'e1', fromNodeId: 'input-1', fromOutput: 'xml', toNodeId: 'seed', toInput: 'input'},
      {id: 'e2', fromNodeId: 'seed', fromOutput: 'text', toNodeId: 'refiner', toInput: 'input'},
    ],
    outputRef: {nodeId: 'refiner', outputName: 'output_text'},
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
    artifacts: {} as Record<string, PipelineArtifact>,
    trace: [] as PipelineTraceEvent[],
  };
}

describe('CapsuleInstanceNode looped execution', () => {
  it('produces iteration artifacts for each iteration', async () => {
    const capsule = makeRefinerCapsule('ref1');
    const pipeline = makePipelineWithLoop(capsule, 3);
    const ctx = makeCtx();

    await executePipeline(
      pipeline, ctx, () => ENDPOINT,
      {onArtifact(a) { ctx.artifacts[a.name] = a; }, onTraceEvent(e) { ctx.trace.push(e); }},
      () => capsule,
    );

    expect('refiner.iteration_1.output_text' in ctx.artifacts).toBe(true);
    expect('refiner.iteration_2.output_text' in ctx.artifacts).toBe(true);
    expect('refiner.iteration_3.output_text' in ctx.artifacts).toBe(true);
  });

  it('creates a final artifact equal to last iteration output', async () => {
    const capsule = makeRefinerCapsule('ref2');
    const pipeline = makePipelineWithLoop(capsule, 2);
    const ctx = makeCtx('run2');

    const result = await executePipeline(
      pipeline, ctx, () => ENDPOINT,
      {onArtifact(a) { ctx.artifacts[a.name] = a; }, onTraceEvent(e) { ctx.trace.push(e); }},
      () => capsule,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('refiner.final.output_text');
    expect(ctx.artifacts['refiner.final.output_text']).toBeDefined();
    expect(ctx.artifacts['refiner.final.output_text']?.value)
      .toBe(ctx.artifacts['refiner.iteration_2.output_text']?.value);
  });

  it('carries previous iteration output into next iteration as carried input', async () => {
    const capsule = makeRefinerCapsule('ref3');
    const pipeline = makePipelineWithLoop(capsule, 2);
    const ctx = makeCtx('run3');

    await executePipeline(
      pipeline, ctx, () => ENDPOINT,
      {onArtifact(a) { ctx.artifacts[a.name] = a; }, onTraceEvent(e) { ctx.trace.push(e); }},
      () => capsule,
    );

    // Iteration 1: input = 'start' → output = 'iter:start'
    expect(ctx.artifacts['refiner.iteration_1.output_text']?.value).toBe('iter:start');
    // Iteration 2: input = 'iter:start' (carried) → output = 'iter:iter:start'
    expect(ctx.artifacts['refiner.iteration_2.output_text']?.value).toBe('iter:iter:start');
  });

  it('rejects loop count above CAPSULE_LOOP_MAX_COUNT', async () => {
    const capsule = makeRefinerCapsule('ref4');
    const pipeline = makePipelineWithLoop(capsule, 11);
    const ctx = makeCtx('run4');

    const result = await executePipeline(
      pipeline, ctx, () => ENDPOINT,
      {onArtifact(a) { ctx.artifacts[a.name] = a; }, onTraceEvent(e) { ctx.trace.push(e); }},
      () => capsule,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('capsule_loop_limit_exceeded');
  });

  it('rejects loop count of 0', async () => {
    const capsule = makeRefinerCapsule('ref5');
    const pipeline = makePipelineWithLoop(capsule, 0);
    const ctx = makeCtx('run5');

    const result = await executePipeline(
      pipeline, ctx, () => ENDPOINT,
      {onArtifact(a) { ctx.artifacts[a.name] = a; }, onTraceEvent(e) { ctx.trace.push(e); }},
      () => capsule,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('capsule_loop_limit_exceeded');
  });

  it('tags trace events with capsuleIteration', async () => {
    const capsule = makeRefinerCapsule('ref6');
    const pipeline = makePipelineWithLoop(capsule, 2);
    const ctx = makeCtx('run6');

    await executePipeline(
      pipeline, ctx, () => ENDPOINT,
      {onArtifact(a) { ctx.artifacts[a.name] = a; }, onTraceEvent(e) { ctx.trace.push(e); }},
      () => capsule,
    );

    const iterationEvents = ctx.trace.filter((e) => e.capsuleIteration !== undefined);
    const iterations = new Set(iterationEvents.map((e) => e.capsuleIteration));
    expect(iterations.has(1)).toBe(true);
    expect(iterations.has(2)).toBe(true);
  });

  it('resolveOutputRef returns .final. key for looped capsule instance', async () => {
    const {resolveOutputRef} = await import('../src/artifacts.js');
    const node = {
      id: 'refiner',
      type: 'capsule-instance' as const,
      artifactPrefix: 'refiner',
      config: {
        capsuleDefinitionId: 'cap1',
        capsuleVersion: 'v1',
        inputBindings: {},
        outputBindings: {},
        parameterValues: {},
        modelSlotAssignments: {},
        loop: {enabled: true, count: 3, inputCarryMode: 'first-input-then-previous-output' as const, carriedInputName: 'carried_text', carriedOutputName: 'output_text'},
      },
    };
    const key = resolveOutputRef({nodeId: 'refiner', outputName: 'output_text'}, [node]);
    expect(key).toBe('refiner.final.output_text');
  });
});
