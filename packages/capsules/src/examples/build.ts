import type {
  CapsuleDefinition,
  CapsuleInterface,
  PipelineEdge,
  PipelineNode,
  PipelineStep,
} from '@lorca/core';
import {wireRetryFeedbackOnFirstModelCall} from '@lorca/pipeline';

export const EXAMPLE_TIMESTAMP = '2025-01-01T00:00:00.000Z';

function primaryOutput(node: PipelineNode): string {
  switch (node.type) {
    case 'input':
      return 'xml';
    case 'model-call':
      return 'text';
    case 'json-extract':
      return 'json';
    default:
      return 'text';
  }
}

export function linearEdges(nodes: PipelineNode[]): PipelineEdge[] {
  const edges: PipelineEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const from = nodes[i]!;
    const to = nodes[i + 1]!;
    edges.push({
      id: `e-${from.id}-${to.id}`,
      fromNodeId: from.id,
      fromOutput: primaryOutput(from),
      toNodeId: to.id,
      toInput: 'input',
    });
  }
  return edges;
}

export interface ExampleCapsuleSpec {
  id: string;
  name: string;
  description: string;
  interface: CapsuleInterface;
  nodes: PipelineNode[];
}

function promptTemplateForModel(
  node: Extract<PipelineNode, {type: 'model-call'}>,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): string {
  const inputEdge = edges.find((edge) => edge.toNodeId === node.id);
  const inputNode = nodes.find((candidate) => candidate.id === inputEdge?.fromNodeId);
  const parts: string[] = [];

  if (node.config.systemPrompt) parts.push(node.config.systemPrompt);
  if (inputNode?.type === 'template') parts.push(inputNode.template);
  if (inputNode?.type === 'prompt-wrapper') parts.push(inputNode.config.instructionText);
  if (inputNode?.type === 'manual-text') parts.push(inputNode.text);

  if (parts.length === 0 && node.config.inputArtifactRef !== 'user_prompt.xml') {
    parts.push(`{{artifact.${node.config.inputArtifactRef}}}`);
  }
  return parts.join('\n\n').trim();
}

export function modelStepsFromGraph(nodes: PipelineNode[], edges: PipelineEdge[]): PipelineStep[] {
  const now = EXAMPLE_TIMESTAMP;
  return nodes.flatMap((node): PipelineStep[] => {
    if (node.type !== 'model-call') return [];
    const promptText = promptTemplateForModel(node, nodes, edges);
    const step: PipelineStep = {
      id: node.id,
      type: 'model-call',
      label: node.title ?? node.id.replace(/[_-]+/g, ' '),
      enabled: true,
      outputNamespace: node.artifactPrefix ?? node.id,
      primaryOutputName: 'text',
      lastEditedAt: now,
      config: {
        type: 'model-call',
        modelRef: node.config.modelRef,
        mode: node.config.mode,
        outputNames: ['text', 'rawResponse'],
        ...(node.config.temperature !== undefined ? {temperature: node.config.temperature} : {}),
        ...(node.config.maxTokens !== undefined ? {maxTokens: node.config.maxTokens} : {}),
        ...(node.config.expectedOutput === 'json' ? {outputType: 'json'} : {}),
      },
      prompt: {
        previousOutput: {enabled: promptText.length === 0, placement: 'afterOwnPrompt', tagName: 'previous_output'},
        historyReads: [],
        blocks: promptText.length > 0
          ? [{
            id: `prompt-${node.id}`,
            label: 'Prompt',
            tagName: 'system',
            body: promptText,
            enabled: true,
            source: 'system-default',
          }]
          : [],
      },
    };
    return [step];
  });
}

export function withGeneratedSteps(capsule: CapsuleDefinition): CapsuleDefinition {
  return {
    ...capsule,
    steps: modelStepsFromGraph(capsule.nodes ?? [], capsule.edges ?? []),
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
  };
}

export function buildExampleCapsule(spec: ExampleCapsuleSpec): CapsuleDefinition {
  const last = spec.nodes[spec.nodes.length - 1]!;
  const edges = linearEdges(spec.nodes);
  return {
    schemaVersion: 1,
    id: spec.id,
    name: spec.name,
    description: spec.description,
    version: 'v1',
    status: 'locked',
    interface: spec.interface,
    nodes: spec.nodes,
    edges,
    outputRef: {nodeId: last.id, outputName: primaryOutput(last)},
    steps: modelStepsFromGraph(spec.nodes, edges),
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
