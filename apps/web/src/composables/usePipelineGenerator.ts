import type {AiEndpointConfig, CapsuleDefinition, DiscoveredModel, LoopExitCondition, ModelUsageBucket, PipelineArtifact, PipelineStep} from '@lorca/core';
import {executeCapsuleTestRun, ALL_SUGGESTIONS, instantiateSuggestion, LORCA_PIPELINE_GENERATOR_ID} from '@lorca/capsules';
import type {PipelineSuggestion} from '@lorca/capsules';
import {modelMatchesBucket} from '@lorca/endpoints';
import {useCapsulesStore} from '../stores/capsules.js';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {newStepId} from '../utils/stepBuilders.js';

export {LORCA_PIPELINE_GENERATOR_ID};

export interface PipelineGeneratorEntry {
  suggestionId?: string;
  wrapInLoop?: boolean;
  maxIterations?: number;
  exitCondition?: LoopExitCondition;
  inner?: PipelineGeneratorEntry[];
}

export type PipelineGeneratorParseResult =
  | {ok: true; entries: PipelineGeneratorEntry[]; unknownSuggestionIds: string[]}
  | {ok: false; message: string; rawResponse: string};

export type PipelineGeneratorRunResult =
  | {ok: true; rawResponse: string; entries: PipelineGeneratorEntry[]; unknownSuggestionIds: string[]}
  | {ok: false; error: 'no_model' | 'model_error' | 'parse_failed'; message: string; rawResponse?: string};

interface GeneratorModelChoice {
  model: DiscoveredModel;
  endpoint: AiEndpointConfig;
}

const GENERATOR_BUCKET: ModelUsageBucket = 'general';

export function generatorCapsuleCompatible(capsule: CapsuleDefinition): boolean {
  return capsule.interface.inputs.some((input) => input.name === 'description' && input.kind === 'text')
    && capsule.interface.outputs.some((output) => output.name === 'pipeline_steps_json')
    && capsule.interface.modelSlots.length > 0;
}

export function selectPipelineGeneratorModel(
  models: readonly DiscoveredModel[],
  endpoints: readonly AiEndpointConfig[],
): GeneratorModelChoice | null {
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

export function parsePipelineGeneratorResponse(
  text: string,
  availableSuggestions: readonly PipelineSuggestion[] = ALL_SUGGESTIONS,
): PipelineGeneratorParseResult {
  const parsed = parseJsonArray(text);
  if (!Array.isArray(parsed)) {
    return {ok: false, message: "Couldn't parse pipeline steps", rawResponse: text};
  }

  const known = new Set(availableSuggestions.map((suggestion) => suggestion.id));
  const unknownSuggestionIds: string[] = [];
  const entries = normalizeEntries(parsed, known, unknownSuggestionIds);
  if (entries.length === 0) {
    return {ok: false, message: "Couldn't parse pipeline steps", rawResponse: text};
  }
  return {ok: true, entries, unknownSuggestionIds};
}

export function buildStepsFromGeneratorPlan(
  entries: readonly PipelineGeneratorEntry[],
  availableSuggestions: readonly PipelineSuggestion[] = ALL_SUGGESTIONS,
): PipelineStep[] {
  return instantiatePlanEntries(entries, new Set(), [], availableSuggestions);
}

export function usePipelineGenerator() {
  const endpointsStore = useEndpointsStore();
  const modelsStore = useModelsStore();
  const capsulesStore = useCapsulesStore();

  async function generatePipelinePlan(
    capsuleId: string,
    description: string,
    signal: AbortSignal,
  ): Promise<PipelineGeneratorRunResult> {
    await Promise.all([endpointsStore.load(), modelsStore.load(), capsulesStore.load()]);
    if (signal.aborted) return {ok: false, error: 'model_error', message: 'Cancelled'};

    const capsule = capsulesStore.getCapsule(capsuleId);
    if (!capsule) {
      return {ok: false, error: 'model_error', message: 'Generator Capsule not found'};
    }

    const choice = selectPipelineGeneratorModel(modelsStore.models, endpointsStore.endpoints);
    if (!choice) {
      return {
        ok: false,
        error: 'no_model',
        message: 'No model available — enable an endpoint first',
      };
    }

    const artifacts: Record<string, PipelineArtifact> = {};
    const slotAssignments = Object.fromEntries(
      capsule.interface.modelSlots.map((slot) => [
        slot.name,
        {endpointId: choice.endpoint.id, modelName: choice.model.providerModelName},
      ]),
    );

    const result = await executeCapsuleTestRun(
      capsule,
      {
        userPromptRaw: description,
        inputValues: {description},
        paramValues: {},
        slotAssignments,
        abortSignal: signal,
      },
      (endpointId) => endpointsStore.getEndpoint(endpointId),
      {
        onTraceEvent() { /* Generator traces stay inside the modal flow. */ },
        onArtifact(artifact) { artifacts[artifact.name] = artifact; },
      },
      (modelName) => {
        const disabledEndpointIds = new Set(endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id));
        const model = modelsStore.models.find((m) =>
          m.providerModelName === modelName &&
          m.enabled !== false &&
          !disabledEndpointIds.has(m.endpointId),
        );
        return model ? endpointsStore.getEndpoint(model.endpointId) : undefined;
      },
    );

    const rawResponse = firstTextArtifact(artifacts);
    if (!result.ok) {
      return {
        ok: false,
        error: 'model_error',
        message: result.error.code === 'run_cancelled' ? 'Cancelled' : result.error.message,
        ...(rawResponse ? {rawResponse} : {}),
      };
    }

    const final = artifacts[result.value.finalOutputKey ?? ''];
    const text = typeof final?.value === 'string' ? final.value : rawResponse;
    const parsed = parsePipelineGeneratorResponse(text);
    if (!parsed.ok) return {ok: false, error: 'parse_failed', message: parsed.message, rawResponse: text};
    return {ok: true, rawResponse: text, entries: parsed.entries, unknownSuggestionIds: parsed.unknownSuggestionIds};
  }

  return {generatePipelinePlan};
}

