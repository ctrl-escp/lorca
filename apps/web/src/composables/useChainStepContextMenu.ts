import {computed, type Ref} from 'vue';
import type {PipelineStep} from '@lorca/core';
import type {ContextMenuItem} from '../components/shared/contextMenu.js';

export function buildStepContextMenuItems(
  step: PipelineStep,
  steps: readonly PipelineStep[],
): ContextMenuItem[] {
  const index = steps.findIndex((s) => s.id === step.id);
  const items: ContextMenuItem[] = [
    {id: 'run-up-to', label: 'Run up to here', disabled: !step.enabled},
    {id: 'run-from', label: 'Run from here', disabled: !step.enabled},
    {id: 'run-only-step', label: 'Re-run only this step', disabled: !step.enabled},
    {id: 'sep-run-edit', separator: true},
    {id: 'insert-after', label: 'Insert step after'},
    {id: 'move-up', label: 'Move up', disabled: index <= 0},
    {id: 'move-down', label: 'Move down', disabled: index < 0 || index >= steps.length - 1},
    {id: 'duplicate', label: 'Duplicate step'},
    {id: 'toggle-enabled', label: step.enabled ? 'Disable step' : 'Enable step'},
    {id: 'comment', label: step.description ? 'Edit comment' : 'Add comment'},
  ];

  if (step.config.type === 'capsule-instance') {
    items.push({id: 'sep-capsule', separator: true});
    if (step.config.displayMode === 'inline') {
      items.push(
        {id: 'collapse-inline-capsule', label: 'Collapse inline Capsule'},
        {id: 'lock-inline-capsule', label: 'Lock as Capsule'},
        {id: 'detach-capsule', label: 'Detach Capsule'},
      );
    } else {
      items.push({id: 'spread-capsule', label: 'Edit inline'});
    }
  }

  items.push(
    {id: 'sep-danger', separator: true},
    {id: 'delete', label: 'Delete step', danger: true},
  );
  return items;
}

export function useChainStepContextMenu(options: {
  steps: Ref<readonly PipelineStep[]>;
  menu: Ref<{stepId: string; x: number; y: number} | null>;
  emit: (event: string, ...args: unknown[]) => void;
  onComment: (step: PipelineStep) => void;
}) {
  const stepContextMenuItems = computed(() => {
    const stepId = options.menu.value?.stepId;
    const step = options.steps.value.find((s) => s.id === stepId);
    if (!step) return [];
    return buildStepContextMenuItems(step, options.steps.value);
  });

  function openStepContextMenu(step: PipelineStep, event: MouseEvent) {
    options.emit('select', step.id);
    options.menu.value = {stepId: step.id, x: event.clientX, y: event.clientY};
  }

  function closeStepContextMenu() {
    options.menu.value = null;
  }

  function selectStepContextMenuAction(action: string) {
    const stepId = options.menu.value?.stepId;
    const step = options.steps.value.find((s) => s.id === stepId);
    closeStepContextMenu();
    if (!step) return;

    if ((action === 'run-up-to' || action === 'run-from' || action === 'run-only-step') && !step.enabled) return;

    switch (action) {
      case 'run-up-to': options.emit('run-up-to', step.id); break;
      case 'run-from': options.emit('run-from', step.id); break;
      case 'run-only-step': options.emit('run-only-step', step.id); break;
      case 'insert-after': options.emit('insert-after', step.id); break;
      case 'move-up': options.emit('move-up', step.id); break;
      case 'move-down': options.emit('move-down', step.id); break;
      case 'duplicate': options.emit('duplicate', step.id); break;
      case 'toggle-enabled': options.emit('toggle-enabled', step.id); break;
      case 'comment': options.onComment(step); break;
      case 'spread-capsule': options.emit('spread-capsule', step.id); break;
      case 'collapse-inline-capsule': options.emit('collapse-inline-capsule', step.id); break;
      case 'lock-inline-capsule': options.emit('lock-inline-capsule', step.id); break;
      case 'detach-capsule': options.emit('detach-capsule', step.id); break;
      case 'delete': options.emit('delete', step.id); break;
    }
  }

  return {
    stepContextMenuItems,
    openStepContextMenu,
    closeStepContextMenu,
    selectStepContextMenuAction,
  };
}
