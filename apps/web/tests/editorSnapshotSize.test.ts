import {describe, it, expect} from 'vitest';
import type {PipelineDefinition, PipelineStep, PromptBlock} from '@lorca/core';
import {snapshotPipeline} from '../src/stores/pipelineEditor/snapshot.js';

function snapshotBytes(pipeline: PipelineDefinition): number {
  return new TextEncoder().encode(JSON.stringify(snapshotPipeline(pipeline))).length;
}

function longPromptBlock(id: string): PromptBlock {
  return {
    id,
    label: 'Block',
    tagName: 'section',
    body: 'x'.repeat(4_000),
    enabled: true,
  };
}

function modelStep(id: string, ns: string): PipelineStep {
  return {
    id,
    type: 'model-call',
    label: `Step ${id}`,
    enabled: true,
    outputNamespace: ns,
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00.000Z',
    config: {
      type: 'model-call',
      modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'llama'},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
    },
    prompt: {
      previousOutput: {enabled: false, placement: 'beforeOwnPrompt', tagName: 'previous_output'},
      historyReads: [],
      blocks: [longPromptBlock(`${id}-b1`), longPromptBlock(`${id}-b2`)],
    },
  };
}

function longPromptPipeline(): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'pipe-long',
    name: 'Long prompt pipeline',
    input: {
      raw: 'user input '.repeat(200),
      tagName: 'user_prompt',
      outputNamespace: 'user_prompt',
    },
    steps: Array.from({length: 12}, (_, i) => modelStep(`step-${i}`, `ns${i}`)),
    outputStepId: 'step-11',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('editor undo snapshot size', () => {
  it('stays under 256KB for a realistic long-prompt pipeline', () => {
    const bytes = snapshotBytes(longPromptPipeline());
    expect(bytes).toBeLessThan(256 * 1024);
    expect(bytes).toBeGreaterThan(50_000);
  });
});
