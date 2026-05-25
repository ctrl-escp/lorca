<template>
  <aside class="left-pane">
    <LeftPaneStepLibrary
      :expanded="isExpanded('stepLibrary')"
      @toggle="toggleSection('stepLibrary')"
    />
    <LeftPaneCapsulesSection
      :expanded="isExpanded('capsules')"
      @toggle="toggleSection('capsules')"
      @delete-request="requestDeleteCapsule"
    />
    <LeftPaneModelsSection
      :expanded="isExpanded('models')"
      @toggle="toggleSection('models')"
    />
    <LeftPaneEndpointsSection
      :expanded="isExpanded('endpoints')"
      @toggle="toggleSection('endpoints')"
    />
  </aside>

  <ConfirmDialog
    :open="replaceConfirmOpen"
    title="Replace Pipeline"
    :message="replaceConfirmMessage"
    confirm-label="Replace"
    :destructive="true"
    @confirm="resolveReplaceConfirm(true)"
    @cancel="resolveReplaceConfirm(false)"
  />

  <ContextMenu
    :open="contextMenu.menu.value !== null"
    :x="contextMenu.menu.value?.x ?? 0"
    :y="contextMenu.menu.value?.y ?? 0"
    :items="contextMenu.menu.value?.items ?? []"
    @select="contextMenu.select"
    @close="contextMenu.close"
  />

  <ConfirmDialog
    :open="disableWarnOpen"
    title="Steps will be affected"
    :message="disableWarnMessage"
    confirm-label="Disable anyway"
    :destructive="true"
    @confirm="resolveDisableWarn(true)"
    @cancel="resolveDisableWarn(false)"
  />

  <ConfirmDialog
    :open="deleteCapsuleConfirm.open"
    title="Delete Capsule"
    :message="deleteCapsuleConfirm.message"
    confirm-label="Delete"
    :destructive="true"
    @confirm="confirmDeleteCapsule"
    @cancel="cancelDeleteCapsule"
  />
</template>

<script setup lang="ts">
import {ref, provide, onMounted} from 'vue';
import type {LeftPaneSection} from '../stores/ui.js';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {useCapsulesStore} from '../stores/capsules.js';
import {useUiStore} from '../stores/ui.js';
import {useLeftPaneContextMenu} from '../composables/useLeftPaneContextMenu.js';
import {usePipelineImpactWarning} from '../composables/usePipelineImpactWarning.js';
import {LEFT_PANE_CONTEXT_MENU_KEY, SUGGESTION_REPLACE_KEY} from './leftPane/injection.js';
import LeftPaneStepLibrary from './leftPane/LeftPaneStepLibrary.vue';
import LeftPaneCapsulesSection from './leftPane/LeftPaneCapsulesSection.vue';
import LeftPaneModelsSection from './leftPane/LeftPaneModelsSection.vue';
import LeftPaneEndpointsSection from './leftPane/LeftPaneEndpointsSection.vue';
import ContextMenu from './shared/ContextMenu.vue';
import {ConfirmDialog} from '@lorca/ui-kit';

const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const capsulesStore = useCapsulesStore();
const uiStore = useUiStore();

const contextMenu = useLeftPaneContextMenu();
provide(LEFT_PANE_CONTEXT_MENU_KEY, contextMenu);

const replaceConfirmOpen = ref(false);
const replaceConfirmMessage = ref('');
let replaceConfirmResolve: ((v: boolean) => void) | null = null;

function resolveReplaceConfirm(value: boolean) {
  replaceConfirmOpen.value = false;
  replaceConfirmResolve?.(value);
  replaceConfirmResolve = null;
}

function confirmSuggestionReplace(name: string): Promise<boolean> {
  replaceConfirmMessage.value = `Replace the current pipeline with "${name}"?\n\nExisting steps and prompt will be cleared.`;
  return new Promise((resolve) => {
    replaceConfirmResolve = resolve;
    replaceConfirmOpen.value = true;
  });
}

provide(SUGGESTION_REPLACE_KEY, confirmSuggestionReplace);

const {
  disableWarnOpen,
  disableWarnMessage,
  resolveDisableWarn,
} = usePipelineImpactWarning();

const deleteCapsuleConfirm = ref({open: false, message: '', targetId: ''});

function requestDeleteCapsule({id, name}: {id: string; name: string}) {
  deleteCapsuleConfirm.value = {
    open: true,
    message: `Delete "${name || 'this capsule'}"? This cannot be undone.`,
    targetId: id,
  };
}

function confirmDeleteCapsule() {
  const id = deleteCapsuleConfirm.value.targetId;
  deleteCapsuleConfirm.value = {open: false, message: '', targetId: ''};
  if (uiStore.activeCapsuleEditId === id) uiStore.closeCapsuleEditor();
  capsulesStore.removeCapsule(id);
}

function cancelDeleteCapsule() {
  deleteCapsuleConfirm.value = {open: false, message: '', targetId: ''};
}

onMounted(async () => {
  await endpointsStore.load();
  await modelsStore.load();
  uiStore.expandLeftPaneSection(
    modelsStore.models.length === 0 ? 'endpoints' : 'stepLibrary',
  );
});

function isExpanded(section: LeftPaneSection): boolean {
  return uiStore.leftPaneExpandedSection === section;
}

function toggleSection(section: LeftPaneSection) {
  uiStore.toggleLeftPaneSection(section);
}
</script>

<style scoped>
.left-pane { width: 100%; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
</style>
