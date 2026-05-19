import type { AiEndpointConfig, Result, PipelineError } from '@lorca/core';
import { err } from '@lorca/core';
import type { EndpointAdapter, ModelCallRequest, ModelCallResponse } from './adapter.js';
import { ollamaAdapter } from './ollama.js';

const adapters = new Map<AiEndpointConfig['kind'], EndpointAdapter>([
  ['ollama', ollamaAdapter],
]);

function getAdapter(kind: AiEndpointConfig['kind']): Result<EndpointAdapter, PipelineError> {
  const adapter = adapters.get(kind);
  if (!adapter) {
    return err({ code: 'missing_endpoint', message: `No adapter registered for endpoint kind: ${kind}` });
  }
  return { ok: true, value: adapter };
}

export function testBrowserAccess(
  config: AiEndpointConfig,
): ReturnType<EndpointAdapter['testBrowserAccess']> {
  const r = getAdapter(config.kind);
  if (!r.ok) return Promise.resolve(r);
  return r.value.testBrowserAccess(config);
}

export function listModels(
  config: AiEndpointConfig,
): ReturnType<EndpointAdapter['listModels']> {
  const r = getAdapter(config.kind);
  if (!r.ok) return Promise.resolve(r);
  return r.value.listModels(config);
}

export function executeModelCall(
  config: AiEndpointConfig,
  request: ModelCallRequest,
): Promise<Result<ModelCallResponse, PipelineError>> {
  const r = getAdapter(config.kind);
  if (!r.ok) return Promise.resolve(r);
  return r.value.executeModelCall(config, request);
}
