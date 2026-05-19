import type {AiEndpointConfig, DiscoveredModel, Result, PipelineError} from '@lorca/core';

export interface ModelCallRequest {
  mode: 'generate' | 'chat';
  endpointId: string;
  modelName: string;
  systemPrompt?: string;
  userContent: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface ModelCallResponse {
  text: string;
  rawResponse: unknown;
  parsedJson?: unknown;
}

export interface EndpointAdapter {
  kind: AiEndpointConfig['kind'];
  testBrowserAccess(config: AiEndpointConfig): Promise<Result<void, PipelineError>>;
  listModels(config: AiEndpointConfig): Promise<Result<DiscoveredModel[], PipelineError>>;
  executeModelCall(
    config: AiEndpointConfig,
    request: ModelCallRequest,
  ): Promise<Result<ModelCallResponse, PipelineError>>;
}
