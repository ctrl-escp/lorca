import type {
  PipelineDefinition,
  PipelineStep,
  PipelineArtifact,
  PipelineTraceEvent,
  PipelineError,
  CapsuleDefinition,
  AiEndpointConfig,
  LoopGroupStepConfig,
  LoopExitCondition,
  Result,
  CapsuleInstanceNode,
  TraceHistoryReadInput,
  StepRunSnapshot,
} from '@lorca/core';
import {MODEL_CALL_TIMEOUT_MS, LOOP_PREV_ARTIFACT_REF} from '@lorca/core';
import {renderPromptComposition, renderTemplate} from '@lorca/prompt';
import type {ResolvedHistoryRead} from '@lorca/prompt';
import type {ModelCallRequest} from '@lorca/endpoints';
import {executeModelCall} from '@lorca/endpoints';
import {
  buildActiveStepChain,
  compileActiveStepsToExecutionPlan,
  compileStepChainToExecutionPlan,
} from './chainCompiler.js';
import type {ExecutePipelineOptions, CompiledExecutionStep} from './chainCompiler.js';
import {executePipeline} from './executor.js';
import {
  buildStepRunSnapshot,
  computeUserPromptSignature,
} from './staleState.js';
import {
  historyReadsForTrace,
  primaryOutputPreview,
  rawResponsePreview,
} from './stepTrace.js';
import {tryParseJson} from './jsonParser.js';

interface StepExecutionResult {
  artifacts: PipelineArtifact[];
  traceExtras?: Partial<PipelineTraceEvent>;
  /** Snapshots for steps executed inside a capsule instance, keyed as `${capsuleStepId}:${innerStepId}`. */
  nestedSnapshots?: Record<string, StepRunSnapshot>;
}

function stepOk(artifacts: PipelineArtifact[], traceExtras?: Partial<PipelineTraceEvent>): Result<StepExecutionResult, PipelineError> {
  return {ok: true, value: {artifacts, ...(traceExtras ? {traceExtras} : {})}};
}

export type EndpointResolver = (id: string) => AiEndpointConfig | undefined;
export type ModelEndpointResolver = (modelName: string) => AiEndpointConfig | undefined;
export type CapsuleResolver = (id: string, version: string) => CapsuleDefinition | undefined;

export interface ExecutorCallbacks {
  onTraceEvent(event: PipelineTraceEvent): void;
  onArtifact(artifact: PipelineArtifact): void;
}

export interface StepChainRunResult {
  finalOutputKey: string;
  snapshots: Record<string, StepRunSnapshot>;
  userPromptSignature: string;
  partial: boolean;
  executedStepIds: string[];
}

function makeArtifact(
  name: string,
  stepId: string,
  kind: PipelineArtifact['kind'],
  value: unknown,
): PipelineArtifact {
  return {name, nodeId: stepId, kind, value, createdAt: new Date().toISOString()};
}

function traceEvent(
  runId: string,
  stepId: string,
  status: PipelineTraceEvent['status'],
  extra?: Partial<PipelineTraceEvent>,
): PipelineTraceEvent {
  return {runId, stepId, nodeId: stepId, status, timestamp: new Date().toISOString(), ...extra};
}

