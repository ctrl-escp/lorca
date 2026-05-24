<template>
  <Teleport to="body">
    <div v-if="open && block" class="pim-backdrop" @click.self="emit('close')">
      <div class="pim-dialog" role="dialog" aria-modal="true" aria-label="AI prompt improver">
        <header class="pim-header">
          <span class="pim-title hdr-prompt">Improve Prompt Block</span>
          <button class="pim-close" type="button" title="Close" @click="emit('close')">x</button>
        </header>

        <div class="pim-body">
          <label class="pim-field">
            <span class="hdr-model">Model</span>
            <select
              v-model="selectedModelKey"
              class="pim-select"
              :disabled="availableModels.length === 0 || isRunning"
              @change="persistModelSelection"
            >
              <option v-if="availableModels.length === 0" value="">No enabled models available</option>
              <optgroup v-if="rewriteModels.length > 0" label="Preferred prose/prompt rewrite models">
                <option v-for="model in rewriteModels" :key="model.id" :value="modelKey(model)">
                  {{ modelOptionLabel(model) }}
                </option>
              </optgroup>
              <optgroup v-if="otherModels.length > 0" label="Other enabled models">
                <option v-for="model in otherModels" :key="model.id" :value="modelKey(model)">
                  {{ modelOptionLabel(model) }}
                </option>
              </optgroup>
            </select>
          </label>

          <label class="pim-field">
            <span class="hdr-prompt">Improvement prompt</span>
            <textarea
              v-model="instructionText"
              class="pim-textarea"
              rows="10"
              spellcheck="true"
              :disabled="isRunning"
              @input="persistInstructionText"
            />
          </label>

          <div class="pim-context-controls">
            <label class="pim-check">
              <input type="checkbox" v-model="includeCurrentBlock" :disabled="isRunning || !previousSuggestionAvailable" />
              <span>Include current block</span>
            </label>
            <label v-if="previousSuggestionAvailable" class="pim-check">
              <input type="checkbox" v-model="includePreviousSuggestion" :disabled="isRunning" />
              <span>Include previous suggestion</span>
            </label>
          </div>

          <div class="pim-original">
            <span class="hdr-preview">Current block</span>
            <pre>{{ block.body }}</pre>
          </div>

          <label v-if="resultText !== null" class="pim-field">
            <span class="hdr-preview">Preview</span>
            <textarea
              v-model="resultText"
              class="pim-textarea pim-result"
              rows="14"
              spellcheck="true"
            />
          </label>

          <div v-if="errorText" class="pim-error">{{ errorText }}</div>
        </div>

        <footer class="pim-footer">
          <button class="pim-btn pim-secondary" type="button" :disabled="isRunning" @click="emit('close')">Cancel</button>
          <button class="pim-btn pim-secondary" type="button" :disabled="!canRun" @click="runImprover">
            {{ isRunning ? 'Improving...' : 'Improve' }}
          </button>
          <button class="pim-btn pim-primary" type="button" :disabled="!canApply" @click="applyResult">Apply</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {AiEndpointConfig, DiscoveredModel, PromptBlock} from '@lorca/core';
import {executeModelCall} from '@lorca/endpoints';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useModelsStore} from '../../stores/models.js';
import {
  buildPromptImproverRequest,
  DEFAULT_PROMPT_IMPROVER_PROMPT,
  loadPromptImproverModelKey,
  loadPromptImproverPrompt,
  isLikelyExecutedPromptOutput,
  isLikelyUnchangedPromptOutput,
  normalizeImprovedPrompt,
  parsePromptImproverModelKey,
  PROMPT_IMPROVER_BUCKET,
  promptImproverModelKey,
  promptImproverModelLabel,
  savePromptImproverModelKey,
  savePromptImproverPrompt,
  selectPromptImproverModel,
} from '../../utils/promptImprover.js';

const props = defineProps<{
  open: boolean;
  stepId: string;
  block: PromptBlock | null;
}>();

const emit = defineEmits<{
  close: [];
  apply: [body: string];
}>();

const endpointsStore = useEndpointsStore();
const modelsStore = useModelsStore();

const selectedModelKey = ref('');
const instructionText = ref(DEFAULT_PROMPT_IMPROVER_PROMPT);
const resultText = ref<string | null>(null);
const errorText = ref('');
const isRunning = ref(false);
const includeCurrentBlock = ref(true);
const includePreviousSuggestion = ref(false);

