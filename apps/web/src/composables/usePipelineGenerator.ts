import type {AiEndpointConfig, CapsuleDefinition, DiscoveredModel, PipelineArtifact} from '@lorca/core';
import {
  buildPipelineGeneratorRequest,
  executeCapsuleTestRun,
  formatPipelineGeneratorUserMessage,
  LORCA_PIPELINE_GENERATOR,
  LORCA_PIPELINE_GENERATOR_ID,
} from '@lorca/capsules';
import {modelMatchesBucket} from '@lorca/endpoints';
import type {ModelUsageBucket} from '@lorca/core';
import {useCapsulesStore} from '../stores/capsules.js';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';

export {LORCA_PIPELINE_GENERATOR_ID};

export type PipelineGeneratorRunResult =
  | {ok: true; rawResponse: string}
  | {ok: false; error: 'no_model' | 'model_error' | 'cancelled'; message: string; rawResponse?: string};

const GENERATOR_BUCKET: ModelUsageBucket = 'general';

export function generatorCapsuleCompatible(capsule: CapsuleDefinition): boolean {
  return capsule.interface.inputs.some((input) => input.name === 'description' && input.kind === 'text')
    && capsule.interface.outputs.some((output) => output.name === 'pipeline_steps_json')
    && capsule.interface.modelSlots.length > 0;
}

export function selectPipelineGeneratorModel(
  models: readonly DiscoveredModel[],
  endpoints: readonly AiEndpointConfig[],
): {model: DiscoveredModel; endpoint: AiEndpointConfig} | null {
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

export function usePipelineGenerator() {
  const endpointsStore = useEndpointsStore();
  const modelsStore = useModelsStore();
  const capsulesStore = useCapsulesStore();
  const editorStore = usePipelineEditorStore();

  async function generatePipelinePlan(
    description: string,
    signal: AbortSignal,
    options: {
      allowCapsules?: boolean;
      applyMode?: 'replace' | 'append';
      refinePreviousPlan?: boolean;
      previousPlanJson?: string;
      previousErrors?: string[];
    } = {},
  ): Promise<PipelineGeneratorRunResult> {
    await Promise.all([endpointsStore.load(), modelsStore.load(), capsulesStore.load()]);
    if (signal.aborted) return {ok: false, error: 'cancelled', message: 'Cancelled'};

    const capsule = capsulesStore.getCapsule(LORCA_PIPELINE_GENERATOR_ID)
      ?? LORCA_PIPELINE_GENERATOR;
    if (!generatorCapsuleCompatible(capsule)) {
      return {ok: false, error: 'model_error', message: 'Generator capsule not available'};
    }

    const choice = selectPipelineGeneratorModel(modelsStore.models, endpointsStore.endpoints);
    if (!choice) {
      return {
        ok: false,
        error: 'no_model',
        message: 'No model available — enable an endpoint first',
      };
    }

    const requestPayload = buildPipelineGeneratorRequest({
      description,
      currentPipeline: editorStore.pipeline,
      models: modelsStore.models,
      endpoints: endpointsStore.endpoints,
      ...(options.allowCapsules !== undefined ? {allowCapsules: options.allowCapsules} : {}),
      ...(options.applyMode ? {applyMode: options.applyMode} : {}),
      ...(options.refinePreviousPlan ? {refinePreviousPlan: options.refinePreviousPlan} : {}),
      ...(options.previousPlanJson ? {previousPlanJson: options.previousPlanJson} : {}),
      ...(options.previousErrors?.length ? {previousErrors: options.previousErrors} : {}),
    });

    const descriptionBlock = formatPipelineGeneratorUserMessage(requestPayload);

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
        userPromptRaw: descriptionBlock,
        inputValues: {description: descriptionBlock},
        paramValues: {},
        slotAssignments,
        abortSignal: signal,
      },
      (endpointId) => endpointsStore.getEndpoint(endpointId),
      {
        onTraceEvent() { /* traces stay in modal */ },
        onArtifact(artifact) { artifacts[artifact.name] = artifact; },
      },
      (modelName) => {
        const disabledEndpointIds = new Set(
          endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id),
        );
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
        error: result.error.code === 'run_cancelled' ? 'cancelled' : 'model_error',
        message: result.error.message,
        ...(rawResponse ? {rawResponse} : {}),
      };
    }

    const final = artifacts[result.value.finalOutputKey ?? ''];
    const text = typeof final?.value === 'string' ? final.value : rawResponse;
    return {ok: true, rawResponse: text};
  }

  return {generatePipelinePlan};
}

function modelRank(model: DiscoveredModel): number {
  if (modelMatchesBucket(model, GENERATOR_BUCKET)) return 0;
  return 1;
}

function firstTextArtifact(artifacts: Record<string, PipelineArtifact>): string {
  const preferred = artifacts['generate.text'];
  if (typeof preferred?.value === 'string') return preferred.value;
  const textArtifact = Object.values(artifacts).find((artifact) =>
    artifact.kind === 'text' && typeof artifact.value === 'string',
  );
  return typeof textArtifact?.value === 'string' ? textArtifact.value : '';
}
