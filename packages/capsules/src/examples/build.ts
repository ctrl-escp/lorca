import type {
  CapsuleDefinition,
  CapsuleInterface,
  ModelCallStepConfig,
  PipelineStep,
} from '@lorca/core';
import {wireRetryFeedbackOnFirstModelCall} from '@lorca/pipeline';

export const EXAMPLE_TIMESTAMP = '2025-01-01T00:00:00.000Z';

export interface ExampleCapsuleSpec {
  id: string;
  name: string;
  description: string;
  interface: CapsuleInterface;
  steps: PipelineStep[];
}

export interface ModelCallStepSpec {
  id: string;
  label: string;
  outputNamespace: string;
  slotName: string;
  prompt: string;
  mode?: ModelCallStepConfig['mode'];
  temperature?: number;
  maxTokens?: number;
  outputType?: 'json' | 'text';
  previousOutputTag?: string;
}

export function modelCallStep(spec: ModelCallStepSpec): PipelineStep {
  const step: PipelineStep = {
    id: spec.id,
    type: 'model-call',
    label: spec.label,
    enabled: true,
    outputNamespace: spec.outputNamespace,
    primaryOutputName: 'text',
    lastEditedAt: EXAMPLE_TIMESTAMP,
    config: {
      type: 'model-call',
      modelRef: {kind: 'slot', slotName: spec.slotName},
      mode: spec.mode ?? 'generate',
      outputNames: ['text', 'rawResponse'],
      ...(spec.temperature !== undefined ? {temperature: spec.temperature} : {}),
      ...(spec.maxTokens !== undefined ? {maxTokens: spec.maxTokens} : {}),
      ...(spec.outputType === 'json' ? {outputType: 'json'} : {}),
    },
    prompt: {
      previousOutput: {
        enabled: false,
        placement: 'afterOwnPrompt',
        tagName: spec.previousOutputTag ?? 'previous_output',
      },
      historyReads: [],
      blocks: [{
        id: `prompt-${spec.id}`,
        label: 'Prompt',
        tagName: 'system',
        body: spec.prompt,
        enabled: true,
        source: 'system-default',
      }],
    },
  };
  return step;
}

export function buildExampleCapsule(spec: ExampleCapsuleSpec): CapsuleDefinition {
  return {
    schemaVersion: 2,
    id: spec.id,
    name: spec.name,
    description: spec.description,
    version: 'v1',
    status: 'locked',
    interface: spec.interface,
    steps: spec.steps,
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    tests: [],
    createdAt: EXAMPLE_TIMESTAMP,
    updatedAt: EXAMPLE_TIMESTAMP,
    lockedAt: EXAMPLE_TIMESTAMP,
  };
}

/** Wrap consecutive answer → verify model-call steps in a retry loop. */
export function withAnswerVerifyRetryLoop(
  capsule: CapsuleDefinition,
  options?: {maxIterations?: number},
): CapsuleDefinition {
  const steps = capsule.steps ?? [];
  const answerIdx = steps.findIndex((s) => s.id === 'answer');
  const verifyIdx = steps.findIndex((s) => s.id === 'verify');
  if (answerIdx < 0 || verifyIdx !== answerIdx + 1) return capsule;

  const inner = wireRetryFeedbackOnFirstModelCall(
    steps.slice(answerIdx, verifyIdx + 1).map((s) => structuredClone(s)),
  );

  const loopStep: PipelineStep = {
    id: 'answer_verify_retry',
    type: 'loop-group',
    label: 'Answer & verify',
    enabled: true,
    outputNamespace: 'verify',
    primaryOutputName: 'text',
    lastEditedAt: EXAMPLE_TIMESTAMP,
    config: {
      type: 'loop-group',
      maxIterations: options?.maxIterations ?? 3,
      exitCondition: {type: 'json-field-equals', fieldPath: 'passed', value: true},
      steps: inner,
      outputNames: ['text'],
    },
  };

  return {
    ...capsule,
    steps: [...steps.slice(0, answerIdx), loopStep],
  };
}
