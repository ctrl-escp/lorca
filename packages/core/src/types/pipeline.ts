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

// ── V2 Step-chain types ──────────────────────────────────────────────────────

export type StepType =
  | 'model-call'
  | 'prompt-wrapper'
  | 'template'
  | 'json-extract'
  | 'manual-text'
  | 'capsule-instance'
  | 'loop-group';

export interface PromptBlock {
  id: string;
  label: string;
  tagName: string;
  body: string;
  enabled: boolean;
  source?: 'system-default' | 'user-input' | 'custom' | 'history-read' | 'previous-output';
}

export interface StepHistoryReadConfig {
  sourceStepId: string;
  sourceArtifactRef: string;
  tagName: string;
  required: boolean;
}

export interface PromptCompositionConfig {
  previousOutput: {
    enabled: boolean;
    placement: 'beforeOwnPrompt' | 'afterOwnPrompt';
    tagName: string;
  };
  historyReads: StepHistoryReadConfig[];
  blocks: PromptBlock[];
}

export type ModelRef =
  | { kind: 'fixed'; endpointId: string; modelName: string }
  | { kind: 'slot'; slotName: string };

export interface ModelCallStepConfig {
  type: 'model-call';
  modelRef: ModelRef;
  mode: 'generate' | 'chat';
  temperature?: number;
  maxTokens?: number;
  outputNames: readonly ['text', 'rawResponse'];
}

export interface PromptWrapperStepConfig {
  type: 'prompt-wrapper';
  outputNames: readonly ['text'];
}

export interface TemplateStepConfig {
  type: 'template';
  template: string;
  outputNames: readonly ['text'];
}

export interface JsonExtractStepConfig {
  type: 'json-extract';
  sourceArtifactRef: string;
  outputNames: readonly ['json'];
}

export interface ManualTextStepConfig {
  type: 'manual-text';
  text: string;
  outputNames: readonly ['text'];
}

export interface CapsuleInstanceStepConfig {
  type: 'capsule-instance';
  capsuleId: string;
  capsuleVersion: string;
  inputBindings: Record<string, string>;
  outputBindings: Record<string, string>;
  parameterValues?: Record<string, string>;
  modelSlotBindings?: Record<string, ModelRef>;
}

export type LoopExitCondition =
  | { type: 'json-field-equals'; fieldPath: string; value: boolean | string | number }
  | { type: 'iterations' };

export interface LoopGroupStepConfig {
  type: 'loop-group';
  maxIterations: number;
  exitCondition: LoopExitCondition;
  steps: PipelineStep[];
  outputNames: readonly ['text'];
}

export type StepConfig =
  | ModelCallStepConfig
  | PromptWrapperStepConfig
  | TemplateStepConfig
  | JsonExtractStepConfig
  | ManualTextStepConfig
  | CapsuleInstanceStepConfig
  | LoopGroupStepConfig;

export interface PipelineStep {
  id: string;
  type: StepType;
  label: string;
  description?: string;
  enabled: boolean;
  collapsed?: boolean;
  createdFromSuggestionId?: string;
  outputNamespace: string;
  primaryOutputName: string;
  config: StepConfig;
  prompt?: PromptCompositionConfig;
  historyReads?: StepHistoryReadConfig[];
  lastEditedAt: string;
}

export interface PipelineInputConfig {
  raw: string;
  tagName: string;
  outputNamespace: 'user_prompt';
}

// ── Pipeline definition (V2 step-chain) ─────────────────────────────────────

export interface PipelineDefinition {
  schemaVersion: 2;
  id: string;
  name: string;
  description?: string;
  input: PipelineInputConfig;
  steps: PipelineStep[];
  outputStepId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Legacy graph types (V1 — used only for Capsule internals and migration) ──

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

export interface PromptWrapperConfig {
  tagName: string;
  instructionText: string;
  includeInputArtifact: boolean;
  inputPlacement: 'before-instructions' | 'after-instructions' | 'inside-template';
  template?: string;
  inputArtifactRef?: string;
}

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

/** Legacy V1 graph-backed pipeline — only used for Capsule internals and migration */
export interface LegacyPipelineDefinition {
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

// ── Capsule definition (still uses graph model) ──────────────────────────────

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
  stepId?: string;
  nodeId?: string;
  kind: 'text' | 'json' | 'model-response' | 'error';
  value: unknown;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PipelineTraceEvent {
  runId: string;
  stepId?: string;
  nodeId?: string;
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
  partial?: boolean;
  abortSignal?: AbortSignal;
  input: {
    userPromptRaw: string;
    userPromptXml: string;
  };
  artifacts: Record<string, PipelineArtifact>;
  trace: PipelineTraceEvent[];
  params?: Record<string, unknown>;
}

// ── Step run snapshot (for stale tracking) ──────────────────────────────────

export interface StepRunSnapshot {
  stepId: string;
  inputSignature: string;
  configSignature: string;
  historyReadSignatures: Record<string, string>;
  outputArtifactRefs: string[];
  completedAt: string;
  status: 'completed' | 'failed' | 'skipped';
}

// ── Export/import types ──────────────────────────────────────────────────────

export interface PipelineExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'pipeline';
  pipeline: PipelineDefinition;
  includedCapsules?: CapsuleDefinition[];
}

export interface LegacyPipelineExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'pipeline';
  pipeline: LegacyPipelineDefinition;
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
export const PIPELINE_INPUT_STEP_ID = 'pipeline-input' as const;
export const LOOP_PREV_STEP_ID = 'loop.prev' as const;
export const LOOP_PREV_ARTIFACT_REF = 'loop.prev.text' as const;