const enabledEndpointIds = computed(() =>
  new Set(endpointsStore.endpoints.filter((e) => e.enabled).map((e) => e.id)),
);

const availableModels = computed(() =>
  modelsStore.models.filter((m) => m.enabled !== false && enabledEndpointIds.value.has(m.endpointId)),
);

const rewriteModels = computed(() =>
  availableModels.value.filter((m) => (m.userBuckets ?? m.buckets).includes(PROMPT_IMPROVER_BUCKET)),
);

const otherModels = computed(() =>
  availableModels.value.filter((m) => !(m.userBuckets ?? m.buckets).includes(PROMPT_IMPROVER_BUCKET)),
);

const selectedModel = computed(() =>
  availableModels.value.find((m) => promptImproverModelKey(m) === selectedModelKey.value) ?? null,
);

const canRun = computed(() =>
  !isRunning.value &&
  Boolean(props.block?.body.trim()) &&
  Boolean(selectedModel.value) &&
  (includeCurrentBlock.value || (includePreviousSuggestion.value && previousSuggestionAvailable.value)),
);

const canApply = computed(() =>
  !isRunning.value && resultText.value !== null && resultText.value.trim().length > 0,
);

const previousSuggestionAvailable = computed(() =>
  resultText.value !== null && resultText.value.trim().length > 0,
);

watch(() => props.open, (open) => {
  if (!open) return;
  resetForOpen();
});

watch(availableModels, () => {
  if (!props.open) return;
  if (selectedModel.value) return;
  const selected = selectPromptImproverModel(availableModels.value, loadPromptImproverModelKey());
  selectedModelKey.value = selected ? promptImproverModelKey(selected) : '';
});

function resetForOpen() {
  instructionText.value = loadPromptImproverPrompt(props.stepId) ?? DEFAULT_PROMPT_IMPROVER_PROMPT;
  resultText.value = null;
  errorText.value = '';
  isRunning.value = false;
  includeCurrentBlock.value = true;
  includePreviousSuggestion.value = false;
  const selected = selectPromptImproverModel(availableModels.value, loadPromptImproverModelKey());
  selectedModelKey.value = selected ? promptImproverModelKey(selected) : '';
}

function modelKey(model: DiscoveredModel): string {
  return promptImproverModelKey(model);
}

function modelOptionLabel(model: DiscoveredModel): string {
  return promptImproverModelLabel(model, endpointsStore.getEndpoint(model.endpointId)?.name ?? model.endpointId);
}

function persistModelSelection() {
  if (selectedModelKey.value) savePromptImproverModelKey(selectedModelKey.value);
}

function persistInstructionText() {
  savePromptImproverPrompt(props.stepId, instructionText.value);
}

async function runImprover() {
  if (!props.block || !selectedModel.value) return;
  const parsed = parsePromptImproverModelKey(selectedModelKey.value);
  if (!parsed) return;
  const endpoint = endpointsStore.getEndpoint(parsed.endpointId);
  if (!endpoint || !endpoint.enabled) {
    errorText.value = 'Selected model endpoint is not available.';
    return;
  }

  persistModelSelection();
  persistInstructionText();
  isRunning.value = true;
  errorText.value = '';
  const previousSuggestion = includePreviousSuggestion.value ? resultText.value : null;
  resultText.value = null;

  const maxTokens = Math.max(512, Math.min(4096, Math.ceil(props.block.body.length / 3) + 512));
  const first = await requestRewrite(endpoint, parsed.modelName, props.block, maxTokens, {
    previousSuggestion,
  });
  if (!first.ok) {
    isRunning.value = false;
    errorText.value = first.message;
    return;
  }

  const firstFailure = rejectedOutputReason(first.text, props.block.body, previousSuggestion);
  if (!firstFailure) {
    isRunning.value = false;
    setResultText(first.text);
    return;
  }

  const second = await requestRewrite(endpoint, parsed.modelName, props.block, maxTokens, {
    previousSuggestion,
    previousBadOutput: first.text,
    rejectionReason: firstFailure.retryMessage,
  });
  isRunning.value = false;
  if (!second.ok) {
    errorText.value = second.message;
    return;
  }
  const secondFailure = rejectedOutputReason(second.text, props.block.body, previousSuggestion);
  if (secondFailure) {
    errorText.value = secondFailure.errorMessage;
    return;
  }
  setResultText(second.text);
}

