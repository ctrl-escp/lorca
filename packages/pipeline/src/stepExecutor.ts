import type {
  PipelineDefinition,
  PipelineStep,
  PipelineArtifact,
  PipelineTraceEvent,
  PipelineError,
  CapsuleDefinition,
  AiEndpointConfig,
  Result,
  CapsuleInstanceNode,
} from '@lorca/core';
import {MODEL_CALL_TIMEOUT_MS} from '@lorca/core';
import {renderPromptComposition, renderTemplate} from '@lorca/prompt';
import type {ResolvedHistoryRead} from '@lorca/prompt';
import type {ModelCallRequest} from '@lorca/endpoints';
import {executeModelCall} from '@lorca/endpoints';
import {compileStepChainToExecutionPlan} from './chainCompiler.js';
import type {ExecutePipelineOptions, CompiledExecutionStep} from './chainCompiler.js';
import {executePipeline} from './executor.js';

export type EndpointResolver = (id: string) => AiEndpointConfig | undefined;
export type CapsuleResolver = (id: string, version: string) => CapsuleDefinition | undefined;

export interface ExecutorCallbacks {
  onTraceEvent(event: PipelineTraceEvent): void;
  onArtifact(artifact: PipelineArtifact): void;
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
  return {runId, nodeId: stepId, status, timestamp: new Date().toISOString(), ...extra};
}

function tryParseJson(text: string): unknown | null {
  const stripped = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try { return JSON.parse(stripped); } catch { /* ignore */ }
  try { return JSON.parse(text); } catch { return null; }
}

export async function executeStepChain(
  pipeline: PipelineDefinition,
  userPromptRaw: string,
  options: ExecutePipelineOptions,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
  resolveCapsule?: CapsuleResolver,
): Promise<Result<string, PipelineError>> {
  const plan = compileStepChainToExecutionPlan(pipeline, options);

  // Build initial artifact store with user prompt
  const {buildUserPromptArtifacts} = await import('@lorca/prompt');
  const {raw, xml} = buildUserPromptArtifacts(userPromptRaw);
  const artifacts: Record<string, PipelineArtifact> = {
    'user_prompt.raw': makeArtifact('user_prompt.raw', 'pipeline-input', 'text', raw),
    'user_prompt.xml': makeArtifact('user_prompt.xml', 'pipeline-input', 'text', xml),
  };

  const stepMap = new Map(pipeline.steps.map((s) => [s.id, s]));

  let failed = false;
  let failError: PipelineError | null = null;

  const abortSignal = options.abortSignal;
  const runId = `run-${pipeline.id.slice(0, 8)}`;

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

    callbacks.onTraceEvent(traceEvent(runId, step.id, 'started'));
    const startMs = Date.now();

    const result = await executeStep(step, compiledStep, artifacts, resolveEndpoint, resolveCapsule, pipeline, abortSignal);

    if (!result.ok) {
      callbacks.onTraceEvent(traceEvent(runId, step.id, 'failed', {durationMs: Date.now() - startMs, error: result.error}));
      failed = true;
      failError = result.error;
      continue;
    }

    const produced: string[] = [];
    for (const artifact of result.value) {
      artifacts[artifact.name] = artifact;
      callbacks.onArtifact(artifact);
      produced.push(artifact.name);
    }
    callbacks.onTraceEvent(traceEvent(runId, step.id, 'completed', {durationMs: Date.now() - startMs, outputArtifactNames: produced}));
  }

  if (failed && failError) return {ok: false, error: failError};

  // Determine final output key
  const lastCompiledStep = plan.steps.at(-1);
  if (!lastCompiledStep) {
    return {ok: false, error: {code: 'final_output_missing', message: 'No steps executed'}};
  }
  const lastStep = stepMap.get(lastCompiledStep.stepId)!;

  // Use outputStepId if set, otherwise use the last step
  let finalStepId = lastStep.id;
  if (pipeline.outputStepId) {
    const outputStep = stepMap.get(pipeline.outputStepId);
    if (outputStep) finalStepId = outputStep.id;
  }
  const finalStep = stepMap.get(finalStepId) ?? lastStep;
  const finalKey = `${finalStep.outputNamespace}.${finalStep.primaryOutputName}`;

  if (!(finalKey in artifacts)) {
    return {ok: false, error: {code: 'final_output_missing', message: `Final output artifact not found: ${finalKey}`}};
  }

  return {ok: true, value: finalKey};
}