function getJsonField(obj: unknown, fieldPath: string): unknown {
  let current: unknown = obj;
  for (const segment of fieldPath.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function flattenJsonFields(prefix: string, value: unknown, map: Record<string, unknown>, depth: number): void {
  if (depth === 0 || value === null || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [field, val] of Object.entries(value as Record<string, unknown>)) {
    const key = `${prefix}.${field}`;
    map[key] = val;
    flattenJsonFields(key, val, map, depth - 1);
  }
}

/**
 * Resolves an artifact reference that may use dot-notation into a JSON artifact.
 * e.g. "step.json.field.sub" → looks up "step.json" artifact, traverses .field.sub
 * Returns a synthetic artifact with the resolved leaf value, or undefined if not found.
 */
function resolveArtifactByPath(
  artifacts: Record<string, PipelineArtifact>,
  ref: string,
): PipelineArtifact | undefined {
  if (ref in artifacts) return artifacts[ref];
  // Try progressively shorter prefixes
  const parts = ref.split('.');
  for (let len = parts.length - 1; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('.');
    const artifact = artifacts[prefix];
    if (artifact && artifact.kind === 'json') {
      const remainingPath = parts.slice(len).join('.');
      const value = getJsonField(artifact.value, remainingPath);
      if (value !== undefined) {
        return {...artifact, name: ref, value};
      }
    }
  }
  return undefined;
}

function exitConditionMet(exitCondition: LoopExitCondition, lastOutputText: string): boolean {
  if (exitCondition.type === 'iterations') return false;
  const parsed = tryParseJson(lastOutputText);
  if (!parsed.ok) return false;
  return getJsonField(parsed.value, exitCondition.fieldPath) === exitCondition.value;
}

export async function executeStepChain(
  pipeline: PipelineDefinition,
  userPromptRaw: string,
  options: ExecutePipelineOptions,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
  resolveCapsule?: CapsuleResolver,
  resolveEndpointForModel?: ModelEndpointResolver,
): Promise<Result<StepChainRunResult, PipelineError>> {
  const plan = compileStepChainToExecutionPlan(pipeline, options);
  const userPromptSignature = computeUserPromptSignature(userPromptRaw);

  const {buildUserPromptArtifacts} = await import('@lorca/prompt');
  const {raw, xml} = buildUserPromptArtifacts(userPromptRaw);
  const artifacts: Record<string, PipelineArtifact> = {
    'user_prompt.raw': makeArtifact('user_prompt.raw', 'pipeline-input', 'text', raw),
    'user_prompt.xml': makeArtifact('user_prompt.xml', 'pipeline-input', 'text', xml),
    ...(options.seedArtifacts ?? {}),
  };

  const stepMap = new Map(pipeline.steps.map((s) => [s.id, s]));
  const snapshots: Record<string, StepRunSnapshot> = {};
  const executedStepIds: string[] = [];

  let failed = false;
  let failError: PipelineError | null = null;

  const abortSignal = options.abortSignal;
  const runId = `run-${pipeline.id.slice(0, 8)}`;
  const partial = Boolean(options.stopAtStepId);

  for (const compiledStep of plan.steps) {
    const step = stepMap.get(compiledStep.stepId);
    if (!step) {
      failError = {code: 'invalid_pipeline_graph', message: `Step not found: ${compiledStep.stepId}`};
      failed = true;
      break;
    }

    if (failed) {
      callbacks.onTraceEvent(traceEvent(runId, step.id, 'skipped'));
      continue;
    }

    if (abortSignal?.aborted) {
      const cancelErr: PipelineError = {code: 'run_cancelled', message: 'Run was cancelled', nodeId: step.id};
      callbacks.onTraceEvent(traceEvent(runId, step.id, 'cancelled', {error: cancelErr}));
      failed = true;
      failError = cancelErr;
      continue;
    }

    if (compiledStep.execute === 'skip') {
      callbacks.onTraceEvent(traceEvent(runId, step.id, 'skipped'));
      continue;
    }

    if (compiledStep.execute === 'blocked') {
      const blockErr: PipelineError = {
        code: 'invalid_pipeline_graph',
        message: compiledStep.blockedReason ?? 'Step has unresolved required inputs',
        nodeId: step.id,
      };
      snapshots[step.id] = buildStepRunSnapshot(
        step,
        compiledStep,
        pipeline,
        userPromptSignature,
        [],
        'failed',
      );
      callbacks.onTraceEvent(traceEvent(runId, step.id, 'failed', {error: blockErr}));
      failed = true;
      failError = blockErr;
      continue;
    }

    callbacks.onTraceEvent(traceEvent(runId, step.id, 'started', {
      inputArtifactNames: compiledStep.inputArtifactRefs,
    }));
    const startMs = Date.now();

    const result = await executeStepInternal(
      step,
      compiledStep,
      artifacts,
      resolveEndpoint,
      resolveCapsule,
      pipeline,
      callbacks,
      abortSignal,
      resolveEndpointForModel,
      options.params,
      options,
    );

    if (!result.ok) {
      snapshots[step.id] = buildStepRunSnapshot(
        step,
        compiledStep,
        pipeline,
        userPromptSignature,
        [],
        'failed',
      );
      callbacks.onTraceEvent(traceEvent(runId, step.id, 'failed', {durationMs: Date.now() - startMs, error: result.error}));
      failed = true;
      failError = result.error;
      continue;
    }

    const produced: string[] = [];
    for (const artifact of result.value.artifacts) {
      artifacts[artifact.name] = artifact;
      callbacks.onArtifact(artifact);
      produced.push(artifact.name);
    }
    executedStepIds.push(step.id);
    if (result.value.nestedSnapshots) {
      Object.assign(snapshots, result.value.nestedSnapshots);
    }
    const preview = primaryOutputPreview(step, artifacts);
    snapshots[step.id] = buildStepRunSnapshot(
      step,
      compiledStep,
      pipeline,
      userPromptSignature,
      produced,
      'completed',
      preview,
    );
    callbacks.onTraceEvent(traceEvent(runId, step.id, 'completed', {
      durationMs: Date.now() - startMs,
      outputArtifactNames: produced,
      inputArtifactNames: compiledStep.inputArtifactRefs,
      ...result.value.traceExtras,
    }));
  }

  if (failed && failError) return {ok: false, error: failError};

  const lastCompiledStep = plan.steps.at(-1);
  if (!lastCompiledStep) {
    return {ok: false, error: {code: 'final_output_missing', message: 'No steps executed'}};
  }
  const lastStep = stepMap.get(lastCompiledStep.stepId)!;

  let finalStepId = lastStep.id;
  if (pipeline.outputStepId && !partial) {
    const outputStep = stepMap.get(pipeline.outputStepId);
    if (outputStep) finalStepId = outputStep.id;
  }
  const finalStep = stepMap.get(finalStepId) ?? lastStep;
  const finalKey = `${finalStep.outputNamespace}.${finalStep.primaryOutputName}`;

  if (!(finalKey in artifacts)) {
    return {
      ok: false,
      error: {
        code: 'final_output_missing',
        message: `Final output artifact not found: ${finalKey}`,
        nodeId: finalStepId,
      },
    };
  }

  return {
    ok: true,
    value: {
      finalOutputKey: finalKey,
      snapshots,
      userPromptSignature,
      partial,
      executedStepIds,
    },
  };
}

export async function executeStepInternal(
  step: PipelineStep,
  compiledStep: CompiledExecutionStep,
  artifacts: Record<string, PipelineArtifact>,
  resolveEndpoint: EndpointResolver,
  resolveCapsule: CapsuleResolver | undefined,
  pipeline: PipelineDefinition,
  callbacks: ExecutorCallbacks,
  abortSignal?: AbortSignal,
  resolveEndpointForModel?: ModelEndpointResolver,
  params?: Record<string, unknown>,
  runOptions?: ExecutePipelineOptions,
): Promise<Result<StepExecutionResult, PipelineError>> {
  const {config} = step;
  const inputArtifactNames = compiledStep.inputArtifactRefs;

  switch (config.type) {
    case 'presentation': {
      const artifactValues: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(artifacts)) {
        artifactValues[k] = v.value;
        if (v.kind === 'json') flattenJsonFields(k, v.value, artifactValues, 8);
      }
      const renderResult = renderTemplate(config.text, {
        artifacts: artifactValues,
        allowParams: params !== undefined,
        ...(params !== undefined ? {params} : {}),
      });
      if (!renderResult.ok) return {ok: false, error: {...renderResult.error, nodeId: step.id}};
      const key = `${step.outputNamespace}.text`;
      return stepOk([makeArtifact(key, step.id, 'text', renderResult.value)], {inputArtifactNames});
    }

    case 'model-call': {
      return executePromptStep(step, compiledStep, artifacts, resolveEndpoint, abortSignal, resolveEndpointForModel, params);
    }

    case 'capsule-instance': {
      const capResult = await executeCapsuleStep(step, artifacts, resolveEndpoint, resolveCapsule, pipeline, callbacks, resolveEndpointForModel, runOptions);
      if (!capResult.ok) return capResult;
      return {
        ok: true,
        value: {
          artifacts: capResult.value.artifacts,
          traceExtras: {inputArtifactNames},
          ...(capResult.value.nestedSnapshots ? {nestedSnapshots: capResult.value.nestedSnapshots} : {}),
        },
      };
    }

    case 'loop-group': {
      const loopResult = await executeLoopGroupStep(step, compiledStep, artifacts, resolveEndpoint, resolveCapsule, pipeline, abortSignal, resolveEndpointForModel, params, runOptions);
      if (!loopResult.ok) return loopResult;
      return stepOk(loopResult.value, {inputArtifactNames});
    }

    default: {
      const _exhaustive: never = config;
      return {ok: false, error: {code: 'invalid_pipeline_graph', message: `Unknown step type: ${String((_exhaustive as {type: string}).type)}`, nodeId: step.id}};
    }
  }
}

async function executeLoopGroupStep(
  step: PipelineStep,
  _compiledStep: CompiledExecutionStep,
  artifacts: Record<string, PipelineArtifact>,
  resolveEndpoint: EndpointResolver,
  resolveCapsule: CapsuleResolver | undefined,
  pipeline: PipelineDefinition,
  abortSignal?: AbortSignal,
  resolveEndpointForModel?: ModelEndpointResolver,
  params?: Record<string, unknown>,
  runOptions?: ExecutePipelineOptions,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  if (step.config.type !== 'loop-group') {
    return {ok: false, error: {code: 'invalid_pipeline_graph', message: 'executeLoopGroupStep called on non-loop step', nodeId: step.id}};
  }

  const config = step.config as LoopGroupStepConfig;
  const innerActive = buildActiveStepChain(config.steps);
  if (innerActive.length === 0) {
    return {ok: false, error: {code: 'invalid_pipeline_graph', message: 'Loop group must contain at least one enabled inner step', nodeId: step.id}};
  }

  if (innerActive.some((s) => s.config.type === 'loop-group')) {
    return {ok: false, error: {code: 'invalid_pipeline_graph', message: 'Nested loop groups are not supported', nodeId: step.id}};
  }

  const loopIdx = pipeline.steps.findIndex((s) => s.id === step.id);
  const outerBefore = loopIdx >= 0 ? pipeline.steps.slice(0, loopIdx) : [];
  const innerPlan = compileActiveStepsToExecutionPlan(innerActive, {
    allSteps: [...outerBefore, ...config.steps],
  });
  const innerStepMap = new Map(config.steps.map((s) => [s.id, s]));
  const outerSnapshot: Record<string, PipelineArtifact> = {...artifacts};
  const loopArtifacts: Record<string, PipelineArtifact> = {...outerSnapshot};

  let previousIterationOutput: string | undefined;
  let finalOutputText: string | undefined;

  for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
    if (abortSignal?.aborted) {
      return {ok: false, error: {code: 'run_cancelled', message: 'Run was cancelled', nodeId: step.id}};
    }

    for (const key of Object.keys(loopArtifacts)) {
      if (!(key in outerSnapshot)) delete loopArtifacts[key];
    }
    Object.assign(loopArtifacts, outerSnapshot);

    if (previousIterationOutput !== undefined) {
      loopArtifacts[LOOP_PREV_ARTIFACT_REF] = makeArtifact(
        LOOP_PREV_ARTIFACT_REF,
        step.id,
        'text',
        previousIterationOutput,
      );
    } else {
      delete loopArtifacts[LOOP_PREV_ARTIFACT_REF];
    }

    for (const compiledInner of innerPlan.steps) {
      const innerStep = innerStepMap.get(compiledInner.stepId);
      if (!innerStep) {
        return {ok: false, error: {code: 'invalid_pipeline_graph', message: `Inner step not found: ${compiledInner.stepId}`, nodeId: step.id}};
      }

      const result = await executeStepInternal(
        innerStep,
        compiledInner,
        loopArtifacts,
        resolveEndpoint,
        resolveCapsule,
        pipeline,
        {onTraceEvent() {}, onArtifact() {}},
        abortSignal,
        resolveEndpointForModel,
        params,
        runOptions,
      );

      if (!result.ok) {
        return {ok: false, error: {...result.error, nodeId: step.id}};
      }

      for (const artifact of result.value.artifacts) {
        loopArtifacts[artifact.name] = artifact;
      }
    }

    const lastInner = innerActive.at(-1)!;
    const lastKey = `${lastInner.outputNamespace}.${lastInner.primaryOutputName}`;
    const lastArtifact = loopArtifacts[lastKey];
    if (!lastArtifact) {
      return {ok: false, error: {code: 'final_output_missing', message: `Loop inner chain produced no output at ${lastKey}`, nodeId: step.id}};
    }

    finalOutputText = typeof lastArtifact.value === 'string'
      ? lastArtifact.value
      : JSON.stringify(lastArtifact.value);
    previousIterationOutput = finalOutputText;

    if (exitConditionMet(config.exitCondition, finalOutputText)) break;
    if (iteration >= config.maxIterations) break;
  }

  if (finalOutputText === undefined) {
    return {ok: false, error: {code: 'final_output_missing', message: 'Loop group produced no output', nodeId: step.id}};
  }

  const outputKey = `${step.outputNamespace}.${step.primaryOutputName}`;
  const produced: PipelineArtifact[] = [makeArtifact(outputKey, step.id, 'text', finalOutputText)];
  for (const [key, artifact] of Object.entries(loopArtifacts)) {
    if (key === LOOP_PREV_ARTIFACT_REF || key in outerSnapshot) continue;
    produced.push(artifact);
  }
  return {ok: true, value: produced};
}

