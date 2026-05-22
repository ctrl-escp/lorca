import type {StepOutputsExport} from '@lorca/core';
import type {RunStatus} from '../stores/activeRun.js';

export interface PersistedRunState extends StepOutputsExport {
  status: Exclude<RunStatus, 'idle' | 'running'>;
  partialRunTargetStepId?: string | null;
}

const RUN_KEY_PREFIX = 'lorca:run:';
const CAPSULE_RUN_KEY_PREFIX = 'lorca:capsule-run:';

export function saveRunState(pipelineId: string, state: PersistedRunState): void {
  try {
    localStorage.setItem(RUN_KEY_PREFIX + pipelineId, JSON.stringify(state));
  } catch {
    // Quota exceeded — skip persistence silently.
  }
}

export function loadRunState(pipelineId: string): PersistedRunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY_PREFIX + pipelineId);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedRunState;
  } catch {
    return null;
  }
}

export function saveCapsuleRunState(capsuleId: string, state: PersistedRunState): void {
  try {
    localStorage.setItem(CAPSULE_RUN_KEY_PREFIX + capsuleId, JSON.stringify(state));
  } catch {
    // Quota exceeded — skip persistence silently.
  }
}

export function loadCapsuleRunState(capsuleId: string): PersistedRunState | null {
  try {
    const raw = localStorage.getItem(CAPSULE_RUN_KEY_PREFIX + capsuleId);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedRunState;
  } catch {
    return null;
  }
}
