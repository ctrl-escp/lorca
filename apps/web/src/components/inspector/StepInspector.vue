<template>
  <div class="step-inspector">
    <div v-if="!step" class="inspector-empty">Select a step to configure it.</div>
    <template v-else>
      <!-- Header -->
      <div class="inspector-header">
        <span class="step-type-badge" :title="`Step type: ${step.type}`">{{ TYPE_LABELS[step.type] ?? step.type }}</span>
        <input
          class="step-label-input"
          v-model="localLabel"
          placeholder="Step label"
          title="Display label for this step"
          @blur="commitLabel"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
      </div>

      <div class="ns-row">
        <span class="ns-label" title="Artifact namespace for this step's outputs">namespace</span>
        <code class="ns-value">{{ step.outputNamespace }}</code>
        <span class="ns-dot">·</span>
        <code class="ns-value">{{ step.primaryOutputName }}</code>
      </div>

      <!-- Model Call -->
      <template v-if="step.config.type === 'model-call'">
        <div class="inspector-field">
          <FieldLabel label="Model" required title="Which model to call for this step" />
          <select v-model="localModelKey" title="Select a model" @change="commitModelCall">
            <option value="">— select model —</option>
            <optgroup v-for="ep in endpointsStore.endpoints" :key="ep.id" :label="ep.name">
              <option
                v-for="m in modelsForEndpoint(ep.id)"
                :key="m.id"
                :value="`${m.endpointId}::${m.providerModelName}`"
              >
                {{ m.displayName }}
              </option>
            </optgroup>
          </select>
        </div>
        <div class="inspector-field">
          <FieldLabel label="Mode" title="Generate: single prompt → single response. Chat: system + user message roles." />
          <select v-model="localMode" title="Inference mode" @change="commitModelCall">
            <option value="generate">Generate</option>
            <option value="chat">Chat</option>
          </select>
        </div>
        <div class="inspector-field">
          <FieldLabel label="Temperature" title="Sampling temperature (leave blank for model default)" />
          <input
            type="number" min="0" max="2" step="0.05"
            v-model="localTemperature"
            placeholder="default"
            title="Sampling temperature"
            @blur="commitModelCall"
          />
        </div>
        <div class="inspector-field">
          <FieldLabel label="Max tokens" title="Maximum output tokens (leave blank for model default)" />
          <input
            type="number" min="1" step="128"
            v-model="localMaxTokens"
            placeholder="default"
            title="Maximum output tokens"
            @blur="commitModelCall"
          />
        </div>
      </template>

      <!-- Prompt Wrapper -->
      <template v-else-if="step.config.type === 'prompt-wrapper'">
        <div class="inspector-field">
          <FieldLabel label="Previous output tag" title="XML tag name wrapping the previous step's output" />
          <input
            v-model="localPrevOutputTag"
            :class="{invalid: localPrevOutputTag && !isValidTag(localPrevOutputTag)}"
            placeholder="previous_output"
            title="XML tag for previous step output"
            @blur="commitPromptWrapper"
          />
        </div>
        <div class="inspector-field">
          <FieldLabel label="Placement" title="Whether previous output appears before or after this step's prompt blocks" />
          <select v-model="localPlacement" title="Placement relative to prompt blocks" @change="commitPromptWrapper">
            <option value="beforeOwnPrompt">Before prompt blocks</option>
            <option value="afterOwnPrompt">After prompt blocks</option>
          </select>
        </div>
        <div class="inspector-field-row">
          <label title="Include the previous step's output in this step's prompt">
            <input type="checkbox" v-model="localPrevOutputEnabled" @change="commitPromptWrapper" />
            Include previous output
          </label>
        </div>
      </template>

      <!-- Manual Text -->
      <template v-else-if="step.config.type === 'manual-text'">
        <div class="inspector-field">
          <FieldLabel label="Text" title="Static text output produced by this step" />
          <textarea
            v-model="localText"
            rows="6"
            placeholder="Enter static text…"
            title="Static text"
            @blur="commitManualText"
          />
        </div>
      </template>

      <!-- Template -->
      <template v-else-if="step.config.type === 'template'">
        <div class="inspector-field">
          <FieldLabel label="Template" title="Handlebars-style template using {{artifact.key}} placeholders" />
          <textarea
            v-model="localTemplate"
            rows="6"
            placeholder="{{user_prompt.raw}}"
            title="Template with artifact placeholders"
            @blur="commitTemplate"
          />
        </div>
      </template>

      <!-- JSON Extract -->
      <template v-else-if="step.config.type === 'json-extract'">
        <div class="inspector-field">
          <FieldLabel label="Source artifact" required title="Artifact key to parse as JSON (supports fenced code blocks)" />
          <input
            v-model="localSourceRef"
            placeholder="answer.text"
            title="Source artifact key"
            @blur="commitJsonExtract"
          />
        </div>
      </template>

      <!-- Capsule Instance -->
      <template v-else-if="step.config.type === 'capsule-instance'">
        <div class="inspector-field">
          <FieldLabel label="Capsule" title="ID of the Capsule this step instantiates" />
          <code class="ns-value">{{ step.config.capsuleId }} @ {{ step.config.capsuleVersion }}</code>
        </div>
        <div v-if="Object.keys(step.config.inputBindings).length > 0" class="inspector-field">
          <FieldLabel label="Input bindings" />
          <div class="binding-list">
            <div v-for="(val, key) in step.config.inputBindings" :key="key" class="binding-row">
              <span class="binding-port">{{ key }}</span>
              <span class="binding-arrow">←</span>
              <code class="binding-ref">{{ val }}</code>
            </div>
          </div>
        </div>
      </template>

      <!-- Loop Group -->
      <template v-else-if="step.config.type === 'loop-group'">
        <div class="inspector-field">
          <FieldLabel label="Max iterations" required title="Maximum number of times the inner chain will run" />
          <input
            type="number" min="1" max="20" step="1"
            v-model="localMaxIterations"
            title="Maximum iterations"
            @blur="commitLoopGroup"
          />
        </div>
        <div class="inspector-field">
          <FieldLabel label="Exit condition" title="When to stop looping before reaching max iterations" />
          <select v-model="localExitConditionType" title="Exit condition type" @change="commitLoopGroup">
            <option value="iterations">Always run max iterations</option>
            <option value="json-field-equals">JSON field equals value</option>
          </select>
        </div>
        <template v-if="localExitConditionType === 'json-field-equals'">
          <div class="inspector-field">
            <FieldLabel label="Field path" title="Dot-path into last inner step's JSON output (e.g. passed)" />
            <input
              v-model="localExitFieldPath"
              placeholder="passed"
              title="JSON field path to check"
              @blur="commitLoopGroup"
            />
          </div>
          <div class="inspector-field">
            <FieldLabel label="Exit when value" title="Loop exits when the field equals this value" />
            <select v-model="localExitValue" title="Expected value that triggers loop exit" @change="commitLoopGroup">
              <option value="true_bool">true</option>
              <option value="false_bool">false</option>
              <option value="custom">Custom string…</option>
            </select>
          </div>
        </template>
        <div class="inspector-readonly">
          <p>{{ step.config.steps.length }} inner step(s). Full inner-chain editor coming in Phase 9.</p>
        </div>
      </template>

      <!-- Prompt composition (shown for all prompt-bearing steps) -->
      <template v-if="hasPromptBlocks">
        <div class="inspector-section-divider">Prompt blocks</div>
        <div class="prompt-block-list">
          <div
            v-for="(block, idx) in step.prompt?.blocks ?? []"
            :key="block.id"
            class="prompt-block-row"
            :class="{disabled: !block.enabled}"
          >
            <input
              type="checkbox"
              :checked="block.enabled"
              :title="block.enabled ? 'Disable this block' : 'Enable this block'"
              @change="toggleBlock(idx)"
            />
            <code class="block-tag">&lt;{{ block.tagName }}&gt;</code>
            <span class="block-body-preview" :title="block.body">{{ block.body.slice(0, 60) }}{{ block.body.length > 60 ? '…' : '' }}</span>
          </div>
          <p v-if="!step.prompt?.blocks?.length" class="empty-hint">No prompt blocks. Prompt editor coming in Phase 3.</p>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, watch, computed} from 'vue';