async function executePromptStep(
  step: PipelineStep,
  compiledStep: CompiledExecutionStep,
  artifacts: Record<string, PipelineArtifact>,
  resolveEndpoint: EndpointResolver,
  abortSignal?: AbortSignal,
  resolveEndpointForModel?: ModelEndpointResolver,
  params?: Record<string, unknown>,
): Promise<Result<StepExecutionResult, PipelineError>> {
  if (step.config.type !== 'model-call') {
    return {ok: false, error: {code: 'unknown_error', message: `Unexpected step type in executePromptStep: ${step.config.type}`, nodeId: step.id}};
  }
  const config = step.config;

  const prevArtifact = compiledStep.previousOutputArtifactRef
    ? artifacts[compiledStep.previousOutputArtifactRef]
    : artifacts['user_prompt.xml'];
  const prevValue = prevArtifact
    ? (typeof prevArtifact.value === 'string' ? prevArtifact.value : JSON.stringify(prevArtifact.value))
    : undefined;

  const resolvedHistory: ResolvedHistoryRead[] = [];
  const historyReadInputs: TraceHistoryReadInput[] = [];
  for (const read of compiledStep.historyReads ?? []) {
    const artifact = resolveArtifactByPath(artifacts, read.sourceArtifactRef);
    if (!artifact) {
      if (read.required) {
        return {
          ok: false,
          error: {
            code: 'missing_artifact',
            message: `Required history read artifact not found: ${read.sourceArtifactRef}`,
            nodeId: step.id,
          },
        };
      }
      resolvedHistory.push({sourceArtifactRef: read.sourceArtifactRef, omitted: true});
      historyReadInputs.push({sourceArtifactRef: read.sourceArtifactRef, omitted: true});
      continue;
    }
    const value = typeof artifact.value === 'string' ? artifact.value : JSON.stringify(artifact.value);
    resolvedHistory.push({sourceArtifactRef: read.sourceArtifactRef, value});
    historyReadInputs.push({sourceArtifactRef: read.sourceArtifactRef, omitted: false, preview: value});
  }

  const prompt = step.prompt ? renderPromptTemplates(step.prompt, artifacts, params) : undefined;
  if (prompt && !prompt.ok) return {ok: false, error: {...prompt.error, nodeId: step.id}};

  const renderedPrompt = prompt?.ok
    ? renderPromptComposition(prompt.value, prevValue, resolvedHistory)
    : {blocks: [], xmlText: prevValue ?? ''};

  const key = `${step.outputNamespace}.text`;

  const traceBase: Partial<PipelineTraceEvent> = {
    inputArtifactNames: compiledStep.inputArtifactRefs,
    renderedPromptXml: renderedPrompt.xmlText,
    historyReadInputs: historyReadsForTrace(historyReadInputs),
  };

  if (config.modelRef.kind === 'slot') {
    return {ok: false, error: {code: 'invalid_capsule_interface', message: "ModelRef kind 'slot' is only valid inside a Capsule", nodeId: step.id}};
  }

  const endpointConfig = config.modelRef.kind === 'any-enabled-endpoint'
    ? resolveEndpointForModel?.(config.modelRef.modelName)
    : resolveEndpoint(config.modelRef.endpointId);
  if (!endpointConfig) {
    const message = config.modelRef.kind === 'any-enabled-endpoint'
      ? `No enabled endpoint has model: ${config.modelRef.modelName}`
      : `Endpoint not found: ${config.modelRef.endpointId}`;
    return {ok: false, error: {code: 'missing_endpoint', message, nodeId: step.id}};
  }

  const timeoutSignal = AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS);
  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutSignal])
    : timeoutSignal;

  const request: ModelCallRequest = {
    mode: config.mode,
    endpointId: endpointConfig.id,
    modelName: config.modelRef.modelName,
    prompt: renderedPrompt,
    abortSignal: combinedSignal,
    ...(config.temperature !== undefined && {temperature: config.temperature}),
    ...(config.maxTokens !== undefined && {maxTokens: config.maxTokens}),
  };

  const callResult = await executeModelCall(endpointConfig, request);
  if (!callResult.ok) return {ok: false, error: {...callResult.error, nodeId: step.id}};

  const produced: PipelineArtifact[] = [
    makeArtifact(key, step.id, 'text', callResult.value.text),
    makeArtifact(`${step.outputNamespace}.rawResponse`, step.id, 'model-response', callResult.value.rawResponse),
  ];

  const outputType = config.outputType ?? 'auto';
  if (outputType === 'auto' || outputType === 'json') {
    const parseResult = tryParseJson(callResult.value.text);
    if (parseResult.ok) {
      produced.push(makeArtifact(`${step.outputNamespace}.json`, step.id, 'json', parseResult.value));
      produced.push(makeArtifact(`${step.outputNamespace}.jsonValid`, step.id, 'json', true));
    } else if (outputType === 'json') {
      return {ok: false, error: {code: 'json_parse_failed', message: 'Step output could not be parsed as JSON', nodeId: step.id}};
    } else {
      produced.push(makeArtifact(`${step.outputNamespace}.jsonValid`, step.id, 'json', false));
    }
  }

  return stepOk(produced, {
    ...traceBase,
    rawModelResponsePreview: rawResponsePreview(callResult.value.rawResponse),
  });
}

