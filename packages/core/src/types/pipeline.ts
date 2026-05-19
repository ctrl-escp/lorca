import type {ModelUsageBucket} from './endpoints.js';
import type {PipelineError} from './errors.js';

// ── Capsule interface types ──────────────────────────────────────────────────

export type CapsuleValueKind = 'text' | 'json' | 'model-response';
export type CapsuleParameterKind = 'text' | 'boolean' | 'number' | 'json';

export interface CapsuleInputPort {
  name: string;
  kind: CapsuleValueKind;
  required: boolean;
  description?: string;
  defaultArtifactKey?: string;
}

export interface CapsuleOutputPort {
  name: string;
  kind: CapsuleValueKind;
  description?: string;
  sourceArtifactKey?: string;
}

export interface CapsuleParameter {
  name: string;
  kind: CapsuleParameterKind;
  required: boolean;
  description?: string;
  default?: unknown;
}

export interface CapsuleModelSlot {
  name: string;
  suggestedBuckets: ModelUsageBucket[];
  required: boolean;
  description?: string;
  defaultModelRef?: {
    endpointId: string;
    modelName: string;
  };
}

export interface CapsuleInterface {
  inputs: CapsuleInputPort[];
  outputs: CapsuleOutputPort[];
  parameters: CapsuleParameter[];
  modelSlots: CapsuleModelSlot[];
}

// ── Pipeline graph primitives ────────────────────────────────────────────────

export interface PipelineOutputRef {
  nodeId: string;
  outputName: string;
}

export interface PipelineEdge {
  id: string;
  fromNodeId: string;
  fromOutput: string;
  toNodeId: string;
  toInput: string;
}

export interface NodeLayout {
  x: number;
  y: number;
}

export interface PipelineNodeBase {
  id: string;
  title?: string;
  artifactPrefix?: string;
  layout?: NodeLayout;
}

// ── Node config types ────────────────────────────────────────────────────────

export interface PromptWrapperConfig {
  tagName: string;
  instructionText: string;
  includeInputArtifact: boolean;
  inputPlacement: 'before-instructions' | 'after-instructions' | 'inside-template';
  template?: string;
  inputArtifactRef?: string;
}

export type ModelRef =
  | { kind: 'fixed'; endpointId: string; modelName: string }
  | { kind: 'slot'; slotName: string };

export interface ModelCallConfig {
  modelRef: ModelRef;
  mode: 'generate' | 'chat';
  systemPrompt?: string;
  inputArtifactRef: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  expectedOutput?: 'text' | 'json';
  jsonSchema?: unknown;
}

export interface CapsuleLoopConfig {
  enabled: boolean;
  count: number;
  inputCarryMode: 'first-input-then-previous-output';
  carriedInputName: string;
  carriedOutputName: string;
}

export interface CapsuleInstanceConfig {
  capsuleDefinitionId: string;
  capsuleVersion: string;
  inputBindings: Record<string, string>;
  outputBindings: Record<string, string>;
  parameterValues: Record<string, unknown>;
  modelSlotAssignments: Record<string, { endpointId: string; modelName: string }>;
  loop?: CapsuleLoopConfig;
}

// ── Node types ───────────────────────────────────────────────────────────────

export interface InputNode extends PipelineNodeBase {
  type: 'input';
}

export interface PromptWrapperNode extends PipelineNodeBase {
  type: 'prompt-wrapper';
  config: PromptWrapperConfig;
}

export interface TemplateNode extends PipelineNodeBase {
  type: 'template';
  template: string;
}

export interface ModelCallNode extends PipelineNodeBase {
  type: 'model-call';
  config: ModelCallConfig;
}

export interface JsonExtractNode extends PipelineNodeBase {
  type: 'json-extract';
  inputArtifactRef: string;
}

export interface ManualTextNode extends PipelineNodeBase {
  type: 'manual-text';
  text: string;
}

export interface CapsuleInstanceNode extends PipelineNodeBase {
  type: 'capsule-instance';
  config: CapsuleInstanceConfig;
}

export type PipelineNode =
  | InputNode
  | PromptWrapperNode
  | TemplateNode
  | ModelCallNode
  | JsonExtractNode
  | ManualTextNode
  | CapsuleInstanceNode;

// ── Pipeline definition ──────────────────────────────────────────────────────

export interface PipelineDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  inputArtifactName: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  outputRef: PipelineOutputRef;
  createdAt: string;
  updatedAt: string;
}

// ── Capsule definition ───────────────────────────────────────────────────────

export interface CapsuleTestRunSummary {
  runId: string;
  ranAt: string;
  passed: boolean;
  failedNodeId?: string;
  error?: PipelineError;
}

export interface CapsuleTestCase {
  id: string;
  name: string;
  inputValues: Record<string, unknown>;
  parameterValues?: Record<string, unknown>;
  expectedOutputs?: Record<string, unknown>;
  lastRun?: CapsuleTestRunSummary;
}

export interface CapsuleDefinition {
  schemaVersion: 1;
  id: string;
  name: string;
  description?: string;
  version: `v${number}`;
  status: 'draft' | 'locked';
  interface: CapsuleInterface;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  outputRef: PipelineOutputRef;
  tests: CapsuleTestCase[];
  createdAt: string;
  updatedAt: string;
  lockedAt?: string;
}

// ── Execution types ──────────────────────────────────────────────────────────

export interface PipelineArtifact {
  name: string;
  nodeId: string;
  kind: 'text' | 'json' | 'model-response' | 'error';
  value: unknown;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineTraceEvent {
  runId: string;
  nodeId: string;
  capsuleInstanceId?: string;
  capsuleIteration?: number;
  status: 'started' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  timestamp: string;
  durationMs?: number;
  inputArtifactNames?: string[];
  outputArtifactNames?: string[];
  error?: PipelineError;
}

export interface PipelineRunContext {
  runId: string;
  pipelineId: string;
  startedAt: string;
  abortSignal?: AbortSignal;
  input: {
    userPromptRaw: string;
    userPromptXml: string;
  };
  artifacts: Record<string, PipelineArtifact>;
  trace: PipelineTraceEvent[];
}

// ── Export/import types ──────────────────────────────────────────────────────

export interface PipelineExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'pipeline';
  pipeline: PipelineDefinition;
  includedCapsules?: CapsuleDefinition[];
}

export interface CapsuleExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'capsule';
  capsule: CapsuleDefinition;
}

// ── Runtime constants ────────────────────────────────────────────────────────

export const CAPSULE_LOOP_MAX_COUNT = 10;
export const MODEL_CALL_TIMEOUT_MS = 120_000;
export const RECENT_RUN_RETENTION = 20;
export const TRACE_PREVIEW_MAX_CHARS = 32_768;
