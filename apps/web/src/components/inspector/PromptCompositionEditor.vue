<template>
  <div class="prompt-composition">
    <div class="pce-toolbar">
      <button
        v-if="nestedEditTarget?.kind === 'loop'"
        type="button"
        class="pce-retry-btn"
        title="Wire loop.prev and instructions so this step improves on failed verification"
        @click="addRetryFeedback"
      >↺ Add retry feedback</button>
      <button type="button" class="pce-full-prompt-btn" title="View the fully resolved prompt that will be sent to the model" @click="showFullPromptModal = true">Full prompt</button>
      <button type="button" class="pce-help-btn" title="Artifact references and prompt composition help" @click="showPromptHelp = true">? References</button>
    </div>
    <HelpDialog
      :open="showPromptHelp"
      variant="prompt"
      :artifact-refs="promptArtifactRefs"
      @close="showPromptHelp = false"
    />
    <FullPromptModal
      :open="showFullPromptModal"
      :xml-text="fullPromptXml"
      :has-unresolved="hasUnresolved"
      @close="showFullPromptModal = false"
    />
    <PromptImproverModal
      :open="promptImproverBlockIndex !== null"
      :step-id="stepId"
      :block="promptImproverBlock"
      @close="promptImproverBlockIndex = null"
      @apply="applyImprovedPrompt"
    />

    <!-- Previous output -->
    <div class="pce-section">
      <div class="pce-section-header">
        <span class="pce-section-title hdr-output">Previous Output</span>
        <label class="pce-toggle-label" title="Include the previous step's primary output in this step's prompt">
          <input type="checkbox" v-model="localPrevEnabled" @change="commitPrev" />
          Include
        </label>
      </div>
      <template v-if="localPrevEnabled">
        <div class="pce-field-row">
          <label class="pce-field-label" title="XML tag wrapping the previous step's output">Tag</label>
          <input
            class="pce-input pce-input-sm"
            v-model="localPrevTagName"
            :class="{invalid: localPrevTagName && !isValidTag(localPrevTagName)}"
            placeholder="previous_output"
            @focus="beginPromptEdit"
            @blur="commitPrev"
          />
        </div>
        <div class="pce-field-row">
          <label class="pce-field-label" title="Whether previous output appears before or after this step's own blocks">Placement</label>
          <select class="pce-select pce-input-sm" v-model="localPrevPlacement" @change="commitPrev">
            <option value="beforeOwnPrompt">Before prompt blocks</option>
            <option value="afterOwnPrompt">After prompt blocks</option>
          </select>
        </div>
      </template>
    </div>

    <!-- History inputs -->
    <div class="pce-section">
      <div class="pce-section-header">
        <span class="pce-section-title hdr-history">History Inputs</span>
        <button
          class="pce-add-btn"
          type="button"
          title="Read output from a prior step"
          :disabled="priorSources.length <= 1"
          @click="addHistoryRead"
        >+ Read</button>
      </div>

      <div v-if="localHistoryReads.length === 0" class="pce-empty">
        No history reads. Add one to include a prior step output in this prompt.
      </div>

      <div
        v-for="(read, idx) in localHistoryReads"
        :key="`${read.sourceStepId}-${idx}`"
        class="pce-history-read"
        :class="historyReadStatusClass(read)"
      >
        <div class="pce-history-header">
          <span class="pce-history-status" :title="historyReadStatusTitle(read)">
            {{ historyReadStatusIcon(read) }}
          </span>
          <button
            class="pce-delete-btn"
            type="button"
            title="Remove this history read"
            @click="deleteHistoryRead(idx)"
          >×</button>
        </div>

        <div class="pce-field-row">
          <label class="pce-field-label" title="Step whose output to include">Source</label>
          <select
            class="pce-select pce-input-sm"
            :value="read.sourceStepId"
            title="Prior step to read from"
            @change="onSourceStepChange(idx, ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="src in priorSources"
              :key="src.stepId"
              :value="src.stepId"
              :disabled="!src.enabled && src.stepId !== read.sourceStepId"
            >
              {{ src.label }}{{ !src.enabled ? ' (disabled)' : '' }}
            </option>
            <option
              v-if="!priorSources.some((s) => s.stepId === read.sourceStepId)"
              :value="read.sourceStepId"
            >
              {{ read.sourceStepId }} (missing)
            </option>
          </select>
        </div>

        <div class="pce-field-row">
          <label class="pce-field-label" title="Which output artifact to read">Artifact</label>
          <select
            class="pce-select pce-input-sm"
            :value="read.sourceArtifactRef"
            title="Artifact output to include"
            @change="onArtifactChange(idx, ($event.target as HTMLSelectElement).value)"
          >
            <option
              v-for="art in artifactsForRead(read)"
              :key="art.ref"
              :value="art.ref"
            >
              {{ art.ref }}{{ art.isPrimary ? ' (primary)' : '' }}
            </option>
            <option
              v-if="read.sourceArtifactRef && !artifactsForRead(read).some((a) => a.ref === read.sourceArtifactRef)"
              :value="read.sourceArtifactRef"
            >
              {{ read.sourceArtifactRef }} (custom)
            </option>
          </select>
        </div>

        <div class="pce-field-row">
          <label class="pce-field-label" title="XML tag wrapping this history value">Tag</label>
          <input
            class="pce-input pce-input-sm pce-tag-input-inline"
            :value="read.tagName"
            :class="{invalid: read.tagName && !isValidTag(read.tagName)}"
            placeholder="intent"
            title="XML tag name"
            @focus="beginPromptEdit"
            @input="onTagNameInput(idx, ($event.target as HTMLInputElement).value)"
            @blur="commitHistoryReads('Edit history read tag')"
          />
        </div>

        <div class="pce-field-row">
          <label class="pce-toggle-label pce-required-toggle" title="If this history input is missing at runtime, halt the pipeline with an error instead of silently skipping it">
            <input
              type="checkbox"
              :checked="read.required"
              @change="toggleRequired(idx)"
            />
            Stop if missing
          </label>
        </div>

        <div v-if="previewForRead(read)" class="pce-history-preview" :title="previewForRead(read)!">
          <span class="pce-preview-label">Last run:</span>
          <code>{{ truncatePreview(previewForRead(read)!) }}</code>
        </div>
        <div v-else-if="readStatus(read).ok" class="pce-history-preview pce-history-preview-empty">
          No value from last run yet
        </div>
        <div v-if="!readStatus(read).ok" class="pce-history-issue">
          {{ readStatus(read).issues.map(historyReadIssueLabel).join(' · ') }}
        </div>
      </div>
    </div>

    <!-- Prompt blocks -->
    <div class="pce-section">
      <div class="pce-section-header">
        <span class="pce-section-title hdr-prompt">Prompt Blocks</span>
        <button class="pce-add-btn" type="button" title="Add a new custom prompt block" @click="addBlock">+ Block</button>
      </div>

      <div v-if="localBlocks.length === 0" class="pce-empty">No prompt blocks yet.</div>

      <div
        v-for="(block, idx) in localBlocks"
        :key="block.id"
        class="pce-block"
        :class="{disabled: !block.enabled}"
      >
        <div class="pce-block-header">
          <input
            type="checkbox"
            :checked="block.enabled"
            :title="block.enabled ? 'Disable this block' : 'Enable this block'"
            @change="toggleBlock(idx)"
          />
          <input
            class="pce-tag-input"
            v-model="block.tagName"
            :class="{invalid: block.tagName && !isValidTag(block.tagName)}"
            placeholder="tag_name"
            title="XML tag name for this block"
            @focus="beginPromptEdit"
            @input="liveUpdate"
            @blur="commitBlocks('Edit block tag')"
          />
          <button
            class="pce-improve-btn"
            type="button"
            title="Improve this prompt block with a local model"
            @click="openPromptImprover(idx)"
          >Improve</button>
          <button
            class="pce-delete-btn"
            type="button"
            title="Remove this block"
            @click="deleteBlock(idx)"
          >×</button>
        </div>
        <textarea
          class="pce-body"
          v-model="block.body"
          rows="4"
          :placeholder="block.source === 'system-default' ? 'System instructions…' : 'Block content…'"
          title="Block body text"
          @focus="beginPromptEdit"
          @input="liveUpdate"
          @blur="commitBlocks('Edit block body')"
        />
      </div>
    </div>

    <!-- XML preview -->
    <div class="pce-section">
      <div class="pce-section-header">
        <span class="pce-section-title hdr-preview">XML Preview</span>
        <button class="pce-toggle-preview-btn" type="button" @click="showPreview = !showPreview">
          {{ showPreview ? 'Hide' : 'Show' }}
        </button>
      </div>
      <XmlPreview v-if="showPreview" class="pce-preview" :value="previewXml" />
    </div>

  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {PromptCompositionConfig, PromptBlock, StepHistoryReadConfig, PipelineStep} from '@lorca/core';
