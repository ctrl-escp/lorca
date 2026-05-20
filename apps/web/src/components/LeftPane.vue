<template>
  <aside class="left-pane">

    <!-- Step types (insert primitives) -->
    <section class="pane-section" :class="{expanded: isExpanded('stepTypes')}">
      <div class="section-header" @click="toggleSection('stepTypes')">
        <button type="button" class="section-toggle" :aria-expanded="isExpanded('stepTypes')" title="Basic step types to insert into the pipeline">
          <span class="chevron" :class="{open: isExpanded('stepTypes')}">›</span>
          <span class="section-title">Step types <span class="section-count">({{ filteredStepTypes.length }})</span></span>
        </button>
      </div>
      <div v-if="isExpanded('stepTypes')" class="section-body">
        <input
          v-model="paletteQuery"
          class="palette-search"
          type="search"
          placeholder="Filter palette…"
          aria-label="Filter step types and suggestions"
        />
        <div class="step-type-list">
          <div
            v-for="entry in filteredStepTypes"
            :key="entry.type"
            class="step-type-row"
            :title="entry.description"
          >
            <div class="step-type-row-main">
              <span class="step-type-row-name">{{ entry.label }}</span>
              <span class="step-type-row-desc">{{ entry.description }}</span>
            </div>
            <button
              class="btn-insert-suggestion"
              type="button"
              title="Insert after selected step (or append)"
              @click.stop="onInsertStepType(entry.type)"
            >↓ Insert</button>
          </div>
          <p v-if="filteredStepTypes.length === 0" class="empty-hint">No step types match your filter.</p>
        </div>
      </div>
    </section>

    <!-- Step Suggestions (replaces destructive Examples) -->
    <section class="pane-section" :class="{expanded: isExpanded('suggestions')}">
      <div class="section-header" @click="toggleSection('suggestions')">
        <button type="button" class="section-toggle" :aria-expanded="isExpanded('suggestions')" title="Insertable step recipes — click to insert into the current pipeline">
          <span class="chevron" :class="{open: isExpanded('suggestions')}">›</span>
          <span class="section-title">Step Suggestions <span class="section-count">({{ filteredSuggestions.length }})</span></span>
        </button>
      </div>
      <div v-if="isExpanded('suggestions')" class="section-body">
        <input
          v-if="!isExpanded('stepTypes')"
          v-model="paletteQuery"
          class="palette-search"
          type="search"
          placeholder="Filter suggestions…"
          aria-label="Filter step suggestions"
        />
        <div class="suggestion-list">
          <div
            v-for="suggestion in filteredSuggestions"
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
                title="Insert before selected step"
                :disabled="!editorStore.selectedStepId"
                @click.stop="onInsertSuggestion(suggestion, 'before')"
              >↑ Before</button>
              <button
                class="btn-insert-suggestion"
                type="button"
                title="Insert after selected step (or append)"
                @click.stop="onInsertSuggestion(suggestion, 'after')"
              >↓ After</button>
              <button
                class="btn-insert-suggestion"
                type="button"
                title="Append to end of pipeline"
                @click.stop="onInsertSuggestion(suggestion, 'append')"
              >+ Append</button>
              <button
                class="btn-insert-suggestion btn-insert-new"
                type="button"
                title="Replace current pipeline with this suggestion"
                @click.stop="onInsertSuggestion(suggestion, 'new')"
              >New</button>
            </div>
          </div>
          <p v-if="filteredSuggestions.length === 0" class="empty-hint">No suggestions match your filter.</p>
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
        <select v-model="modelBucketFilter" class="model-bucket-filter" aria-label="Filter models by usage bucket">
          <option v-for="opt in MODEL_BUCKET_OPTIONS" :key="opt.value || 'all'" :value="opt.value">{{ opt.label }}</option>
        </select>
        <p v-if="canAssignModelToStep" class="model-assign-hint">Click a model to assign it to the selected step.</p>
        <div class="model-list">
          <div
            v-for="model in filteredModels"
            :key="model.id"
            class="model-row"
            :class="{assignable: canAssignModelToStep}"
            :title="canAssignModelToStep ? `Assign ${model.displayName} to selected step` : model.displayName"
            @click="onModelClick(model)"
          >
            <div class="model-row-header">
              <span class="model-name">{{ model.displayName }}</span>
              <span class="model-source" :class="`source-${model.source}`">{{ model.source }}</span>
            </div>
            <ModelBucketEditor :model="model" @update="onUpdateBuckets(model.id, $event)" @click.stop />
          </div>
          <p v-if="modelsStore.models.length === 0" class="empty-hint">No models. Discover from an endpoint or add manually.</p>
          <p v-else-if="filteredModels.length === 0" class="empty-hint">No models match this filter.</p>
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
import {ref, computed, onMounted} from 'vue';
import type {AiEndpointConfig, DiscoveredModel, ModelUsageBucket, StepType, PipelineStep} from '@lorca/core';
import type {LeftPaneSection} from '../stores/ui.js';
import {BUILTIN_SUGGESTIONS, instantiateSuggestion} from '@lorca/capsules';
import type {PipelineSuggestion} from '@lorca/capsules';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {useCapsulesStore} from '../stores/capsules.js';
import {useUiStore} from '../stores/ui.js';
import {useImportExportStore} from '../stores/importExport.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useActiveRunStore} from '../stores/activeRun.js';
import {useEndpointActions} from '../composables/useEndpointActions.js';
import {pickJsonFile} from '../utils/importFile.js';
import {newId} from '../utils/id.js';
import {
  autoAssignModelsToSteps,
  autoAssignModelToStep,
  modelMatchesBucket,
} from '@lorca/endpoints';
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
const runStore = useActiveRunStore();
const epActions = useEndpointActions();

