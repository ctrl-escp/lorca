import type {
  LegacyPipelineDefinition,
  PipelineRunContext,
  PipelineArtifact,
  PipelineTraceEvent,
  PipelineError,
  PipelineNode,
  ModelCallNode,
  CapsuleInstanceNode,
  CapsuleDefinition,
  AiEndpointConfig,
  Result,
} from '@lorca/core';
import {MODEL_CALL_TIMEOUT_MS, CAPSULE_LOOP_MAX_COUNT} from '@lorca/core';
import {renderPromptWrapper, renderTemplate} from '@lorca/prompt';
import type {ModelCallRequest} from '@lorca/endpoints';
import {executeModelCall} from '@lorca/endpoints';
import {validateLegacyPipeline} from './validate.js';
import {topologicalOrder} from './order.js';
import {outputKey, resolveOutputRef} from './artifacts.js';

export type EndpointResolver = (id: string) => AiEndpointConfig | undefined;
export type ModelEndpointResolver = (modelName: string) => AiEndpointConfig | undefined;
export type CapsuleResolver = (id: string, version: string) => CapsuleDefinition | undefined;

export interface ExecutorCallbacks {
  onTraceEvent(event: PipelineTraceEvent): void;
  onArtifact(artifact: PipelineArtifact): void;
}

function makeArtifact(
  name: string,
  nodeId: string,
  kind: PipelineArtifact['kind'],
  value: unknown,
): PipelineArtifact {
  return {name, nodeId, kind, value, createdAt: new Date().toISOString()};
}

function traceStarted(runId: string, nodeId: string): PipelineTraceEvent {
  return {runId, nodeId, status: 'started', timestamp: new Date().toISOString()};
}

function traceCompleted(
  runId: string,
  nodeId: string,
  startMs: number,
  outputArtifactNames: string[],
): PipelineTraceEvent {
  return {
    runId,
    nodeId,
    status: 'completed',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    outputArtifactNames,
  };
}

function traceFailed(
  runId: string,
  nodeId: string,
  startMs: number,
  error: PipelineError,
): PipelineTraceEvent {
  return {
    runId,
    nodeId,
    status: 'failed',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    error,
  };
}

function traceSkipped(runId: string, nodeId: string): PipelineTraceEvent {
  return {runId, nodeId, status: 'skipped', timestamp: new Date().toISOString()};
}

export async function executePipeline(
  def: LegacyPipelineDefinition,
  ctx: PipelineRunContext,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
  resolveCapsule?: CapsuleResolver,
  resolveEndpointForModel?: ModelEndpointResolver,
): Promise<Result<string, PipelineError>> {
  // Validate first
  const validation = validateLegacyPipeline(def);
  if (!validation.ok) return validation;

  const order = topologicalOrder(def);
  const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
  let failed = false;
  let failError: PipelineError | null = null;

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)!;

    if (failed) {
      callbacks.onTraceEvent(traceSkipped(ctx.runId, nodeId));
      continue;
    }

    if (ctx.abortSignal?.aborted) {
      const cancelErr: PipelineError = {code: 'run_cancelled', message: 'Run was cancelled', nodeId};
      callbacks.onTraceEvent({runId: ctx.runId, nodeId, status: 'cancelled', timestamp: new Date().toISOString(), error: cancelErr});
      failed = true;
      failError = cancelErr;
      continue;
    }

    const startMs = Date.now();
    callbacks.onTraceEvent(traceStarted(ctx.runId, nodeId));

    const result = await executeNode(node, ctx, resolveEndpoint, callbacks, resolveCapsule, resolveEndpointForModel);

    if (!result.ok) {
      callbacks.onTraceEvent(traceFailed(ctx.runId, nodeId, startMs, result.error));
      failed = true;
      failError = result.error;
      continue;
    }

    const produced: string[] = [];
    for (const artifact of result.value) {
      ctx.artifacts[artifact.name] = artifact;
      callbacks.onArtifact(artifact);
      produced.push(artifact.name);
    }
    callbacks.onTraceEvent(traceCompleted(ctx.runId, nodeId, startMs, produced));
  }

  if (failed && failError) {
    return {ok: false, error: failError};
  }

  const finalKey = resolveOutputRef(def.outputRef, def.nodes);
  if (!finalKey || !(finalKey in ctx.artifacts)) {
    return {
      ok: false,
      error: {code: 'final_output_missing', message: `Final output artifact not found: ${finalKey ?? '(unresolved)'}`},
    };
  }

  return {ok: true, value: finalKey};
}

