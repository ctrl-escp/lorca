// @vitest-environment node
import {describe, it, expect} from 'vitest';
import type {LegacyPipelineDefinition} from '@lorca/core';
import {migrateLegacyPipeline} from '../src/chainCompiler.js';

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
          modelRef: {kind: 'fixed', endpointId: 'ep-1', modelName: 'llama3:latest'},
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

describe('migrateLegacyPipeline', () => {
  it('converts a linear V1 graph into an ordered step chain', () => {
    const migrated = migrateLegacyPipeline(makeLegacyPipeline());
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.steps).toHaveLength(2);
    expect(migrated.steps.map((s) => s.type)).toEqual(['presentation', 'model-call']);
    expect(migrated.steps[0]?.outputNamespace).toBe('wrapped');
    expect(migrated.steps[1]?.label).toBe('Main Model');
  });

  it('migrates prompt-wrapper preserving input artifact and tag wrapping', () => {
    const migrated = migrateLegacyPipeline(makeLegacyPipeline());
    const wrapperStep = migrated.steps[0];
    expect(wrapperStep?.type).toBe('presentation');
    if (wrapperStep?.config.type !== 'presentation') return;
    expect(wrapperStep.config.text).toContain('<user>');
    expect(wrapperStep.config.text).toContain('{{artifact.user_prompt.xml}}');
    expect(wrapperStep.config.text).toContain('Wrap the input.');
  });

  it('migrates model-call system prompt into XML prompt blocks', () => {
    const migrated = migrateLegacyPipeline(makeLegacyPipeline());
    const modelStep = migrated.steps.find((s) => s.type === 'model-call');
    expect(modelStep?.prompt?.blocks[0]?.tagName).toBe('system');
    expect(modelStep?.prompt?.blocks[0]?.body).toContain('Answer the user.');
  });

  it('returns an empty pipeline when the legacy graph has no input node', () => {
    const legacy = makeLegacyPipeline();
    legacy.nodes = legacy.nodes.filter((n) => n.type !== 'input');
    const migrated = migrateLegacyPipeline(legacy);
    expect(migrated.steps).toHaveLength(0);
    expect(migrated.id).toBe('pipe-legacy');
  });
});