import {PIPELINE_INPUT_STEP_ID} from '@lorca/core';
import {buildUserPromptArtifacts, isValidTag, renderPromptComposition} from '@lorca/prompt';
import type {ResolvedHistoryRead} from '@lorca/prompt';
import {
  getPriorSourceSteps,
  listStepOutputArtifacts,
  artifactsForSourceStep,
  defaultArtifactRefForSource,
  suggestHistoryReadTagName,
  validateHistoryRead,
  historyReadIssueLabel,
} from '@lorca/pipeline';
import {wireRetryFeedback} from '@lorca/pipeline';
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import HelpDialog from '../help/HelpDialog.vue';
import XmlPreview from '../shared/XmlPreview.vue';
import FullPromptModal from './FullPromptModal.vue';
import PromptImproverModal from './PromptImproverModal.vue';
import {resolveArtifactValue, resolvePreviousOutput, PREVIEW_TRUNCATE_CHARS} from '../../utils/promptPreview.js';

export type NestedEditTarget =
  | {kind: 'loop'; parentStepId: string}
  | {kind: 'inline-capsule'; parentStepId: string};

const props = defineProps<{
  stepId: string;
  config: PromptCompositionConfig | undefined;
  /** When editing a step inside a loop group, prior steps from outer + inner chain. */
  contextSteps?: PipelineStep[];
  nestedEditTarget?: NestedEditTarget;
}>();

