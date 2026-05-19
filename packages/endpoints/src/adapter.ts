import type {AiEndpointConfig, DiscoveredModel, Result, PipelineError} from '@lorca/core';
import type {RenderedPromptPayload} from '@lorca/prompt';

export interface ModelCallRequest {
  mode: 'generate' | 'chat';
  endpointId: string;
  modelName: string;
  /** Structured prompt from renderPromptComposition — preferred over legacy fields. */
  prompt?: RenderedPromptPayload;
  /** @deprecated Use prompt instead. Kept for legacy executor path. */
  systemPrompt?: string;
  /** @deprecated Use prompt instead. Kept for legacy executor path. */
  userContent?: string;
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