function renderPromptTemplates(
  prompt: NonNullable<PipelineStep['prompt']>,
  artifacts: Record<string, PipelineArtifact>,
  params?: Record<string, unknown>,
): Result<NonNullable<PipelineStep['prompt']>, PipelineError> {
  const artifactValues: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(artifacts)) {
    artifactValues[k] = v.value;
    if (v.kind === 'json') flattenJsonFields(k, v.value, artifactValues, 8);
  }

  const blocks = [];
  for (const block of prompt.blocks) {
    const rendered = renderTemplate(block.body, {
      artifacts: artifactValues,
      allowParams: params !== undefined,
      ...(params !== undefined ? {params} : {}),
    });
    if (!rendered.ok) return rendered;
    blocks.push({...block, body: rendered.value});
  }
  return {ok: true, value: {...prompt, blocks}};
}

async function executeCapsuleStep(
  step: PipelineStep,
  artifacts: Record<string, PipelineArtifact>,
  resolveEndpoint: EndpointResolver,
  resolveCapsule: CapsuleResolver | undefined,
  pipeline: PipelineDefinition,
  callbacks: ExecutorCallbacks,
  resolveEndpointForModel?: ModelEndpointResolver,
  runOptions?: ExecutePipelineOptions,
): Promise<Result<{artifacts: PipelineArtifact[]; nestedSnapshots?: Record<string, StepRunSnapshot>}, PipelineError>> {
  if (step.config.type !== 'capsule-instance') {
    return {ok: false, error: {code: 'invalid_pipeline_graph', message: 'executeCapsuleStep called on non-capsule step', nodeId: step.id}};
  }
  if (!resolveCapsule) {
    return {ok: false, error: {code: 'missing_capsule', message: 'No capsule resolver provided', nodeId: step.id}};
  }

  const {capsuleId, capsuleVersion, inputBindings, outputBindings, parameterValues, modelSlotBindings} = step.config;

  const capsule = resolveCapsule(capsuleId, capsuleVersion);
  if (!capsule) {
    return {ok: false, error: {code: 'missing_capsule', message: `Capsule not found: ${capsuleId} ${capsuleVersion}`, nodeId: step.id}};
  }

  const executionCapsule = step.config.displayMode === 'inline' && step.config.inlineSteps?.length
    ? {...capsule, steps: step.config.inlineSteps}
    : capsule;

  if (executionCapsule.steps && executionCapsule.steps.length > 0) {
    return executeCapsuleStepChain(step, executionCapsule, artifacts, resolveEndpoint, resolveCapsule, pipeline, callbacks, resolveEndpointForModel, runOptions);
  }

  const modelSlotAssignments: Record<string, {endpointId: string; modelName: string}> = {};
  for (const [slotName, ref] of Object.entries(modelSlotBindings ?? {})) {
    if (ref.kind === 'fixed') {
      modelSlotAssignments[slotName] = {endpointId: ref.endpointId, modelName: ref.modelName};
    } else if (ref.kind === 'any-enabled-endpoint') {
      const endpoint = resolveEndpointForModel?.(ref.modelName);
      if (!endpoint) {
        return {ok: false, error: {code: 'missing_endpoint', message: `No enabled endpoint has model: ${ref.modelName}`, nodeId: step.id}};
      }
      modelSlotAssignments[slotName] = {endpointId: endpoint.id, modelName: ref.modelName};
    }
  }

  const capsuleNode: CapsuleInstanceNode = {
    id: step.id,
    type: 'capsule-instance',
    config: {
      capsuleDefinitionId: capsuleId,
      capsuleVersion,
      inputBindings,
      outputBindings,
      parameterValues: parameterValues ?? {},
      modelSlotAssignments,
    },
  };

  const runId = `run-${step.id}`;
  const ctx = {
    runId,
    pipelineId: pipeline.id,
    startedAt: new Date().toISOString(),
    input: {
      userPromptRaw: typeof artifacts['user_prompt.raw']?.value === 'string' ? artifacts['user_prompt.raw'].value : '',
      userPromptXml: typeof artifacts['user_prompt.xml']?.value === 'string' ? artifacts['user_prompt.xml'].value : '',
    },
    artifacts: {...artifacts},
    trace: [] as import('@lorca/core').PipelineTraceEvent[],
  };

  const produced: PipelineArtifact[] = [];
  const collectedCallbacks = {
    onTraceEvent() { /* trace events handled by outer executor */ },
    onArtifact(a: PipelineArtifact) { produced.push(a); },
  };

  const legacyDef = {
    schemaVersion: 1 as const,
    id: capsule.id,
    name: capsule.name,
    inputArtifactName: 'user_prompt',
    nodes: [{id: 'pipeline-input', type: 'input' as const}, capsuleNode],
    edges: [{
      id: `e-input-${step.id}`,
      fromNodeId: 'pipeline-input',
      fromOutput: 'xml',
      toNodeId: step.id,
      toInput: 'input',
    }],
    outputRef: {nodeId: step.id, outputName: step.primaryOutputName},
    createdAt: capsule.createdAt,
    updatedAt: capsule.updatedAt,
  };

  const result = await executePipeline(legacyDef, ctx, resolveEndpoint, collectedCallbacks, resolveCapsule, resolveEndpointForModel);
  if (!result.ok) return {ok: false, error: {...result.error, nodeId: step.id}};

  return {ok: true, value: {artifacts: produced}};
}

