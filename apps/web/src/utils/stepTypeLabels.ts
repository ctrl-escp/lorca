import type {StepType} from '@lorca/core';

const STEP_TYPE_LABELS: Record<StepType, string> = {
  'model-call': 'Model call',
  'presentation': 'Text',
  'capsule-instance': 'Capsule',
  'loop-group': 'Loop',
};

export function stepTypeLabel(type: StepType): string {
  return STEP_TYPE_LABELS[type] ?? type;
}

export function stepTypeInspectorLabel(type: StepType): string {
  const labels: Record<StepType, string> = {
    'model-call': 'Model Call',
    'presentation': 'Text',
    'capsule-instance': 'Capsule',
    'loop-group': 'Loop',
  };
  return labels[type] ?? type;
}