async function executeNode(
  node: PipelineNode,
  ctx: PipelineRunContext,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
  resolveCapsule?: CapsuleResolver,
  resolveEndpointForModel?: ModelEndpointResolver,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  switch (node.type) {
    case 'input':
      return {ok: true, value: [
        makeArtifact('user_prompt.raw', node.id, 'text', ctx.input.userPromptRaw),
        makeArtifact('user_prompt.xml', node.id, 'text', ctx.input.userPromptXml),
      ]};

    case 'manual-text': {
      const key = outputKey(node, 'text');
      return {ok: true, value: [makeArtifact(key, node.id, 'text', node.text)]};
    }

    case 'prompt-wrapper': {
      const inputArtifact = ctx.artifacts[node.config.inputArtifactRef ?? 'user_prompt.xml'] ?? ctx.artifacts['user_prompt.xml'];
      const inputText = typeof inputArtifact?.value === 'string' ? inputArtifact.value : '';
      let config = node.config;
      if (ctx.params !== undefined) {
        const instrResult = renderTemplate(node.config.instructionText, {
          artifacts: {},
          allowParams: true,
          params: ctx.params,
        });
        if (!instrResult.ok) return {ok: false, error: {...instrResult.error, nodeId: node.id}};
        config = {...node.config, instructionText: instrResult.value};
      }
      const rendered = renderPromptWrapper(config, inputText);
      const key = outputKey(node, 'text');
      return {ok: true, value: [makeArtifact(key, node.id, 'text', rendered)]};
    }

    case 'template': {
      const artifactValues: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(ctx.artifacts)) {
        artifactValues[k] = v.value;
      }
      const renderResult = renderTemplate(node.template, {
        artifacts: artifactValues,
        allowParams: ctx.params !== undefined,
        ...(ctx.params !== undefined && {params: ctx.params}),
      });
      if (!renderResult.ok) return {ok: false, error: {...renderResult.error, nodeId: node.id}};
      const key = outputKey(node, 'text');
      return {ok: true, value: [makeArtifact(key, node.id, 'text', renderResult.value)]};
    }

    case 'json-extract': {
      const source = ctx.artifacts[node.inputArtifactRef];
      if (!source) {
        return {ok: false, error: {code: 'missing_artifact', message: `Artifact not found: ${node.inputArtifactRef}`, nodeId: node.id}};
      }
      const text = typeof source.value === 'string' ? source.value : JSON.stringify(source.value);
      const parseResult = tryParseJson(text);
      if (!parseResult.ok) {
        return {ok: false, error: {code: 'json_parse_failed', message: `Could not extract JSON from artifact: ${node.inputArtifactRef}`, nodeId: node.id}};
      }
      const key = outputKey(node, 'json');
      return {ok: true, value: [makeArtifact(key, node.id, 'json', parseResult.value)]};
    }

    case 'model-call':
      return executeModelCallNode(node, ctx, resolveEndpoint, resolveEndpointForModel);

    case 'capsule-instance':
      return executeCapsuleInstance(node, ctx, resolveEndpoint, callbacks, resolveCapsule, resolveEndpointForModel);
    default: {
      const _exhaustive: never = node;
      throw new Error(`Unknown node type: ${String(_exhaustive)}`);
    }
  }
}