async function requestRewrite(
  endpoint: AiEndpointConfig,
  modelName: string,
  block: PromptBlock,
  maxTokens: number,
  options: {previousSuggestion?: string | null; previousBadOutput?: string; rejectionReason?: string} = {},
): Promise<{ok: true; text: string} | {ok: false; message: string}> {
  const requestOptions: {
    includeCurrentBlock: boolean;
    previousSuggestion?: string | null;
    previousBadOutput?: string;
    rejectionReason?: string;
  } = {includeCurrentBlock: includeCurrentBlock.value};
  if (options.previousSuggestion !== undefined) requestOptions.previousSuggestion = options.previousSuggestion;
  if (options.previousBadOutput !== undefined) requestOptions.previousBadOutput = options.previousBadOutput;
  if (options.rejectionReason !== undefined) requestOptions.rejectionReason = options.rejectionReason;
  const request = buildPromptImproverRequest(block, instructionText.value, {
    ...requestOptions,
  });
  const response = await executeModelCall(endpoint, {
    mode: 'chat',
    endpointId: endpoint.id,
    modelName,
    systemPrompt: request.systemPrompt,
    userContent: request.userContent,
    temperature: 0.2,
    maxTokens,
  });

  if (!response.ok) {
    return {ok: false, message: response.error.message};
  }

  const normalized = normalizeImprovedPrompt(response.value.text);
  if (!normalized) {
    return {ok: false, message: 'The model returned an empty rewrite.'};
  }
  return {ok: true, text: normalized};
}

function setResultText(text: string) {
  resultText.value = text;
  includePreviousSuggestion.value = true;
}

function rejectedOutputReason(
  output: string,
  currentBlock: string,
  previousSuggestion: string | null,
): {retryMessage: string; errorMessage: string} | null {
  if (isLikelyExecutedPromptOutput(output)) {
    return {
      retryMessage: 'Your previous response was rejected because it answered or emitted the source prompt output shape instead of rewriting the source prompt.',
      errorMessage: 'The model answered the prompt instead of rewriting it. Try a different model or edit the improvement prompt.',
    };
  }
  if (isLikelyUnchangedPromptOutput(output, [currentBlock, previousSuggestion])) {
    return {
      retryMessage: 'Your previous response was rejected because it copied the source or previous suggestion with no substantive improvement. Produce a meaningfully revised prompt while preserving the contract.',
      errorMessage: 'The model returned the current block or previous suggestion without a substantive improvement. Try a different model or make the improvement prompt more specific.',
    };
  }
  return null;
}

function applyResult() {
  if (!canApply.value || resultText.value === null) return;
  emit('apply', resultText.value);
  emit('close');
}
</script>

<style scoped>
.pim-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9200;
}

.pim-dialog {
  width: min(1500px, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  background: #141414;
  border: 1px solid #333;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.pim-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 0.9rem;
  border-bottom: 1px solid #222;
}

.pim-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #e8e8e8;
}

.pim-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}

.pim-close:hover { color: #aaa; }

.pim-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1rem;
}

.pim-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.pim-field span,
.pim-original span {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

.pim-select,
.pim-textarea {
  width: 100%;
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 4px;
  padding: 0.45rem 0.55rem;
  font-size: 0.78rem;
}

.pim-select:focus,
.pim-textarea:focus {
  outline: none;
  border-color: var(--accent-border);
}

.pim-textarea {
  resize: vertical;
  line-height: 1.45;
  font-family: monospace;
}

.pim-result {
  color: #d8ead8;
}

.pim-context-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.pim-check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: #aaa;
  font-size: 0.78rem;
}

.pim-check input {
  margin: 0;
}

.pim-check:has(input:disabled) {
  color: var(--text-secondary);
}

.pim-original {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.pim-original pre {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  background: #0d0d0d;
  border: 1px solid #222;
  border-radius: 4px;
  color: #aaa;
  padding: 0.55rem;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.72rem;
  line-height: 1.45;
  font-family: monospace;
}

.pim-error {
  color: #e07070;
  font-size: 0.78rem;
}

.pim-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  border-top: 1px solid #222;
}

.pim-btn {
  border-radius: 4px;
  padding: 5px 14px;
  font-size: 0.82rem;
  cursor: pointer;
  border: 1px solid #333;
}

.pim-secondary {
  background: #1a1a1a;
  color: #ccc;
}

.pim-secondary:hover:not(:disabled) {
  background: #222;
}

.pim-primary {
  background: var(--accent-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}

.pim-primary:hover:not(:disabled) {
  background: var(--accent-bg-hover);
}

.pim-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
