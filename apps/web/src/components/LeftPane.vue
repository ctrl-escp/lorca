<template>
  <aside class="left-pane">

    <!-- Step library (types + suggestions unified) -->
    <section class="pane-section" :class="{expanded: isExpanded('stepLibrary')}">
      <div class="section-header" @click="toggleSection('stepLibrary')">
        <button type="button" class="section-toggle" :aria-expanded="isExpanded('stepLibrary')" title="Step types and pre-built suggestion templates">
          <span class="chevron" :class="{open: isExpanded('stepLibrary')}">›</span>
          <span class="section-title">Step library</span>
        </button>
      </div>
      <div v-if="isExpanded('stepLibrary')" class="section-body">
        <input
          v-model="stepLibraryQuery"
          class="palette-search"
          type="search"
          placeholder="Filter…"
          aria-label="Filter step types and suggestions"
        />
        <div class="step-library-list">
          <div
            v-for="group in filteredStepGroups"
            :key="group.type"
            class="type-group"
            :class="{expanded: isTypeGroupExpanded(group.type)}"
          >
            <div class="type-group-header">
              <div class="type-group-info">
                <span class="type-group-name">{{ group.label }}</span>
                <span class="type-group-desc">{{ group.description }}</span>
              </div>
              <div class="type-group-actions">
                <button
                  v-if="isPipelineContext"
                  class="btn-insert-suggestion"
                  type="button"
                  title="Insert a blank step of this type"
                  @click.stop="onInsertStepType(group.type)"
                >↓ Insert</button>
                <button
                  v-if="group.suggestions.length > 0"
                  type="button"
                  class="type-group-expand"
                  :aria-expanded="isTypeGroupExpanded(group.type)"
                  :title="isTypeGroupExpanded(group.type) ? 'Collapse templates' : `Show ${group.suggestions.length} template(s)`"
                  @click.stop="toggleTypeGroup(group.type)"
                >
                  <span class="type-expand-chevron" :class="{open: isTypeGroupExpanded(group.type)}">›</span>
                  <span class="type-expand-count">{{ group.suggestions.length }}</span>
                </button>
              </div>
            </div>

            <div v-if="isTypeGroupExpanded(group.type)" class="type-group-suggestions">
              <div
                v-for="suggestion in group.suggestions"
                :key="suggestion.id"
                class="suggestion-row"
                :title="isPipelineContext ? `${suggestion.description} — drag into the pipeline` : suggestion.description"
              >
                <button
                  v-if="isPipelineContext"
                  type="button"
                  class="row-drag-handle"
                  draggable="true"
                  title="Drag into pipeline"
                  aria-label="Drag suggestion into pipeline"
                  @dragstart="onSuggestionDragStart(suggestion.id, $event)"
                  @dragend="onSuggestionDragEnd"
                  @click.stop
                ><span class="row-drag-grip" aria-hidden="true">⠿</span></button>
                <div class="suggestion-row-main">
                  <div class="suggestion-row-info">
                    <span class="suggestion-row-name">{{ suggestion.name }}</span>
                    <span class="suggestion-row-category">{{ suggestion.category }}</span>
                  </div>
                  <span class="suggestion-row-desc">{{ suggestion.description }}</span>
                  <div v-if="isPipelineContext" class="suggestion-row-actions">
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
              </div>
            </div>
          </div>
          <p v-if="filteredStepGroups.length === 0" class="empty-hint">No step types match your filter.</p>
        </div>

        <div v-if="isPipelineContext" class="ai-suggestions">
          <div class="ai-suggestions-header">
            <span class="ai-suggestions-title">AI suggestions</span>
            <button
              type="button"
              class="btn-ai-suggest"
              :disabled="advisorLoading || !hasAdvisorRunContext"
              :title="hasAdvisorRunContext ? 'Suggest next steps from the last run' : 'Run the pipeline first'"
              @click.stop="loadAiSuggestions"
            >{{ advisorLoading ? 'Thinking...' : 'Suggest' }}</button>
          </div>
          <div v-if="advisorError" class="advisor-banner">
            <div>
              <strong>{{ advisorError.message }}</strong>
              <pre v-if="advisorError.raw" class="advisor-raw">{{ advisorError.raw }}</pre>
            </div>
            <button type="button" class="advisor-dismiss" title="Dismiss" @click="advisorError = null">×</button>
          </div>
          <p v-else-if="!hasAdvisorRunContext" class="empty-hint">Run the pipeline to ask for next-step suggestions.</p>
          <div v-if="advisorCards.length" class="advisor-list">
            <div v-for="card in advisorCards" :key="card.suggestion.id" class="advisor-card">
              <div class="advisor-card-main">
                <span class="suggestion-row-name">{{ card.suggestion.name }}</span>
                <span class="suggestion-row-desc">{{ card.reason }}</span>
              </div>
              <button
                class="btn-insert-suggestion"
                type="button"
                title="Append to end of pipeline"
                @click.stop="onInsertSuggestion(card.suggestion, 'append')"
              >↓ Insert</button>
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
          <span class="section-title">Capsules <span class="section-count">({{ visibleCapsules.length }})</span></span>
        </button>
        <div class="section-actions" @click.stop>
          <button class="icon-btn" @click="onImportCapsule" title="Import a Capsule from a JSON file">↓</button>
          <button class="icon-btn" @click="onNewCapsule" title="Create a new empty Capsule">+</button>
        </div>
      </div>
      <div v-if="isExpanded('capsules')" class="section-body">
        <div class="capsule-list">
          <div
            v-for="cap in visibleCapsules"
            :key="`${cap.id}::${cap.version}`"
            class="capsule-row"
            :class="{active: uiStore.activeCapsuleEditId === cap.id}"
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
          </div>
          <p v-if="visibleCapsules.length === 0" class="empty-hint">No Capsules yet.</p>
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
            :class="{assignable: canAssignModelToStep && model.enabled !== false, disabled: model.enabled === false}"
            :title="model.enabled === false ? `${model.displayName} (disabled)` : canAssignModelToStep ? `Assign ${model.displayName} to selected step` : model.displayName"
            @click="model.enabled !== false && onModelClick(model)"
          >
            <div class="model-row-header">
              <span class="model-name">{{ model.displayName }}</span>
              <div class="model-row-badges">
                <span class="model-badge-disabled" v-if="model.enabled === false">disabled</span>
                <span class="model-source" :class="`source-${model.source}`">{{ model.source }}</span>
              </div>
            </div>
            <ModelBucketEditor :model="model" @update="onUpdateBuckets(model.id, $event)" @click.stop />
            <button
              class="btn-toggle-model"
              :class="model.enabled === false ? 'btn-toggle-enable' : 'btn-toggle-disable'"
              :title="model.enabled === false ? 'Enable this model for auto-assignment' : 'Disable this model (exclude from auto-assignment)'"
              @click.stop="onToggleModel(model.id)"
            >{{ model.enabled === false ? 'Enable' : 'Disable' }}</button>
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
          <template v-for="ep in endpointsStore.endpoints" :key="ep.id">
            <AddEndpointForm
              v-if="editingEndpointId === ep.id"
              :initial="ep"
              @save="onSaveEndpoint"
              @cancel="editingEndpointId = null"
            />
            <EndpointCard
              v-else
              :endpoint="ep"
              :model-count="(modelsStore.modelsByEndpoint.get(ep.id) ?? []).length"
              :is-testing="epActions.testing.value.has(ep.id)"
              :is-discovering="epActions.discovering.value.has(ep.id)"
              @test="epActions.testAccess"
              @discover="epActions.discoverModels"
              @edit="editingEndpointId = ep.id"
              @toggle="onToggleEndpoint"
              @remove="onRemoveEndpoint"
            />
          </template>
          <p v-if="endpointsStore.endpoints.length === 0" class="empty-hint">No endpoints yet. Add one above.</p>
        </div>
      </div>
    </section>
  </aside>

  <!-- Suggestion replace confirmation dialog -->
  <ConfirmDialog
    :open="replaceConfirmOpen"
    title="Replace Pipeline"
    :message="replaceConfirmMessage"
    confirm-label="Replace"
    :destructive="true"
    @confirm="resolveReplaceConfirm(true)"
    @cancel="resolveReplaceConfirm(false)"
  />

  <!-- Disable warning dialog -->
  <ConfirmDialog
    :open="disableWarnOpen"
    title="Steps will be affected"
    :message="disableWarnMessage"
    confirm-label="Disable anyway"
    :destructive="true"
    @confirm="resolveDisableWarn(true)"
    @cancel="resolveDisableWarn(false)"
  />
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch} from 'vue';
import type {AiEndpointConfig, CapsuleDefinition, DiscoveredModel, ModelRef, ModelUsageBucket, StepType} from '@lorca/core';
import type {LeftPaneSection} from '../stores/ui.js';
import {ALL_SUGGESTIONS} from '@lorca/capsules';
import type {PipelineSuggestion} from '@lorca/capsules';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useModelsStore} from '../stores/models.js';
import {useCapsulesStore} from '../stores/capsules.js';
import {useUiStore} from '../stores/ui.js';
import {useImportExportStore} from '../stores/importExport.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useActiveStepEditor} from '../composables/useActiveStepEditor.js';
import {useSuggestionInsert} from '../composables/useSuggestionInsert.js';
import {useStepAdvisor} from '../composables/useStepAdvisor.js';
import {useActiveRunStore} from '../stores/activeRun.js';
import {useEndpointActions} from '../composables/useEndpointActions.js';
import {DND_BODY_SUGGESTION, DND_SUGGESTION_ID} from '../utils/dragDrop.js';
import {pickJsonFile} from '../utils/importFile.js';
import {newId} from '../utils/id.js';
import {autoAssignModelToStep, modelMatchesBucket, pickModelRefForSlot} from '@lorca/endpoints';
import EndpointCard from './endpoints/EndpointCard.vue';
import AddEndpointForm from './endpoints/AddEndpointForm.vue';
import AddModelForm from './models/AddModelForm.vue';
import ModelBucketEditor from './models/ModelBucketEditor.vue';
import {ConfirmDialog} from '@lorca/ui-kit';