async function executeModelCallNode(
  node: ModelCallNode,
  ctx: PipelineRunContext,
  resolveEndpoint: EndpointResolver,
  resolveEndpointForModel?: ModelEndpointResolver,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  const {modelRef, mode, systemPrompt, inputArtifactRef, temperature, topP, maxTokens, expectedOutput} = node.config;

  if (modelRef.kind === 'slot') {
    return {ok: false, error: {code: 'invalid_capsule_interface', message: 'ModelRef kind \'slot\' is only valid inside a Capsule', nodeId: node.id}};
  }

  const endpointConfig = modelRef.kind === 'any-enabled-endpoint'
    ? resolveEndpointForModel?.(modelRef.modelName)
    : resolveEndpoint(modelRef.endpointId);
  if (!endpointConfig) {
    const message = modelRef.kind === 'any-enabled-endpoint'
      ? `No enabled endpoint has model: ${modelRef.modelName}`
      : `Endpoint not found: ${modelRef.endpointId}`;
    return {ok: false, error: {code: 'missing_endpoint', message, nodeId: node.id}};
  }

  const inputArtifact = ctx.artifacts[inputArtifactRef];
  if (!inputArtifact) {
    return {ok: false, error: {code: 'missing_artifact', message: `Input artifact not found: ${inputArtifactRef}`, nodeId: node.id}};
  }

  const userContent = typeof inputArtifact.value === 'string'
    ? inputArtifact.value
    : JSON.stringify(inputArtifact.value);

  // Combine user abort signal with model call timeout
  const timeoutSignal = AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS);
  const signal = ctx.abortSignal
    ? AbortSignal.any([ctx.abortSignal, timeoutSignal])
    : timeoutSignal;

  const request: ModelCallRequest = {
    mode,
    endpointId: endpointConfig.id,
    modelName: modelRef.modelName,
    userContent,
    abortSignal: signal,
    ...(systemPrompt !== undefined && {systemPrompt}),
    ...(temperature !== undefined && {temperature}),
    ...(topP !== undefined && {topP}),
    ...(maxTokens !== undefined && {maxTokens}),
  };

  const callResult = await executeModelCall(endpointConfig, request);
  if (!callResult.ok) {
    return {ok: false, error: {...callResult.error, nodeId: node.id}};
  }

  const artifacts: PipelineArtifact[] = [
    makeArtifact(outputKey(node, 'text'), node.id, 'text', callResult.value.text),
    makeArtifact(outputKey(node, 'rawResponse'), node.id, 'model-response', callResult.value.rawResponse),
  ];

  if (expectedOutput === 'json') {
    const parseResult = tryParseJson(callResult.value.text);
    if (parseResult.ok) {
      artifacts.push(makeArtifact(outputKey(node, 'parsedJson'), node.id, 'json', parseResult.value));
      artifacts.push(makeArtifact(outputKey(node, 'json'), node.id, 'json', parseResult.value));
    }
  }

  return {ok: true, value: artifacts};
}