const USER_PROMPT_ARTIFACT_PREFIXES = ['user_prompt.raw', 'user_prompt.xml'] as const;

function capsuleInternalArtifactKey(instancePrefix: string, localName: string): string {
  return `${instancePrefix}.internal.${localName}`;
}

function namespaceCapsuleArtifactRef(instancePrefix: string, ref: string): string {
  if (ref.startsWith(`${instancePrefix}.internal.`)) return ref;
  if (USER_PROMPT_ARTIFACT_PREFIXES.some((p) => ref === p || ref.startsWith(`${p}.`))) return ref;
  return capsuleInternalArtifactKey(instancePrefix, ref);
}

function namespaceCapsuleTraceEvent(
  event: PipelineTraceEvent,
  instancePrefix: string,
  capsuleInstanceId: string,
): PipelineTraceEvent {
  const ns = (name: string) => namespaceCapsuleArtifactRef(instancePrefix, name);
  const next: PipelineTraceEvent = {
    ...event,
    capsuleInstanceId,
  };
  if (event.error && event.error.capsuleInstanceId === undefined) {
    next.error = {...event.error, capsuleInstanceId};
  }
  if (event.inputArtifactNames) {
    next.inputArtifactNames = event.inputArtifactNames.map(ns);
  }
  if (event.outputArtifactNames) {
    next.outputArtifactNames = event.outputArtifactNames.map(ns);
  }
  if (event.historyReadInputs) {
    next.historyReadInputs = event.historyReadInputs.map((hr) => ({
      ...hr,
      sourceArtifactRef: ns(hr.sourceArtifactRef),
    }));
  }
  return next;
}

