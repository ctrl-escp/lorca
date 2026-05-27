import type {AiEndpointConfig, DiscoveredModel, PipelineDefinition, ModelUsageBucket} from '@lorca/core';
import {MODEL_CALL_TIMEOUT_MS} from '@lorca/core';
import type {PipelineSuggestion} from '@lorca/capsules';
import type {RenderedPromptPayload} from '@lorca/prompt';
import {executeModelCall, modelMatchesBucket} from '@lorca/endpoints';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';

export interface StepAdvisorSuggestion {
  suggestionId: string;
  reason: string;
}

export type StepAdvisorResult =
  | {ok: true; suggestions: StepAdvisorSuggestion[]}
  | {ok: false; error: 'no_model' | 'model_error' | 'parse_failed'; message: string; rawResponse?: string};

interface AdvisorModelChoice {
  model: DiscoveredModel;
  endpoint: AiEndpointConfig;
}

const ADVISOR_BUCKET: ModelUsageBucket = 'general';

function modelPrompt(systemPrompt: string, userContent: string): RenderedPromptPayload {
  return {
    blocks: [
      {tagName: 'system', body: systemPrompt, source: 'system-default'},
      {tagName: 'user', body: userContent, source: 'user-input'},
    ],
    xmlText: `<system>\n${systemPrompt}\n</system>\n\n<user>\n${userContent}\n</user>`,
  };
}

export function selectStepAdvisorModel(
  models: readonly DiscoveredModel[],
  endpoints: readonly AiEndpointConfig[],
): AdvisorModelChoice | null {
  const enabledEndpoints = new Map(
    endpoints.filter((endpoint) => endpoint.enabled).map((endpoint) => [endpoint.id, endpoint]),
  );
  const usable = models.filter((model) =>
    model.enabled !== false && enabledEndpoints.has(model.endpointId),
  );
  const ranked = [...usable].sort((a, b) => modelRank(a) - modelRank(b));
  const model = ranked[0];
  if (!model) return null;
  return {model, endpoint: enabledEndpoints.get(model.endpointId)!};
}

export function buildStepAdvisorRequest(
  pipeline: PipelineDefinition,
  artifactKeys: readonly string[],
  availableSuggestions: readonly PipelineSuggestion[],
): {systemPrompt: string; userContent: string} {
  const steps = pipeline.steps
    .filter((step) => step.enabled)
    .map((step, idx) => `${idx + 1}. ${step.label} (${step.type}; outputs ${step.outputNamespace}.${step.primaryOutputName})`);
  const suggestions = availableSuggestions.map((suggestion) => [
    `${suggestion.id}: ${suggestion.name}`,
    `category: ${suggestion.category}`,
    `description: ${suggestion.description}`,
    suggestion.preferredModelBucket ? `preferred model bucket: ${suggestion.preferredModelBucket}` : '',
    suggestion.requiredBindings.length
      ? `requires: ${suggestion.requiredBindings.map((binding) => binding.name).join(', ')}`
      : '',
  ].filter(Boolean).join('\n'));

  return {
    systemPrompt: [
      'You are a pipeline design advisor for Lorca.',
      'Pick the most useful built-in next steps for the current pipeline after a run.',
      'Only choose IDs from the available suggestions list.',
      'Respond with JSON only: [{ "id": string, "reason": string }].',
    ].join('\n'),
    userContent: [
      `Pipeline: ${pipeline.name}`,
      '',
      'Current pipeline steps:',
      steps.length ? steps.join('\n') : '(none)',
      '',
      'Run artifact keys:',
      artifactKeys.length ? artifactKeys.join('\n') : '(none)',
      '',
      'Available suggestions:',
      suggestions.join('\n\n'),
      '',
      'Suggest 2-3 most useful next steps. Keep each reason to one concise sentence.',
      'Respond JSON only with this shape:',
      '[{ "id": "suggestion-id", "reason": "why this helps now" }]',
    ].join('\n'),
  };
}

export function parseStepAdvisorResponse(
  text: string,
  availableSuggestions: readonly PipelineSuggestion[],
): StepAdvisorSuggestion[] | null {
  const parsed = parseJsonArray(text);
  if (!Array.isArray(parsed)) return null;

  const known = new Set(availableSuggestions.map((suggestion) => suggestion.id));
  const seen = new Set<string>();
  const suggestions: StepAdvisorSuggestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof (item as {id?: unknown}).id === 'string' ? (item as {id: string}).id : '';
    const reason = typeof (item as {reason?: unknown}).reason === 'string' ? (item as {reason: string}).reason.trim() : '';
    if (!id || !reason || seen.has(id)) continue;
    if (!known.has(id)) {
      console.warn(`Ignoring unknown AI step suggestion id: ${id}`);
      continue;
    }
    seen.add(id);
    suggestions.push({suggestionId: id, reason});
    if (suggestions.length === 3) break;
  }
  if (parsed.length > 0 && suggestions.length === 0) return null;
  return suggestions;
}

export function useStepAdvisor() {
  const endpointsStore = useEndpointsStore();
  const modelsStore = useModelsStore();

  async function getStepSuggestions(
    pipeline: PipelineDefinition,
    artifactKeys: string[],
    availableSuggestions: PipelineSuggestion[],
    signal: AbortSignal,
  ): Promise<StepAdvisorResult> {
    await Promise.all([endpointsStore.load(), modelsStore.load()]);
    if (signal.aborted) {
      return {ok: false, error: 'model_error', message: 'Cancelled'};
    }
    const choice = selectStepAdvisorModel(modelsStore.models, endpointsStore.endpoints);
    if (!choice) {
      return {
        ok: false,
        error: 'no_model',
        message: 'No model available — enable an endpoint first',
      };
    }

    const timeoutSignal = AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS);
    const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
    const request = buildStepAdvisorRequest(pipeline, artifactKeys, availableSuggestions);
    const response = await executeModelCall(choice.endpoint, {
      mode: 'chat',
      endpointId: choice.endpoint.id,
      modelName: choice.model.providerModelName,
      prompt: modelPrompt(request.systemPrompt, request.userContent),
      temperature: 0.2,
      maxTokens: 900,
      abortSignal: combinedSignal,
    });

    if (!response.ok) {
      return {ok: false, error: 'model_error', message: response.error.message};
    }

    const suggestions = parseStepAdvisorResponse(response.value.text, availableSuggestions);
    if (!suggestions) {
      return {
        ok: false,
        error: 'parse_failed',
        message: "Couldn't parse suggestions",
        rawResponse: response.value.text,
      };
    }
    return {ok: true, suggestions};
  }

  return {getStepSuggestions};
}

function modelRank(model: DiscoveredModel): number {
  if (modelMatchesBucket(model, ADVISOR_BUCKET)) return 0;
  return 1;
}

function parseJsonArray(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed)?.[1]?.trim();
  for (const candidate of [fenced, trimmed, firstArrayBlock(trimmed)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next extraction strategy.
    }
  }
  return null;
}

function firstArrayBlock(text: string): string | null {
  const start = text.indexOf('[');
  const end = findMatchingArrayEnd(text, start);
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

function findMatchingArrayEnd(text: string, start: number): number {
  if (start < 0) return -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '[') depth++;
    if (char === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