const editorStore = useActiveStepEditor();
const pipelineEditorStore = usePipelineEditorStore();
const runStore = useActiveRunStore();

const EMPTY_CONFIG: PromptCompositionConfig = {
  previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
  historyReads: [],
  blocks: [],
};

const localPrevEnabled = ref(false);
const localPrevTagName = ref('previous_output');
const localPrevPlacement = ref<'beforeOwnPrompt' | 'afterOwnPrompt'>('afterOwnPrompt');
const localHistoryReads = ref<StepHistoryReadConfig[]>([]);
const localBlocks = ref<PromptBlock[]>([]);
const showPreview = ref(false);
const showPromptHelp = ref(false);
const showFullPromptModal = ref(false);
const promptImproverBlockIndex = ref<number | null>(null);

const chainSteps = computed(() => props.contextSteps ?? editorStore.steps);

const priorSources = computed(() => getPriorSourceSteps(chainSteps.value, props.stepId));

const promptArtifactRefs = computed(() => {
  const refs = ['user_prompt.raw', 'user_prompt.xml'];
  for (const opt of priorSources.value) {
    if (opt.stepId === props.stepId || opt.stepId === PIPELINE_INPUT_STEP_ID) continue;
    const step = chainSteps.value.find((s) => s.id === opt.stepId);
    if (!step) continue;
    for (const art of listStepOutputArtifacts(step)) {
      refs.push(art.ref);
    }
  }
  return [...new Set(refs)];
});

const currentUserPromptArtifacts = computed(() =>
  buildUserPromptArtifacts(editorStore.pipeline.input.raw),
);

