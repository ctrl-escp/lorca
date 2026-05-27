import type {AiEndpointConfig, DiscoveredModel, Result, PipelineError} from '@lorca/core';
import {ok, err} from '@lorca/core';
import type {EndpointAdapter, ModelCallRequest, ModelCallResponse} from './adapter.js';
import {assignBuckets} from './buckets.js';

// Shapes returned by the Ollama REST API
interface OllamaTagsResponse {
  models: OllamaModelInfo[];
}

interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  details?: {
    parameter_size?: string;
    quantization_level?: string;
    family?: string;
  };
}

interface OllamaGenerateResponse {
  response: string;
  done: boolean;
  model: string;
}

interface OllamaChatResponse {
  message: { role: string; content: string };
  done: boolean;
  model: string;
}

function endpointError(
  code: PipelineError['code'],
  message: string,
): Result<never, PipelineError> {
  return err({code, message});
}

async function safeFetch(
  url: string,
  init: RequestInit,
): Promise<Result<Response, PipelineError>> {
  try {
    const response = await fetch(url, init);
    return ok(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // CORS/network failures in browser: "Failed to fetch", "NetworkError", "Load failed"
    // Network failures in Node/MSW test environment: "fetch failed"
    if (
      message.includes('NetworkError') ||
      message.includes('Failed to fetch') ||
      message.includes('fetch failed') ||
      message.includes('CORS') ||
      message.includes('Load failed')
    ) {
      return endpointError(
        'endpoint_browser_access_blocked',
        `Browser cannot reach endpoint: ${message}`,
      );
    }
    return endpointError('endpoint_unreachable', `Fetch failed: ${message}`);
  }
}

export const ollamaAdapter: EndpointAdapter = {
  kind: 'ollama',

  async testBrowserAccess(config: AiEndpointConfig): Promise<Result<void, PipelineError>> {
    const result = await safeFetch(`${config.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
    });
    if (!result.ok) return result;
    const response = result.value;
    if (!response.ok) {
      return endpointError(
        'endpoint_unreachable',
        `Endpoint returned HTTP ${response.status}`,
      );
    }
    return ok(undefined);
  },

  async listModels(config: AiEndpointConfig): Promise<Result<DiscoveredModel[], PipelineError>> {
    const fetchResult = await safeFetch(`${config.baseUrl}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    });
    if (!fetchResult.ok) return fetchResult;

    const response = fetchResult.value;
    if (!response.ok) {
      return endpointError(
        'endpoint_unreachable',
        `Ollama /api/tags returned HTTP ${response.status}`,
      );
    }

    let body: OllamaTagsResponse;
    try {
      body = (await response.json()) as OllamaTagsResponse;
    } catch {
      return endpointError('endpoint_unreachable', 'Ollama response was not valid JSON');
    }

    const models: DiscoveredModel[] = (body.models ?? []).map((m) => {
      const parameterSize = m.details?.parameter_size;
      const quantization = m.details?.quantization_level;
      const family = m.details?.family;

      const model: DiscoveredModel = {
        id: `${config.id}::${m.name}`,
        endpointId: config.id,
        providerModelName: m.name,
        displayName: m.name,
        sizeBytes: m.size,
        modifiedAt: m.modified_at,
        buckets: assignBuckets({
          providerModelName: m.name,
          ...(parameterSize !== undefined && {parameterSize}),
          ...(quantization !== undefined && {quantization}),
          ...(family !== undefined && {family}),
        }),
        source: 'discovered',
        ...(parameterSize !== undefined && {parameterSize}),
        ...(quantization !== undefined && {quantization}),
        ...(family !== undefined && {family}),
      };
      return model;
    });

    return ok(models);
  },

  async executeModelCall(
    config: AiEndpointConfig,
    request: ModelCallRequest,
  ): Promise<Result<ModelCallResponse, PipelineError>> {
    const isChat = request.mode === 'chat';
    const url = isChat ? `${config.baseUrl}/api/chat` : `${config.baseUrl}/api/generate`;

    const options = request.temperature !== undefined ? {temperature: request.temperature} : undefined;

    let body: unknown;
    if (isChat) {
      const systemContent = request.prompt.blocks
        .filter((b) => b.tagName === 'system')
        .map((b) => b.body)
        .join('\n\n');
      const userContent = request.prompt.blocks
        .filter((b) => b.tagName !== 'system')
        .map((b) => `<${b.tagName}>\n${b.body}\n</${b.tagName}>`)
        .join('\n\n') || request.prompt.xmlText;
      body = {
        model: request.modelName,
        stream: false,
        messages: [
          ...(systemContent ? [{role: 'system', content: systemContent}] : []),
          {role: 'user', content: userContent || request.prompt.xmlText},
        ],
        ...(options !== undefined && {options}),
      };
    } else {
      body = {
        model: request.modelName,
        prompt: request.prompt.xmlText,
        stream: false,
        ...(options !== undefined && {options}),
      };
    }

    const fetchResult = await safeFetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: request.abortSignal ?? null,
    });

    if (!fetchResult.ok) return fetchResult;

    const response = fetchResult.value;
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return endpointError(
        'model_call_failed',
        `Ollama returned HTTP ${response.status}: ${text.slice(0, 256)}`,
      );
    }

    let rawResponse: unknown;
    try {
      rawResponse = await response.json();
    } catch {
      return endpointError('model_call_failed', 'Ollama response was not valid JSON');
    }

    const text = isChat
      ? ((rawResponse as OllamaChatResponse).message?.content ?? '')
      : ((rawResponse as OllamaGenerateResponse).response ?? '');

    return ok({text, rawResponse});
  },
};
