import {defineStore} from 'pinia';
import {ref, watch} from 'vue';

export type EditorContext = 'pipeline' | 'capsule';
export type RightPaneTab = 'inspector' | 'interface' | 'trace' | 'output';
export type LeftPaneSection = 'endpoints' | 'suggestions' | 'stepTypes' | 'capsules' | 'models';

export interface UiState {
  editorContext: EditorContext;
  activeCapsuleEditId: string | null;
  selectedNodeId: string | null;
  rightPaneTab: RightPaneTab;
  leftPaneWidth: number;
  rightPaneWidth: number;
}

const PANE_SIZE_STORAGE_KEY = 'lorca:ui:paneSizes';

function readPersistedSizes(): {left: number; right: number} {
  try {
    const raw = localStorage.getItem(PANE_SIZE_STORAGE_KEY);
    if (!raw) return {left: 280, right: 360};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      return {
        left: typeof p.left === 'number' ? p.left : 280,
        right: typeof p.right === 'number' ? p.right : 360,
      };
    }
  } catch {
    // ignore
  }
  return {left: 280, right: 360};
}

export const useUiStore = defineStore('ui', () => {
  const editorContext = ref<EditorContext>('pipeline');
  const activeCapsuleEditId = ref<string | null>(null);
  const selectedNodeId = ref<string | null>(null);
  const rightPaneTab = ref<RightPaneTab>('inspector');
  const sizes = readPersistedSizes();
  const leftPaneWidth = ref(sizes.left);
  const rightPaneWidth = ref(sizes.right);
  const leftPaneExpandedSection = ref<LeftPaneSection | null>(null);

  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  watch([leftPaneWidth, rightPaneWidth], ([l, r]) => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      localStorage.setItem(PANE_SIZE_STORAGE_KEY, JSON.stringify({left: l, right: r}));
    }, 250);
  });

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

  function toggleLeftPaneSection(section: LeftPaneSection) {
    leftPaneExpandedSection.value = leftPaneExpandedSection.value === section ? null : section;
  }

  function expandLeftPaneSection(section: LeftPaneSection) {
    leftPaneExpandedSection.value = section;
  }

  function selectNodeAndInspect(nodeId: string | null) {
    selectedNodeId.value = nodeId;
    if (nodeId) rightPaneTab.value = 'inspector';
  }

  return {
    editorContext,
    activeCapsuleEditId,
    selectedNodeId,
    rightPaneTab,
    leftPaneWidth,
    rightPaneWidth,
    leftPaneExpandedSection,
    openCapsuleEditor,
    closeCapsuleEditor,
    selectNode,
    selectNodeAndInspect,
    setRightPaneTab,
    toggleLeftPaneSection,
    expandLeftPaneSection,
  };
});