async function executeCapsuleInstance(
  node: CapsuleInstanceNode,
  ctx: PipelineRunContext,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
  resolveCapsule?: CapsuleResolver,
  resolveEndpointForModel?: ModelEndpointResolver,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  if (!resolveCapsule) {
    return {ok: false, error: {code: 'missing_capsule', message: 'No capsule resolver provided', nodeId: node.id}};
  }

  const {capsuleDefinitionId, capsuleVersion, inputBindings, outputBindings, parameterValues, modelSlotAssignments} = node.config;
  const instancePrefix = node.artifactPrefix ?? node.id;

  const capsule = resolveCapsule(capsuleDefinitionId, capsuleVersion);
  if (!capsule) {
    return {ok: false, error: {code: 'missing_capsule', message: `Capsule not found: ${capsuleDefinitionId} ${capsuleVersion}`, nodeId: node.id}};
  }

  const resolvedNodes = resolveCapsuleSlots(capsule.nodes ?? [], modelSlotAssignments);

  if (node.config.loop?.enabled) {
    return executeCapsuleInstanceLooped(node, capsule, resolvedNodes, ctx, resolveEndpoint, callbacks, resolveCapsule, resolveEndpointForModel);
  }

  // Pre-seed internal artifacts from parent via inputBindings
  const internalArtifacts: Record<string, PipelineArtifact> = {};
  for (const port of capsule.interface.inputs) {
    const parentKey = inputBindings[port.name] ?? `${instancePrefix}.${port.name}`;
    const parentArtifact = ctx.artifacts[parentKey];
    if (parentArtifact) {
      internalArtifacts[port.name] = {...parentArtifact, name: port.name};
    }
  }

  const internalCtx: PipelineRunContext = {
    runId: ctx.runId,
    pipelineId: capsule.id,
    startedAt: new Date().toISOString(),
    ...(ctx.abortSignal !== undefined && {abortSignal: ctx.abortSignal}),
    input: ctx.input,
    artifacts: internalArtifacts,
    trace: [],
    ...(Object.keys(parameterValues).length > 0 && {params: parameterValues}),
  };

  const order = topologicalOrder({
    schemaVersion: 1,
    id: capsule.id,
    name: capsule.name,
    inputArtifactName: 'user_prompt',
    nodes: resolvedNodes,
    edges: capsule.edges ?? [],
    outputRef: capsule.outputRef ?? {nodeId: '', outputName: 'text'},
    createdAt: capsule.createdAt,
    updatedAt: capsule.updatedAt,
  });

  const nodeMap = new Map(resolvedNodes.map((n) => [n.id, n]));
  let failed = false;
  let failError: PipelineError | null = null;

  for (const nodeId of order) {
    const n = nodeMap.get(nodeId)!;

    if (failed) {
      callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, status: 'skipped', timestamp: new Date().toISOString()});
      continue;
    }

    if (ctx.abortSignal?.aborted) {
      const cancelErr: PipelineError = {code: 'run_cancelled', message: 'Run was cancelled', nodeId, capsuleInstanceId: node.id};
      callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, status: 'cancelled', timestamp: new Date().toISOString(), error: cancelErr});
      failed = true;
      failError = cancelErr;
      continue;
    }

    const startMs = Date.now();
    callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, status: 'started', timestamp: new Date().toISOString()});

    const result = await executeNode(n, internalCtx, resolveEndpoint, callbacks, resolveCapsule, resolveEndpointForModel);

    if (!result.ok) {
      const nodeErr: PipelineError = {...result.error, capsuleInstanceId: node.id};
      callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, status: 'failed', timestamp: new Date().toISOString(), durationMs: Date.now() - startMs, error: nodeErr});
      failed = true;
      failError = nodeErr;
      continue;
    }

    const produced: string[] = [];
    for (const artifact of result.value) {
      internalCtx.artifacts[artifact.name] = artifact;
      // Store internal artifacts in parent with namespaced key for trace inspection
      const internalKey = `${instancePrefix}.internal.${artifact.name}`;
      const internalArtifact = {...artifact, name: internalKey};
      ctx.artifacts[internalKey] = internalArtifact;
      callbacks.onArtifact(internalArtifact);
      produced.push(internalKey);
    }
    callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, status: 'completed', timestamp: new Date().toISOString(), durationMs: Date.now() - startMs, outputArtifactNames: produced});
  }

  if (failed && failError) {
    return {ok: false, error: {...failError, nodeId: node.id}};
  }

  // Copy declared public output ports to parent store
  const publicOutputs: PipelineArtifact[] = [];
  for (const port of capsule.interface.outputs) {
    const sourceKey = port.sourceArtifactKey ?? resolveOutputRef(capsule.outputRef, resolvedNodes) ?? port.name;
    const internalArtifact = internalCtx.artifacts[sourceKey];
    if (!internalArtifact) continue;
    const parentKey = outputBindings[port.name] ?? `${instancePrefix}.${port.name}`;
    publicOutputs.push({...internalArtifact, name: parentKey});
  }

  // If no output ports declared, expose the primary capsule output
  if (capsule.interface.outputs.length === 0) {
    const primaryKey = resolveOutputRef(capsule.outputRef, resolvedNodes);
    if (primaryKey) {
      const internalArtifact = internalCtx.artifacts[primaryKey];
      if (internalArtifact) {
        const portName = capsule.outputRef?.outputName ?? 'text';
        const parentKey = outputBindings[portName] ?? `${instancePrefix}.${portName}`;
        publicOutputs.push({...internalArtifact, name: parentKey});
      }
    }
  }

  return {ok: true, value: publicOutputs};
}

