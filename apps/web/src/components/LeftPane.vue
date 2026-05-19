<template>
  <aside class="left-pane">

    <!-- Step Suggestions (replaces destructive Examples) -->
    <section class="pane-section" :class="{expanded: isExpanded('suggestions')}">
      <div class="section-header" @click="toggleSection('suggestions')">
        <button type="button" class="section-toggle" :aria-expanded="isExpanded('suggestions')" title="Insertable step recipes — click to insert into the current pipeline">
          <span class="chevron" :class="{open: isExpanded('suggestions')}">›</span>
          <span class="section-title">Step Suggestions <span class="section-count">({{ BUILTIN_SUGGESTIONS.length }})</span></span>
        </button>
      </div>
      <div v-if="isExpanded('suggestions')" class="section-body">
        <div class="suggestion-list">
          <div
            v-for="suggestion in BUILTIN_SUGGESTIONS"
            :key="suggestion.id"
            class="suggestion-row"
            :title="suggestion.description"
          >
            <div class="suggestion-row-main">
              <span class="suggestion-row-name">{{ suggestion.name }}</span>
              <span class="suggestion-row-desc">{{ suggestion.description }}</span>
              <span class="suggestion-row-category">{{ suggestion.category }}</span>
            </div>
            <div class="suggestion-row-actions">
              <button
                class="btn-insert-suggestion"
                type="button"
                title="Insert after selected step (or append)"
                @click.stop="onInsertSuggestion(suggestion)"
              >
                ↓ Insert
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Capsules -->
    <section class="pane-section" :class="{expanded: isExpanded('capsules')}">
      <div class="section-header" @click="toggleSection('capsules')">
        <button type="button" class="section-toggle" :aria-expanded="isExpanded('capsules')" title="Your saved reusable mini-pipelines">
          <span class="chevron" :class="{open: isExpanded('capsules')}">›</span>
          <span class="section-title">Capsules <span class="section-count">({{ capsulesStore.capsules.length }})</span></span>
        </button>
        <div class="section-actions" @click.stop>
          <button class="icon-btn" @click="onImportCapsule" title="Import a Capsule from a JSON file">↓</button>
          <button class="icon-btn" @click="onNewCapsule" title="Create a new empty Capsule">+</button>
        </div>
      </div>
      <div v-if="isExpanded('capsules')" class="section-body">
        <div class="capsule-list">
          <div
            v-for="cap in capsulesStore.capsules"
            :key="cap.id"
            class="capsule-row"
            :class="{active: uiStore.activeCapsuleEditId === cap.id}"
          >
            <div
              class="capsule-row-main"
              :title="`Open Capsule editor: ${cap.name || '(unnamed)'} (${cap.version}, ${cap.status})`"
              @click="uiStore.openCapsuleEditor(cap.id)"
            >
              <span class="capsule-row-name">{{ cap.name || '(unnamed)' }}</span>
              <span class="capsule-row-meta">{{ cap.version }} · {{ cap.status }}</span>
            </div>
            <button
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
          </div>
          <p v-if="capsulesStore.capsules.length === 0" class="empty-hint">No Capsules yet.</p>
        </div>
      </div>
    </section>

    <!-- Models -->
    <section class="pane-section" :class="{expanded: isExpanded('models')}">
      <div class="section-header" @click="toggleSection('models')">
        <button type="button" class="section-toggle" :aria-expanded="isExpanded('models')" title="Discovered and manually added models available for pipeline steps">
          <span class="chevron" :class="{open: isExpanded('models')}">›</span>
          <span class="section-title">Models <span class="section-count">({{ modelsStore.models.length }})</span></span>
        </button>
        <button class="icon-btn" :class="{active: showAddModel}" :disabled="endpointsStore.endpoints.length === 0" title="Add model manually" @click.stop="openAddModel">+</button>
      </div>
      <div v-if="isExpanded('models')" class="section-body">
        <AddModelForm v-if="showAddModel" :endpoints="endpointsStore.endpoints" @add="onAddModel" @cancel="showAddModel = false" />
        <div class="model-list">
          <div v-for="model in modelsStore.models" :key="model.id" class="model-row">
            <div class="model-row-header">
              <span class="model-name">{{ model.displayName }}</span>
              <span class="model-source" :class="`source-${model.source}`">{{ model.source }}</span>
            </div>
            <ModelBucketEditor :model="model" @update="onUpdateBuckets(model.id, $event)" />
          </div>
          <p v-if="modelsStore.models.length === 0" class="empty-hint">No models. Discover from an endpoint or add manually.</p>
        </div>
      </div>
    </section>

    <!-- Endpoints -->
    <section class="pane-section" :class="{expanded: isExpanded('endpoints')}">
      <div class="section-header" @click="toggleSection('endpoints')">
        <button type="button" class="section-toggle" :aria-expanded="isExpanded('endpoints')" title="AI server connections">
          <span class="chevron" :class="{open: isExpanded('endpoints')}">›</span>
          <span class="section-title">Endpoints <span class="section-count">({{ endpointsStore.endpoints.length }})</span></span>
        </button>
        <button class="icon-btn" :class="{active: showAddEndpoint}" title="Add a new AI endpoint" @click.stop="openAddEndpoint">+</button>
      </div>
      <div v-if="isExpanded('endpoints')" class="section-body">
        <AddEndpointForm v-if="showAddEndpoint" @add="onAddEndpoint" @cancel="showAddEndpoint = false" />
        <div class="ep-list">
          <EndpointCard
            v-for="ep in endpointsStore.endpoints"
            :key="ep.id"
            :endpoint="ep"
            :model-count="(modelsStore.modelsByEndpoint.get(ep.id) ?? []).length"
            :is-testing="epActions.testing.value.has(ep.id)"
            :is-discovering="epActions.discovering.value.has(ep.id)"
            @test="epActions.testAccess"
            @discover="epActions.discoverModels"
            @remove="onRemoveEndpoint"
          />
          <p v-if="endpointsStore.endpoints.length === 0" class="empty-hint">No endpoints yet. Add one above.</p>
        </div>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import {ref, onMounted} from 'vue';