const promptImproverBlock = computed(() =>
  promptImproverBlockIndex.value === null ? null : localBlocks.value[promptImproverBlockIndex.value] ?? null,
);

function syncFromConfig(cfg: PromptCompositionConfig | undefined) {
  const c = cfg ?? EMPTY_CONFIG;
  localPrevEnabled.value = c.previousOutput.enabled;
  localPrevTagName.value = c.previousOutput.tagName || 'previous_output';
  localPrevPlacement.value = c.previousOutput.placement;
  localHistoryReads.value = c.historyReads.map((r) => ({...r}));
  localBlocks.value = c.blocks.map((b) => ({...b}));
}

watch(() => props.config, syncFromConfig, {immediate: true});

function buildConfig(): PromptCompositionConfig {
  return {
    previousOutput: {
      enabled: localPrevEnabled.value,
      placement: localPrevPlacement.value,
      tagName: localPrevTagName.value || 'previous_output',
    },
    historyReads: localHistoryReads.value.map((r) => ({...r})),
    blocks: localBlocks.value.map((b) => ({...b})),
  };
}

function applyStepPatch(patch: Partial<PipelineStep>, label?: string) {
  if (props.nestedEditTarget?.kind === 'inline-capsule') {
    if (label) {
      pipelineEditorStore.commitInlineCapsuleInnerStepEdit(props.nestedEditTarget.parentStepId, props.stepId, patch, label);
    } else {
      pipelineEditorStore.updateInlineCapsuleInnerStep(props.nestedEditTarget.parentStepId, props.stepId, patch);
    }
    return;
  }
  if (props.nestedEditTarget?.kind === 'loop') {
    if (label) {
      editorStore.commitLoopInnerStepEdit(props.nestedEditTarget.parentStepId, props.stepId, patch, label);
    } else {
      editorStore.updateLoopInnerStep(props.nestedEditTarget.parentStepId, props.stepId, patch);
    }
    return;
  }
  if (label) {
    editorStore.commitStepEdit(props.stepId, patch, label);
  } else {
    editorStore.updateStepDuringEdit(props.stepId, patch);
  }
}

function beginPromptEdit() {
  if (props.nestedEditTarget) return;
  editorStore.beginStepEdit(props.stepId);
}

function liveUpdate() {
  applyStepPatch({prompt: buildConfig()});
}

function commitPrev() {
  applyStepPatch({prompt: buildConfig()}, 'Update previous output');
}

function commitBlocks(label: string) {
  applyStepPatch({prompt: buildConfig()}, label);
}

function commitHistoryReads(label: string) {
  applyStepPatch({prompt: buildConfig()}, label);
}

function addRetryFeedback() {
  const step = chainSteps.value.find((s) => s.id === props.stepId);
  if (!step || step.type !== 'model-call') return;
  const wired = wireRetryFeedback(step);
  if (!wired.prompt) return;
  localHistoryReads.value = wired.prompt.historyReads.map((r) => ({...r}));
  localBlocks.value = wired.prompt.blocks.map((b) => ({...b}));
  applyStepPatch({prompt: wired.prompt}, 'Add retry feedback');
}

function toggleBlock(idx: number) {
  localBlocks.value[idx]!.enabled = !localBlocks.value[idx]!.enabled;
  commitBlocks(localBlocks.value[idx]!.enabled ? 'Enable block' : 'Disable block');
}

function deleteBlock(idx: number) {
  localBlocks.value.splice(idx, 1);
  commitBlocks('Delete block');
}

function addBlock() {
  const id = `blk_${Date.now().toString(36)}`;
  localBlocks.value.push({
    id,
    label: 'Custom block',
    tagName: 'custom',
    body: '',
    enabled: true,
    source: 'custom',
  });
  commitBlocks('Add block');
}

function openPromptImprover(idx: number) {
  promptImproverBlockIndex.value = idx;
}

