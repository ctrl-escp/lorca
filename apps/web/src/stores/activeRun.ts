import {defineStore} from 'pinia';
import {ref, computed} from 'vue';
import type {PipelineArtifact, PipelineTraceEvent, PipelineError} from '@lorca/core';

export type RunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ActiveRunState {
  runId: string;
  pipelineId: string;
  startedAt: string;
  status: RunStatus;
  artifacts: Record<string, PipelineArtifact>;
  trace: PipelineTraceEvent[];
  finalOutputKey: string | null;
  error: PipelineError | null;
}

export const useActiveRunStore = defineStore('activeRun', () => {
  const run = ref<ActiveRunState | null>(null);
  const abortController = ref<AbortController | null>(null);

  const isRunning = computed(() => run.value?.status === 'running');
  const canCancel = computed(() => isRunning.value && abortController.value != null);

  function startRun(runId: string, pipelineId: string) {
    abortController.value = new AbortController();
    run.value = {
      runId,
      pipelineId,
      startedAt: new Date().toISOString(),
      status: 'running',
      artifacts: {},
      trace: [],
      finalOutputKey: null,
      error: null,
    };
  }

  function addArtifact(artifact: PipelineArtifact) {
    if (!run.value) return;
    run.value.artifacts[artifact.name] = artifact;
  }

  function addTraceEvent(event: PipelineTraceEvent) {
    if (!run.value) return;
    run.value.trace.push(event);
  }

  function completeRun(finalOutputKey: string) {
    if (!run.value) return;
    run.value.status = 'completed';
    run.value.finalOutputKey = finalOutputKey;
    abortController.value = null;
  }

  function failRun(error: PipelineError) {
    if (!run.value) return;
    run.value.status = 'failed';
    run.value.error = error;
    abortController.value = null;
  }

  function cancelRun() {
    abortController.value?.abort();
    if (run.value) run.value.status = 'cancelled';
    abortController.value = null;
  }

  function clearRun() {
    run.value = null;
    abortController.value = null;
  }

  return {
    run,
    abortController,
    isRunning,
    canCancel,
    startRun,
    addArtifact,
    addTraceEvent,
    completeRun,
    failRun,
    cancelRun,
    clearRun,
  };
});