import type {AiEndpointConfig, DiscoveredModel, ModelUsageBucket} from '@lorca/core';
import type {LeftPaneSection} from '../stores/ui.js';
import {BUILTIN_SUGGESTIONS, instantiateSuggestion} from '@lorca/capsules';
import type {PipelineSuggestion} from '@lorca/capsules';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {useCapsulesStore} from '../stores/capsules.js';
import {useUiStore} from '../stores/ui.js';
import {useImportExportStore} from '../stores/importExport.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useEndpointActions} from '../composables/useEndpointActions.js';
import {pickJsonFile} from '../utils/importFile.js';
import {newId} from '../utils/id.js';
import EndpointCard from './endpoints/EndpointCard.vue';
import AddEndpointForm from './endpoints/AddEndpointForm.vue';
import AddModelForm from './models/AddModelForm.vue';
import ModelBucketEditor from './models/ModelBucketEditor.vue';

const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const capsulesStore = useCapsulesStore();
const uiStore = useUiStore();
const importStore = useImportExportStore();
const editorStore = usePipelineEditorStore();
const epActions = useEndpointActions();

const showAddEndpoint = ref(false);
const showAddModel = ref(false);

onMounted(async () => {
  await endpointsStore.load();
  await modelsStore.load();
  uiStore.expandLeftPaneSection(
    modelsStore.models.length === 0 ? 'endpoints' : 'suggestions',
  );
});

function isExpanded(section: LeftPaneSection): boolean {
  return uiStore.leftPaneExpandedSection === section;
}

function toggleSection(section: LeftPaneSection) {
  uiStore.toggleLeftPaneSection(section);
}

function openAddEndpoint() {
  uiStore.expandLeftPaneSection('endpoints');
  showAddEndpoint.value = !showAddEndpoint.value;
}

function openAddModel() {
  uiStore.expandLeftPaneSection('models');
  showAddModel.value = !showAddModel.value;
}

async function onAddEndpoint(config: AiEndpointConfig) {
  await endpointsStore.addEndpoint(config);
  showAddEndpoint.value = false;
}

async function onRemoveEndpoint(id: string) {
  await endpointsStore.removeEndpoint(id);
  await modelsStore.removeModelsForEndpoint(id);
}

async function onAddModel(model: DiscoveredModel) {
  await modelsStore.addModel(model);
  showAddModel.value = false;
}

function onInsertCapsule(capsuleId: string) {
  const cap = capsulesStore.getCapsule(capsuleId);
  if (!cap) return;
  const stepId = editorStore.insertCapsuleInstance(cap);
  if (stepId) editorStore.selectStep(stepId);
}

function onDuplicateCapsule(capsuleId: string) {
  const newId = capsulesStore.duplicateCapsule(capsuleId);
  if (newId) uiStore.openCapsuleEditor(newId);
}

