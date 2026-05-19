import type {
  PipelineDefinition,
  PipelineRunContext,
  PipelineArtifact,
  PipelineTraceEvent,
  PipelineError,
  PipelineNode,
  ModelCallNode,
  AiEndpointConfig,
  Result,
} from '@lorca/core';
import { MODEL_CALL_TIMEOUT_MS } from '@lorca/core';
import { buildUserPromptArtifacts } from '@lorca/prompt';
import { renderPromptWrapper } from '@lorca/prompt';
import { renderTemplate } from '@lorca/prompt';
import type { ModelCallRequest } from '@lorca/endpoints';
import { executeModelCall } from '@lorca/endpoints';
import { validatePipeline } from './validate.js';
import { topologicalOrder } from './order.js';
import { outputKey, resolveOutputRef } from './artifacts.js';

export type EndpointResolver = (id: string) => AiEndpointConfig | undefined;

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
  return { name, nodeId, kind, value, createdAt: new Date().toISOString() };
}

function traceStarted(runId: string, nodeId: string): PipelineTraceEvent {
  return { runId, nodeId, status: 'started', timestamp: new Date().toISOString() };
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
  return { runId, nodeId, status: 'skipped', timestamp: new Date().toISOString() };
}

export async function executePipeline(
  def: PipelineDefinition,
  ctx: PipelineRunContext,
  resolveEndpoint: EndpointResolver,
  callbacks: ExecutorCallbacks,
): Promise<Result<string, PipelineError>> {
  // Validate first
  const validation = validatePipeline(def);
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
      const cancelErr: PipelineError = { code: 'run_cancelled', message: 'Run was cancelled', nodeId };
      callbacks.onTraceEvent({ runId: ctx.runId, nodeId, status: 'cancelled', timestamp: new Date().toISOString(), error: cancelErr });
      failed = true;
      failError = cancelErr;
      continue;
    }

    const startMs = Date.now();
    callbacks.onTraceEvent(traceStarted(ctx.runId, nodeId));

    const result = await executeNode(node, ctx, resolveEndpoint);

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
    return { ok: false, error: failError };
  }

  const finalKey = resolveOutputRef(def.outputRef, def.nodes);
  if (!finalKey || !(finalKey in ctx.artifacts)) {
    return {
      ok: false,
      error: { code: 'final_output_missing', message: `Final output artifact not found: ${finalKey ?? '(unresolved)'}` },
    };
  }

  return { ok: true, value: finalKey };
}

async function executeNode(
  node: PipelineNode,
  ctx: PipelineRunContext,
  resolveEndpoint: EndpointResolver,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  switch (node.type) {
    case 'input':
      return { ok: true, value: [
        makeArtifact('user_prompt.raw', node.id, 'text', ctx.input.userPromptRaw),
        makeArtifact('user_prompt.xml', node.id, 'text', ctx.input.userPromptXml),
      ]};

    case 'manual-text': {
      const key = outputKey(node, 'text');
      return { ok: true, value: [makeArtifact(key, node.id, 'text', node.text)] };
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
        if (!instrResult.ok) return { ok: false, error: { ...instrResult.error, nodeId: node.id } };
        config = { ...node.config, instructionText: instrResult.value };
      }
      const rendered = renderPromptWrapper(config, inputText);
      const key = outputKey(node, 'text');
      return { ok: true, value: [makeArtifact(key, node.id, 'text', rendered)] };
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
      if (!renderResult.ok) return { ok: false, error: { ...renderResult.error, nodeId: node.id } };
      const key = outputKey(node, 'text');
      return { ok: true, value: [makeArtifact(key, node.id, 'text', renderResult.value)] };
    }

    case 'json-extract': {
      const source = ctx.artifacts[node.inputArtifactRef];
      if (!source) {
        return { ok: false, error: { code: 'missing_artifact', message: `Artifact not found: ${node.inputArtifactRef}`, nodeId: node.id } };
      }
      const text = typeof source.value === 'string' ? source.value : JSON.stringify(source.value);
      const parsed = tryParseJson(text);
      if (parsed === null) {
        return { ok: false, error: { code: 'json_parse_failed', message: `Could not extract JSON from artifact: ${node.inputArtifactRef}`, nodeId: node.id } };
      }
      const key = outputKey(node, 'json');
      return { ok: true, value: [makeArtifact(key, node.id, 'json', parsed)] };
    }

    case 'model-call':
      return executeModelCallNode(node, ctx, resolveEndpoint);

    case 'capsule-instance':
      return { ok: false, error: { code: 'missing_capsule', message: 'CapsuleInstanceNode execution is not yet implemented (Phase 8)', nodeId: node.id } };
  }
}

async function executeModelCallNode(
  node: ModelCallNode,
  ctx: PipelineRunContext,
  resolveEndpoint: EndpointResolver,
): Promise<Result<PipelineArtifact[], PipelineError>> {
  const { modelRef, mode, systemPrompt, inputArtifactRef, temperature, topP, maxTokens, expectedOutput } = node.config;

  if (modelRef.kind === 'slot') {
    return { ok: false, error: { code: 'invalid_capsule_interface', message: `ModelRef kind 'slot' is only valid inside a Capsule`, nodeId: node.id } };
  }

  const endpointConfig = resolveEndpoint(modelRef.endpointId);
  if (!endpointConfig) {
    return { ok: false, error: { code: 'missing_endpoint', message: `Endpoint not found: ${modelRef.endpointId}`, nodeId: node.id } };
  }

  const inputArtifact = ctx.artifacts[inputArtifactRef];
  if (!inputArtifact) {
    return { ok: false, error: { code: 'missing_artifact', message: `Input artifact not found: ${inputArtifactRef}`, nodeId: node.id } };
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
    endpointId: modelRef.endpointId,
    modelName: modelRef.modelName,
    userContent,
    abortSignal: signal,
    ...(systemPrompt !== undefined && { systemPrompt }),
    ...(temperature !== undefined && { temperature }),
    ...(topP !== undefined && { topP }),
    ...(maxTokens !== undefined && { maxTokens }),
  };

  const callResult = await executeModelCall(endpointConfig, request);
  if (!callResult.ok) {
    return { ok: false, error: { ...callResult.error, nodeId: node.id } };
  }

  const artifacts: PipelineArtifact[] = [
    makeArtifact(outputKey(node, 'text'), node.id, 'text', callResult.value.text),
    makeArtifact(outputKey(node, 'rawResponse'), node.id, 'model-response', callResult.value.rawResponse),
  ];

  if (expectedOutput === 'json') {
    const parsed = tryParseJson(callResult.value.text);
    if (parsed !== null) {
      artifacts.push(makeArtifact(outputKey(node, 'parsedJson'), node.id, 'json', parsed));
    }
  }

  return { ok: true, value: artifacts };
}

function tryParseJson(text: string): unknown | null {
  // Strategy 1: strict JSON parse
  try { return JSON.parse(text); } catch { /* fall through */ }

  // Strategy 2: fenced code block extraction
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]+?)\n?```/);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }

  // Strategy 3: first complete object or array
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch { /* fall through */ } }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch { /* fall through */ } }

  return null;
}
