import {ref} from 'vue';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';

export function usePipelineImpactWarning() {
  const pipelineEditorStore = usePipelineEditorStore();
  const disableWarnOpen = ref(false);
  const disableWarnMessage = ref('');
  let disableWarnResolve: ((value: boolean) => void) | null = null;

  function stepsUsingEndpoint(endpointId: string) {
    return pipelineEditorStore.steps.filter(
      (s) => s.config.type === 'model-call' && s.config.modelRef.kind === 'fixed' && s.config.modelRef.endpointId === endpointId,
    );
  }

  function stepsUsingModel(endpointId: string, modelName: string) {
    return pipelineEditorStore.steps.filter(
      (s) =>
        s.config.type === 'model-call' &&
        s.config.modelRef.kind === 'fixed' &&
        s.config.modelRef.endpointId === endpointId &&
        s.config.modelRef.modelName === modelName,
    );
  }

  function resolveDisableWarn(value: boolean) {
    disableWarnOpen.value = false;
    disableWarnResolve?.(value);
    disableWarnResolve = null;
  }

  function confirmDisable(entityName: string, affectedLabels: string[]): Promise<boolean> {
    const list = affectedLabels.map((l) => `• ${l}`).join('\n');
    disableWarnMessage.value = `Disabling "${entityName}" affects ${affectedLabels.length} step(s) in the current pipeline:\n\n${list}\n\nThese steps will not execute while disabled.`;
    return new Promise((resolve) => {
      disableWarnResolve = resolve;
      disableWarnOpen.value = true;
    });
  }

  return {
    disableWarnOpen,
    disableWarnMessage,
    resolveDisableWarn,
    confirmDisable,
    stepsUsingEndpoint,
    stepsUsingModel,
  };
}