async function executeCapsuleInstanceLooped(
  node: CapsuleInstanceNode,
  capsule: CapsuleDefinition,
  resolvedNodes: PipelineNode[],
  ctx: PipelineRunContext,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
  resolveCapsule: CapsuleResolver | undefined,
  resolveEndpointForModel?: ModelEndpointResolver,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  const {inputBindings, outputBindings, parameterValues} = node.config;
  const loop = node.config.loop!;
  const instancePrefix = node.artifactPrefix ?? node.id;
  const count = loop.count;

  if (count < 1 || count > CAPSULE_LOOP_MAX_COUNT) {
    return {ok: false, error: {code: 'capsule_loop_limit_exceeded', message: `Loop count ${count} must be between 1 and ${CAPSULE_LOOP_MAX_COUNT}`, nodeId: node.id}};
  }

  const syntheticDef = {
    schemaVersion: 1 as const,
    id: capsule.id, name: capsule.name, inputArtifactName: 'user_prompt',
    nodes: resolvedNodes, edges: capsule.edges ?? [], outputRef: capsule.outputRef ?? {nodeId: '', outputName: 'text'},
    createdAt: capsule.createdAt, updatedAt: capsule.updatedAt,
  };
  const order = topologicalOrder(syntheticDef);
  const nodeMap = new Map(resolvedNodes.map((n) => [n.id, n]));

  let previousCarriedArtifact: PipelineArtifact | null = null;
  const lastIterationPublicOutputs: PipelineArtifact[] = [];

  for (let iteration = 1; iteration <= count; iteration++) {
    // Seed artifacts for this iteration
    const internalArtifacts: Record<string, PipelineArtifact> = {};
    for (const port of capsule.interface.inputs) {
      if (port.name === loop.carriedInputName && iteration > 1 && previousCarriedArtifact) {
        internalArtifacts[port.name] = {...previousCarriedArtifact, name: port.name};
      } else {
        const parentKey = inputBindings[port.name] ?? `${instancePrefix}.${port.name}`;
        const parentArtifact = ctx.artifacts[parentKey];
        if (parentArtifact) internalArtifacts[port.name] = {...parentArtifact, name: port.name};
      }
    }

    const internalCtx: PipelineRunContext = {
      runId: ctx.runId, pipelineId: capsule.id, startedAt: new Date().toISOString(),
      ...(ctx.abortSignal !== undefined && {abortSignal: ctx.abortSignal}),
      input: ctx.input, artifacts: internalArtifacts, trace: [],
      ...(Object.keys(parameterValues).length > 0 && {params: parameterValues}),
    };

    let failed = false;
    let failError: PipelineError | null = null;

    for (const nodeId of order) {
      const n = nodeMap.get(nodeId)!;

      if (failed) {
        callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, capsuleIteration: iteration, status: 'skipped', timestamp: new Date().toISOString()});
        continue;
      }
      if (ctx.abortSignal?.aborted) {
        const cancelErr: PipelineError = {code: 'run_cancelled', message: 'Run was cancelled', nodeId, capsuleInstanceId: node.id};
        callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, capsuleIteration: iteration, status: 'cancelled', timestamp: new Date().toISOString(), error: cancelErr});
        failed = true; failError = cancelErr; continue;
      }

      const startMs = Date.now();
      callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, capsuleIteration: iteration, status: 'started', timestamp: new Date().toISOString()});

      const result = await executeNode(n, internalCtx, resolveEndpoint, callbacks, resolveCapsule, resolveEndpointForModel);
      if (!result.ok) {
        const nodeErr: PipelineError = {...result.error, capsuleInstanceId: node.id};
        callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, capsuleIteration: iteration, status: 'failed', timestamp: new Date().toISOString(), durationMs: Date.now() - startMs, error: nodeErr});
        failed = true; failError = nodeErr; continue;
      }

      const produced: string[] = [];
      for (const artifact of result.value) {
        internalCtx.artifacts[artifact.name] = artifact;
        const iterInternalKey = `${instancePrefix}.iteration_${iteration}.internal.${artifact.name}`;
        const iterInternal = {...artifact, name: iterInternalKey};
        ctx.artifacts[iterInternalKey] = iterInternal;
        callbacks.onArtifact(iterInternal);
        produced.push(iterInternalKey);
      }
      callbacks.onTraceEvent({runId: ctx.runId, nodeId, capsuleInstanceId: node.id, capsuleIteration: iteration, status: 'completed', timestamp: new Date().toISOString(), durationMs: Date.now() - startMs, outputArtifactNames: produced});
    }

    if (failed && failError) {
      return {ok: false, error: {...failError, nodeId: node.id, iteration}};
    }

    // Determine carried output for next iteration and public iteration outputs
    const primaryKey = resolveOutputRef(capsule.outputRef, resolvedNodes);
    lastIterationPublicOutputs.length = 0;

    for (const port of capsule.interface.outputs) {
      const sourceKey = port.sourceArtifactKey ?? primaryKey ?? port.name;
      const artifact = internalCtx.artifacts[sourceKey];
      if (!artifact) continue;
      const iterKey = `${instancePrefix}.iteration_${iteration}.${port.name}`;
      const iterArtifact = {...artifact, name: iterKey};
      ctx.artifacts[iterKey] = iterArtifact;
      callbacks.onArtifact(iterArtifact);
      lastIterationPublicOutputs.push(iterArtifact);
      if (port.name === loop.carriedOutputName) previousCarriedArtifact = artifact;
    }

    // No declared outputs — use capsule's primary outputRef
    if (capsule.interface.outputs.length === 0 && primaryKey) {
      const artifact = internalCtx.artifacts[primaryKey];
      if (artifact) {
        const portName = capsule.outputRef?.outputName ?? 'text';
        const iterKey = `${instancePrefix}.iteration_${iteration}.${portName}`;
        const iterArtifact = {...artifact, name: iterKey};
        ctx.artifacts[iterKey] = iterArtifact;
        callbacks.onArtifact(iterArtifact);
        lastIterationPublicOutputs.push(iterArtifact);
        if (portName === loop.carriedOutputName || !previousCarriedArtifact) {
          previousCarriedArtifact = artifact;
        }
      }
    }
  }

  // Create .final.* artifacts from last iteration
  const finalOutputs: PipelineArtifact[] = [];
  for (const iterArtifact of lastIterationPublicOutputs) {
    const portName = iterArtifact.name.replace(`${instancePrefix}.iteration_${count}.`, '');
    const finalKey = `${instancePrefix}.final.${portName}`;
    const finalArtifact = {...iterArtifact, name: finalKey};
    ctx.artifacts[finalKey] = finalArtifact;
    callbacks.onArtifact(finalArtifact);
    finalOutputs.push(finalArtifact);

    const binding = outputBindings[portName];
    if (binding) {
      const boundArtifact = {...finalArtifact, name: binding};
      ctx.artifacts[binding] = boundArtifact;
      callbacks.onArtifact(boundArtifact);
      finalOutputs.push(boundArtifact);
    }
  }

  return {ok: true, value: finalOutputs};
}

