<template>
  <div class="prompt-composition">

    <!-- Previous output -->
    <div class="pce-section">
      <div class="pce-section-header">
        <span class="pce-section-title">Previous Output</span>
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

    <!-- Prompt blocks -->
    <div class="pce-section">
      <div class="pce-section-header">
        <span class="pce-section-title">Prompt Blocks</span>
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
            @input="liveUpdate"
            @blur="commitBlocks('Edit block tag')"
          />
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
          @input="liveUpdate"
          @blur="commitBlocks('Edit block body')"
        />
      </div>
    </div>

    <!-- XML preview -->
    <div class="pce-section">
      <div class="pce-section-header">
        <span class="pce-section-title">XML Preview</span>
        <button class="pce-toggle-preview-btn" type="button" @click="showPreview = !showPreview">
          {{ showPreview ? 'Hide' : 'Show' }}
        </button>
      </div>
      <pre v-if="showPreview" class="pce-preview">{{ previewXml }}</pre>
    </div>

  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {PromptCompositionConfig, PromptBlock} from '@lorca/core';
import {isValidTag, previewPromptXml} from '@lorca/prompt';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';

const props = defineProps<{
  stepId: string;
  config: PromptCompositionConfig | undefined;
}>();

const editorStore = usePipelineEditorStore();

const EMPTY_CONFIG: PromptCompositionConfig = {
  previousOutput: {enabled: false, placement: 'afterOwnPrompt', tagName: 'previous_output'},
  historyReads: [],
  blocks: [],
};

const localPrevEnabled = ref(false);
const localPrevTagName = ref('previous_output');
const localPrevPlacement = ref<'beforeOwnPrompt' | 'afterOwnPrompt'>('afterOwnPrompt');
const localBlocks = ref<PromptBlock[]>([]);
const showPreview = ref(false);

function syncFromConfig(cfg: PromptCompositionConfig | undefined) {
  const c = cfg ?? EMPTY_CONFIG;
  localPrevEnabled.value = c.previousOutput.enabled;
  localPrevTagName.value = c.previousOutput.tagName || 'previous_output';
  localPrevPlacement.value = c.previousOutput.placement;
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
    historyReads: props.config?.historyReads ?? [],
    blocks: localBlocks.value.map((b) => ({...b})),
  };
}

function liveUpdate() {
  editorStore.updateStepConfig(props.stepId, {prompt: buildConfig()});
}

function commitPrev() {
  editorStore.commitStepConfigEdit(props.stepId, {prompt: buildConfig()}, 'Update previous output');
}

function commitBlocks(label: string) {
  editorStore.commitStepConfigEdit(props.stepId, {prompt: buildConfig()}, label);
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

const previewXml = computed(() => previewPromptXml(buildConfig()));
</script>

<style scoped>
.prompt-composition { display: flex; flex-direction: column; gap: 0.5rem; }

.pce-section { display: flex; flex-direction: column; gap: 0.3rem; }

.pce-section-header {
  display: flex; align-items: center; justify-content: space-between;
  border-top: 1px solid #1e1e1e; padding-top: 0.4rem;
}
.pce-section-title { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: #444; }

.pce-toggle-label { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: #888; cursor: pointer; }
.pce-toggle-label input[type="checkbox"] { width: auto; }

.pce-field-row { display: flex; align-items: center; gap: 0.4rem; }
.pce-field-label { font-size: 0.68rem; color: #666; flex-shrink: 0; width: 4rem; }

.pce-input { background: #111; border: 1px solid #2a2a2a; color: #e8e8e8; border-radius: 3px; padding: 3px 6px; font-size: 0.78rem; }
.pce-input:focus { outline: none; border-color: #3a6080; }
.pce-input.invalid { border-color: #c0392b; }
.pce-input-sm { flex: 1; }
.pce-select { background: #111; border: 1px solid #2a2a2a; color: #e8e8e8; border-radius: 3px; padding: 3px 6px; font-size: 0.78rem; flex: 1; }
.pce-select:focus { outline: none; border-color: #3a6080; }

.pce-add-btn {
  font-size: 0.65rem; padding: 2px 8px;
  background: #1a2a1a; border: 1px solid #2a4a2a; color: #6db86d;
  border-radius: 3px; cursor: pointer;
}
.pce-add-btn:hover { background: #1e381e; }

.pce-empty { font-size: 0.68rem; color: #444; }

.pce-block {
  border: 1px solid #222; border-radius: 4px; padding: 0.4rem;
  display: flex; flex-direction: column; gap: 0.25rem; background: #111;
}
.pce-block.disabled { opacity: 0.5; }

.pce-block-header { display: flex; align-items: center; gap: 0.3rem; }
.pce-block-header input[type="checkbox"] { flex-shrink: 0; }

.pce-tag-input {
  flex: 1; background: #0d0d0d; border: 1px solid #2a2a2a; color: #7ec8e3;
  border-radius: 3px; padding: 2px 5px; font-size: 0.72rem; font-family: monospace;
}
.pce-tag-input:focus { outline: none; border-color: #3a6080; }
.pce-tag-input.invalid { border-color: #c0392b; }

.pce-delete-btn {
  flex-shrink: 0; background: none; border: none; color: #555; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 2px;
}
.pce-delete-btn:hover { color: #e07070; }

.pce-body {
  width: 100%; background: #0d0d0d; border: 1px solid #222; color: #e8e8e8;
  border-radius: 3px; padding: 4px 6px; font-size: 0.78rem; font-family: monospace;
  resize: vertical; line-height: 1.4; box-sizing: border-box;
}
.pce-body:focus { outline: none; border-color: #3a6080; }

.pce-toggle-preview-btn {
  font-size: 0.65rem; padding: 1px 6px;
  background: #1a1a1a; border: 1px solid #2a2a2a; color: #666;
  border-radius: 3px; cursor: pointer;
}
.pce-toggle-preview-btn:hover { color: #999; }

.pce-preview {
  background: #0a0a0a; border: 1px solid #1e1e1e; border-radius: 3px;
  padding: 0.5rem; font-size: 0.7rem; color: #8ab48a; white-space: pre-wrap;
  word-break: break-all; margin: 0; font-family: monospace; line-height: 1.5;
  max-height: 200px; overflow-y: auto;
}
</style>
