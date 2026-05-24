// @vitest-environment node
import {describe, it, expect} from 'vitest';
import type {DiscoveredModel, PipelineStep} from '@lorca/core';
import {
  pickModelRef,
  pickModelRefMatchingBuckets,
  pickModelRefForSlot,
  pickModelRefForSlotStrict,
  autoSelectModelCallStep,
  autoSelectCapsuleSlot,
  autoAssignModelToStep,
  modelMatchesBucket,
  modelMatchesAnyBucket,
  partitionModelsByBuckets,
} from '../src/modelResolution.js';

const models: DiscoveredModel[] = [
  {
    id: 'm1',
    endpointId: 'ep-1',
    providerModelName: 'big:latest',
    displayName: 'Big',
    buckets: ['general'],
    source: 'discovered',
  },
  {
    id: 'm2',
    endpointId: 'ep-1',
    providerModelName: 'extract:latest',
    displayName: 'Extract',
    family: 'mistral',
    parameterSize: '7B',
    buckets: ['extract-json'],
    source: 'discovered',
  },
];

describe('modelResolution', () => {
  it('matches models by usage bucket', () => {
    expect(modelMatchesBucket(models[1]!, 'extract-json')).toBe(true);
    expect(modelMatchesBucket(models[0]!, 'extract-json')).toBe(false);
  });

  it('pickModelRef prefers the requested bucket', () => {
    expect(pickModelRef(models, 'extract-json')).toEqual({
      kind: 'fixed',
      endpointId: 'ep-1',
      modelName: 'extract:latest',
    });
  });

  it('pickModelRefMatchingBuckets returns null when no bucket matches', () => {
    expect(pickModelRefMatchingBuckets(models, ['verify'])).toBeNull();
    expect(pickModelRefMatchingBuckets(models, ['extract-json'])).toEqual({
      kind: 'fixed',
      endpointId: 'ep-1',
      modelName: 'extract:latest',
    });
  });

  it('autoSelectModelCallStep warns when no model matches suggested buckets', () => {
    const step: PipelineStep = {
      id: 's1',
      type: 'model-call',
      label: 'Test',
      enabled: true,
      outputNamespace: 'test',
      primaryOutputName: 'text',
      lastEditedAt: new Date().toISOString(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    const result = autoSelectModelCallStep(step, models, ['verify']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning).toContain('verify');
      expect(result.warning).toContain('verification and critique');
    }
  });

  it('pickModelRefForSlotStrict does not fall back to an arbitrary model', () => {
    expect(pickModelRefForSlotStrict(models, {
      name: 'extractor',
      suggestedBuckets: ['verify'],
      required: true,
    })).toBeNull();
  });

  it('autoSelectCapsuleSlot explains slot requirements when nothing matches', () => {
    const result = autoSelectCapsuleSlot({
      name: 'checker',
      suggestedBuckets: ['verify'],
      required: true,
      preferredModelNames: ['judge:latest'],
    }, models);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.warning).toContain('checker');
      expect(result.warning).toContain('verify');
      expect(result.warning).toContain('judge:latest');
    }
  });

  it('partitionModelsByBuckets puts matching models first', () => {
    const {relevant, other} = partitionModelsByBuckets(models, ['extract-json']);
    expect(relevant.map((m) => m.id)).toEqual(['m2']);
    expect(other.map((m) => m.id)).toEqual(['m1']);
    expect(modelMatchesAnyBucket(models[1]!, ['extract-json', 'verify'])).toBe(true);
  });

  it('autoAssignModelToStep fills empty model refs', () => {
    const step: PipelineStep = {
      id: 's1',
      type: 'model-call',
      label: 'Test',
      enabled: true,
      outputNamespace: 'test',
      primaryOutputName: 'text',
      lastEditedAt: new Date().toISOString(),
      config: {
        type: 'model-call',
        modelRef: {kind: 'fixed', endpointId: '', modelName: ''},
        mode: 'generate',
        outputNames: ['text', 'rawResponse'],
      },
    };
    const assigned = autoAssignModelToStep(step, models, 'extract-json');
    if (assigned.config.type === 'model-call') {
      expect(assigned.config.modelRef).toEqual({
        kind: 'fixed',
        endpointId: 'ep-1',
        modelName: 'extract:latest',
      });
    }
  });

  it('pickModelRefForSlot falls back from exact names to family and size hints', () => {
    expect(pickModelRefForSlot(models, {
      name: 'extractor',
      suggestedBuckets: ['extract-json'],
      required: true,
      preferredModelNames: ['missing:latest'],
      preferredFamilies: ['mistral'],
      preferredParameterSizes: ['7b'],
    })).toEqual({
      kind: 'fixed',
      endpointId: 'ep-1',
      modelName: 'extract:latest',
    });
  });
});