function onInsertSuggestion(suggestion: PipelineSuggestion) {
  const existingNamespaces = new Set(editorStore.steps.map((s) => s.outputNamespace));
  const newSteps = instantiateSuggestion(suggestion, existingNamespaces);

  const anchorId = editorStore.selectedStepId;
  for (const step of newSteps) {
    if (anchorId) {
      editorStore.insertStepAfter(anchorId, step);
    } else {
      editorStore.appendStep(step);
    }
  }
  if (newSteps.length > 0) {
    editorStore.selectStep(newSteps[newSteps.length - 1]!.id);
  }
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
    nodes: [{id: `${id}-input`, type: 'input'}],
    edges: [],
    outputRef: {nodeId: `${id}-input`, outputName: 'xml'},
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

async function onUpdateBuckets(modelId: string, buckets: ModelUsageBucket[] | undefined) {
  if (buckets === undefined) {
    const model = modelsStore.models.find((m) => m.id === modelId);
    if (model) {
      const {userBuckets: _removed, ...rest} = model;
      await modelsStore.addModel(rest);
    }
  } else {
    await modelsStore.setUserBuckets(modelId, buckets);
  }
}
</script>

<style scoped>
.left-pane { width: 100%; height: 100%; overflow: hidden; display: flex; flex-direction: column; }

.pane-section {
  flex-shrink: 0; border-bottom: 1px solid #222;
  display: flex; flex-direction: column; min-height: 0;
}
.pane-section.expanded { flex: 1; min-height: 0; }

.section-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.5rem 0.75rem; cursor: pointer; flex-shrink: 0; user-select: none;
}
.section-header:hover { background: #151515; }

.section-toggle {
  display: flex; align-items: center; gap: 0.35rem;
  background: none; border: none; padding: 0; cursor: pointer;
  color: inherit; flex: 1; min-width: 0; text-align: left;
}

.chevron { display: inline-block; font-size: 0.85rem; color: #555; transition: transform 0.15s; width: 0.75rem; flex-shrink: 0; }
.chevron.open { transform: rotate(90deg); color: #7ec8e3; }

.section-title { font-size: 0.72rem; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.06em; }
.section-count { font-weight: 500; color: #555; letter-spacing: 0; }

.section-actions { display: flex; gap: 0.25rem; }

.section-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 0.75rem 0.75rem; display: flex; flex-direction: column; gap: 0.3rem; }

.icon-btn { background: none; border: 1px solid #333; color: #888; border-radius: 4px; width: 22px; height: 22px; cursor: pointer; font-size: 1rem; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn:hover:not(:disabled) { background: #222; color: #ccc; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.icon-btn.active { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }

.ep-list, .model-list, .capsule-list { display: flex; flex-direction: column; gap: 0.3rem; }

.capsule-row {
  padding: 0.3rem 0.45rem; border-radius: 4px; border: 1px solid #222;
  display: flex; align-items: center; gap: 0.35rem; background: #1a1a1a;
}
.capsule-row:hover { background: #222; border-color: #333; }
.capsule-row.active { background: #1e2d3d; border-color: #2a4d6e; }
.capsule-row-main { flex: 1; min-width: 0; cursor: pointer; display: flex; flex-direction: column; gap: 0.1rem; }
.capsule-row-name { font-size: 0.8rem; font-weight: 500; }
.capsule-row-meta { font-size: 0.65rem; color: #555; }
.btn-insert-capsule {
  flex-shrink: 0;
  font-size: 0.68rem;
  padding: 2px 6px;
  background: #1a2430;
  border: 1px solid #2a4a6a;
  color: #9d6db8;
  border-radius: 3px;
  cursor: pointer;
}
.btn-insert-capsule:hover { background: #243040; }
.btn-dup-capsule {
  flex-shrink: 0;
  font-size: 0.75rem;
  padding: 2px 5px;
  background: transparent;
  border: 1px solid #333;
  color: #888;
  border-radius: 3px;
  cursor: pointer;
}
.btn-dup-capsule:hover { color: #ccc; border-color: #555; }

/* Suggestions */
.suggestion-list { display: flex; flex-direction: column; gap: 0.3rem; }
.suggestion-row {
  display: flex; align-items: flex-start; gap: 0.4rem;
  padding: 0.35rem 0.5rem; border-radius: 4px; border: 1px solid #222; background: #161616;
}
.suggestion-row:hover { border-color: #2a3d2a; background: #191f19; }
.suggestion-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
.suggestion-row-name { font-size: 0.78rem; font-weight: 500; }
.suggestion-row-desc { font-size: 0.62rem; color: #666; line-height: 1.3; }
.suggestion-row-category { font-size: 0.58rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a8a5a; }
.suggestion-row-actions { display: flex; flex-direction: column; gap: 0.2rem; flex-shrink: 0; }
.btn-insert-suggestion {
  font-size: 0.65rem; padding: 2px 6px;
  background: #1a2d1a; border: 1px solid #2a4d2a; color: #6db86d;
  border-radius: 3px; cursor: pointer; white-space: nowrap;
}
.btn-insert-suggestion:hover { background: #1e381e; color: #8dda8d; }

.empty-hint { font-size: 0.72rem; color: #555; margin: 0; }

.model-row { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 6px; padding: 0.45rem 0.6rem; display: flex; flex-direction: column; gap: 0.3rem; }
.model-row-header { display: flex; justify-content: space-between; align-items: center; }
.model-name { font-size: 0.8rem; font-weight: 500; }
.model-source { font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; }
.source-discovered { background: #1e2d1e; color: #6db86d; }
.source-manual { background: #2d2a1e; color: #c8a85a; }
</style>