function resolveCapsuleSlots(
  nodes: PipelineNode[],
  assignments: Record<string, {endpointId: string; modelName: string}>,
): PipelineNode[] {
  return nodes.map((node) => {
    if (node.type !== 'model-call') return node;
    const {modelRef} = node.config;
    if (modelRef.kind !== 'slot') return node;
    const assignment = assignments[modelRef.slotName];
    if (!assignment) return node;
    return {
      ...node,
      config: {
        ...node.config,
        modelRef: {kind: 'fixed' as const, endpointId: assignment.endpointId, modelName: assignment.modelName},
      },
    };
  });
}

type ParseResult = {ok: true; value: unknown} | {ok: false};

function tryParseJson(text: string): ParseResult {
  // Strategy 1: strict JSON parse
  try { return {ok: true, value: JSON.parse(text)}; } catch { /* fall through */ }

  // Strategy 2: fenced code block extraction
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/);
  if (fenced?.[1]) {
    try { return {ok: true, value: JSON.parse(fenced[1])}; } catch { /* fall through */ }
  }

  // Strategy 3: first complete object or array
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return {ok: true, value: JSON.parse(objMatch[0])}; } catch { /* fall through */ } }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return {ok: true, value: JSON.parse(arrMatch[0])}; } catch { /* fall through */ } }

  return {ok: false};
}