async function executeStep(
  step: PipelineStep,
  compiledStep: CompiledExecutionStep,
  artifacts: Record<string, PipelineArtifact>,
  resolveEndpoint: EndpointResolver,
  resolveCapsule: CapsuleResolver | undefined,
  pipeline: PipelineDefinition,
  abortSignal?: AbortSignal,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  const {config} = step;

  switch (config.type) {
    case 'manual-text': {
      const key = `${step.outputNamespace}.text`;
      return {ok: true, value: [makeArtifact(key, step.id, 'text', config.text)]};
    }

    case 'template': {
      const artifactValues: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(artifacts)) artifactValues[k] = v.value;
      const renderResult = renderTemplate(config.template, {artifacts: artifactValues, allowParams: false});
      if (!renderResult.ok) return {ok: false, error: {...renderResult.error, nodeId: step.id}};
      const key = `${step.outputNamespace}.text`;
      return {ok: true, value: [makeArtifact(key, step.id, 'text', renderResult.value)]};
    }

    case 'json-extract': {
      const source = artifacts[config.sourceArtifactRef];
      if (!source) {
        return {ok: false, error: {code: 'missing_artifact', message: `Artifact not found: ${config.sourceArtifactRef}`, nodeId: step.id}};
      }
      const text = typeof source.value === 'string' ? source.value : JSON.stringify(source.value);
      const parsed = tryParseJson(text);
      if (parsed === null) {
        return {ok: false, error: {code: 'json_parse_failed', message: `Could not extract JSON from: ${config.sourceArtifactRef}`, nodeId: step.id}};
      }
      const key = `${step.outputNamespace}.json`;
      return {ok: true, value: [makeArtifact(key, step.id, 'json', parsed)]};
    }

    case 'prompt-wrapper':
    case 'model-call': {
      return executePromptStep(step, compiledStep, artifacts, resolveEndpoint, abortSignal);
    }

    case 'capsule-instance': {
      return executeCapsuleStep(step, artifacts, resolveEndpoint, resolveCapsule, pipeline);
    }

    case 'loop-group': {
      return {ok: false, error: {code: 'invalid_pipeline_graph', message: 'loop-group steps require the native loop executor (Phase 5a)', nodeId: step.id}};
    }

    default: {
      const _exhaustive: never = config;
      return {ok: false, error: {code: 'invalid_pipeline_graph', message: `Unknown step type: ${String((_exhaustive as {type: string}).type)}`, nodeId: step.id}};
    }
  }
}

async function executePromptStep(
  step: PipelineStep,
  compiledStep: CompiledExecutionStep,
  artifacts: Record<string, PipelineArtifact>,
  resolveEndpoint: EndpointResolver,
  abortSignal?: AbortSignal,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  const {config} = step;

  // Resolve previous output value
  const prevArtifact = compiledStep.previousOutputArtifactRef
    ? artifacts[compiledStep.previousOutputArtifactRef]
    : artifacts['user_prompt.xml'];
  const prevValue = prevArtifact
    ? (typeof prevArtifact.value === 'string' ? prevArtifact.value : JSON.stringify(prevArtifact.value))
    : undefined;

  // Resolve history read artifacts
  const resolvedHistory: ResolvedHistoryRead[] = [];
  for (const read of compiledStep.historyReads ?? []) {
    const artifact = artifacts[read.sourceArtifactRef];
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
      continue;
    }
    const value = typeof artifact.value === 'string' ? artifact.value : JSON.stringify(artifact.value);
    resolvedHistory.push({sourceArtifactRef: read.sourceArtifactRef, value});
  }

  // Render prompt composition
  const renderedPrompt = step.prompt
    ? renderPromptComposition(step.prompt, prevValue, resolvedHistory)
    : {blocks: [], xmlText: prevValue ?? ''};

  const key = `${step.outputNamespace}.text`;

  if (config.type === 'prompt-wrapper') {
    // prompt-wrapper just produces the rendered XML as its text output
    return {ok: true, value: [makeArtifact(key, step.id, 'text', renderedPrompt.xmlText)]};
  }

  // config is now narrowed to model-call
  if (config.type !== 'model-call') {
    return {ok: false, error: {code: 'unknown_error', message: `Unexpected step type in executePromptStep: ${String((config as {type: string}).type)}`, nodeId: step.id}};
  }

  if (config.modelRef.kind === 'slot') {
    return {ok: false, error: {code: 'invalid_capsule_interface', message: "ModelRef kind 'slot' is only valid inside a Capsule", nodeId: step.id}};
  }

  const endpointConfig = resolveEndpoint(config.modelRef.endpointId);
  if (!endpointConfig) {
    return {ok: false, error: {code: 'missing_endpoint', message: `Endpoint not found: ${config.modelRef.endpointId}`, nodeId: step.id}};
  }

  const timeoutSignal = AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS);
  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutSignal])
    : timeoutSignal;

  const request: ModelCallRequest = {
    mode: config.mode,
    endpointId: config.modelRef.endpointId,
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

  // Opportunistic JSON parse
  const parsed = tryParseJson(callResult.value.text);
  if (parsed !== null) {
    produced.push(makeArtifact(`${step.outputNamespace}.parsedJson`, step.id, 'json', parsed));
  }

  return {ok: true, value: produced};
}

async function executeCapsuleStep(
  step: PipelineStep,
  artifacts: Record<string, PipelineArtifact>,
  resolveEndpoint: EndpointResolver,
  resolveCapsule: CapsuleResolver | undefined,
  pipeline: PipelineDefinition,
): Promise<Result<PipelineArtifact[], PipelineError>> {
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

  // Convert V2 step config to V1 CapsuleInstanceNode for delegation to legacy capsule executor
  const modelSlotAssignments: Record<string, {endpointId: string; modelName: string}> = {};
  for (const [slotName, ref] of Object.entries(modelSlotBindings ?? {})) {
    if (ref.kind === 'fixed') {
      modelSlotAssignments[slotName] = {endpointId: ref.endpointId, modelName: ref.modelName};
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

  // Build a synthetic legacy pipeline just for this capsule instance and delegate
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

  // Use legacy executePipeline to run the capsule's internal graph
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

  const result = await executePipeline(legacyDef, ctx, resolveEndpoint, collectedCallbacks, resolveCapsule);
  if (!result.ok) return {ok: false, error: {...result.error, nodeId: step.id}};

  return {ok: true, value: produced};
}
