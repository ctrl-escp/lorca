import type {
  CapsuleDefinition,
  PipelineDefinition,
  PipelineNode,
  PipelineArtifact,
  PipelineRunContext,
  PipelineError,
  Result,
} from '@lorca/core';
import {buildUserPromptArtifacts} from '@lorca/prompt';
import {executePipeline} from '@lorca/pipeline';
import type {ExecutorCallbacks, EndpointResolver} from '@lorca/pipeline';
import {validateCapsule} from './validate.js';

export interface CapsuleTestInput {
  userPromptRaw: string;
  inputValues: Record<string, unknown>;
  paramValues: Record<string, unknown>;
  slotAssignments: Record<string, {endpointId: string; modelName: string}>;
  abortSignal?: AbortSignal;
}

export async function executeCapsuleTestRun(
  def: CapsuleDefinition,
  testInput: CapsuleTestInput,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
): Promise<Result<string, PipelineError>> {
  const validation = validateCapsule(def);
  if (!validation.ok) return validation;

  // Resolve slot model refs → fixed refs using provided slot assignments
  const resolvedNodes = resolveSlots(def.nodes, testInput.slotAssignments);

  const syntheticDef: PipelineDefinition = {
    schemaVersion: 1,
    id: def.id,
    name: def.name,
    inputArtifactName: 'user_prompt',
    nodes: resolvedNodes,
    edges: def.edges,
    outputRef: def.outputRef,
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };

  const {raw, xml} = buildUserPromptArtifacts(testInput.userPromptRaw);
  const ctx: PipelineRunContext = {
    runId: `capsule-test-${crypto.randomUUID().slice(0, 8)}`,
    pipelineId: def.id,
    startedAt: new Date().toISOString(),
    ...(testInput.abortSignal !== undefined && {abortSignal: testInput.abortSignal}),
    input: {userPromptRaw: raw, userPromptXml: xml},
    artifacts: {},
    trace: [],
    ...(Object.keys(testInput.paramValues).length > 0 && {params: testInput.paramValues}),
  };

  // Pre-seed input port artifacts from declared interface inputs
  for (const port of def.interface.inputs) {
    const value = testInput.inputValues[port.name];
    if (value !== undefined) {
      const artifact: PipelineArtifact = {
        name: port.name,
        nodeId: 'capsule-input',
        kind: port.kind === 'json' ? 'json' : 'text',
        value,
        createdAt: new Date().toISOString(),
      };
      ctx.artifacts[port.name] = artifact;
      callbacks.onArtifact(artifact);
    }
  }

  return executePipeline(syntheticDef, ctx, resolveEndpoint, callbacks);
}

function resolveSlots(
  nodes: PipelineNode[],
  slotAssignments: Record<string, {endpointId: string; modelName: string}>,
): PipelineNode[] {
  return nodes.map((node) => {
    if (node.type !== 'model-call') return node;
    const {modelRef} = node.config;
    if (modelRef.kind !== 'slot') return node;
    const assignment = slotAssignments[modelRef.slotName];
    if (!assignment) return node;
    return {
      ...node,
      config: {
        ...node.config,
        modelRef: {kind: 'fixed', endpointId: assignment.endpointId, modelName: assignment.modelName},
      },
    };
  });
}
