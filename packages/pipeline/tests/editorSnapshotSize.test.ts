import {describe, it, expect} from 'vitest';
import type {PipelineStep, PromptBlock} from '@lorca/core';

/** Mirrors PipelineEditorSnapshot shape from apps/web pipelineEditor store. */
function editorSnapshotBytes(steps: PipelineStep[], pipelineName: string, inputRaw: string): number {
  const snap = {
    steps: JSON.parse(JSON.stringify(steps)),
    pipelineName,
    inputRaw,
  };
  return new TextEncoder().encode(JSON.stringify(snap)).length;
}

function longPromptBlock(id: string): PromptBlock {
  const body = 'x'.repeat(4_000);
  return {
    id,
    label: 'Block',
    tagName: 'section',
    body,
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
    lastEditedAt: new Date().toISOString(),
    config: {
      type: 'model-call',
      modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'llama'},
      mode: 'generate',
    },
    prompt: {
      previousOutput: {enabled: false, placement: 'beforeOwnPrompt', tagName: 'previous_output'},
      historyReads: [],
      blocks: [longPromptBlock(`${id}-b1`), longPromptBlock(`${id}-b2`)],
    },
  };
}

describe('editor undo snapshot size', () => {
  it('stays under 256KB for a realistic long-prompt pipeline (single snapshot)', () => {
    const steps: PipelineStep[] = Array.from({length: 12}, (_, i) =>
      modelStep(`step-${i}`, `ns${i}`),
    );
    const bytes = editorSnapshotBytes(steps, 'Long prompt pipeline', 'user input '.repeat(200));
    expect(bytes).toBeLessThan(256 * 1024);
    // Document approximate size for MAX_UNDO tuning (30 × bytes ≈ worst-case undo memory).
    expect(bytes).toBeGreaterThan(50_000);
  });
});
