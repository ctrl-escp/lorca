import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, LegacyPipelineDefinition, PipelineDefinition, StepOutputsExport} from '@lorca/core';
import {migrateLegacyPipeline} from '@lorca/pipeline';
import {
  exportPipeline,
  exportCapsule,
  parsePipelineExport,
  parseCapsuleExport,
  previewPipelineImport,
  previewCapsuleImport,
  prepareImportedPipeline,
  prepareImportedCapsule,
  applyModelRemapsToSteps,
} from '../src/importExport.js';

function makeLegacyPipeline(): LegacyPipelineDefinition {
  const inputId = 'input-1';
  const wrapperId = 'wrap-1';
  const modelId = 'model-1';
  return {
    schemaVersion: 1,
    id: 'pipe-legacy',
    name: 'Legacy Pipeline',
    inputArtifactName: 'user_prompt',
    nodes: [
      {id: inputId, type: 'input'},
      {
        id: wrapperId,
        type: 'prompt-wrapper',
        artifactPrefix: 'wrapped',
        config: {
          tagName: 'user',
          instructionText: 'Wrap the input.',
          includeInputArtifact: true,
          inputPlacement: 'before-instructions',
        },
      },
      {
        id: modelId,
        type: 'model-call',
        title: 'Main Model',
        artifactPrefix: 'answer',
        config: {
          modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
          mode: 'generate',
          inputArtifactRef: 'wrapped.text',
          systemPrompt: 'Answer the user.',
        },
      },
    ],
    edges: [
      {id: 'e1', fromNodeId: inputId, fromOutput: 'xml', toNodeId: wrapperId, toInput: 'input'},
      {id: 'e2', fromNodeId: wrapperId, fromOutput: 'text', toNodeId: modelId, toInput: 'input'},
    ],
    outputRef: {nodeId: modelId, outputName: 'text'},
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeRichPipeline(): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-rich',
    name: 'Rich Pipeline',
    input: {raw: 'hello', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [
      {
        id: 'step-intent',
        type: 'model-call',
        label: 'Intent Extraction',
        enabled: true,
        outputNamespace: 'intent_extraction',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
        prompt: {
          previousOutput: {enabled: true, placement: 'beforeOwnPrompt', tagName: 'user_prompt'},
          historyReads: [],
          blocks: [
            {
              id: 'blk-intent',
              label: 'Instructions',
              tagName: 'system',
              body: 'Extract intent as JSON.',
              enabled: true,
              source: 'system-default',
            },
          ],
        },
      },
      {
        id: 'step-criteria',
        type: 'model-call',
        label: 'Acceptance Criteria',
        enabled: false,
        outputNamespace: 'acceptance_criteria',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
        prompt: {
          previousOutput: {enabled: true, placement: 'afterOwnPrompt', tagName: 'previous_output'},
          historyReads: [],
          blocks: [
            {
              id: 'blk-criteria',
              label: 'Instructions',
              tagName: 'system',
              body: 'Generate acceptance criteria.',
              enabled: true,
              source: 'system-default',
            },
          ],
        },
      },
      {
        id: 'step-main',
        type: 'model-call',
        label: 'Main Model',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
        prompt: {
          previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
          historyReads: [
            {
              sourceStepId: 'step-intent',
              sourceArtifactRef: 'intent_extraction.text',
              tagName: 'intent',
              required: true,
            },
            {
              sourceStepId: 'step-criteria',
              sourceArtifactRef: 'acceptance_criteria.text',
              tagName: 'criteria',
              required: false,
            },
          ],
          blocks: [
            {
              id: 'blk-main',
              label: 'Instructions',
              tagName: 'system',
              body: 'Answer using intent and criteria from history.',
              enabled: true,
              source: 'system-default',
            },
          ],
        },
      },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makePipeline(): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-1',
    name: 'Export Me',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [
      {
        id: 'step-1',
        type: 'model-call',
        label: 'Main Model',
        enabled: true,
        outputNamespace: 'answer',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'model-call',
          modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
          mode: 'generate',
          outputNames: ['text', 'rawResponse'],
        },
      },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeInlineCapsulePipeline(): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-inline',
    name: 'Inline Capsule Pipeline',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [
      {
        id: 'cap-step',
        type: 'capsule-instance',
        label: 'Inline Capsule',
        enabled: true,
        outputNamespace: 'cap',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'capsule-instance',
          capsuleId: 'cap-1',
          capsuleVersion: 'v1',
          inputBindings: {},
          outputBindings: {result: 'cap.text'},
          displayMode: 'inline',
          inlineModified: true,
          inlineSteps: [
            {
              id: 'inline-model',
              type: 'model-call',
              label: 'Inline Model',
              enabled: true,
              outputNamespace: 'inline_model',
              primaryOutputName: 'text',
              lastEditedAt: '2026-01-01T00:00:00Z',
              config: {
                type: 'model-call',
                modelRef: {kind: 'fixed', endpointId: 'ep-old', modelName: 'llama3:latest'},
                mode: 'generate',
                outputNames: ['text', 'rawResponse'],
              },
            },
          ],
        },
      },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeCapsule(): CapsuleDefinition {
  return {
    schemaVersion: 1,
    id: 'cap-1',
    name: 'Verifier',
    version: 'v1',
    status: 'locked',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    nodes: [{id: 'input-1', type: 'input'}],
    edges: [],
    outputRef: {nodeId: 'input-1', outputName: 'xml'},
    tests: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeStepChainCapsule(): CapsuleDefinition {
  return {
    schemaVersion: 1,
    id: 'cap-chain',
    name: 'Step Capsule',
    version: 'v1',
    status: 'locked',
    interface: {
      inputs: [],
      outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'body.text'}],
      parameters: [],
      modelSlots: [],
    },
    nodes: [{id: 'stale', type: 'manual-text', text: 'stale graph'}],
    edges: [],
    outputRef: {nodeId: 'stale', outputName: 'text'},
    steps: [{
      id: 'body',
      type: 'presentation',
      label: 'Body',
      enabled: true,
      outputNamespace: 'body',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {type: 'presentation', text: 'canonical step', outputNames: ['text']},
    }],
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const localCtx = {
  knownEndpointIds: new Set(['ep-local']),
  knownModelKeys: new Set(['ep-local::llama3:latest']),
  knownModelNames: new Set(['llama3:latest']),
  knownCapsuleKeys: new Set(['cap-1::v1']),
};

const stepOutputs: StepOutputsExport = {
  status: 'completed',
  runId: 'run-1',
  artifacts: {
    'answer.text': {
      name: 'answer.text',
      stepId: 'step-1',
      kind: 'text',
      value: 'Hello from a saved run',
      createdAt: '2026-01-01T00:00:00Z',
    },
  },
  trace: [],
  finalOutputKey: 'answer.text',
  error: null,
  snapshots: {
    'step-1': {
      stepId: 'step-1',
      inputSignature: 'input',
      configSignature: 'config',
      historyReadSignatures: {},
      outputArtifactRefs: ['answer.text'],
      primaryOutputPreview: 'Hello from a saved run',
      completedAt: '2026-01-01T00:00:01Z',
      status: 'completed',
    },
  },
  userPromptSignature: 'prompt',
  partial: false,
  executedStepIds: ['step-1'],
  rerunSingleStepId: null,
};

describe('importExport', () => {
  it('exports and parses a pipeline file', () => {
    const pipeline = makePipeline();
    const file = exportPipeline(pipeline);
    expect(file.app).toBe('lorca');
    expect(file.kind).toBe('pipeline');
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    expect(parsed.pipeline.name).toBe('Export Me');
  });

  it('optionally includes step outputs in a pipeline export', () => {
    const file = exportPipeline(makePipeline(), [], stepOutputs);
    expect(file.stepOutputs?.artifacts['answer.text']?.value).toBe('Hello from a saved run');

    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    expect(parsed.stepOutputs?.finalOutputKey).toBe('answer.text');
  });

  it('rejects invalid import files', () => {
    const bad = parsePipelineExport({app: 'other', kind: 'pipeline', pipeline: {}});
    expect(bad).toMatchObject({ok: false, errors: expect.arrayContaining([expect.stringContaining('lorca')])});
  });

  it('detects missing model references on import preview', () => {
    const file = exportPipeline(makePipeline());
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    const preview = previewPipelineImport(parsed, localCtx);
    if ('errors' in preview) throw new Error(preview.errors.join(', '));
    expect(preview.missingModels).toHaveLength(1);
    expect(preview.missingModels[0]?.endpointId).toBe('ep-old');
    expect(preview.missingModels[0]?.suggestedBuckets).toEqual(['general']);
  });

  it('attaches usage buckets per step for import remap UI', () => {
    const file = exportPipeline(makeRichPipeline());
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    const preview = previewPipelineImport(parsed, localCtx);
    if ('errors' in preview) throw new Error(preview.errors.join(', '));
    const intent = preview.missingModels.find((m) => m.label.includes('Intent Extraction'));
    const criteria = preview.missingModels.find((m) => m.label.includes('Acceptance Criteria'));
    expect(intent?.suggestedBuckets).toEqual(['extract-json']);
    expect(criteria?.suggestedBuckets).toEqual(['general']);
  });

  it('applies model remaps to imported pipeline', () => {
    const pipeline = makePipeline();
    const remapped = prepareImportedPipeline(pipeline, 'pipe-new', {
      'step-1': {endpointId: 'ep-local', modelName: 'llama3:latest'},
    });
    const modelStep = remapped.steps.find((s) => s.id === 'step-1');
    expect(modelStep?.type).toBe('model-call');
    if (modelStep?.config.type === 'model-call') {
      expect(modelStep.config.modelRef).toEqual({
        kind: 'fixed',
        endpointId: 'ep-local',
        modelName: 'llama3:latest',
      });
    }
  });

  it('applies model remaps inside loop-group steps', () => {
    const remapped = applyModelRemapsToSteps([
      {
        id: 'loop',
        type: 'loop-group',
        label: 'Retry Loop',
        enabled: true,
        outputNamespace: 'retry_loop',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'loop-group',
          maxIterations: 2,
          exitCondition: {type: 'iterations'},
          outputNames: ['text'],
          steps: [
            {
              id: 'inner-model',
              type: 'model-call',
              label: 'Inner Model',
              enabled: true,
              outputNamespace: 'inner',
              primaryOutputName: 'text',
              lastEditedAt: '2026-01-01T00:00:00Z',
              config: {
                type: 'model-call',
                modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
                mode: 'generate',
                outputNames: ['text', 'rawResponse'],
              },
            },
          ],
        },
      },
    ], {
      'inner-model': {endpointId: 'ep-local', modelName: 'llama3:latest'},
    });

    const loop = remapped[0];
    expect(loop?.config.type).toBe('loop-group');
    if (loop?.config.type === 'loop-group') {
      const inner = loop.config.steps[0];
      expect(inner?.config.type).toBe('model-call');
      if (inner?.config.type === 'model-call') {
        expect(inner.config.modelRef).toEqual({
          kind: 'fixed',
          endpointId: 'ep-local',
          modelName: 'llama3:latest',
        });
      }
    }
  });

  it('round-trips inline capsule working copies through pipeline export', () => {
    const file = exportPipeline(makeInlineCapsulePipeline(), [makeCapsule()]);
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));

    const step = parsed.pipeline.steps[0];
    expect(step?.config.type).toBe('capsule-instance');
    if (step?.config.type !== 'capsule-instance') return;
    expect(step.config.displayMode).toBe('inline');
    expect(step.config.inlineModified).toBe(true);
    expect(step.config.inlineSteps?.[0]?.id).toBe('inline-model');
  });

  it('detects and remaps model references inside inline capsule steps', () => {
    const file = exportPipeline(makeInlineCapsulePipeline(), [makeCapsule()]);
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    const preview = previewPipelineImport(parsed, localCtx);
    if ('errors' in preview) throw new Error(preview.errors.join(', '));
    expect(preview.missingModels.some((m) => m.key === 'inline-model')).toBe(true);

    const remapped = prepareImportedPipeline(parsed.pipeline, 'pipe-inline-imported', {
      'inline-model': {endpointId: 'ep-local', modelName: 'llama3:latest'},
    });
    const step = remapped.steps[0];
    expect(step?.config.type).toBe('capsule-instance');
    if (step?.config.type !== 'capsule-instance') return;
    const inner = step.config.inlineSteps?.[0];
    expect(inner?.config.type).toBe('model-call');
    if (inner?.config.type !== 'model-call') return;
    expect(inner.config.modelRef).toEqual({
      kind: 'fixed',
      endpointId: 'ep-local',
      modelName: 'llama3:latest',
    });
  });

  it('exports and imports a capsule file', () => {
    const capsule = makeCapsule();
    const file = exportCapsule(capsule);
    const parsed = parseCapsuleExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    const preview = previewCapsuleImport(parsed, localCtx);
    if ('errors' in preview) throw new Error(preview.errors.join(', '));
    expect(preview.capsule.name).toBe('Verifier');
    expect(preview.missingModels).toHaveLength(0);
  });

  it('optionally includes step outputs in a capsule export', () => {
    const file = exportCapsule(makeCapsule(), stepOutputs);
    expect(file.stepOutputs?.snapshots['step-1']?.outputArtifactRefs).toEqual(['answer.text']);

    const parsed = parseCapsuleExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    expect(parsed.stepOutputs?.artifacts['answer.text']?.stepId).toBe('step-1');
  });

  it('strips legacy graph fields from step-chain capsule exports', () => {
    const file = exportCapsule(makeStepChainCapsule());
    expect(file.capsule.steps).toHaveLength(1);
    expect(file.capsule.nodes).toBeUndefined();
    expect(file.capsule.edges).toBeUndefined();
    expect(file.capsule.outputRef).toBeUndefined();
  });

  it('strips legacy graph fields from included step-chain capsules in pipeline exports', () => {
    const pipeline: PipelineDefinition = {
      ...makePipeline(),
      steps: [{
        id: 'cap-step',
        type: 'capsule-instance',
        label: 'Capsule',
        enabled: true,
        outputNamespace: 'cap',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'capsule-instance',
          capsuleId: 'cap-chain',
          capsuleVersion: 'v1',
          inputBindings: {},
          outputBindings: {result: 'cap.text'},
        },
      }],
    };

    const file = exportPipeline(pipeline, [makeStepChainCapsule()]);
    const cap = file.includedCapsules?.[0];
    expect(cap?.steps).toHaveLength(1);
    expect(cap?.nodes).toBeUndefined();
    expect(cap?.edges).toBeUndefined();
    expect(cap?.outputRef).toBeUndefined();
  });

  it('prepareImportedCapsule assigns a new id', () => {
    const next = prepareImportedCapsule(makeCapsule(), 'cap-imported', {});
    expect(next.id).toBe('cap-imported');
    expect(next.id).not.toBe('cap-1');
  });

  it('prepareImportedCapsule migrates graph-only capsules and stores step-chain fields only', () => {
    const next = prepareImportedCapsule(makeCapsule(), 'cap-imported', {});
    expect(next.steps).toBeDefined();
    expect(next.nodes).toBeUndefined();
    expect(next.edges).toBeUndefined();
    expect(next.outputRef).toBeUndefined();
  });

  it('parseCapsuleExport normalizes step-chain capsules and drops stale graph fields', () => {
    const parsed = parseCapsuleExport({...exportCapsule(makeStepChainCapsule())});
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));
    expect(parsed.capsule.steps).toHaveLength(1);
    expect(parsed.capsule.nodes).toBeUndefined();
    expect(parsed.capsule.edges).toBeUndefined();
    expect(parsed.capsule.outputRef).toBeUndefined();
  });

  it('exports graph-only capsules as migrated step-chain bodies', () => {
    const file = exportCapsule(makeCapsule());
    expect(file.capsule.steps).toBeDefined();
    expect(file.capsule.nodes).toBeUndefined();
    expect(file.capsule.edges).toBeUndefined();
    expect(file.capsule.outputRef).toBeUndefined();
  });

  it('round-trips prompt blocks, history reads, enabled flags, and primaryOutputName', () => {
    const pipeline = makeRichPipeline();
    const file = exportPipeline(pipeline);
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));

    const rt = parsed.pipeline;
    expect(rt.steps).toHaveLength(3);

    const intent = rt.steps.find((s) => s.id === 'step-intent');
    expect(intent?.enabled).toBe(true);
    expect(intent?.primaryOutputName).toBe('text');
    expect(intent?.prompt?.previousOutput).toEqual({
      enabled: true,
      placement: 'beforeOwnPrompt',
      tagName: 'user_prompt',
    });
    expect(intent?.prompt?.blocks[0]?.body).toContain('Extract intent');

    const criteria = rt.steps.find((s) => s.id === 'step-criteria');
    expect(criteria?.enabled).toBe(false);
    expect(criteria?.prompt?.previousOutput.placement).toBe('afterOwnPrompt');

    const main = rt.steps.find((s) => s.id === 'step-main');
    expect(main?.primaryOutputName).toBe('text');
    expect(main?.prompt?.historyReads).toHaveLength(2);
    expect(main?.prompt?.historyReads[0]).toMatchObject({
      sourceStepId: 'step-intent',
      sourceArtifactRef: 'intent_extraction.text',
      tagName: 'intent',
      required: true,
    });
    expect(main?.prompt?.historyReads[1]?.required).toBe(false);
  });

  it('migrates legacy V1 pipeline and round-trips through export', () => {
    const migrated = migrateLegacyPipeline(makeLegacyPipeline());
    const file = exportPipeline(migrated);
    const parsed = parsePipelineExport(file);
    if ('errors' in parsed) throw new Error(parsed.errors.join(', '));

    expect(parsed.pipeline.schemaVersion).toBe(2);
    expect(parsed.pipeline.name).toBe('Legacy Pipeline');
    expect(parsed.pipeline.steps).toHaveLength(2);
    expect(parsed.pipeline.steps.map((s) => s.type)).toEqual(['presentation', 'model-call']);

    const wrapper = parsed.pipeline.steps[0];
    // Legacy prompt-wrapper nodes migrate to presentation steps with instruction text as config.text
    expect(wrapper?.config.type === 'presentation' && wrapper.config.text).toContain('Wrap the input');

    const model = parsed.pipeline.steps[1];
    expect(model?.label).toBe('Main Model');
    expect(model?.primaryOutputName).toBe('text');
    expect(model?.prompt?.blocks[0]?.body).toContain('Answer the user');
  });
});
