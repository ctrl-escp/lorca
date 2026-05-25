import {describe, it, expect} from 'vitest';
import type {CapsuleDefinition, PipelineDefinition, PipelineStep} from '@lorca/core';
import {LOOP_PREV_ARTIFACT_REF, LOOP_PREV_STEP_ID, PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import {validatePipeline} from '../src/validate.js';
import {validateCapsule} from '@lorca/capsules';

function makePipeline(steps: PipelineStep[], overrides: Partial<PipelineDefinition> = {}): PipelineDefinition {
  return {
    schemaVersion: 2,
    id: 'p1',
    name: 'Test',
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function textStep(id: string, text = '', outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'presentation',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00Z',
    config: {type: 'presentation', text, outputNames: ['text']},
  };
}

function modelStep(id: string, outputNamespace = id): PipelineStep {
  return {
    id,
    type: 'model-call',
    label: id,
    enabled: true,
    outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: '2026-01-01T00:00:00Z',
    config: {
      type: 'model-call',
      modelRef: {kind: 'fixed', endpointId: 'ep', modelName: 'm'},
      mode: 'generate',
      outputNames: ['text', 'rawResponse'],
    },
    prompt: {
      previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'prev'},
      historyReads: [],
      blocks: [],
    },
  };
}

describe('validatePipeline step-chain rules', () => {
  it('accepts a minimal valid pipeline', () => {
    expect(validatePipeline(makePipeline([textStep('intro')])).ok).toBe(true);
  });

  it('rejects duplicate step IDs including nested loop inner steps', () => {
    const loop: PipelineStep = {
      id: 'loop',
      type: 'loop-group',
      label: 'Loop',
      enabled: true,
      outputNamespace: 'loop',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'loop-group',
        maxIterations: 2,
        exitCondition: {type: 'iterations'},
        steps: [textStep('dup', 'inner', 'inner')],
        outputNames: ['text'],
      },
    };
    const result = validatePipeline(makePipeline([textStep('dup'), loop]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
  });

  it('rejects unknown outputStepId', () => {
    const result = validatePipeline(makePipeline([textStep('a')], {outputStepId: 'missing'}));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('outputStepId');
  });

  it('rejects duplicate artifact namespaces across steps', () => {
    const result = validatePipeline(makePipeline([
      textStep('a', '', 'answer'),
      textStep('b', '', 'answer'),
    ]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('duplicate_artifact_key');
  });

  it('rejects presentation templates that reference unknown artifacts', () => {
    const result = validatePipeline(makePipeline([
      textStep('a', '', 'a'),
      textStep('b', 'Use {{artifact.missing.text}}', 'b'),
    ]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing_artifact');
  });

  it('accepts presentation templates that reference prior step artifacts', () => {
    const result = validatePipeline(makePipeline([
      textStep('a', '', 'a'),
      textStep('b', 'Use {{artifact.a.text}}', 'b'),
    ]));
    expect(result.ok).toBe(true);
  });

  it('rejects required history reads whose source step is later in the chain', () => {
    const consumer = {
      ...modelStep('c', 'c'),
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt' as const, tagName: 'prev'},
        historyReads: [{
          sourceStepId: 'b',
          sourceArtifactRef: 'b.text',
          tagName: 'b_out',
          required: true,
        }],
        blocks: [],
      },
    };
    const result = validatePipeline(makePipeline([
      modelStep('a', 'a'),
      consumer,
      textStep('b', '', 'b'),
    ]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid_pipeline_graph');
  });

  it('allows optional stale history reads', () => {
    const consumer = {
      ...modelStep('c', 'c'),
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt' as const, tagName: 'prev'},
        historyReads: [{
          sourceStepId: 'b',
          sourceArtifactRef: 'b.text',
          tagName: 'b_out',
          required: false,
        }],
        blocks: [],
      },
    };
    expect(validatePipeline(makePipeline([
      modelStep('a', 'a'),
      consumer,
      textStep('b', '', 'b'),
    ])).ok).toBe(true);
  });

  it('rejects required history reads with unknown artifact refs', () => {
    const consumer = {
      ...modelStep('c', 'c'),
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt' as const, tagName: 'prev'},
        historyReads: [{
          sourceStepId: 'a',
          sourceArtifactRef: 'a.ghost',
          tagName: 'a_ghost',
          required: true,
        }],
        blocks: [],
      },
    };
    const result = validatePipeline(makePipeline([modelStep('a', 'a'), consumer]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing_artifact');
  });

  it('accepts pipeline-input history reads', () => {
    const consumer = {
      ...modelStep('c', 'c'),
      prompt: {
        previousOutput: {enabled: false, placement: 'afterOwnPrompt' as const, tagName: 'prev'},
        historyReads: [{
          sourceStepId: PIPELINE_INPUT_STEP_ID,
          sourceArtifactRef: 'user_prompt.xml',
          tagName: 'user_prompt',
          required: true,
        }],
        blocks: [],
      },
    };
    expect(validatePipeline(makePipeline([consumer])).ok).toBe(true);
  });

  it('rejects capsule instances with missing capsule metadata', () => {
    const capsuleStep: PipelineStep = {
      id: 'cap',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'capsule-instance',
        capsuleId: '',
        capsuleVersion: 'v1',
        inputBindings: {},
        outputBindings: {},
      },
    };
    const result = validatePipeline(makePipeline([capsuleStep]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing_capsule');
  });

  it('rejects capsule input bindings that reference unknown artifacts', () => {
    const capsuleStep: PipelineStep = {
      id: 'cap',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'capsule-instance',
        capsuleId: 'cap-def',
        capsuleVersion: 'v1',
        inputBindings: {user_prompt: 'ghost.text'},
        outputBindings: {result: 'cap.text'},
      },
    };
    const result = validatePipeline(makePipeline([textStep('a', '', 'a'), capsuleStep]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing_artifact');
  });

  it('accepts capsule input bindings that reference prior artifacts', () => {
    const capsuleStep: PipelineStep = {
      id: 'cap',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'capsule-instance',
        capsuleId: 'cap-def',
        capsuleVersion: 'v1',
        inputBindings: {user_prompt: 'a.text'},
        outputBindings: {result: 'cap.text'},
      },
    };
    expect(validatePipeline(makePipeline([textStep('a', '', 'a'), capsuleStep])).ok).toBe(true);
  });

  it('rejects empty loop groups and nested loop groups', () => {
    const emptyLoop: PipelineStep = {
      id: 'loop',
      type: 'loop-group',
      label: 'Loop',
      enabled: true,
      outputNamespace: 'loop',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'loop-group',
        maxIterations: 2,
        exitCondition: {type: 'iterations'},
        steps: [],
        outputNames: ['text'],
      },
    };
    expect(validatePipeline(makePipeline([emptyLoop])).ok).toBe(false);

    const nestedLoop: PipelineStep = {
      id: 'loop',
      type: 'loop-group',
      label: 'Loop',
      enabled: true,
      outputNamespace: 'loop',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'loop-group',
        maxIterations: 2,
        exitCondition: {type: 'iterations'},
        steps: [{
          id: 'inner-loop',
          type: 'loop-group',
          label: 'Inner',
          enabled: true,
          outputNamespace: 'inner_loop',
          primaryOutputName: 'text',
          lastEditedAt: '2026-01-01T00:00:00Z',
          config: {
            type: 'loop-group',
            maxIterations: 1,
            exitCondition: {type: 'iterations'},
            steps: [textStep('leaf', 'ok', 'leaf')],
            outputNames: ['text'],
          },
        }],
        outputNames: ['text'],
      },
    };
    const nestedResult = validatePipeline(makePipeline([nestedLoop]));
    expect(nestedResult.ok).toBe(false);
    if (!nestedResult.ok) expect(nestedResult.error.message).toContain('Nested loop groups');
  });

  it('rejects enabled loop groups with no enabled inner steps', () => {
    const loop: PipelineStep = {
      id: 'loop',
      type: 'loop-group',
      label: 'Loop',
      enabled: true,
      outputNamespace: 'loop',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'loop-group',
        maxIterations: 2,
        exitCondition: {type: 'iterations'},
        steps: [textStep('inner', 'x', 'inner')].map((s) => ({...s, enabled: false})),
        outputNames: ['text'],
      },
    };
    const result = validatePipeline(makePipeline([loop]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('enabled inner step');
  });

  it('accepts loop.prev history reads inside loop groups only', () => {
    const inner = {
      ...modelStep('refine', 'refine'),
      prompt: {
        previousOutput: {enabled: true, placement: 'afterOwnPrompt' as const, tagName: 'prev'},
        historyReads: [{
          sourceStepId: LOOP_PREV_STEP_ID,
          sourceArtifactRef: LOOP_PREV_ARTIFACT_REF,
          tagName: 'retry_feedback',
          required: false,
        }],
        blocks: [],
      },
    };
    const loop: PipelineStep = {
      id: 'loop',
      type: 'loop-group',
      label: 'Loop',
      enabled: true,
      outputNamespace: 'loop',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'loop-group',
        maxIterations: 2,
        exitCondition: {type: 'iterations'},
        steps: [inner],
        outputNames: ['text'],
      },
    };
    expect(validatePipeline(makePipeline([loop])).ok).toBe(true);

    const topLevel = {
      ...inner,
      id: 'top',
      outputNamespace: 'top',
    };
    const invalid = validatePipeline(makePipeline([topLevel]));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.message).toContain('loop.prev');
  });

  it('validates inline capsule inner steps', () => {
    const capsuleStep: PipelineStep = {
      id: 'cap',
      type: 'capsule-instance',
      label: 'Capsule',
      enabled: true,
      outputNamespace: 'cap',
      primaryOutputName: 'text',
      lastEditedAt: '2026-01-01T00:00:00Z',
      config: {
        type: 'capsule-instance',
        capsuleId: 'cap-def',
        capsuleVersion: 'v1',
        displayMode: 'inline',
        inlineSteps: [textStep('inner', 'Uses {{artifact.ghost.text}}', 'inner')],
        inputBindings: {},
        outputBindings: {result: 'cap.text'},
      },
    };
    const result = validatePipeline(makePipeline([capsuleStep]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('missing_artifact');
  });
});

describe('validateCapsule uses step-chain pipeline validation', () => {
  it('rejects invalid loop groups inside capsules', () => {
    const capsule: CapsuleDefinition = {
      schemaVersion: 1,
      id: 'cap',
      name: 'Capsule',
      version: 'v1',
      status: 'draft',
      interface: {
        inputs: [],
        outputs: [{name: 'result', kind: 'text', sourceArtifactKey: 'loop.text'}],
        parameters: [],
        modelSlots: [],
      },
      steps: [{
        id: 'loop',
        type: 'loop-group',
        label: 'Loop',
        enabled: true,
        outputNamespace: 'loop',
        primaryOutputName: 'text',
        lastEditedAt: '2026-01-01T00:00:00Z',
        config: {
          type: 'loop-group',
          maxIterations: 0,
          exitCondition: {type: 'iterations'},
          steps: [textStep('inner', 'x', 'inner')],
          outputNames: ['text'],
        },
      }],
      input: {raw: '', tagName: 'user_prompt', outputNamespace: 'user_prompt'},
      tests: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const result = validateCapsule(capsule);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('maxIterations');
  });
});