const showAddEndpoint = ref(false);
const showAddModel = ref(false);
const paletteQuery = ref('');
const modelBucketFilter = ref<ModelUsageBucket | ''>('');

const STEP_TYPE_ENTRIES: {type: StepType; label: string; description: string}[] = [
  {type: 'model-call', label: 'Model call', description: 'Call a model with composed prompt blocks'},
  {type: 'prompt-wrapper', label: 'Prompt wrapper', description: 'Compose XML prompt blocks without calling a model'},
  {type: 'manual-text', label: 'Manual text', description: 'Emit static text as an artifact'},
  {type: 'template', label: 'Template', description: 'Render a Handlebars-style template into text'},
  {type: 'json-extract', label: 'JSON extract', description: 'Parse JSON from a prior artifact'},
  {type: 'loop-group', label: 'Loop group', description: 'Repeat an inner step chain until exit condition'},
];

function matchesPaletteQuery(text: string): boolean {
  const q = paletteQuery.value.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

const filteredStepTypes = computed(() =>
  STEP_TYPE_ENTRIES.filter((e) =>
    matchesPaletteQuery(`${e.label} ${e.description} ${e.type}`),
  ),
);

const filteredSuggestions = computed(() =>
  BUILTIN_SUGGESTIONS.filter((s) =>
    matchesPaletteQuery(`${s.name} ${s.description} ${s.category} ${s.id}`),
  ),
);

const MODEL_BUCKET_OPTIONS: {value: ModelUsageBucket | ''; label: string}[] = [
  {value: '', label: 'All buckets'},
  {value: 'tiny', label: 'Tiny'},
  {value: 'thinking', label: 'Thinking'},
  {value: 'summarize', label: 'Summarize'},
  {value: 'rewrite', label: 'Rewrite'},
  {value: 'extract-json', label: 'Extract JSON'},
  {value: 'verify', label: 'Verify'},
  {value: 'general', label: 'General'},
];

const filteredModels = computed(() => {
  if (!modelBucketFilter.value) return modelsStore.models;
  return modelsStore.models.filter((m) => modelMatchesBucket(m, modelBucketFilter.value as ModelUsageBucket));
});

const canAssignModelToStep = computed(() => {
  const step = editorStore.selectedStep;
  return step?.type === 'model-call' && step.config.type === 'model-call';
});

onMounted(async () => {
  await endpointsStore.load();
  await modelsStore.load();
  uiStore.expandLeftPaneSection(
    modelsStore.models.length === 0 ? 'endpoints' : 'stepTypes',
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
  const duplicatedId = capsulesStore.duplicateCapsule(capsuleId);
  if (duplicatedId) uiStore.openCapsuleEditor(duplicatedId);
}

function prepareSteps(
  steps: ReturnType<typeof instantiateSuggestion>,
  preferredBucket?: ModelUsageBucket,
): PipelineStep[] {
  return autoAssignModelsToSteps(steps, modelsStore.models, preferredBucket);
}

function insertStepsAfterAnchor(anchorId: string | null, newSteps: PipelineStep[]) {
  if (newSteps.length === 0) return;
  if (anchorId) {
    let afterId = anchorId;
    for (const step of newSteps) {
      afterId = editorStore.insertStepAfter(afterId, step);
    }
    editorStore.selectStep(afterId);
  } else {
    for (const step of newSteps) {
      editorStore.appendStep(step);
    }
    editorStore.selectStep(newSteps[newSteps.length - 1]!.id);
  }
}

function insertStepsBeforeAnchor(anchorId: string, newSteps: PipelineStep[]) {
  if (newSteps.length === 0) return;
  for (const step of newSteps) {
    editorStore.insertStepBefore(anchorId, step);
  }
  editorStore.selectStep(newSteps[newSteps.length - 1]!.id);
}

function onInsertStepType(type: StepType) {
  let step = editorStore.buildDefaultStep(type);
  step = autoAssignModelToStep(step, modelsStore.models, type === 'model-call' ? 'general' : undefined);
  const anchorId = editorStore.selectedStepId;
  const id = anchorId
    ? editorStore.insertStepAfter(anchorId, step)
    : editorStore.appendStep(step);
  editorStore.selectStep(id);
}

type SuggestionInsertMode = 'before' | 'after' | 'append' | 'new';

function onInsertSuggestion(suggestion: PipelineSuggestion, mode: SuggestionInsertMode) {
  const existingNamespaces = new Set(editorStore.steps.map((s) => s.outputNamespace));
  const rawSteps = instantiateSuggestion(suggestion, existingNamespaces);
  const newSteps = prepareSteps(rawSteps, suggestion.preferredModelBucket);

  if (mode === 'new') {
    const hasContent = editorStore.steps.length > 0 || editorStore.pipeline.input.raw.trim();
    if (hasContent && !window.confirm(
      `Replace the current pipeline with "${suggestion.name}"?\n\nExisting steps and prompt will be cleared.`,
    )) return;
    if (runStore.isRunning) runStore.cancel();
    runStore.reset();
    editorStore.replaceSteps(newSteps, `New pipeline from "${suggestion.name}"`);
    return;
  }

  const anchorId = mode === 'append' ? null : editorStore.selectedStepId;
  if (mode === 'before') {
    if (!anchorId) return;
    insertStepsBeforeAnchor(anchorId, newSteps);
    return;
  }
  insertStepsAfterAnchor(anchorId, newSteps);
}

function onModelClick(model: DiscoveredModel) {
  const step = editorStore.selectedStep;
  if (!step || step.type !== 'model-call' || step.config.type !== 'model-call') return;
  editorStore.commitStepConfigEdit(
    step.id,
    {
      config: {
        ...step.config,
        modelRef: {kind: 'fixed', endpointId: model.endpointId, modelName: model.providerModelName},
      },
    },
    `Assign model "${model.displayName}"`,
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

.palette-search {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #ccc;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.75rem;
  margin-bottom: 0.35rem;
}
.palette-search:focus { outline: none; border-color: #2a5070; }

.step-type-list { display: flex; flex-direction: column; gap: 0.3rem; }
.step-type-row {
  display: flex; align-items: flex-start; gap: 0.4rem;
  padding: 0.35rem 0.5rem; border-radius: 4px; border: 1px solid #222; background: #161616;
}
.step-type-row:hover { border-color: #2a3a4a; background: #181c22; }
.step-type-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
.step-type-row-name { font-size: 0.78rem; font-weight: 500; }
.step-type-row-desc { font-size: 0.62rem; color: #666; line-height: 1.3; }

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
.suggestion-row-actions { display: flex; flex-wrap: wrap; gap: 0.2rem; flex-shrink: 0; max-width: 5.5rem; }
.btn-insert-new { background: #2d1a1a; border-color: #4d2a2a; color: #b86d6d; }
.btn-insert-new:hover { background: #381e1e; color: #da8d8d; }
.btn-insert-suggestion:disabled { opacity: 0.35; cursor: default; }

.model-bucket-filter {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #ccc;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 0.72rem;
  margin-bottom: 0.35rem;
}
.model-assign-hint {
  font-size: 0.68rem;
  color: #7ec8e3;
  margin: 0 0 0.35rem;
}
.model-row.assignable { cursor: pointer; border-color: #2a4a6a; }
.model-row.assignable:hover { background: #1e2d3d; border-color: #3a6a9a; }
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