const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();
const capsulesStore = useCapsulesStore();
const uiStore = useUiStore();
const importStore = useImportExportStore();
const pipelineEditorStore = usePipelineEditorStore();
const editorStore = useActiveStepEditor();
const suggestionInsert = useSuggestionInsert();
const stepAdvisor = useStepAdvisor();
const runStore = useActiveRunStore();
const epActions = useEndpointActions();

const isPipelineContext = computed(() => uiStore.editorContext === 'pipeline');

const STEP_TYPE_ENTRIES: {type: StepType; label: string; description: string}[] = [
  {type: 'model-call', label: 'Model call', description: 'Call a model with composed prompt blocks. Set output format to JSON strict if downstream steps depend on parsed output.'},
  {type: 'loop-group', label: 'Loop', description: 'Repeat an inner step chain until exit condition'},
  {type: 'presentation', label: 'Text', description: 'Free-form text with optional {{artifact.key}} interpolation'},
];

const showAddEndpoint = ref(false);
const showAddModel = ref(false);
const editingEndpointId = ref<string | null>(null);
const stepLibraryQuery = ref('');
const expandedTypeGroups = ref<Set<StepType>>(new Set(STEP_TYPE_ENTRIES.map((e) => e.type)));
const modelBucketFilter = ref<ModelUsageBucket | ''>('');
const advisorLoading = ref(false);
const advisorSuggestions = ref<{suggestionId: string; reason: string}[]>([]);
const advisorError = ref<{message: string; raw?: string} | null>(null);
let advisorAbort: AbortController | null = null;

