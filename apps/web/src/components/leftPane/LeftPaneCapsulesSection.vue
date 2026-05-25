<template>
  <LeftPaneSectionShell
    :expanded="expanded"
    title="Capsules"
    title-class="hdr-capsule"
    :count="visibleCapsules.length"
    @toggle="$emit('toggle')"
  >
    <template #actions>
      <button class="icon-btn" title="Import a Capsule from a JSON file" @click="onImportCapsule">↓</button>
      <button class="icon-btn" title="Create a new empty Capsule" @click="onNewCapsule">+</button>
    </template>

    <div class="capsule-list">
      <div
        v-for="cap in visibleCapsules"
        :key="`${cap.id}::${cap.version}`"
        class="capsule-row"
        :class="{active: uiStore.activeCapsuleEditId === cap.id}"
        @contextmenu.prevent.stop="openCapsuleContextMenu(cap, $event)"
      >
        <div
          class="capsule-row-main"
          :title="`Open Capsule editor: ${cap.name || '(unnamed)'} (${cap.version}, ${cap.status})`"
          @click="uiStore.openCapsuleEditor(cap.id)"
        >
          <span class="capsule-row-name">{{ cap.name || '(unnamed)' }}</span>
          <span class="capsule-row-meta">
            {{ cap.version }} ·
            <span class="capsule-status" :class="`cs-${cap.status}`">{{ cap.status }}</span>
          </span>
        </div>
        <button
          v-if="isPipelineContext"
          class="btn-insert-capsule"
          type="button"
          title="Insert Capsule instance into pipeline"
          @click.stop="onInsertCapsule(cap.id)"
        >↓ Insert</button>
        <button
          class="btn-dup-capsule"
          type="button"
          title="Duplicate as editable draft"
          @click.stop="onDuplicateCapsule(cap.id)"
        >⊕</button>
        <button
          v-if="canDeleteCapsule(cap.id)"
          class="btn-delete-capsule"
          type="button"
          title="Delete this capsule"
          @click.stop="emit('delete-request', {id: cap.id, name: cap.name})"
        >×</button>
      </div>
      <p v-if="visibleCapsules.length === 0" class="empty-hint">No Capsules yet.</p>
    </div>
  </LeftPaneSectionShell>
</template>

<script setup lang="ts">
import {computed, inject} from 'vue';
import type {CapsuleDefinition} from '@lorca/core';
import {isBuiltinExampleId} from '@lorca/capsules';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useUiStore} from '../../stores/ui.js';
import {useImportExportStore} from '../../stores/importExport.js';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useModelsStore} from '../../stores/models.js';
import {pickJsonFile} from '../../utils/importFile.js';
import {newId} from '../../utils/id.js';
import {buildCapsuleSlotBindings} from '../../utils/capsuleSlotModels.js';
import {LEFT_PANE_CONTEXT_MENU_KEY} from './injection.js';
import LeftPaneSectionShell from './LeftPaneSectionShell.vue';

defineProps<{expanded: boolean}>();
const emit = defineEmits<{
  toggle: [];
  'delete-request': [payload: {id: string; name: string}];
}>();

const FEATURED_CAPSULE_IDS = ['example-best-of-two', 'example-expert'];

const capsulesStore = useCapsulesStore();
const uiStore = useUiStore();
const importStore = useImportExportStore();
const pipelineEditorStore = usePipelineEditorStore();
const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const contextMenu = inject(LEFT_PANE_CONTEXT_MENU_KEY)!;

const isPipelineContext = computed(() => uiStore.editorContext === 'pipeline');

const visibleCapsules = computed(() => {
  const priority = new Map(FEATURED_CAPSULE_IDS.map((id, index) => [id, index]));
  return [...capsulesStore.allCapsules].sort((a, b) => {
    const aPriority = priority.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bPriority = priority.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return 0;
  });
});

function canDeleteCapsule(id: string): boolean {
  return !isBuiltinExampleId(id) && capsulesStore.capsules.some((c) => c.id === id);
}

function onInsertCapsule(capsuleId: string) {
  if (!isPipelineContext.value) return;
  const cap = capsulesStore.getCapsule(capsuleId);
  if (!cap) return;
  const stepId = pipelineEditorStore.insertCapsuleInstance(cap);
  assignCapsuleSlotModels(stepId, cap);
  if (stepId) pipelineEditorStore.selectStep(stepId);
}

