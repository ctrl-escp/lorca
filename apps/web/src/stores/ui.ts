import {defineStore} from 'pinia';
import {ref} from 'vue';

export type EditorContext = 'pipeline' | 'capsule';
export type RightPaneTab = 'inspector' | 'interface' | 'trace' | 'output';

export interface UiState {
  editorContext: EditorContext;
  activeCapsuleEditId: string | null;
  selectedNodeId: string | null;
  rightPaneTab: RightPaneTab;
  leftPaneWidth: number;
  rightPaneWidth: number;
}

export const useUiStore = defineStore('ui', () => {
  const editorContext = ref<EditorContext>('pipeline');
  const activeCapsuleEditId = ref<string | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const rightPaneTab = ref<RightPaneTab>('inspector');
  const leftPaneWidth = ref(280);
  const rightPaneWidth = ref(360);

  function openCapsuleEditor(capsuleId: string) {
    editorContext.value = 'capsule';
    activeCapsuleEditId.value = capsuleId;
    selectedNodeId.value = null;
  }

  function closeCapsuleEditor() {
    editorContext.value = 'pipeline';
    activeCapsuleEditId.value = null;
    selectedNodeId.value = null;
  }

  function selectNode(nodeId: string | null) {
    selectedNodeId.value = nodeId;
  }

  function setRightPaneTab(tab: RightPaneTab) {
    rightPaneTab.value = tab;
  }

  return {
    editorContext,
    activeCapsuleEditId,
    selectedNodeId,
    rightPaneTab,
    leftPaneWidth,
    rightPaneWidth,
    openCapsuleEditor,
    closeCapsuleEditor,
    selectNode,
    setRightPaneTab,
  };
});
