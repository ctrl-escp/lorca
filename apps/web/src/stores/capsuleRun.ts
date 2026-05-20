import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {CapsuleDefinition, PipelineArtifact, PipelineTraceEvent, PipelineError, StepRunSnapshot} from '@lorca/core';
import type {RunSnapshotContext} from '@lorca/pipeline';
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
  const snapshots = ref<Record<string, StepRunSnapshot>>({});
  const userPromptSignature = ref<string | null>(null);
  const partial = ref(false);
  const executedStepIds = ref<string[]>([]);

  const isRunning = computed(() => status.value === 'running');
  const runSnapshotContext = computed((): RunSnapshotContext | null => {
    if (status.value === 'idle') return null;
    return {
      snapshots: snapshots.value,
      userPromptSignature: userPromptSignature.value ?? '',
      partial: partial.value,
      executedStepIds: executedStepIds.value,
    };
  });
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
    snapshots.value = {};
    userPromptSignature.value = null;
    partial.value = false;
    executedStepIds.value = [];
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
    stopAtStepId?: string,
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
      {
        userPromptRaw,
        inputValues,
        paramValues,
        slotAssignments,
        abortSignal: controller.signal,
        ...(stopAtStepId ? {stopAtStepId} : {}),
      },
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
      finalOutputKey.value = result.value.finalOutputKey;
      snapshots.value = result.value.snapshots;
      userPromptSignature.value = result.value.userPromptSignature;
      partial.value = result.value.partial;
      executedStepIds.value = result.value.executedStepIds;
      status.value = 'completed';
    } else {
      error.value = result.error;
      status.value = result.error.code === 'run_cancelled' ? 'cancelled' : 'failed';
    }
  }

  return {
    status,
    runId,
    artifacts,
    trace,
    finalOutputKey,
    error,
    isRunning,
    finalOutput,
    snapshots,
    userPromptSignature,
    partial,
    executedStepIds,
    runSnapshotContext,
    reset,
    cancel,
    run,
  };
});