function applyImprovedPrompt(body: string) {
  const idx = promptImproverBlockIndex.value;
  if (idx === null || !localBlocks.value[idx]) return;
  beginPromptEdit();
  localBlocks.value[idx] = {...localBlocks.value[idx]!, body};
  commitBlocks('Apply prompt improvement');
  promptImproverBlockIndex.value = null;
}

function defaultNewHistoryRead(): StepHistoryReadConfig {
  const sources = priorSources.value;
  const lastPrior = sources.length > 1 ? sources[sources.length - 1]! : sources[0]!;
  const sourceStepId = lastPrior.stepId;
  return {
    sourceStepId,
    sourceArtifactRef: defaultArtifactRefForSource(chainSteps.value, sourceStepId),
    tagName: suggestHistoryReadTagName(sourceStepId, chainSteps.value),
    required: true,
  };
}

function addHistoryRead() {
  localHistoryReads.value.push(defaultNewHistoryRead());
  commitHistoryReads('Add history read');
}

function deleteHistoryRead(idx: number) {
  localHistoryReads.value.splice(idx, 1);
  commitHistoryReads('Remove history read');
}

function onSourceStepChange(idx: number, sourceStepId: string) {
  const read = localHistoryReads.value[idx]!;
  read.sourceStepId = sourceStepId;
  read.sourceArtifactRef = defaultArtifactRefForSource(chainSteps.value, sourceStepId);
  read.tagName = suggestHistoryReadTagName(sourceStepId, chainSteps.value);
  commitHistoryReads('Change history read source');
}

function onArtifactChange(idx: number, sourceArtifactRef: string) {
  localHistoryReads.value[idx]!.sourceArtifactRef = sourceArtifactRef;
  commitHistoryReads('Change history read artifact');
}

function onTagNameInput(idx: number, tagName: string) {
  localHistoryReads.value[idx]!.tagName = tagName;
  liveUpdate();
}

function toggleRequired(idx: number) {
  const read = localHistoryReads.value[idx]!;
  read.required = !read.required;
  commitHistoryReads(read.required ? 'Mark history read required' : 'Mark history read optional');
}

function artifactsForRead(read: StepHistoryReadConfig) {
  return artifactsForSourceStep(chainSteps.value, read.sourceStepId);
}

function readStatus(read: StepHistoryReadConfig) {
  return validateHistoryRead(read, props.stepId, chainSteps.value);
}

function historyReadStatusClass(read: StepHistoryReadConfig) {
  const status = readStatus(read);
  if (!status.ok) return 'invalid';
  return previewForRead(read) ? 'resolved' : 'pending';
}

function historyReadStatusIcon(read: StepHistoryReadConfig) {
  const status = readStatus(read);
  if (!status.ok) return '⚠';
  return previewForRead(read) ? '●' : '○';
}

function historyReadStatusTitle(read: StepHistoryReadConfig) {
  const status = readStatus(read);
  if (!status.ok) return status.issues.map(historyReadIssueLabel).join('; ');
  if (previewForRead(read)) return 'Value available from last run';
  return 'Valid — run pipeline to populate';
}

function previewForRead(read: StepHistoryReadConfig): string | null {
  return artifactValue(read.sourceArtifactRef);
}

function truncatePreview(text: string, max = 120): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

function artifactValue(artifactRef: string): string | null {
  return resolveArtifactValue(artifactRef, runStore.artifacts, currentUserPromptArtifacts.value);
}

// Embedded XML preview: truncated values + «not yet run» placeholders to show structure.
const embeddedResolvedHistoryReads = computed<ResolvedHistoryRead[]>(() =>
  localHistoryReads.value.map((read) => {
    const value = resolveArtifactValue(
      read.sourceArtifactRef,
      runStore.artifacts,
      currentUserPromptArtifacts.value,
      PREVIEW_TRUNCATE_CHARS,
    );
    if (value !== null) return {sourceArtifactRef: read.sourceArtifactRef, value};
    return {sourceArtifactRef: read.sourceArtifactRef, value: '«not yet run»'};
  }),
);

