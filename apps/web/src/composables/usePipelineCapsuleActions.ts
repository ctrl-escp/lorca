import type {Ref} from 'vue';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useCapsulesStore} from '../stores/capsules.js';
import {usePipelinesStore} from '../stores/pipelines.js';
import {useUiStore} from '../stores/ui.js';
import {formatPipelineValidationError} from '../utils/editorValidation.js';

export interface ModalPromises {
  showConfirm: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
  }) => Promise<boolean>;
  showPrompt: (options: {
    title: string;
    label: string;
    defaultValue?: string;
  }) => Promise<string | null>;
}

export function usePipelineCapsuleActions(options: {
  inlineError: Ref<string | null>;
  closeMoreMenu?: () => void;
  modals: ModalPromises;
}) {
  const editorStore = usePipelineEditorStore();
  const capsulesStore = useCapsulesStore();
  const pipelinesStore = usePipelinesStore();
  const uiStore = useUiStore();

  function handleWrapInRetryLoop() {
    options.closeMoreMenu?.();
    const range = editorStore.getSelectionRange();
    if (!range) {
      options.inlineError.value = 'Select steps to wrap. Shift+click to select a range ending with a verification step.';
      return;
    }
    const stepCount = range.endIndex - range.startIndex + 1;
    const result = editorStore.wrapSelectionInRetryLoop(
      stepCount === 2 ? `Retry: ${editorStore.steps[range.endIndex]?.label ?? 'loop'}` : undefined,
    );
    if (!result.ok) {
      options.inlineError.value = result.message;
      return;
    }
    options.inlineError.value = null;
    uiStore.setRightPaneTab('inspector');
  }

  async function handleLockSelectionAsCapsule() {
    options.closeMoreMenu?.();
    if (editorStore.steps.length === 0) {
      options.inlineError.value = 'Add steps before locking a Capsule.';
      return;
    }
    const validationError = formatPipelineValidationError(editorStore.pipeline, {
      resolveCapsule: (id, version) => capsulesStore.getCapsule(id, version),
    });
    if (validationError) {
      options.inlineError.value = `Cannot lock: ${validationError}`;
      return;
    }
    const range = editorStore.getSelectionRange();
    const stepCount = range ? range.endIndex - range.startIndex + 1 : editorStore.steps.length;
    const confirmed = await options.modals.showConfirm({
      title: 'Lock as Capsule',
      message: range
        ? `Replace ${stepCount} selected step(s) with a locked Capsule instance?`
        : `Replace all ${stepCount} pipeline step(s) with a locked Capsule instance?`,
      confirmLabel: 'Lock',
      destructive: true,
    });
    if (!confirmed) return;
    const defaultName = range ? editorStore.selectedStep?.label ?? 'Pipeline Capsule' : editorStore.pipeline.name || 'Pipeline Capsule';
    const name = await options.modals.showPrompt({title: 'Name this Capsule', label: 'Capsule name', defaultValue: defaultName});
    if (!name) return;
    const result = editorStore.lockSelectionAsCapsule(name);
    if (!result.ok) {
      options.inlineError.value = result.message;
      return;
    }
    capsulesStore.addCapsule(result.capsule);
    await pipelinesStore.save(editorStore.pipeline);
    options.inlineError.value = null;
    uiStore.setRightPaneTab('inspector');
  }

  function handleSpreadCapsule(stepId: string) {
    const result = editorStore.spreadCapsule(stepId);
    if (!result.ok) {
      options.inlineError.value = result.message;
      return;
    }
    options.inlineError.value = null;
    uiStore.setRightPaneTab('inspector');
  }

  async function handleLockInlineCapsule(stepId: string) {
    const step = editorStore.steps.find((s) => s.id === stepId);
    const defaultName = step?.label ?? 'Inline Capsule';
    const name = await options.modals.showPrompt({title: 'Name this Capsule', label: 'Capsule name', defaultValue: defaultName});
    if (!name) return;
    const confirmed = await options.modals.showConfirm({
      title: 'Lock inline Capsule',
      message: 'Save these inline steps as a locked Capsule and point this instance at it?',
      confirmLabel: 'Lock',
    });
    if (!confirmed) return;
    const result = editorStore.lockInlineCapsuleAsCapsule(stepId, name);
    if (!result.ok) {
      options.inlineError.value = result.message;
      return;
    }
    capsulesStore.addCapsule(result.capsule);
    await pipelinesStore.save(editorStore.pipeline);
    options.inlineError.value = null;
  }

  async function handleDetachCapsule(stepId: string) {
    const confirmed = await options.modals.showConfirm({
      title: 'Detach Capsule',
      message: 'Replace this Capsule instance with its inline steps and break the link?',
      confirmLabel: 'Detach',
      destructive: true,
    });
    if (!confirmed) return;
    const result = editorStore.detachCapsule(stepId);
    if (!result.ok) {
      options.inlineError.value = result.message;
      return;
    }
    await pipelinesStore.save(editorStore.pipeline);
    options.inlineError.value = null;
  }

  return {
    handleWrapInRetryLoop,
    handleLockSelectionAsCapsule,
    handleSpreadCapsule,
    handleLockInlineCapsule,
    handleDetachCapsule,
  };
}