const FEATURED_CAPSULE_IDS = ['example-best-of-two', 'example-expert'];

// Suggestion replace dialog
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

// Disable warning dialog
const disableWarnOpen = ref(false);
const disableWarnMessage = ref('');
let disableWarnResolve: ((v: boolean) => void) | null = null;

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

function matchesQuery(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

interface StepTypeGroup {
  type: StepType;
  label: string;
  description: string;
  suggestions: PipelineSuggestion[];
  typeMatches: boolean;
}

const suggestionsByType = computed(() => {
  const map = new Map<StepType, PipelineSuggestion[]>();
  for (const s of ALL_SUGGESTIONS) {
    const type = s.insertableSteps[0]?.type ?? 'model-call';
    if (!map.has(type)) map.set(type, []);
    map.get(type)!.push(s);
  }
  return map;
});

const filteredStepGroups = computed((): StepTypeGroup[] => {
  const query = stepLibraryQuery.value.trim().toLowerCase();
  return STEP_TYPE_ENTRIES.flatMap((entry) => {
    const allSuggestions = suggestionsByType.value.get(entry.type) ?? [];
    if (!query) {
      return [{...entry, suggestions: allSuggestions, typeMatches: true}];
    }
    const typeMatches = matchesQuery(query, `${entry.label} ${entry.description} ${entry.type}`);
    const matchedSuggestions = allSuggestions.filter((s) =>
      matchesQuery(query, `${s.name} ${s.description} ${s.category} ${s.id}`),
    );
    if (!typeMatches && matchedSuggestions.length === 0) return [];
    return [{...entry, suggestions: typeMatches ? allSuggestions : matchedSuggestions, typeMatches}];
  });
});

const visibleCapsules = computed(() => {
  const priority = new Map(FEATURED_CAPSULE_IDS.map((id, index) => [id, index]));
  return [...capsulesStore.allCapsules].sort((a, b) => {
    const aPriority = priority.get(a.id) ?? Number.POSITIVE_INFINITY;
    const bPriority = priority.get(b.id) ?? Number.POSITIVE_INFINITY;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return 0;
  });
});

function isTypeGroupExpanded(type: StepType): boolean {
  if (stepLibraryQuery.value.trim()) {
    const group = filteredStepGroups.value.find((g) => g.type === type);
    if (group && !group.typeMatches && group.suggestions.length > 0) return true;
  }
  return expandedTypeGroups.value.has(type);
}

function toggleTypeGroup(type: StepType) {
  const next = new Set(expandedTypeGroups.value);
  if (next.has(type)) next.delete(type);
  else next.add(type);
  expandedTypeGroups.value = next;
}

const advisorArtifactKeys = computed(() => Object.keys(runStore.artifacts).sort());

const hasAdvisorRunContext = computed(() =>
  isPipelineContext.value &&
  !runStore.isRunning &&
  runStore.status !== 'idle' &&
  advisorArtifactKeys.value.length > 0,
);

const advisorCards = computed(() =>
  advisorSuggestions.value.flatMap((entry) => {
    const suggestion = ALL_SUGGESTIONS.find((s) => s.id === entry.suggestionId);
    return suggestion ? [{suggestion, reason: entry.reason}] : [];
  }),
);

const MODEL_BUCKET_OPTIONS: {value: ModelUsageBucket | ''; label: string}[] = [
  {value: '', label: 'All buckets'},
  {value: 'tiny', label: 'Tiny'},
  {value: 'thinking', label: 'Thinking'},
  {value: 'summarize', label: 'Summarize'},
  {value: 'rewrite', label: 'Rewrite'},
  {value: 'rewrite-prose', label: 'Rewrite prose'},
  {value: 'rewrite-code', label: 'Rewrite code'},
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
    modelsStore.models.length === 0 ? 'endpoints' : 'stepLibrary',
  );
});