import type {ModelCallStepConfig} from '@lorca/core';
import {isValidTag} from '@lorca/prompt';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useModelsStore} from '../../stores/models.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import FieldLabel from '../common/FieldLabel.vue';

const editorStore = usePipelineEditorStore();
const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();

const step = computed(() => editorStore.selectedStep);

const TYPE_LABELS: Record<string, string> = {
  'model-call': 'Model Call',
  'prompt-wrapper': 'Prompt Wrapper',
  'template': 'Template',
  'json-extract': 'JSON Extract',
  'manual-text': 'Manual Text',
  'capsule-instance': 'Capsule',
  'loop-group': 'Loop Group',
};

const hasPromptBlocks = computed(() =>
  step.value?.config.type === 'model-call' || step.value?.config.type === 'prompt-wrapper',
);

// ── Local state ───────────────────────────────────────────────────────────────

const localLabel = ref('');
const localModelKey = ref('');
const localMode = ref<'generate' | 'chat'>('generate');
const localTemperature = ref('');
const localMaxTokens = ref('');
const localPrevOutputTag = ref('previous_output');
const localPlacement = ref<'beforeOwnPrompt' | 'afterOwnPrompt'>('beforeOwnPrompt');
const localPrevOutputEnabled = ref(true);
const localText = ref('');
const localTemplate = ref('');
const localSourceRef = ref('');
const localMaxIterations = ref(3);
const localExitConditionType = ref<'iterations' | 'json-field-equals'>('json-field-equals');
const localExitFieldPath = ref('passed');
const localExitValue = ref<'true_bool' | 'false_bool' | 'custom'>('true_bool');

