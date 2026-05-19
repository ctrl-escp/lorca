<template>
  <div class="inspector">
    <div v-if="!node" class="inspector-empty" title="Click a step in the pipeline chain to configure it">Select a step to configure it.</div>
    <template v-else>
      <div class="inspector-header">
        <span class="inspector-type" :title="`Step type: ${typeLabel}`">{{ typeLabel }}</span>
        <input
          class="inspector-title"
          v-model="localTitle"
          placeholder="(no title)"
          title="Optional display title for this step in the chain"
          @blur="emitTitle"
        />
      </div>
      <div class="inspector-prefix-row">
        <label title="Prefix used when naming artifacts produced by this step">Artifact prefix</label>
        <input v-model="localPrefix" @blur="emitPrefix" :placeholder="node.id" title="Prefix for artifact keys (e.g. prompt → prompt.text)" />
      </div>

      <!-- InputNode: read-only -->
      <div v-if="node.type === 'input'" class="inspector-readonly" title="The Input step always produces these artifacts from the target prompt">
        <p>Produces: <code>user_prompt.raw</code>, <code>user_prompt.xml</code></p>
      </div>

      <!-- ManualTextNode -->
      <div v-else-if="node.type === 'manual-text'" class="inspector-field">
        <FieldLabel label="Text" required title="Static text written to this step's output artifact" />
        <textarea v-model="localText" rows="6" title="Static text written to this step's output artifact" @blur="emit('update', {text: localText})" />
      </div>

      <!-- PromptWrapperNode -->
      <template v-else-if="node.type === 'prompt-wrapper'">
        <div class="inspector-field">
          <FieldLabel label="Tag name" required title="XML tag wrapping the instructions and input (must be a valid tag name)" />
          <input v-model="localWrapTag" @blur="emitWrapper" :class="{invalid: !isValidTag(localWrapTag)}" title="XML tag wrapping the instructions and input" />
        </div>
        <div class="inspector-field">
          <FieldLabel label="Instruction text" title="System-style instructions placed inside the wrapper tag" />
          <textarea v-model="localWrapInstruction" rows="4" title="System-style instructions placed inside the wrapper tag" @blur="emitWrapper" />
        </div>
        <div class="inspector-field-row">
          <label title="When checked, the upstream artifact is included inside the wrapper">
            <input type="checkbox" v-model="localWrapInclude" title="Include the upstream artifact inside the wrapper" @change="emitWrapper" /> Include input artifact
          </label>
        </div>
        <div v-if="localWrapInclude" class="inspector-field">
          <FieldLabel label="Input placement" title="Where the upstream artifact appears relative to instructions" />
          <select v-model="localWrapPlacement" title="Where the upstream artifact appears relative to instructions" @change="emitWrapper">
            <option value="after-instructions">After instructions</option>
            <option value="before-instructions">Before instructions</option>
            <option value="inside-template">Inside template</option>
          </select>
        </div>
      </template>

      <!-- TemplateNode -->
      <div v-else-if="node.type === 'template'" class="inspector-field">
        <label class="field-label-row">
          <FieldLabel label="Template" required title="Text template with {{artifact.key}} and {{param.name}} placeholders" />
          <span class="hint">use <code v-pre>{{artifact.key}}</code></span>
        </label>
        <textarea v-model="localTemplate" rows="8" title="Text template with {{artifact.key}} placeholders" @blur="emit('update', {template: localTemplate})" />
      </div>

      <!-- ModelCallNode -->
      <template v-else-if="node.type === 'model-call'">
        <div class="inspector-field">
          <FieldLabel label="Model ref kind" title="Use a fixed model or a Capsule slot filled at runtime" />
          <select v-model="localModelRefKind" title="Use a fixed model or a Capsule slot filled at runtime" @change="onModelRefKindChange">
            <option value="fixed">Fixed model</option>
            <option value="slot" :disabled="!capsule">Model slot</option>
          </select>
        </div>
        <div v-if="localModelRefKind === 'fixed'" class="inspector-field">
          <FieldLabel label="Model" required title="Which local model to call for this step" />
          <select v-model="localModelKey" title="Which local model to call for this step" @change="emitModelCall">
            <option value="">— select model —</option>
            <option v-for="m in models" :key="m.id" :value="`${m.endpointId}::${m.providerModelName}`">
              {{ m.displayName }} ({{ endpointName(m.endpointId) }})
            </option>
          </select>
        </div>
        <div v-else class="inspector-field">
          <FieldLabel label="Slot name" required title="Capsule interface slot that supplies the model at runtime" />
          <select v-model="localSlotName" title="Capsule interface slot that supplies the model at runtime" @change="emitModelCall">
            <option value="">— select slot —</option>
            <option v-for="slot in capsule?.interface.modelSlots ?? []" :key="slot.name" :value="slot.name">
              {{ slot.name }}
            </option>
          </select>
        </div>
        <div class="inspector-field">
          <FieldLabel label="Mode" title="Generate: single prompt. Chat: system + user message roles." />
          <select v-model="localMode" title="Generate: single prompt. Chat: system + user message roles." @change="emitModelCall">
            <option value="generate">Generate</option>
            <option value="chat">Chat</option>
          </select>
        </div>
        <div class="inspector-field">
          <FieldLabel label="Input artifact ref" required title="Artifact key fed to the model (e.g. user_prompt.xml or prompt.text)" />
          <input v-model="localInputRef" @blur="emitModelCall" placeholder="user_prompt.xml" title="Artifact key fed to the model" />
        </div>
        <div class="inspector-field">
          <FieldLabel label="System prompt (optional)" title="Separate system instruction (chat mode or Ollama generate system field)" />
          <textarea v-model="localSystemPrompt" rows="3" title="Separate system instruction sent to the model" @blur="emitModelCall" />
        </div>
        <div class="inspector-field-row">
          <FieldLabel label="Expected output" title="When json, the adapter parses the model response as JSON" />
          <select v-model="localExpectedOutput" title="When json, parse the model response as JSON" @change="emitModelCall">
            <option value="">text</option>
            <option value="json">json</option>
          </select>
        </div>
      </template>

      <!-- JsonExtractNode -->
      <div v-else-if="node.type === 'json-extract'" class="inspector-field">
        <FieldLabel label="Input artifact ref" required title="Text artifact to parse as JSON (supports fenced code blocks)" />
        <input v-model="localInputRef" @blur="emit('update', {inputArtifactRef: localInputRef})" placeholder="answer.text" title="Text artifact to parse as JSON" />
      </div>

      <!-- CapsuleInstanceNode -->
      <CapsuleInstanceInspector
        v-else-if="node.type === 'capsule-instance'"
        :node="node"
        :locked-capsules="lockedCapsules ?? []"
        @update="emit('update', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue';