const embeddedResolvedPrevOutput = computed((): string | undefined => {
  if (!localPrevEnabled.value) return undefined;
  const val = resolvePreviousOutput(
    props.stepId,
    chainSteps.value,
    runStore.artifacts,
    currentUserPromptArtifacts.value,
  );
  if (val === undefined) return '«not yet run»';
  return val.length > PREVIEW_TRUNCATE_CHARS
    ? val.slice(0, PREVIEW_TRUNCATE_CHARS) + '\n…(truncated)'
    : val;
});

// Full prompt modal: untruncated values, optional reads omitted when missing.
const fullResolvedHistoryReads = computed<ResolvedHistoryRead[]>(() =>
  localHistoryReads.value.map((read) => {
    const value = resolveArtifactValue(
      read.sourceArtifactRef,
      runStore.artifacts,
      currentUserPromptArtifacts.value,
    );
    if (value !== null) return {sourceArtifactRef: read.sourceArtifactRef, value};
    return {sourceArtifactRef: read.sourceArtifactRef, omitted: !read.required};
  }),
);

const fullPromptPrevOutput = computed((): string | undefined => {
  if (!localPrevEnabled.value) return undefined;
  return resolvePreviousOutput(
    props.stepId,
    chainSteps.value,
    runStore.artifacts,
    currentUserPromptArtifacts.value,
  );
});

const fullPromptXml = computed(() =>
  renderPromptComposition(buildConfig(), fullPromptPrevOutput.value, fullResolvedHistoryReads.value).xmlText,
);

const hasUnresolved = computed(() => {
  if (localPrevEnabled.value && fullPromptPrevOutput.value === undefined) return true;
  return fullResolvedHistoryReads.value.some((r) => r.value === undefined && r.omitted === false);
});

const previewXml = computed(() =>
  renderPromptComposition(buildConfig(), embeddedResolvedPrevOutput.value, embeddedResolvedHistoryReads.value).xmlText,
);
</script>

<style scoped>
.prompt-composition { display: flex; flex-direction: column; gap: 0.5rem; }

.pce-section { display: flex; flex-direction: column; gap: 0.3rem; }

