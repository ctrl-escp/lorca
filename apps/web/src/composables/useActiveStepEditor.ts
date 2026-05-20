import {useUiStore} from '../stores/ui.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useCapsuleStepEditorStore} from '../stores/capsuleStepEditor.js';

/** Pipeline or Capsule step editor, depending on the active center pane. */
export function useActiveStepEditor() {
  const ui = useUiStore();
  if (ui.editorContext === 'capsule') return useCapsuleStepEditorStore();
  return usePipelineEditorStore();
}