watch(step, (s) => {
  if (!s) return;
  localLabel.value = s.label;
  const cfg = s.config;

  if (cfg.type === 'model-call') {
    localModelKey.value = cfg.modelRef.kind === 'fixed'
      ? `${cfg.modelRef.endpointId}::${cfg.modelRef.modelName}`
      : '';
    localMode.value = cfg.mode;
    localTemperature.value = cfg.temperature !== undefined ? String(cfg.temperature) : '';
    localMaxTokens.value = cfg.maxTokens !== undefined ? String(cfg.maxTokens) : '';
  }

  if (cfg.type === 'prompt-wrapper') {
    const prev = s.prompt?.previousOutput;
    localPrevOutputEnabled.value = prev?.enabled ?? true;
    localPrevOutputTag.value = prev?.tagName ?? 'previous_output';
    localPlacement.value = prev?.placement ?? 'beforeOwnPrompt';
  }

  if (cfg.type === 'manual-text') localText.value = cfg.text;
  if (cfg.type === 'template') localTemplate.value = cfg.template;
  if (cfg.type === 'json-extract') localSourceRef.value = cfg.sourceArtifactRef;

  if (cfg.type === 'loop-group') {
    localMaxIterations.value = cfg.maxIterations;
    const ec = cfg.exitCondition;
    localExitConditionType.value = ec.type === 'json-field-equals' ? 'json-field-equals' : 'iterations';
    if (ec.type === 'json-field-equals') {
      localExitFieldPath.value = ec.fieldPath;
      localExitValue.value = ec.value === true ? 'true_bool' : ec.value === false ? 'false_bool' : 'custom';
    }
  }
}, {immediate: true});

// ── Helpers ───────────────────────────────────────────────────────────────────

function modelsForEndpoint(endpointId: string) {
  return modelsStore.modelsByEndpoint.get(endpointId) ?? [];
}

// ── Commit functions ──────────────────────────────────────────────────────────

function commitLabel() {
  const s = step.value;
  if (!s || localLabel.value === s.label) return;
  editorStore.commitStepConfigEdit(s.id, {label: localLabel.value.trim() || s.label}, 'Rename step');
}