import type {PipelineNode, DiscoveredModel, AiEndpointConfig, CapsuleDefinition} from '@lorca/core';
import {isValidTag} from '@lorca/prompt';
import FieldLabel from '../common/FieldLabel.vue';
import CapsuleInstanceInspector from './CapsuleInstanceInspector.vue';

const props = defineProps<{
  node: PipelineNode | null;
  models: DiscoveredModel[];
  endpoints: AiEndpointConfig[];
  capsule?: CapsuleDefinition;
  lockedCapsules?: CapsuleDefinition[];
}>();

const emit = defineEmits<{update: [patch: Record<string, unknown>]}>();

// Local reactive copies of config fields — reset when node changes
const localTitle = ref('');
const localPrefix = ref('');
const localText = ref('');
const localTemplate = ref('');
const localWrapTag = ref('');
const localWrapInstruction = ref('');
const localWrapInclude = ref(true);
const localWrapPlacement = ref<'after-instructions' | 'before-instructions' | 'inside-template'>('after-instructions');
const localModelKey = ref('');
const localModelRefKind = ref<'fixed' | 'slot'>('fixed');
const localSlotName = ref('');
const localMode = ref<'generate' | 'chat'>('generate');
const localInputRef = ref('');
const localSystemPrompt = ref('');
const localExpectedOutput = ref('');

