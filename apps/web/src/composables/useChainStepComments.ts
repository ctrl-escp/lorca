import {reactive, ref} from 'vue';
import type {PipelineStep} from '@lorca/core';

export function useChainStepComments(onUpdate: (stepId: string, comment: string) => void) {
  const expandedCommentStepIds = ref<Set<string>>(new Set());
  const commentDrafts = reactive<Record<string, string>>({});

  function isCommentExpanded(stepId: string): boolean {
    return expandedCommentStepIds.value.has(stepId);
  }

  function toggleComment(step: PipelineStep) {
    const next = new Set(expandedCommentStepIds.value);
    if (next.has(step.id)) {
      next.delete(step.id);
    } else {
      commentDrafts[step.id] = step.description ?? '';
      next.add(step.id);
    }
    expandedCommentStepIds.value = next;
  }

  function saveComment(stepId: string) {
    onUpdate(stepId, commentDrafts[stepId] ?? '');
    const next = new Set(expandedCommentStepIds.value);
    next.delete(stepId);
    expandedCommentStepIds.value = next;
  }

  function cancelComment(step: PipelineStep) {
    commentDrafts[step.id] = step.description ?? '';
    const next = new Set(expandedCommentStepIds.value);
    next.delete(step.id);
    expandedCommentStepIds.value = next;
  }

  return {
    expandedCommentStepIds,
    commentDrafts,
    isCommentExpanded,
    toggleComment,
    saveComment,
    cancelComment,
  };
}

export function useChainStepOutputPreview() {
  const expandedOutputStepIds = ref<Set<string>>(new Set());

  function isStepOutputCollapsed(stepId: string): boolean {
    return !expandedOutputStepIds.value.has(stepId);
  }

  function toggleStepOutput(stepId: string) {
    const next = new Set(expandedOutputStepIds.value);
    if (next.has(stepId)) next.delete(stepId);
    else next.add(stepId);
    expandedOutputStepIds.value = next;
  }

  return {isStepOutputCollapsed, toggleStepOutput};
}
