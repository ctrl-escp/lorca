import type {
  PipelineDefinition,
  PipelineStep,
  StepType,
  LegacyPipelineDefinition,
  PipelineNode,
  PipelineEdge,
  ModelCallConfig,
  PromptWrapperConfig,
} from '@lorca/core';
import {PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import {getStepHistoryReads, getStepBlockReasons} from './historyReads.js';
import {newStepId} from './stepId.js';

// ── Active chain ──────────────────────────────────────────────────────────────

export function buildActiveStepChain(steps: PipelineStep[]): PipelineStep[] {
  return steps.filter((s) => s.enabled);
}

// ── Execution plan ────────────────────────────────────────────────────────────

export interface CompiledExecutionStep {
  stepId: string;
  stepOrder: number;
  type: StepType;
  inputArtifactRefs: string[];
  historyReads?: PipelineStep['historyReads'];
  previousOutputArtifactRef?: string;
  outputNamespace: string;
  execute: 'run' | 'skip' | 'blocked';
  blockedReason?: string;
}

export interface ExecutionPlan {
  steps: CompiledExecutionStep[];
  stopAtStepId?: string;
  requiredHistorySources: string[];
}

export interface ExecutePipelineOptions {
  stopAtStepId?: string;
  includeDisabled?: boolean;
  reuseValidArtifacts?: boolean;
  abortSignal?: AbortSignal;
}

export function compileStepChainToExecutionPlan(
  pipeline: PipelineDefinition,
  options: ExecutePipelineOptions = {},
): ExecutionPlan {
  const activeSteps = options.includeDisabled
    ? pipeline.steps
    : buildActiveStepChain(pipeline.steps);

  const stopIdx = options.stopAtStepId
    ? activeSteps.findIndex((s) => s.id === options.stopAtStepId)
    : -1;
  const slicedSteps = stopIdx >= 0 ? activeSteps.slice(0, stopIdx + 1) : activeSteps;

  return compileActiveStepsToExecutionPlan(slicedSteps, {
    allSteps: pipeline.steps,
    ...(options.stopAtStepId ? {stopAtStepId: options.stopAtStepId} : {}),
  });
}

/** Compile an ordered active step slice into an execution plan. */
export function compileActiveStepsToExecutionPlan(
  steps: PipelineStep[],
  options?: {stopAtStepId?: string; allSteps?: PipelineStep[]},
): ExecutionPlan {
  const stopAtStepId = options?.stopAtStepId;
  const allSteps = options?.allSteps ?? steps;
  const requiredHistorySources = new Set<string>();
  const compiled: CompiledExecutionStep[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const prevActiveStep = i > 0 ? steps[i - 1] : undefined;

    const historyReads = getStepHistoryReads(step);
    for (const read of historyReads) {
      requiredHistorySources.add(read.sourceStepId);
    }

    const previousOutputArtifactRef = prevActiveStep
      ? `${prevActiveStep.outputNamespace}.${prevActiveStep.primaryOutputName}`
      : undefined;

    const inputArtifactRefs: string[] = [];
    if (previousOutputArtifactRef) inputArtifactRefs.push(previousOutputArtifactRef);
    for (const read of historyReads) {
      inputArtifactRefs.push(read.sourceArtifactRef);
    }

    const blockReasons = getStepBlockReasons(step, allSteps);
    const compiledStep: CompiledExecutionStep = {
      stepId: step.id,
      stepOrder: i,
      type: step.type,
      inputArtifactRefs,
      outputNamespace: step.outputNamespace,
      execute: blockReasons.length > 0 ? 'blocked' : 'run',
    };
    if (blockReasons.length > 0) compiledStep.blockedReason = blockReasons.join('; ');
    if (historyReads.length > 0) compiledStep.historyReads = historyReads;
    if (previousOutputArtifactRef !== undefined) compiledStep.previousOutputArtifactRef = previousOutputArtifactRef;
    compiled.push(compiledStep);
  }

  return {
    steps: compiled,
    ...(stopAtStepId ? {stopAtStepId} : {}),
    requiredHistorySources: [...requiredHistorySources],
  };
}

// ── V2 → V1 bridge (compiles step chain to legacy node graph for execution) ──

export function compilePipelineToLegacyGraph(
  pipeline: PipelineDefinition,
  options: ExecutePipelineOptions = {},
): LegacyPipelineDefinition {
  const activeSteps = options.includeDisabled
    ? pipeline.steps
    : buildActiveStepChain(pipeline.steps);

  const stopIdx = options.stopAtStepId
    ? activeSteps.findIndex((s) => s.id === options.stopAtStepId)
    : -1;
  const slicedSteps = stopIdx >= 0 ? activeSteps.slice(0, stopIdx + 1) : activeSteps;

  const inputNodeId = 'pipeline-input-node';
  const inputNode: PipelineNode = {id: inputNodeId, type: 'input'};

  const nodes: PipelineNode[] = [inputNode];
  const edges: PipelineEdge[] = [];

  let prevNodeId = inputNodeId;
  let prevOutput = 'xml';

  for (let i = 0; i < slicedSteps.length; i++) {
    const step = slicedSteps[i]!;
    const node = stepToLegacyNode(step, pipeline, slicedSteps, i);
    nodes.push(node);

    edges.push({
      id: `e-${prevNodeId}-${node.id}`,
      fromNodeId: prevNodeId,
      fromOutput: prevOutput,
      toNodeId: node.id,
      toInput: 'input',
    });

    prevNodeId = node.id;
    prevOutput = step.primaryOutputName;
  }

  const lastStep = slicedSteps.at(-1);
  const outputRef = lastStep
    ? {nodeId: lastStep.id, outputName: lastStep.primaryOutputName}
    : {nodeId: inputNodeId, outputName: 'xml'};

  const legacyDef: LegacyPipelineDefinition = {
    schemaVersion: 1,
    id: pipeline.id,
    name: pipeline.name,
    inputArtifactName: 'user_prompt',
    nodes,
    edges,
    outputRef,
    createdAt: pipeline.createdAt,
    updatedAt: pipeline.updatedAt,
  };
  if (pipeline.description !== undefined) legacyDef.description = pipeline.description;
  return legacyDef;
}

function stepToLegacyNode(
  step: PipelineStep,
  pipeline: PipelineDefinition,
  activeSteps: PipelineStep[],
  stepIndex: number,
): PipelineNode {
  const {config} = step;

  switch (config.type) {
    case 'model-call': {
      const prevStep = stepIndex > 0 ? activeSteps[stepIndex - 1] : undefined;
      const inputArtifactRef = prevStep
        ? `${prevStep.outputNamespace}.${prevStep.primaryOutputName}`
        : 'user_prompt.xml';

      const legacyConfig: ModelCallConfig = {
        modelRef: config.modelRef,
        mode: config.mode,
        inputArtifactRef,
        ...(config.temperature !== undefined ? {temperature: config.temperature} : {}),
        ...(config.maxTokens !== undefined ? {maxTokens: config.maxTokens} : {}),
      };

      // Inject system prompt from prompt blocks if present
      if (step.prompt?.blocks) {
        const systemBlock = step.prompt.blocks.find(
          (b) => b.enabled && (b.source === 'system-default' || b.tagName === 'system'),
        );
        if (systemBlock) {
          legacyConfig.systemPrompt = systemBlock.body;
        }
      }

      return {
        id: step.id,
        type: 'model-call',
        artifactPrefix: step.outputNamespace,
        title: step.label,
        config: legacyConfig,
      };
    }

    case 'prompt-wrapper': {
      const prevStep = stepIndex > 0 ? activeSteps[stepIndex - 1] : undefined;
      const inputArtifactRef = prevStep
        ? `${prevStep.outputNamespace}.${prevStep.primaryOutputName}`
        : 'user_prompt.xml';

      const instructionText = step.prompt?.blocks
        .filter((b) => b.enabled)
        .map((b) => b.body)
        .join('\n') ?? '';

      const legacyConfig: PromptWrapperConfig = {
        tagName: step.prompt?.previousOutput.tagName ?? 'instructions',
        instructionText,
        includeInputArtifact: true,
        inputPlacement: step.prompt?.previousOutput.placement === 'beforeOwnPrompt'
          ? 'before-instructions'
          : 'after-instructions',
        inputArtifactRef,
      };
      return {
        id: step.id,
        type: 'prompt-wrapper',
        artifactPrefix: step.outputNamespace,
        title: step.label,
        config: legacyConfig,
      };
    }

    case 'template':
      return {
        id: step.id,
        type: 'template',
        artifactPrefix: step.outputNamespace,
        title: step.label,
        template: config.template,
      };

    case 'json-extract':
      return {
        id: step.id,
        type: 'json-extract',
        artifactPrefix: step.outputNamespace,
        title: step.label,
        inputArtifactRef: config.sourceArtifactRef,
      };

    case 'manual-text':
      return {
        id: step.id,
        type: 'manual-text',
        artifactPrefix: step.outputNamespace,
        title: step.label,
        text: config.text,
      };

    case 'capsule-instance':
      return {
        id: step.id,
        type: 'capsule-instance',
        artifactPrefix: step.outputNamespace,
        title: step.label,
        config: {
          capsuleDefinitionId: config.capsuleId,
          capsuleVersion: config.capsuleVersion,
          inputBindings: config.inputBindings,
          outputBindings: config.outputBindings,
          parameterValues: config.parameterValues ?? {},
          modelSlotAssignments: {},
        },
      };

    case 'loop-group':
      throw new Error(
        'Loop group steps require the native step executor and cannot be compiled to the legacy graph format',
      );

    default: {
      const _exhaustive: never = config;
      throw new Error(`Unknown step config type: ${String(_exhaustive)}`);
    }
  }
}

// ── Legacy V1 → V2 migration ─────────────────────────────────────────────────

export function migrateLegacyPipeline(legacy: LegacyPipelineDefinition): PipelineDefinition {
  const inputNode = legacy.nodes.find((n) => n.type === 'input');
  if (!inputNode) {
    return makeEmptyPipeline(legacy.id, legacy.name, legacy.createdAt);
  }

  // Build ordered chain by following edges from input
  const orderedNodes = buildLinearChain(legacy.nodes, legacy.edges, inputNode.id);
  const nonInputNodes = orderedNodes.filter((n) => n.type !== 'input');

  const steps: PipelineStep[] = nonInputNodes.map((node, i) =>
    legacyNodeToStep(node, nonInputNodes, i),
  );

  const migrated: PipelineDefinition = {
    schemaVersion: 2,
    id: legacy.id,
    name: legacy.name,
    input: {
      raw: '',
      tagName: 'user',
      outputNamespace: 'user_prompt',
    },
    steps,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
  };
  if (legacy.description !== undefined) migrated.description = legacy.description;
  return migrated;
}

function buildLinearChain(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  startId: string,
): PipelineNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map<string, string>(); // fromNodeId -> toNodeId
  for (const edge of edges) edgeMap.set(edge.fromNodeId, edge.toNodeId);

  const chain: PipelineNode[] = [];
  const visited = new Set<string>();
  let current = startId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = nodeMap.get(current);
    if (node) chain.push(node);
    current = edgeMap.get(current) ?? '';
  }

  return chain;
}