function commitModelCall() {
  const s = step.value;
  if (!s || s.config.type !== 'model-call') return;
  const parts = localModelKey.value.split('::');
  const modelRef = localModelKey.value
    ? {kind: 'fixed' as const, endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')}
    : s.config.modelRef;
  const patch: Partial<ModelCallStepConfig> = {modelRef, mode: localMode.value};
  const temp = parseFloat(localTemperature.value);
  if (!isNaN(temp)) patch.temperature = temp;
  const maxTok = parseInt(localMaxTokens.value, 10);
  if (!isNaN(maxTok) && maxTok > 0) patch.maxTokens = maxTok;
  editorStore.commitStepConfigEdit(s.id, {config: {...s.config, ...patch}}, 'Update model call');
}

function commitPromptWrapper() {
  const s = step.value;
  if (!s) return;
  const prev = {
    enabled: localPrevOutputEnabled.value,
    placement: localPlacement.value,
    tagName: localPrevOutputTag.value || 'previous_output',
  };
  const prompt = {
    ...(s.prompt ?? {blocks: [], historyReads: []}),
    previousOutput: prev,
  };
  editorStore.commitStepConfigEdit(s.id, {prompt}, 'Update prompt wrapper');
}

function commitManualText() {
  const s = step.value;
  if (!s || s.config.type !== 'manual-text') return;
  editorStore.commitStepConfigEdit(s.id, {config: {...s.config, text: localText.value}}, 'Edit text');
}

function commitTemplate() {
  const s = step.value;
  if (!s || s.config.type !== 'template') return;
  editorStore.commitStepConfigEdit(s.id, {config: {...s.config, template: localTemplate.value}}, 'Edit template');
}

function commitJsonExtract() {
  const s = step.value;
  if (!s || s.config.type !== 'json-extract') return;
  editorStore.commitStepConfigEdit(s.id, {config: {...s.config, sourceArtifactRef: localSourceRef.value}}, 'Update source');
}

function commitLoopGroup() {
  const s = step.value;
  if (!s || s.config.type !== 'loop-group') return;
  const exitCondition = localExitConditionType.value === 'iterations'
    ? {type: 'iterations' as const}
    : {
        type: 'json-field-equals' as const,
        fieldPath: localExitFieldPath.value || 'passed',
        value: localExitValue.value === 'true_bool' ? true : localExitValue.value === 'false_bool' ? false : 'done',
      };
  editorStore.commitStepConfigEdit(s.id, {
    config: {...s.config, maxIterations: localMaxIterations.value, exitCondition},
  }, 'Update loop');
}

function toggleBlock(idx: number) {
  const s = step.value;
  if (!s?.prompt?.blocks) return;
  const blocks = s.prompt.blocks.map((b, i) => i === idx ? {...b, enabled: !b.enabled} : b);
  editorStore.updateStepConfig(s.id, {prompt: {...s.prompt, blocks}});
}
</script>

<style scoped>
.step-inspector { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.55rem; overflow-y: auto; height: 100%; }
.inspector-empty { color: #444; font-size: 0.78rem; }

.inspector-header { display: flex; align-items: center; gap: 0.5rem; }
.step-type-badge { font-size: 0.62rem; padding: 1px 6px; background: #1a2a3a; color: #7ec8e3; border-radius: 3px; flex-shrink: 0; border: 1px solid #2a4a6a; }
.step-label-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid #2a2a2a; color: #e8e8e8; font-size: 0.9rem; font-weight: 500; padding: 2px 0; min-width: 0; }
.step-label-input:focus { outline: none; border-bottom-color: #3a6080; }

.ns-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.65rem; }
.ns-label { color: #444; }
.ns-value { color: #5a8a5a; font-size: 0.65rem; }
.ns-dot { color: #333; }

.inspector-field { display: flex; flex-direction: column; gap: 0.2rem; }
.inspector-field-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: #888; }
.inspector-field-row label { display: flex; align-items: center; gap: 0.3rem; cursor: pointer; }
.inspector-readonly p { font-size: 0.72rem; color: #555; margin: 0; }

input, select, textarea {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 4px; padding: 4px 8px; font-size: 0.82rem; width: 100%;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #3a6080; }
textarea { resize: vertical; font-family: monospace; line-height: 1.4; }
input.invalid { border-color: #c0392b; }
input[type="checkbox"] { width: auto; }

.inspector-section-divider {
  font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; color: #444;
  border-top: 1px solid #1e1e1e; padding-top: 0.5rem; margin-top: 0.25rem;
}

.binding-list { display: flex; flex-direction: column; gap: 0.2rem; }
.binding-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; }
.binding-port { color: #888; }
.binding-arrow { color: #444; }
.binding-ref { color: #5a8a5a; font-size: 0.72rem; }

.prompt-block-list { display: flex; flex-direction: column; gap: 0.25rem; }
.prompt-block-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; }
.prompt-block-row.disabled { opacity: 0.4; }
.block-tag { color: #7ec8e3; font-size: 0.68rem; flex-shrink: 0; }
.block-body-preview { color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.empty-hint { font-size: 0.68rem; color: #444; margin: 0; }
</style>