onUnmounted(() => {
  advisorAbort?.abort();
});

watch(() => runStore.runId, () => {
  advisorSuggestions.value = [];
  advisorError.value = null;
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

async function onSaveEndpoint(config: AiEndpointConfig) {
  await endpointsStore.updateEndpoint(config.id, config);
  editingEndpointId.value = null;
}

async function onRemoveEndpoint(id: string) {
  await endpointsStore.removeEndpoint(id);
  await modelsStore.removeModelsForEndpoint(id);
}

async function onToggleEndpoint(id: string) {
  const ep = endpointsStore.getEndpoint(id);
  if (!ep) return;
  if (ep.enabled) {
    const affected = stepsUsingEndpoint(id);
    if (affected.length > 0) {
      const ok = await confirmDisable(ep.name, affected.map((s) => s.label));
      if (!ok) return;
    }
  }
  await endpointsStore.updateEndpoint(id, {enabled: !ep.enabled});
}

async function onToggleModel(id: string) {
  const model = modelsStore.models.find((m) => m.id === id);
  if (!model) return;
  if (model.enabled !== false) {
    const affected = stepsUsingModel(model.endpointId, model.providerModelName);
    if (affected.length > 0) {
      const ok = await confirmDisable(model.displayName, affected.map((s) => s.label));
      if (!ok) return;
    }
  }
  await modelsStore.toggleModel(id);
}

async function onAddModel(model: DiscoveredModel) {
  await modelsStore.addModel(model);
  showAddModel.value = false;
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
  const modelSlotBindings: Record<string, ModelRef> = {...(step.config.modelSlotBindings ?? {})};
  for (const slot of capsule.interface.modelSlots) {
    const picked = pickModelRefForSlot(enabledModels, slot);
    if (picked) modelSlotBindings[slot.name] = picked;
  }
  pipelineEditorStore.updateStepConfig(stepId, {
    config: {...step.config, modelSlotBindings},
  });
}

function onDuplicateCapsule(capsuleId: string) {
  const duplicatedId = capsulesStore.duplicateCapsule(capsuleId);
  if (duplicatedId) uiStore.openCapsuleEditor(duplicatedId);
}

function onSuggestionDragStart(suggestionId: string, event: DragEvent) {
  if (!isPipelineContext.value) return;
  document.body.classList.add('lorca-dnd-active', DND_BODY_SUGGESTION);
  event.dataTransfer?.setData(DND_SUGGESTION_ID, suggestionId);
  event.dataTransfer!.effectAllowed = 'copy';
}

function onSuggestionDragEnd() {
  document.body.classList.remove('lorca-dnd-active', DND_BODY_SUGGESTION);
}

function onInsertStepType(type: StepType) {
  if (!isPipelineContext.value) return;
  let step = editorStore.buildDefaultStep(type);
  const disabledEpIds = new Set(endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id));
  const enabledModels = modelsStore.models.filter((m) => m.enabled !== false && !disabledEpIds.has(m.endpointId));
  step = autoAssignModelToStep(step, enabledModels, type === 'model-call' ? 'general' : undefined);
  const anchorId = editorStore.selectedStepId;
  const id = anchorId
    ? editorStore.insertStepAfter(anchorId, step)
    : editorStore.appendStep(step);
  editorStore.selectStep(id);
}

type SuggestionInsertMode = 'before' | 'after' | 'append' | 'new';

async function onInsertSuggestion(suggestion: PipelineSuggestion, mode: SuggestionInsertMode) {
  if (!isPipelineContext.value) return;
  if (mode === 'new') {
    if (runStore.isRunning) runStore.cancel();
    runStore.reset();
  }
  await suggestionInsert.insertSuggestion(suggestion, mode, {
    confirmReplace: () => confirmSuggestionReplace(suggestion.name),
  });
}

async function loadAiSuggestions() {
  if (!hasAdvisorRunContext.value) return;
  advisorAbort?.abort();
  const controller = new AbortController();
  advisorAbort = controller;
  advisorLoading.value = true;
  advisorError.value = null;

  try {
    const result = await stepAdvisor.getStepSuggestions(
      pipelineEditorStore.pipeline,
      advisorArtifactKeys.value,
      ALL_SUGGESTIONS,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    if (result.ok) {
      advisorSuggestions.value = result.suggestions;
    } else {
      advisorSuggestions.value = [];
      advisorError.value = {
        message: result.message,
        ...(result.rawResponse ? {raw: result.rawResponse} : {}),
      };
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    advisorSuggestions.value = [];
    advisorError.value = {message: error instanceof Error ? error.message : 'AI suggestions failed'};
  } finally {
    if (advisorAbort === controller) {
      advisorAbort = null;
      advisorLoading.value = false;
    }
  }
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
  padding: 0.9rem 1.1rem; cursor: pointer; flex-shrink: 0; user-select: none;
}
.section-header:hover { background: #151515; }

.section-toggle {
  display: flex; align-items: center; gap: 0.5rem;
  background: none; border: none; padding: 0; cursor: pointer;
  color: inherit; flex: 1; min-width: 0; text-align: left;
}

.chevron { display: inline-block; font-size: 1.1rem; color: #555; transition: transform 0.15s; width: 1rem; flex-shrink: 0; }
.chevron.open { transform: rotate(90deg); color: #7ec8e3; }

.section-title { font-size: 1rem; font-weight: 700; color: #bbb; letter-spacing: 0.01em; }
.section-count { font-weight: 500; color: #555; }

.section-actions { display: flex; gap: 0.35rem; }

.section-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 1rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }

.icon-btn { background: none; border: 1px solid #333; color: #888; border-radius: 5px; width: 36px; height: 36px; cursor: pointer; font-size: 1.2rem; line-height: 1; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.icon-btn:hover:not(:disabled) { background: #222; color: #ccc; }
.icon-btn:disabled { opacity: 0.3; cursor: default; }
.icon-btn.active { background: #1e3d52; border-color: #2a5070; color: #7ec8e3; }

.ep-list, .model-list, .capsule-list { display: flex; flex-direction: column; gap: 0.5rem; }

.capsule-row {
  padding: 0.7rem 0.85rem; border-radius: 6px; border: 1px solid #222;
  display: flex; align-items: center; gap: 0.5rem; background: #1a1a1a;
}
.capsule-row:hover { background: #222; border-color: #333; }
.capsule-row.active { background: #1e2d3d; border-color: #2a4d6e; }
.capsule-row-main { flex: 1; min-width: 0; cursor: pointer; display: flex; flex-direction: column; gap: 0.25rem; }
.capsule-row-name { font-size: 0.95rem; font-weight: 500; }
.capsule-row-meta { font-size: 0.78rem; color: #555; }
.capsule-status { font-size: 0.72rem; padding: 1px 5px; border-radius: 3px; }
.cs-draft { color: #c8a050; }
.cs-locked { color: #7ec8e3; background: #1a2a3a; border: 1px solid #2a4a6a; }
.btn-insert-capsule {
  flex-shrink: 0;
  font-size: 0.82rem;
  padding: 6px 11px;
  background: #1a2430;
  border: 1px solid #2a4a6a;
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
  color: #888;
  border-radius: 5px;
  cursor: pointer;
}
.btn-dup-capsule:hover { color: #ccc; border-color: #555; }

.palette-search {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #ccc;
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 0.9rem;
  margin-bottom: 0.2rem;
}
.palette-search:focus { outline: none; border-color: #2a5070; }

/* Step library */
.step-library-list { display: flex; flex-direction: column; gap: 0.35rem; }

.type-group {
  border: 1px solid #222;
  border-radius: 6px;
  background: #161616;
  overflow: hidden;
}
.type-group.expanded { border-color: #2a3d4a; }

.type-group-header {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.65rem 0.75rem;
}
.type-group:hover .type-group-header { background: #181c22; }
.type-group.expanded .type-group-header { background: #0f161c; }

.type-group-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.type-group-name { font-size: 0.95rem; font-weight: 600; color: #ddd; }
.type-group-desc { font-size: 0.76rem; color: #555; line-height: 1.35; }

.type-group-actions {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.type-group-expand {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  background: none;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  color: #555;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1;
  white-space: nowrap;
}
.type-group-expand:hover { background: #1e1e1e; color: #999; border-color: #3a3a3a; }
.type-group.expanded .type-group-expand { color: #7ec8e3; border-color: #2a5070; background: #0f1a22; }

.type-expand-chevron {
  display: inline-block;
  font-size: 1rem;
  color: inherit;
  transition: transform 0.15s;
}
.type-expand-chevron.open { transform: rotate(90deg); }
.type-expand-count { font-size: 0.72rem; color: inherit; }

.type-group-suggestions {
  border-top: 1px solid #1e2a32;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.type-group-suggestions .suggestion-row {
  border-radius: 0;
  border: none;
  border-bottom: 1px solid #1a1a1a;
  background: #0f0f0f;
}
.type-group-suggestions .suggestion-row:last-child { border-bottom: none; }
.type-group-suggestions .suggestion-row:hover { background: #141a14; border-color: transparent; }

/* Suggestions shared */
.suggestion-row {
  display: flex; align-items: stretch;
  border-radius: 6px; border: 1px solid #222; background: #161616;
  overflow: hidden;
}
.suggestion-row:hover { border-color: #2a3d2a; background: #191f19; }
.row-drag-handle {
  flex-shrink: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  padding: 0;
  border: none;
  border-right: 1px solid #2a2a2a;
  border-radius: 6px 0 0 6px;
  background: #121612;
  color: #5a7a5a;
  cursor: grab;
}
.row-drag-grip {
  font-size: 1rem;
  line-height: 1;
  letter-spacing: -0.12em;
  user-select: none;
}
.row-drag-handle:hover { background: #1a221a; color: #8ab88a; }
.row-drag-handle:active { cursor: grabbing; }
.suggestion-row-main {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem;
  padding: 0.65rem 0.75rem;
}
.suggestion-row-info {
  display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap;
}
.suggestion-row-name { font-size: 1rem; font-weight: 600; }
.suggestion-row-desc { font-size: 0.78rem; color: #666; line-height: 1.35; }
.suggestion-row-category { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a8a5a; }
.suggestion-row-bucket { font-size: 0.7rem; color: #6a8ab0; font-family: monospace; }
.suggestion-row-actions {
  display: flex; flex-wrap: wrap; gap: 0.3rem;
  padding-top: 0.45rem;
}
.model-row.assignable { cursor: pointer; }
.model-row.assignable:hover { background: #1a2430; border-radius: 6px; }
.btn-insert-new { background: #2d1a1a; border-color: #4d2a2a; color: #b86d6d; }
.btn-insert-new:hover { background: #381e1e; color: #da8d8d; }
.btn-insert-suggestion:disabled { opacity: 0.35; cursor: default; }

.model-bucket-filter {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #ccc;
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 0.88rem;
  margin-bottom: 0.2rem;
}
.model-assign-hint {
  font-size: 0.85rem;
  color: #7ec8e3;
  margin: 0 0 0.35rem;
}
.model-row.assignable { cursor: pointer; border-color: #2a4a6a; }
.model-row.assignable:hover { background: #1e2d3d; border-color: #3a6a9a; }
.btn-insert-suggestion {
  font-size: 0.82rem; padding: 5px 11px;
  background: #1a2d1a; border: 1px solid #2a4d2a; color: #6db86d;
  border-radius: 5px; cursor: pointer; white-space: nowrap;
}
.btn-insert-suggestion:hover { background: #1e381e; color: #8dda8d; }

.ai-suggestions {
  margin-top: 0.85rem;
  padding-top: 0.75rem;
  border-top: 1px solid #242424;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ai-suggestions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.ai-suggestions-title {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8a8a8a;
}
.btn-ai-suggest {
  font-size: 0.78rem;
  padding: 5px 10px;
  background: #1a2630;
  border: 1px solid #2b4c62;
  color: #80c7df;
  border-radius: 5px;
  cursor: pointer;
}
.btn-ai-suggest:hover:not(:disabled) { background: #203444; color: #9adcf0; }
.btn-ai-suggest:disabled { opacity: 0.45; cursor: default; }
.advisor-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid #4b3020;
  border-radius: 6px;
  background: #221813;
  color: #d89a72;
  font-size: 0.78rem;
}
.advisor-dismiss {
  border: none;
  background: transparent;
  color: #d89a72;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
.advisor-raw {
  max-height: 8rem;
  overflow: auto;
  white-space: pre-wrap;
  margin: 0.4rem 0 0;
  color: #b98b70;
  font-size: 0.72rem;
}
.advisor-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.advisor-card {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.7rem;
  border: 1px solid #263326;
  border-radius: 6px;
  background: #141a14;
}
.advisor-card-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.empty-hint { font-size: 0.88rem; color: #555; margin: 0; }

.model-row { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 7px; padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.4rem; }
.model-row.disabled { opacity: 0.5; }
.model-row-header { display: flex; justify-content: space-between; align-items: center; }
.model-row-badges { display: flex; gap: 0.3rem; align-items: center; }
.model-name { font-size: 0.95rem; font-weight: 500; }
.model-badge-disabled { font-size: 0.68rem; padding: 1px 6px; border-radius: 3px; background: #2a2010; color: #b89a50; }
.model-source { font-size: 0.75rem; padding: 2px 7px; border-radius: 4px; }
.source-discovered { background: #1e2d1e; color: #6db86d; }
.source-manual { background: #2d2a1e; color: #c8a85a; }
.btn-toggle-model {
  align-self: flex-start;
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  background: none;
}
.btn-toggle-disable { border: 1px solid #333; color: #666; }
.btn-toggle-disable:hover { color: #aaa; border-color: #555; }
.btn-toggle-enable { border: 1px solid #1e4d37; color: #5ddb9e; }
.btn-toggle-enable:hover { background: #1a2d22; }
</style>