watch(() => props.node, (node) => {
  if (!node) return;
  localTitle.value = node.title ?? '';
  localPrefix.value = node.artifactPrefix ?? '';
  if (node.type === 'manual-text') localText.value = node.text;
  if (node.type === 'template') localTemplate.value = node.template;
  if (node.type === 'prompt-wrapper') {
    localWrapTag.value = node.config.tagName;
    localWrapInstruction.value = node.config.instructionText;
    localWrapInclude.value = node.config.includeInputArtifact;
    localWrapPlacement.value = node.config.inputPlacement;
  }
  if (node.type === 'model-call') {
    const ref = node.config.modelRef;
    localModelRefKind.value = ref.kind;
    localModelKey.value = ref.kind === 'fixed' ? `${ref.endpointId}::${ref.modelName}` : '';
    localSlotName.value = ref.kind === 'slot' ? ref.slotName : '';
    localMode.value = node.config.mode;
    localInputRef.value = node.config.inputArtifactRef;
    localSystemPrompt.value = node.config.systemPrompt ?? '';
    localExpectedOutput.value = node.config.expectedOutput ?? '';
  }
  if (node.type === 'json-extract') localInputRef.value = node.inputArtifactRef;
}, {immediate: true});

const TYPE_LABELS: Record<PipelineNode['type'], string> = {
  input: 'Input', 'prompt-wrapper': 'Prompt Wrapper', template: 'Template',
  'model-call': 'Model Call', 'json-extract': 'JSON Extract', 'manual-text': 'Manual Text', 'capsule-instance': 'Capsule',
};
const typeLabel = ref('');
watch(() => props.node, (n) => { typeLabel.value = n ? (TYPE_LABELS[n.type] ?? n.type) : ''; }, {immediate: true});

function emitTitle() { emit('update', {title: localTitle.value || undefined}); }
function emitPrefix() { emit('update', {artifactPrefix: localPrefix.value || undefined}); }

function emitWrapper() {
  emit('update', {config: {
    tagName: localWrapTag.value,
    instructionText: localWrapInstruction.value,
    includeInputArtifact: localWrapInclude.value,
    inputPlacement: localWrapPlacement.value,
  }});
}

function onModelRefKindChange() {
  localModelKey.value = '';
  localSlotName.value = '';
  emitModelCall();
}

function emitModelCall() {
  let modelRef: Record<string, unknown>;
  if (localModelRefKind.value === 'slot') {
    modelRef = {kind: 'slot', slotName: localSlotName.value};
  } else {
    const parts = localModelKey.value.split('::');
    modelRef = {kind: 'fixed', endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')};
  }
  emit('update', {config: {
    modelRef,
    mode: localMode.value,
    inputArtifactRef: localInputRef.value,
    ...(localSystemPrompt.value && {systemPrompt: localSystemPrompt.value}),
    ...(localExpectedOutput.value && {expectedOutput: localExpectedOutput.value}),
  }});
}

function endpointName(id: string): string {
  return props.endpoints.find((e) => e.id === id)?.name ?? id;
}
</script>

<style scoped>
.inspector { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.6rem; overflow-y: auto; height: 100%; }
.inspector-empty { color: #444; font-size: 0.78rem; }
.inspector-header { display: flex; align-items: center; gap: 0.5rem; }
.inspector-type { font-size: 0.65rem; padding: 1px 6px; background: #222; color: #888; border-radius: 3px; flex-shrink: 0; }
.inspector-title { flex: 1; background: transparent; border: none; border-bottom: 1px solid #2a2a2a; color: #e8e8e8; font-size: 0.9rem; font-weight: 500; padding: 2px 0; }
.inspector-title:focus { outline: none; border-bottom-color: #3a6080; }
.inspector-prefix-row { display: flex; align-items: center; gap: 0.5rem; }
.inspector-prefix-row label { font-size: 0.72rem; color: #666; flex-shrink: 0; cursor: help; }
.inspector-prefix-row input { flex: 1; }
.inspector-readonly p { font-size: 0.78rem; color: #666; }
.inspector-readonly code { color: #7ec8e3; font-family: monospace; }
.inspector-field { display: flex; flex-direction: column; gap: 0.2rem; }
.field-label-row { display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap; }
.inspector-field .hint { color: #555; font-size: 0.65rem; }
.inspector-field-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: #888; }
.inspector-field-row label { display: flex; align-items: center; gap: 0.3rem; cursor: help; }
input, select, textarea {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 4px; padding: 4px 8px; font-size: 0.82rem; width: 100%;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #3a6080; }
textarea { resize: vertical; font-family: monospace; }
input.invalid { border-color: #c0392b; }
</style>
