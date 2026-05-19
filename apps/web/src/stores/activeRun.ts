import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {PipelineDefinition, PipelineArtifact, PipelineTraceEvent, PipelineError} from '@lorca/core';
import {buildUserPromptArtifacts} from '@lorca/prompt';
import {executePipeline, compilePipelineToLegacyGraph} from '@lorca/pipeline';
import {useEndpointsStore} from './endpoints.js';
import {useCapsulesStore} from './capsules.js';

export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export const useActiveRunStore = defineStore('activeRun', () => {
  const status = ref<RunStatus>('idle');
  const runId = ref<string | null>(null);
  const artifacts = ref<Record<string, PipelineArtifact>>({});
  const trace = ref<PipelineTraceEvent[]>([]);
  const finalOutputKey = ref<string | null>(null);
  const error = ref<PipelineError | null>(null);
  const abortController = ref<AbortController | null>(null);

  const isRunning = computed(() => status.value === 'running');
  const canCancel = computed(() => isRunning.value);
  const finalOutput = computed(() =>
    finalOutputKey.value ? artifacts.value[finalOutputKey.value] : null,
  );

  function reset() {
    status.value = 'idle';
    runId.value = null;
    artifacts.value = {};
    trace.value = [];
    finalOutputKey.value = null;
    error.value = null;
    abortController.value = null;
  }

  function cancel() {
    abortController.value?.abort();
    status.value = 'cancelled';
  }

  async function run(def: PipelineDefinition, userPromptRaw: string, stopAtStepId?: string) {
    const endpointsStore = useEndpointsStore();
    const capsulesStore = useCapsulesStore();
    reset();

    const id = `run-${crypto.randomUUID().slice(0, 8)}`;
    runId.value = id;
    status.value = 'running';
    const controller = new AbortController();
    abortController.value = controller;

    const {raw, xml} = buildUserPromptArtifacts(userPromptRaw);
    const ctx = {
      runId: id,
      pipelineId: def.id,
      startedAt: new Date().toISOString(),
      abortSignal: controller.signal,
      ...(stopAtStepId ? {partial: true} : {}),
      input: {userPromptRaw: raw, userPromptXml: xml},
      artifacts: {} as Record<string, PipelineArtifact>,
      trace: [] as PipelineTraceEvent[],
    };

    // Compile V2 step-chain to V1 legacy graph for execution
    const legacyDef = compilePipelineToLegacyGraph(def, stopAtStepId ? {stopAtStepId} : {});

    const result = await executePipeline(
      legacyDef,
      ctx,
      (endpointId) => endpointsStore.getEndpoint(endpointId),
      {
        onTraceEvent(event) {
          trace.value = [...trace.value, event];
          ctx.trace.push(event);
        },
        onArtifact(artifact) {
          artifacts.value = {...artifacts.value, [artifact.name]: artifact};
          ctx.artifacts[artifact.name] = artifact;
        },
      },
      (capsuleId, version) => capsulesStore.getCapsule(capsuleId, version),
    );

    abortController.value = null;

    if (result.ok) {
      finalOutputKey.value = result.value;
      status.value = 'completed';
    } else {
      error.value = result.error;
      status.value = result.error.code === 'run_cancelled' ? 'cancelled' : 'failed';
    }
  }

  return {status, runId, artifacts, trace, finalOutputKey, error, isRunning, canCancel, finalOutput, reset, cancel, run};
});
