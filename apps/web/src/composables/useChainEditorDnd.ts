import {ref, computed, type Ref} from 'vue';
import type {PipelineStep} from '@lorca/core';
import {
  DND_STEP_ID,
  isSuggestionDragActive,
  readDragStepId,
  readDragSuggestionId,
} from '../utils/dragDrop.js';

export type ChainDragKind = 'step-reorder' | 'suggestion';

export function useChainEditorDnd(options: {
  steps: Ref<readonly PipelineStep[]>;
  acceptSuggestionDrop: Ref<boolean | undefined>;
  onReorder: (stepId: string, targetIndex: number) => void;
  onDropSuggestion: (suggestionId: string, insertIndex: number) => void;
  onSelectStep: (stepId: string) => void;
}) {
  const draggingStepId = ref<string | null>(null);
  const dragOverStepId = ref<string | null>(null);
  const dropTargetIndex = ref<number | null>(null);
  const activeDragKind = ref<ChainDragKind | null>(null);
  const chainDndHover = ref(false);

  const isDndActive = computed(() =>
    chainDndHover.value
    || draggingStepId.value !== null
    || dropTargetIndex.value !== null
    || dragOverStepId.value !== null,
  );

  function isStepReorderDragActive(): boolean {
    return draggingStepId.value !== null;
  }

  function resolveDragKind(): ChainDragKind | null {
    if (isStepReorderDragActive()) return 'step-reorder';
    if (options.acceptSuggestionDrop.value && isSuggestionDragActive()) return 'suggestion';
    return null;
  }

  function syncActiveDragKind() {
    activeDragKind.value = resolveDragKind();
  }

  function draggedStepIdForDrop(event: DragEvent): string | null {
    return draggingStepId.value ?? readDragStepId(event.dataTransfer);
  }

  function draggedSuggestionIdForDrop(event: DragEvent): string | null {
    return readDragSuggestionId(event.dataTransfer);
  }

  function clearDndState() {
    draggingStepId.value = null;
    dragOverStepId.value = null;
    dropTargetIndex.value = null;
    activeDragKind.value = null;
    chainDndHover.value = false;
  }

  function dropHintAtIndex(index: number): string {
    const kind = activeDragKind.value;
    const n = options.steps.value.length;
    if (kind === 'suggestion') {
      if (n === 0) return 'Insert suggestion as first step';
      if (index >= n) return 'Insert suggestion at end of pipeline';
      const target = options.steps.value[index];
      return `Insert suggestion before “${target?.label ?? 'step'}”`;
    }
    if (kind === 'step-reorder') {
      if (index >= n) return 'Move step to end of pipeline';
      if (index === 0) return 'Move step to start (position 1)';
      const target = options.steps.value[index];
      return `Move step before “${target?.label ?? 'step'}” (position ${index + 1})`;
    }
    return 'Drop here';
  }

  function onChainDragEnter() {
    if (resolveDragKind()) chainDndHover.value = true;
  }

  function onChainDragLeave(event: DragEvent, scrollEl: HTMLElement | null) {
    const related = event.relatedTarget;
    if (scrollEl && related instanceof Node && scrollEl.contains(related)) return;
    chainDndHover.value = false;
  }

  function onStepDragStart(stepId: string, event: DragEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('button, input, select, a, .cm-editor, [contenteditable="true"]')) {
      event.preventDefault();
      return;
    }
    draggingStepId.value = stepId;
    activeDragKind.value = 'step-reorder';
    chainDndHover.value = true;
    event.dataTransfer?.setData(DND_STEP_ID, stepId);
    event.dataTransfer!.effectAllowed = 'move';
    options.onSelectStep(stepId);
  }

  function onStepDragEnd() {
    clearDndState();
  }

  function onStepDragOver(stepId: string, index: number, event: DragEvent) {
    if (isStepReorderDragActive()) {
      syncActiveDragKind();
      if (draggingStepId.value !== stepId) {
        dragOverStepId.value = stepId;
        dropTargetIndex.value = null;
      }
      event.dataTransfer!.dropEffect = 'move';
      return;
    }
    if (options.acceptSuggestionDrop.value && isSuggestionDragActive()) {
      syncActiveDragKind();
      dragOverStepId.value = null;
      dropTargetIndex.value = index;
      event.dataTransfer!.dropEffect = 'copy';
    }
  }

  function onStepDragLeave(stepId: string, event: DragEvent) {
    const stepEl = event.currentTarget as HTMLElement;
    const related = event.relatedTarget;
    if (related instanceof Node && stepEl.contains(related)) return;
    if (dragOverStepId.value === stepId) dragOverStepId.value = null;
  }

  function onStepDrop(stepId: string, index: number, event: DragEvent) {
    const draggedId = draggedStepIdForDrop(event);
    if (draggedId && draggedId !== stepId) {
      options.onReorder(draggedId, index);
      clearDndState();
      return;
    }
    const suggestionId = draggedSuggestionIdForDrop(event);
    if (options.acceptSuggestionDrop.value && suggestionId) {
      options.onDropSuggestion(suggestionId, index);
      clearDndState();
    }
  }

  function onInsertZoneDragOver(index: number, event: DragEvent) {
    if (isStepReorderDragActive()) {
      syncActiveDragKind();
      dragOverStepId.value = null;
      dropTargetIndex.value = index;
      event.dataTransfer!.dropEffect = 'move';
      return;
    }
    if (options.acceptSuggestionDrop.value && isSuggestionDragActive()) {
      syncActiveDragKind();
      dragOverStepId.value = null;
      dropTargetIndex.value = index;
      event.dataTransfer!.dropEffect = 'copy';
    }
  }

  function onInsertZoneDragLeave(index: number, event: DragEvent) {
    const zone = event.currentTarget as HTMLElement;
    const related = event.relatedTarget;
    if (related instanceof Node && zone.contains(related)) return;
    if (dropTargetIndex.value === index) dropTargetIndex.value = null;
  }

  function onInsertZoneDrop(index: number, event: DragEvent) {
    const draggedId = draggedStepIdForDrop(event);
    if (draggedId) {
      options.onReorder(draggedId, index);
      clearDndState();
      return;
    }
    const suggestionId = draggedSuggestionIdForDrop(event);
    if (options.acceptSuggestionDrop.value && suggestionId) {
      options.onDropSuggestion(suggestionId, index);
      clearDndState();
    }
  }

  return {
    draggingStepId,
    dragOverStepId,
    dropTargetIndex,
    activeDragKind,
    chainDndHover,
    isDndActive,
    clearDndState,
    dropHintAtIndex,
    onChainDragEnter,
    onChainDragLeave,
    onStepDragStart,
    onStepDragEnd,
    onStepDragOver,
    onStepDragLeave,
    onStepDrop,
    onInsertZoneDragOver,
    onInsertZoneDragLeave,
    onInsertZoneDrop,
  };
}