function instantiatePlanEntries(
  entries: readonly PipelineGeneratorEntry[],
  namespaces: Set<string>,
  existingSteps: PipelineStep[],
  availableSuggestions: readonly PipelineSuggestion[],
): PipelineStep[] {
  const steps: PipelineStep[] = [];
  for (const entry of entries) {
    if (entry.wrapInLoop && entry.inner?.length) {
      const inner = instantiatePlanEntries(entry.inner, namespaces, [], availableSuggestions);
      if (inner.length === 0) continue;
      const loopStep: PipelineStep = {
        id: newStepId('loop_group'),
        type: 'loop-group',
        label: 'Generated Retry Loop',
        enabled: true,
        outputNamespace: uniqueNamespace('generated_loop', namespaces),
        primaryOutputName: 'text',
        lastEditedAt: new Date().toISOString(),
        config: {
          type: 'loop-group',
          maxIterations: clampIterations(entry.maxIterations),
          exitCondition: entry.exitCondition ?? {type: 'iterations'},
          steps: inner,
          outputNames: ['text'],
        },
      };
      steps.push(loopStep);
      existingSteps.push(loopStep);
      continue;
    }

    if (!entry.suggestionId) continue;
    const suggestion = availableSuggestions.find((s) => s.id === entry.suggestionId);
    if (!suggestion) continue;
    const instantiated = instantiateSuggestion(suggestion, namespaces, [...existingSteps, ...steps]);
    for (const step of instantiated) namespaces.add(step.outputNamespace);
    steps.push(...instantiated);
  }
  return steps;
}

function normalizeEntries(
  rawEntries: unknown[],
  knownSuggestionIds: ReadonlySet<string>,
  unknownSuggestionIds: string[],
): PipelineGeneratorEntry[] {
  const entries: PipelineGeneratorEntry[] = [];
  for (const raw of rawEntries) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const suggestionId = typeof item.suggestionId === 'string'
      ? item.suggestionId
      : typeof item.id === 'string'
        ? item.id
        : '';

    if (suggestionId) {
      if (knownSuggestionIds.has(suggestionId)) {
        entries.push({suggestionId});
      } else {
        unknownSuggestionIds.push(suggestionId);
        console.warn(`Ignoring unknown generated pipeline suggestion id: ${suggestionId}`);
      }
      continue;
    }

    if (item.wrapInLoop === true && Array.isArray(item.inner)) {
      const inner = normalizeEntries(item.inner, knownSuggestionIds, unknownSuggestionIds);
      if (inner.length === 0) continue;
      entries.push({
        wrapInLoop: true,
        inner,
        ...(typeof item.maxIterations === 'number' ? {maxIterations: item.maxIterations} : {}),
        ...(isLoopExitCondition(item.exitCondition) ? {exitCondition: item.exitCondition} : {}),
      });
    }
  }
  return entries;
}

function isLoopExitCondition(value: unknown): value is LoopExitCondition {
  if (!value || typeof value !== 'object') return false;
  const condition = value as Record<string, unknown>;
  if (condition.type === 'iterations') return true;
  return condition.type === 'json-field-equals'
    && typeof condition.fieldPath === 'string'
    && ['boolean', 'string', 'number'].includes(typeof condition.value);
}

function modelRank(model: DiscoveredModel): number {
  if (modelMatchesBucket(model, GENERATOR_BUCKET)) return 0;
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

function clampIterations(value: number | undefined): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(10, Math.floor(value!)));
}

function uniqueNamespace(base: string, namespaces: Set<string>): string {
  let ns = base;
  let attempt = 1;
  while (namespaces.has(ns)) ns = `${base}_${attempt++}`;
  namespaces.add(ns);
  return ns;
}

function firstTextArtifact(artifacts: Record<string, PipelineArtifact>): string {
  const preferred = artifacts['generate.text'];
  if (typeof preferred?.value === 'string') return preferred.value;
  const textArtifact = Object.values(artifacts).find((artifact) =>
    artifact.kind === 'text' && typeof artifact.value === 'string',
  );
  return typeof textArtifact?.value === 'string' ? textArtifact.value : '';
}
