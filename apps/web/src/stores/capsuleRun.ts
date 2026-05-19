import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {CapsuleDefinition, PipelineArtifact, PipelineTraceEvent, PipelineError} from '@lorca/core';
import {executeCapsuleTestRun} from '@lorca/capsules';
import {useEndpointsStore} from './endpoints.js';

export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export const useCapsuleRunStore = defineStore('capsuleRun', () => {
  const status = ref<RunStatus>('idle');
  const runId = ref<string | null>(null);
  const artifacts = ref<Record<string, PipelineArtifact>>({});
  const trace = ref<PipelineTraceEvent[]>([]);
  const finalOutputKey = ref<string | null>(null);
  const error = ref<PipelineError | null>(null);
  const abortController = ref<AbortController | null>(null);

  const isRunning = computed(() => status.value === 'running');
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

  async function run(
    def: CapsuleDefinition,
    userPromptRaw: string,
    inputValues: Record<string, unknown>,
    paramValues: Record<string, unknown>,
    slotAssignments: Record<string, {endpointId: string; modelName: string}>,
  ) {
    const endpointsStore = useEndpointsStore();
    reset();

    const id = `capsule-run-${crypto.randomUUID().slice(0, 8)}`;
    runId.value = id;
    status.value = 'running';
    const controller = new AbortController();
    abortController.value = controller;

    const result = await executeCapsuleTestRun(
      def,
      {userPromptRaw, inputValues, paramValues, slotAssignments, abortSignal: controller.signal},
      (endpointId) => endpointsStore.getEndpoint(endpointId),
      {
        onTraceEvent(event) { trace.value = [...trace.value, event]; },
        onArtifact(artifact) {
          artifacts.value = {...artifacts.value, [artifact.name]: artifact};
        },
      },
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

  return {status, runId, artifacts, trace, finalOutputKey, error, isRunning, finalOutput, reset, cancel, run};
});