function legacyNodeToStep(
  node: PipelineNode,
  allNonInputNodes: PipelineNode[],
  index: number,
): PipelineStep {
  const prefix = node.artifactPrefix ?? node.id;
  const now = new Date().toISOString();
  const label = node.title ?? labelForNodeType(node.type);

  const prevNode = index > 0 ? allNonInputNodes[index - 1] : undefined;

  const baseStep = {
    id: node.id,
    label,
    enabled: true,
    outputNamespace: prefix,
    lastEditedAt: now,
  };

  switch (node.type) {
    case 'model-call': {
      const modelStep: PipelineStep = {
        id: node.id,
        type: 'model-call',
        label,
        enabled: true,
        outputNamespace: prefix,
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {
          type: 'model-call',
          modelRef: node.config.modelRef,
          mode: node.config.mode,
          outputNames: ['text', 'rawResponse'],
        },
      };
      if (node.config.temperature !== undefined) (modelStep.config as {temperature?: number}).temperature = node.config.temperature;
      if (node.config.maxTokens !== undefined) (modelStep.config as {maxTokens?: number}).maxTokens = node.config.maxTokens;
      if (node.config.systemPrompt) {
        modelStep.prompt = {
          previousOutput: {enabled: true, placement: 'beforeOwnPrompt', tagName: 'previous_output'},
          historyReads: [],
          blocks: [{
            id: newStepId('block'),
            label: 'System',
            tagName: 'system',
            body: node.config.systemPrompt,
            enabled: true,
            source: 'system-default',
          }],
        };
      }
      return modelStep;
    }

    case 'prompt-wrapper': {
      const wrapStep: PipelineStep = {
        id: node.id,
        type: 'prompt-wrapper',
        label,
        enabled: true,
        outputNamespace: prefix,
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {type: 'prompt-wrapper', outputNames: ['text']},
        prompt: {
          previousOutput: {
            enabled: node.config.includeInputArtifact,
            placement: node.config.inputPlacement === 'before-instructions' ? 'beforeOwnPrompt' : 'afterOwnPrompt',
            tagName: node.config.tagName,
          },
          historyReads: [],
          blocks: node.config.instructionText
            ? [{
                id: newStepId('block'),
                label: 'Instructions',
                tagName: 'system',
                body: node.config.instructionText,
                enabled: true,
                source: 'system-default' as const,
              }]
            : [],
        },
      };
      return wrapStep;
    }

    case 'template':
      return {
        id: node.id,
        type: 'template',
        label,
        enabled: true,
        outputNamespace: prefix,
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {
          type: 'template',
          template: node.template,
          outputNames: ['text'],
        },
      } satisfies PipelineStep;

    case 'json-extract':
      return {
        id: node.id,
        type: 'json-extract',
        label,
        enabled: true,
        outputNamespace: prefix,
        primaryOutputName: 'json',
        lastEditedAt: now,
        config: {
          type: 'json-extract',
          sourceArtifactRef: node.inputArtifactRef,
          outputNames: ['json'],
        },
      } satisfies PipelineStep;

    case 'manual-text':
      return {
        id: node.id,
        type: 'manual-text',
        label,
        enabled: true,
        outputNamespace: prefix,
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {
          type: 'manual-text',
          text: node.text,
          outputNames: ['text'],
        },
      } satisfies PipelineStep;

    case 'capsule-instance':
      return {
        id: node.id,
        type: 'capsule-instance',
        label,
        enabled: true,
        outputNamespace: prefix,
        primaryOutputName: 'text',
        lastEditedAt: now,
        config: {
          type: 'capsule-instance',
          capsuleId: node.config.capsuleDefinitionId,
          capsuleVersion: node.config.capsuleVersion,
          inputBindings: node.config.inputBindings,
          outputBindings: node.config.outputBindings,
          parameterValues: Object.fromEntries(
            Object.entries(node.config.parameterValues).map(([k, v]) => [k, String(v)]),
          ),
        },
      } satisfies PipelineStep;

    case 'input':
      throw new Error('input node should not appear in legacyNodeToStep');

    default: {
      const _exhaustive: never = node;
      throw new Error(`Unknown node type: ${String(_exhaustive)}`);
    }
  }
}

function labelForNodeType(type: string): string {
  const labels: Record<string, string> = {
    'model-call': 'Model Call',
    'prompt-wrapper': 'Prompt Wrapper',
    'template': 'Template',
    'json-extract': 'JSON Extract',
    'manual-text': 'Manual Text',
    'capsule-instance': 'Capsule',
  };
  return labels[type] ?? type;
}

export function makeEmptyPipeline(id: string, name: string, createdAt?: string): PipelineDefinition {
  const now = createdAt ?? new Date().toISOString();
  return {
    schemaVersion: 2,
    id,
    name,
    input: {raw: '', tagName: 'user', outputNamespace: 'user_prompt'},
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}
