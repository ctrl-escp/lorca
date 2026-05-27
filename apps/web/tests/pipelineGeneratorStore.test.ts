import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import type {PipelineStep} from '@lorca/core';
import {usePipelineGeneratorStore} from '../src/stores/pipelineGenerator.js';
import {usePipelineEditorStore} from '../src/stores/pipelineEditor.js';
import {createDefaultPipeline} from '../src/stores/pipelines.js';
import {PIPELINE_GENERATOR_SCHEMA_VERSION} from '@lorca/pipeline';

const MINIMAL_PLAN = {
  schemaVersion: PIPELINE_GENERATOR_SCHEMA_VERSION,
  steps: [{
    kind: 'custom',
    stepKey: 'summarize',
    label: 'Summarize input',
    prompt: {mode: 'custom', text: 'Summarize the user request.'},
    modelBucket: 'general',
  }],
};

describe('pipelineGenerator store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    usePipelineGeneratorStore().clearAll();
  });

  it('parses and builds from raw v1 JSON', () => {
    const store = usePipelineGeneratorStore();
    store.ingestBuild(JSON.stringify(MINIMAL_PLAN));
    expect(store.buildResult?.ok).toBe(true);
    expect(store.previewSteps).toHaveLength(1);
    expect(store.previewSteps[0]?.label).toBe('Summarize input');
  });

  it('keeps session after closeModal', () => {
    const store = usePipelineGeneratorStore();
    store.description = 'Test pipeline';
    store.ingestBuild(JSON.stringify(MINIMAL_PLAN));
    store.closeModal();
    expect(store.modalOpen).toBe(false);
    expect(store.description).toBe('Test pipeline');
    expect(store.previewSteps).toHaveLength(1);
  });

  it('clearAll resets session', () => {
    const store = usePipelineGeneratorStore();
    store.description = 'Test';
    store.ingestBuild(JSON.stringify(MINIMAL_PLAN));
    store.clearAll();
    expect(store.description).toBe('');
    expect(store.previewSteps).toHaveLength(0);
    expect(store.buildResult).toBeNull();
  });

  it('re-parses when apply mode changes and raw exists', async () => {
    const store = usePipelineGeneratorStore();
    store.rawResponse = JSON.stringify(MINIMAL_PLAN);
    store.applyMode = 'replace';
    store.ingestBuild(store.rawResponse);
    expect(store.buildResult?.ok).toBe(true);

    store.applyMode = 'append';
    await Promise.resolve();
    expect(store.applyMode).toBe('append');
    expect(store.previewSteps.length).toBeGreaterThan(0);
  });

  it('blocks Apply and enables Resolve when preview steps lack configured models', () => {
    const store = usePipelineGeneratorStore();
    const unconfiguredStep: PipelineStep = {
      id: 'step_gen',
      type: 'model-call',
      label: 'Summarize',
      enabled: true,
      outputNamespace: 'summarize',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    store.previewSteps = [unconfiguredStep];
    store.buildResult = {
      ok: true,
      steps: [unconfiguredStep],
      errors: [],
      unresolvedModels: [{stepId: 'step_gen', stepKey: 'summarize', reason: 'Model not configured'}],
      assumptions: [],
      warnings: [],
    };

    expect(store.canApply).toBe(false);
    expect(store.canResolveModels).toBe(true);
    expect(store.missingModelRefs.length).toBe(1);
  });

  it('blocks Apply when parse fails', () => {
    const store = usePipelineGeneratorStore();
    store.ingestBuild('[{"suggestionId":"legacy"}]');
    expect(store.canApply).toBe(false);
    expect(store.canResolveModels).toBe(false);
    expect(store.validationErrors.length).toBeGreaterThan(0);
  });

  it('applyPreviewToEditor replaces editor steps when preview is apply-ready', () => {
    const editor = usePipelineEditorStore();
    editor.loadPipeline(createDefaultPipeline());
    const store = usePipelineGeneratorStore();
    const configuredStep: PipelineStep = {
      id: 'step_gen',
      type: 'model-call',
      label: 'Summarize input',
      enabled: true,
      outputNamespace: 'summarize',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'llama3:latest'},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    store.previewSteps = [configuredStep];
    store.buildResult = {
      ok: true,
      steps: [configuredStep],
      errors: [],
      unresolvedModels: [],
      assumptions: [],
      warnings: [],
    };

    store.applyPreviewToEditor();
    expect(editor.steps).toHaveLength(1);
    expect(editor.steps[0]?.label).toBe('Summarize input');
  });
});
