export type ModelUsageBucket =
  | 'tiny'
  | 'thinking'
  | 'summarize'
  | 'rewrite'
  | 'rewrite-prose'
  | 'rewrite-code'
  | 'extract-json'
  | 'verify'
  | 'general'
  | 'unknown';

export interface AiEndpointConfig {
  id: string;
  name: string;
  baseUrl: string;
  kind: 'ollama' | 'openai-compatible' | 'lmstudio' | 'custom-http';
  enabled: boolean;
  browserAccess: 'unknown' | 'available' | 'blocked';
  authKind: 'none' | 'bearer-token' | 'api-key';
  authSecretRef?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointSecretRef {
  id: string;
  endpointId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveredModel {
  id: string;
  endpointId: string;
  providerModelName: string;
  displayName: string;
  sizeBytes?: number;
  parameterSize?: string;
  quantization?: string;
  family?: string;
  modifiedAt?: string;
  buckets: ModelUsageBucket[];
  userBuckets?: ModelUsageBucket[];
  source: 'discovered' | 'manual';
  enabled?: boolean;
}
