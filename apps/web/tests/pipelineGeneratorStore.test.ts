import {beforeEach, describe, expect, it} from 'vitest';
import {createPinia, setActivePinia} from 'pinia';
import {usePipelineGeneratorStore} from '../src/stores/pipelineGenerator.js';
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
});