.pce-section-header {
  display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid var(--border-divider); padding-top: 0.4rem;
}
.pce-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 0.35rem; margin-bottom: 0.35rem; }
.pce-retry-btn {
  font-size: 0.72rem; padding: 3px 8px; border-radius: 4px; cursor: pointer;
  background: var(--accent-bg-muted); border: 1px solid var(--accent-border); color: var(--accent);
}
.pce-retry-btn:hover { background: #243040; color: #a8d0f0; }
.pce-full-prompt-btn {
  margin-left: auto;
  font-size: 0.68rem; padding: 2px 8px; background: #1a1a2a; border: 1px solid #303060;
  color: #9898d8; border-radius: 3px; cursor: pointer;
}
.pce-full-prompt-btn:hover { background: #222240; color: #b0b0f0; }
.pce-help-btn {
  font-size: 0.68rem; padding: 2px 8px; background: var(--accent-bg-muted); border: 1px solid var(--accent-border);
  color: var(--accent); border-radius: 3px; cursor: pointer;
}
.pce-help-btn:hover { background: var(--accent-bg-hover); }
.pce-section-title { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }

.pce-toggle-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: var(--text-label); cursor: pointer; }
.pce-toggle-label input[type="checkbox"] { width: auto; }
.pce-required-toggle { margin-left: 4rem; }

.pce-field-row { display: flex; align-items: center; gap: 0.4rem; }
.pce-field-label { font-size: 0.68rem; color: var(--text-label); flex-shrink: 0; width: 4rem; }

.pce-input { background: #111; border: 1px solid #2a2a2a; color: #e8e8e8; border-radius: 3px; padding: 3px 6px; font-size: 0.78rem; }
.pce-input:focus { outline: none; border-color: var(--accent-border); }
.pce-input.invalid { border-color: #c0392b; }
.pce-input-sm { flex: 1; }
.pce-tag-input-inline { font-family: monospace; color: var(--accent); }
.pce-select { background: #111; border: 1px solid #2a2a2a; color: #e8e8e8; border-radius: 3px; padding: 3px 6px; font-size: 0.78rem; flex: 1; }
.pce-select:focus { outline: none; border-color: var(--accent-border); }

.pce-add-btn {
  font-size: 0.65rem; padding: 2px 8px;
  background: #1a2a1a; border: 1px solid #2a4a2a; color: #6db86d;
  border-radius: 3px; cursor: pointer;
}
.pce-add-btn:hover:not(:disabled) { background: #1e381e; }
.pce-add-btn:disabled { opacity: 0.35; cursor: default; }

.pce-empty { font-size: 0.68rem; color: var(--text-muted); }

.pce-history-read {
  border: 1px solid #222; border-radius: 4px; padding: 0.4rem;
  display: flex; flex-direction: column; gap: 0.25rem; background: #111;
}
.pce-history-read.invalid { border-color: #5a3030; background: #1a1010; }
.pce-history-read.resolved { border-left: 2px solid #3a7a5a; }
.pce-history-read.pending { border-left: 2px solid #444; }

.pce-history-header { display: flex; align-items: center; justify-content: space-between; }
.pce-history-status { font-size: 0.65rem; color: var(--text-secondary); }

.pce-history-preview {
  font-size: 0.65rem; color: var(--text-secondary); margin-left: 4rem;
  display: flex; gap: 0.3rem; align-items: baseline; min-width: 0;
}
.pce-history-preview code {
  color: #5a8a5a; font-family: monospace; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;
}
.pce-history-preview-empty { color: var(--text-muted); font-style: italic; }
.pce-preview-label { color: var(--text-secondary); flex-shrink: 0; }

.pce-history-issue {
  font-size: 0.65rem; color: #c07070; margin-left: 4rem;
}

.pce-block {
  border: 1px solid #222; border-radius: 4px; padding: 0.4rem;
  display: flex; flex-direction: column; gap: 0.25rem; background: #111;
}
.pce-block.disabled { opacity: 0.5; }

.pce-block-header { display: flex; align-items: center; gap: 0.3rem; }
.pce-block-header input[type="checkbox"] { flex-shrink: 0; }

.pce-tag-input {
  flex: 1; background: #0d0d0d; border: 1px solid #2a2a2a; color: var(--accent);
  border-radius: 3px; padding: 2px 5px; font-size: 0.72rem; font-family: monospace;
}
.pce-tag-input:focus { outline: none; border-color: var(--accent-border); }
.pce-tag-input.invalid { border-color: #c0392b; }

.pce-delete-btn {
  flex-shrink: 0; background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 2px;
}
.pce-delete-btn:hover { color: #e07070; }

.pce-improve-btn {
  flex-shrink: 0;
  background: var(--accent-bg-muted);
  border: 1px solid var(--accent-border);
  color: var(--accent);
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.65rem;
  padding: 2px 7px;
}
.pce-improve-btn:hover { background: var(--accent-bg-hover); color: #a8d8f0; }

.pce-body {
  width: 100%; background: #0d0d0d; border: 1px solid #222; color: #e8e8e8;
  border-radius: 3px; padding: 4px 6px; font-size: 0.78rem; font-family: monospace;
  resize: vertical; line-height: 1.4; box-sizing: border-box;
}
.pce-body:focus { outline: none; border-color: var(--accent-border); }

.pce-toggle-preview-btn {
  font-size: 0.65rem; padding: 1px 6px;
  background: #1a1a1a; border: 1px solid #2a2a2a; color: var(--text-secondary);
  border-radius: 3px; cursor: pointer;
}
.pce-toggle-preview-btn:hover { color: var(--text-label); }

.pce-preview {
  background: #0a0a0a; border: 1px solid var(--border-divider); border-radius: 3px;
  padding: 0.5rem; font-size: 0.7rem; white-space: pre-wrap;
  word-break: break-all; margin: 0; font-family: monospace; line-height: 1.5;
  max-height: 200px; overflow-y: auto;
}
</style>
