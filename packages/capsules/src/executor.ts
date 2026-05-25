import type {
  CapsuleDefinition,
  PipelineError,
  PipelineStep,
  Result,
} from '@lorca/core';
import {buildUserPromptArtifacts} from '@lorca/prompt';
import {ensureCapsuleStepChain, executeStepChain} from '@lorca/pipeline';
import type {ExecutorCallbacks, EndpointResolver, ModelEndpointResolver, StepChainRunResult} from '@lorca/pipeline';
import type {PipelineDefinition} from '@lorca/core';
import {validateCapsule} from './validate.js';

export interface CapsuleTestInput {
  userPromptRaw: string;
  inputValues: Record<string, unknown>;
  paramValues: Record<string, unknown>;
  slotAssignments: Record<string, {endpointId: string; modelName: string}>;
  abortSignal?: AbortSignal;
  stopAtStepId?: string;
  startAtStepId?: string;
  seedArtifacts?: Record<string, import('@lorca/core').PipelineArtifact>;
}

export type CapsuleTestRunResult = StepChainRunResult;

export async function executeCapsuleTestRun(
  def: CapsuleDefinition,
  testInput: CapsuleTestInput,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
  resolveEndpointForModel?: ModelEndpointResolver,
): Promise<Result<CapsuleTestRunResult, PipelineError>> {
  const executionDef = ensureCapsuleStepChain(def);
  const validation = validateCapsule(executionDef);
  if (!validation.ok) return validation;

  return executeCapsuleStepChainTestRun(executionDef, testInput, resolveEndpoint, callbacks, resolveEndpointForModel);
}

async function executeCapsuleStepChainTestRun(
  def: CapsuleDefinition,
  testInput: CapsuleTestInput,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
  resolveEndpointForModel?: ModelEndpointResolver,
): Promise<Result<CapsuleTestRunResult, PipelineError>> {
  const {raw, xml} = buildUserPromptArtifacts(testInput.userPromptRaw);
  const seedArtifacts: Record<string, import('@lorca/core').PipelineArtifact> = {};
  const now = new Date().toISOString();
  for (const port of def.interface.inputs) {
    const value = testInput.inputValues[port.name];
    if (value === undefined) continue;
    const kind = port.kind === 'json' ? 'json' as const : 'text' as const;
    const ref = port.defaultArtifactKey ?? (port.name === 'user_prompt' ? 'user_prompt.xml' : `${port.name}.text`);
    seedArtifacts[ref] = {name: ref, nodeId: 'capsule-input', kind, value, createdAt: now};
    if (port.name === 'user_prompt') {
      seedArtifacts['user_prompt.raw'] = {name: 'user_prompt.raw', nodeId: 'capsule-input', kind: 'text', value: raw, createdAt: now};
      seedArtifacts['user_prompt.xml'] = {name: 'user_prompt.xml', nodeId: 'capsule-input', kind: 'text', value: xml, createdAt: now};
    }
  }
  for (const artifact of Object.values(seedArtifacts)) {
    callbacks.onArtifact(artifact);
  }

  const innerPipeline: PipelineDefinition = {
    schemaVersion: 2,
    id: def.id,
    name: def.name,
    input: def.input ?? {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: resolveStepSlots(def.steps!, testInput.slotAssignments),
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };

  return executeStepChain(
    innerPipeline,
    raw,
    {
      seedArtifacts: {...seedArtifacts, ...(testInput.seedArtifacts ?? {})},
      ...(Object.keys(testInput.paramValues).length > 0 ? {params: testInput.paramValues} : {}),
      ...(testInput.abortSignal !== undefined ? {abortSignal: testInput.abortSignal} : {}),
      ...(testInput.stopAtStepId ? {stopAtStepId: testInput.stopAtStepId} : {}),
      ...(testInput.startAtStepId ? {startAtStepId: testInput.startAtStepId} : {}),
    },
    resolveEndpoint,
    callbacks,
    undefined,
    resolveEndpointForModel,
  );
}

function resolveStepSlots(
  steps: PipelineStep[],
  slotAssignments: Record<string, {endpointId: string; modelName: string}>,
): PipelineStep[] {
  return steps.map((step) => {
    if (step.config.type === 'loop-group') {
      return {
        ...step,
        config: {
          ...step.config,
          steps: resolveStepSlots(step.config.steps, slotAssignments),
        },
      };
    }
    if (step.config.type !== 'model-call' || step.config.modelRef.kind !== 'slot') return step;
    const assignment = slotAssignments[step.config.modelRef.slotName];
    if (!assignment) return step;
    return {
      ...step,
      config: {
        ...step.config,
        modelRef: {kind: 'fixed', endpointId: assignment.endpointId, modelName: assignment.modelName},
      },
    };
  });
}
