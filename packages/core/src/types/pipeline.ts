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
  preferredModelNames?: string[];
  preferredFamilies?: string[];
  preferredParameterSizes?: string[];
  preferredQuantizations?: string[];
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

// ── Step-chain types ─────────────────────────────────────────────────────────

export type StepType =
  | 'model-call'
  | 'presentation'
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
  | { kind: 'any-enabled-endpoint'; modelName: string }
  | { kind: 'slot'; slotName: string };

export interface ModelCallStepConfig {
  type: 'model-call';
  modelRef: ModelRef;
  mode: 'generate' | 'chat';
  temperature?: number;
  maxTokens?: number;
  outputType?: 'text' | 'auto' | 'json';
  outputNames: readonly ['text', 'rawResponse'];
}

export interface PresentationStepConfig {
  type: 'presentation';
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
  /** Content signature captured when the instance was created or rebound. */
  boundContentSignature?: string;
  /** Opaque runs the saved capsule; inline runs an embedded working copy. */
  displayMode?: 'opaque' | 'inline';
  /** Embedded working copy of the capsule body when displayMode is inline. */
  inlineSteps?: PipelineStep[];
  /** True once inlineSteps diverge from the saved capsule version. */
  inlineModified?: boolean;
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
  | PresentationStepConfig
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
  /** Template step ID this was cloned from; used for historyRead remapping on insertion. */
  createdFromTemplateStepId?: string;
  outputNamespace: string;
  primaryOutputName: string;
  config: StepConfig;
  prompt?: PromptCompositionConfig;
  lastEditedAt: string;
}

export interface PipelineInputConfig {
  raw: string;
  tagName: string;
  outputNamespace: 'user_prompt';
}

// ── Pipeline definition ──────────────────────────────────────────────────────

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
  schemaVersion: 2;
  id: string;
  name: string;
  description?: string;
  version: `v${number}`;
  status: 'draft' | 'locked';
  interface: CapsuleInterface;
  steps: PipelineStep[];
  /** Default input config for step-chain capsules (mirrors pipeline input). */
  input?: PipelineInputConfig;
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

export interface TraceHistoryReadInput {
  sourceArtifactRef: string;
  omitted: boolean;
  preview?: string;
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
  /** Full composed prompt XML sent to a model-call step. */
  renderedPromptXml?: string;
  /** History-read inputs resolved for this step's prompt composition. */
  historyReadInputs?: TraceHistoryReadInput[];
  /** Truncated JSON/text preview of the model adapter raw response. */
  rawModelResponsePreview?: string;
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
  /** Truncated primary output for chain-row preview. */
  primaryOutputPreview?: string;
  completedAt: string;
  status: 'completed' | 'failed' | 'skipped';
}

// ── Export/import types ──────────────────────────────────────────────────────

export interface StepOutputsExport {
  status: 'completed' | 'failed' | 'cancelled';
  runId: string | null;
  artifacts: Record<string, PipelineArtifact>;
  trace: PipelineTraceEvent[];
  finalOutputKey: string | null;
  error: PipelineError | null;
  snapshots: Record<string, StepRunSnapshot>;
  userPromptSignature: string | null;
  partial: boolean;
  executedStepIds: string[];
  rerunSingleStepId: string | null;
}

export interface PipelineExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'pipeline';
  pipeline: PipelineDefinition;
  includedCapsules?: CapsuleDefinition[];
  stepOutputs?: StepOutputsExport;
}

export interface CapsuleExportFile {
  exportedAt: string;
  app: 'lorca';
  kind: 'capsule';
  capsule: CapsuleDefinition;
  stepOutputs?: StepOutputsExport;
}

// ── Runtime constants ────────────────────────────────────────────────────────

export const CAPSULE_LOOP_MAX_COUNT = 10;
export const MODEL_CALL_TIMEOUT_MS = 120_000;
export const RECENT_RUN_RETENTION = 20;
export const TRACE_PREVIEW_MAX_CHARS = 32_768;
export const PIPELINE_INPUT_STEP_ID = 'pipeline-input' as const;
export const LOOP_PREV_STEP_ID = 'loop.prev' as const;
export const LOOP_PREV_ARTIFACT_REF = 'loop.prev.text' as const;