function assignCapsuleSlotModels(stepId: string | null, capsule: CapsuleDefinition) {
  if (!stepId || capsule.interface.modelSlots.length === 0) return;
  const step = pipelineEditorStore.pipeline.steps.find((s) => s.id === stepId);
  if (!step || step.config.type !== 'capsule-instance') return;
  const disabledEpIds = new Set(endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id));
  const enabledModels = modelsStore.models.filter((m) => m.enabled !== false && !disabledEpIds.has(m.endpointId));
  pipelineEditorStore.updateStepConfig(stepId, {
    config: {
      ...step.config,
      modelSlotBindings: buildCapsuleSlotBindings(capsule, enabledModels, step.config.modelSlotBindings ?? {}),
    },
  });
}

function onDuplicateCapsule(capsuleId: string) {
  const duplicatedId = capsulesStore.duplicateCapsule(capsuleId);
  if (duplicatedId) uiStore.openCapsuleEditor(duplicatedId);
}

function openCapsuleContextMenu(cap: CapsuleDefinition, event: MouseEvent) {
  contextMenu.open(
    event,
    [
      {id: 'open', label: 'Open Capsule editor'},
      {id: 'insert', label: 'Insert into pipeline', disabled: !isPipelineContext.value},
      {id: 'duplicate', label: 'Duplicate as draft'},
      {id: 'sep-delete', separator: true},
      {id: 'delete', label: 'Delete Capsule', disabled: !canDeleteCapsule(cap.id), danger: true},
    ],
    {
      open: () => uiStore.openCapsuleEditor(cap.id),
      insert: () => onInsertCapsule(cap.id),
      duplicate: () => onDuplicateCapsule(cap.id),
      delete: () => emit('delete-request', {id: cap.id, name: cap.name}),
    },
  );
}

function onNewCapsule() {
  uiStore.expandLeftPaneSection('capsules');
  const id = newId('cap');
  const now = new Date().toISOString();
  capsulesStore.addCapsule({
    schemaVersion: 1,
    id,
    name: 'New Capsule',
    version: 'v1',
    status: 'draft',
    interface: {inputs: [], outputs: [], parameters: [], modelSlots: []},
    steps: [],
    tests: [],
    createdAt: now,
    updatedAt: now,
  });
  uiStore.openCapsuleEditor(id);
}

function onImportCapsule() {
  uiStore.expandLeftPaneSection('capsules');
  pickJsonFile((text) => {
    try {
      const data = importStore.parseImportJson(text);
      importStore.beginCapsuleImport(data);
    } catch {
      importStore.setImportErrors(['Import file is not valid JSON']);
    }
  });
}
</script>

<style scoped>
.capsule-list { display: flex; flex-direction: column; gap: 0.5rem; }

.capsule-row {
  padding: 0.7rem 0.85rem; border-radius: 6px; border: 1px solid #222;
  display: flex; align-items: center; gap: 0.5rem; background: #1a1a1a;
}
.capsule-row:hover { background: #222; border-color: #333; }
.capsule-row.active { background: #1e2d3d; border-color: #2a4d6e; }
.capsule-row-main { flex: 1; min-width: 0; cursor: pointer; display: flex; flex-direction: column; gap: 0.25rem; }
.capsule-row-name { font-size: 0.95rem; font-weight: 500; }
.capsule-row-meta { font-size: 0.78rem; color: var(--text-secondary); }
.capsule-status { font-size: 0.72rem; padding: 1px 5px; border-radius: 3px; }
.cs-draft { color: #c8a050; }
.cs-locked { color: var(--accent); background: var(--accent-bg-muted); border: 1px solid var(--accent-border-muted); }
.btn-insert-capsule {
  flex-shrink: 0;
  font-size: 0.82rem;
  padding: 6px 11px;
  background: var(--accent-bg-muted);
  border: 1px solid var(--accent-border-muted);
  color: #9d6db8;
  border-radius: 5px;
  cursor: pointer;
}
.btn-insert-capsule:hover { background: #243040; }
.btn-dup-capsule {
  flex-shrink: 0;
  font-size: 0.9rem;
  padding: 5px 8px;
  background: transparent;
  border: 1px solid #333;
  color: var(--text-label);
  border-radius: 5px;
  cursor: pointer;
}
.btn-dup-capsule:hover { color: #ccc; border-color: var(--text-secondary); }
.btn-delete-capsule {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 1rem;
  padding: 0 2px;
  line-height: 1;
}
.btn-delete-capsule:hover { color: #e07070; }

.empty-hint { font-size: 0.88rem; color: var(--text-secondary); margin: 0; }

.icon-btn { background: none; border: 1px solid #333; color: var(--text-label); border-radius: 5px; width: 36px; height: 36px; cursor: pointer; font-size: 1.2rem; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn:hover:not(:disabled) { background: #222; color: #ccc; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.icon-btn.active { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent); }
</style>