function remapCapsuleInnerSnapshots(
  capsuleStepId: string,
  instancePrefix: string,
  innerSnapshots: Record<string, StepRunSnapshot>,
): Record<string, StepRunSnapshot> {
  const remapped: Record<string, StepRunSnapshot> = {};
  for (const [innerStepId, snapshot] of Object.entries(innerSnapshots)) {
    remapped[`${capsuleStepId}:${innerStepId}`] = {
      ...snapshot,
      outputArtifactRefs: snapshot.outputArtifactRefs.map((ref) => namespaceCapsuleArtifactRef(instancePrefix, ref)),
    };
  }
  return remapped;
}

function unmapSeededInternalArtifacts(
  instancePrefix: string,
  artifacts: Record<string, PipelineArtifact>,
): void {
  const prefix = `${instancePrefix}.internal.`;
  for (const [key, artifact] of Object.entries({...artifacts})) {
    if (!key.startsWith(prefix)) continue;
    const localName = key.slice(prefix.length);
    if (localName in artifacts) continue;
    artifacts[localName] = {...artifact, name: localName};
  }
}

async function executeCapsuleStepChain(
  step: PipelineStep,
  capsule: CapsuleDefinition,
  parentArtifacts: Record<string, PipelineArtifact>,
  resolveEndpoint: EndpointResolver,
  resolveCapsule: CapsuleResolver | undefined,
  parentPipeline: PipelineDefinition,
  outerCallbacks: ExecutorCallbacks,
  resolveEndpointForModel?: ModelEndpointResolver,
  runOptions?: ExecutePipelineOptions,
): Promise<Result<{artifacts: PipelineArtifact[]; nestedSnapshots?: Record<string, StepRunSnapshot>}, PipelineError>> {
  if (step.config.type !== 'capsule-instance') {
    return {ok: false, error: {code: 'invalid_pipeline_graph', message: 'Not a capsule step', nodeId: step.id}};
  }

  const {inputBindings, outputBindings, parameterValues} = step.config;
  const instancePrefix = step.outputNamespace;
  const innerArtifacts: Record<string, PipelineArtifact> = {
    ...parentArtifacts,
  };
  unmapSeededInternalArtifacts(instancePrefix, innerArtifacts);

  for (const [portName, parentKey] of Object.entries(inputBindings)) {
    const parentArtifact = parentArtifacts[parentKey];
    if (!parentArtifact) continue;
    const portRef = portName === 'user_prompt' ? 'user_prompt.xml' : `${portName}.${artifactOutputSuffix(parentKey)}`;
    innerArtifacts[portRef] = {...parentArtifact, name: portRef, stepId: step.id};
    if (portName === 'user_prompt') {
      innerArtifacts['user_prompt.raw'] = {
        ...parentArtifact,
        name: 'user_prompt.raw',
        stepId: step.id,
      };
      innerArtifacts['user_prompt.xml'] = {
        ...parentArtifact,
        name: 'user_prompt.xml',
        stepId: step.id,
      };
    }
  }

  const userPromptRaw = typeof parentArtifacts['user_prompt.raw']?.value === 'string'
    ? parentArtifacts['user_prompt.raw'].value
    : '';

  const resolvedSteps = applyCapsuleModelSlotBindings(capsule.steps!, step.config.modelSlotBindings ?? {});

  const innerPipeline: PipelineDefinition = {
    schemaVersion: 2,
    id: capsule.id,
    name: capsule.name,
    input: capsule.input ?? parentPipeline.input,
    steps: resolvedSteps,
    createdAt: capsule.createdAt,
    updatedAt: capsule.updatedAt,
  };

  const innerCallbacks: ExecutorCallbacks = {
    onTraceEvent(event) {
      outerCallbacks.onTraceEvent(namespaceCapsuleTraceEvent(event, instancePrefix, step.id));
    },
    onArtifact(a) {
      innerArtifacts[a.name] = a;
      const internalKey = capsuleInternalArtifactKey(instancePrefix, a.name);
      const namespaced = {...a, name: internalKey, stepId: step.id};
      innerArtifacts[internalKey] = namespaced;
      outerCallbacks.onArtifact(namespaced);
    },
  };

  const innerStartAtStepId = runOptions?.capsuleInnerStartAtStepId
    && capsule.steps?.some((s) => s.id === runOptions.capsuleInnerStartAtStepId)
    ? runOptions.capsuleInnerStartAtStepId
    : undefined;

  const result = await executeStepChain(
    innerPipeline,
    userPromptRaw,
    {
      seedArtifacts: innerArtifacts,
      ...(runOptions?.abortSignal ? {abortSignal: runOptions.abortSignal} : {}),
      ...(parameterValues && Object.keys(parameterValues).length > 0 ? {params: parameterValues} : {}),
      ...(innerStartAtStepId ? {startAtStepId: innerStartAtStepId} : {}),
    },
    resolveEndpoint,
    innerCallbacks,
    resolveCapsule,
    resolveEndpointForModel,
  );
  if (!result.ok) return {ok: false, error: {...result.error, nodeId: step.id}};

  const publicOutputs: PipelineArtifact[] = [];
  for (const [portName, parentKey] of Object.entries(outputBindings)) {
    const sourceKey = capsule.interface.outputs.find((o) => o.name === portName)?.sourceArtifactKey
      ?? parentKey;
    const internal = innerArtifacts[sourceKey] ?? innerArtifacts[parentKey];
    if (!internal) continue;
    const resolvedParentKey = parentKey.startsWith(`${instancePrefix}.`)
      ? parentKey
      : `${instancePrefix}.${artifactOutputSuffix(sourceKey)}`;
    publicOutputs.push({...internal, name: resolvedParentKey, stepId: step.id});
  }

  if (publicOutputs.length === 0) {
    const last = capsule.steps!.at(-1)!;
    const primaryKey = `${last.outputNamespace}.${last.primaryOutputName}`;
    const internal = innerArtifacts[primaryKey];
    if (internal) {
      const parentKey = outputBindings[portNameForRef(primaryKey)] ?? primaryKey;
      publicOutputs.push({...internal, name: parentKey, stepId: step.id});
    }
  }

  return {
    ok: true,
    value: {
      artifacts: publicOutputs,
      nestedSnapshots: remapCapsuleInnerSnapshots(step.id, instancePrefix, result.value.snapshots),
    },
  };
}

function artifactOutputSuffix(ref: string): string {
  const dot = ref.lastIndexOf('.');
  return dot >= 0 ? ref.slice(dot + 1) : 'text';
}

function portNameForRef(ref: string): string {
  const dot = ref.lastIndexOf('.');
  return dot >= 0 ? ref.slice(0, dot).replace(/-/g, '_') : ref;
}

function applyCapsuleModelSlotBindings(
  steps: PipelineStep[],
  bindings: Record<string, import('@lorca/core').ModelRef>,
): PipelineStep[] {
  return steps.map((s) => {
    if (s.config.type !== 'model-call' || s.config.modelRef.kind !== 'slot') return s;
    const bound = bindings[s.config.modelRef.slotName];
    if (!bound || (bound.kind !== 'fixed' && bound.kind !== 'any-enabled-endpoint')) return s;
    return {
      ...s,
      config: {
        ...s.config,
        modelRef: bound,
      },
    };
  });
}
