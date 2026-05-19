<template>
  <div class="inspector">
    <div v-if="!node" class="inspector-empty">Select a step to configure it.</div>
    <template v-else>
      <div class="inspector-header">
        <span class="inspector-type">{{ typeLabel }}</span>
        <input class="inspector-title" v-model="localTitle" placeholder="(no title)" @blur="emitTitle" />
      </div>
      <div class="inspector-prefix-row">
        <label>Artifact prefix</label>
        <input v-model="localPrefix" @blur="emitPrefix" :placeholder="node.id" />
      </div>

      <!-- InputNode: read-only -->
      <div v-if="node.type === 'input'" class="inspector-readonly">
        <p>Produces: <code>user_prompt.raw</code>, <code>user_prompt.xml</code></p>
      </div>

      <!-- ManualTextNode -->
      <div v-else-if="node.type === 'manual-text'" class="inspector-field">
        <label>Text</label>
        <textarea v-model="localText" rows="6" @blur="emit('update', {text: localText})" />
      </div>

      <!-- PromptWrapperNode -->
      <template v-else-if="node.type === 'prompt-wrapper'">
        <div class="inspector-field">
          <label>Tag name</label>
          <input v-model="localWrapTag" @blur="emitWrapper" :class="{invalid: !isValidTag(localWrapTag)}" />
        </div>
        <div class="inspector-field">
          <label>Instruction text</label>
          <textarea v-model="localWrapInstruction" rows="4" @blur="emitWrapper" />
        </div>
        <div class="inspector-field-row">
          <label><input type="checkbox" v-model="localWrapInclude" @change="emitWrapper" /> Include input artifact</label>
        </div>
        <div v-if="localWrapInclude" class="inspector-field">
          <label>Input placement</label>
          <select v-model="localWrapPlacement" @change="emitWrapper">
            <option value="after-instructions">After instructions</option>
            <option value="before-instructions">Before instructions</option>
            <option value="inside-template">Inside template</option>
          </select>
        </div>
      </template>

      <!-- TemplateNode -->
      <div v-else-if="node.type === 'template'" class="inspector-field">
        <label>Template <span class="hint">use <code v-pre>{{artifact.key}}</code></span></label>
        <textarea v-model="localTemplate" rows="8" @blur="emit('update', {template: localTemplate})" />
      </div>

      <!-- ModelCallNode -->
      <template v-else-if="node.type === 'model-call'">
        <div class="inspector-field">
          <label>Model ref kind</label>
          <select v-model="localModelRefKind" @change="onModelRefKindChange">
            <option value="fixed">Fixed model</option>
            <option value="slot" :disabled="!capsule">Model slot</option>
          </select>
        </div>
        <div v-if="localModelRefKind === 'fixed'" class="inspector-field">
          <label>Model</label>
          <select v-model="localModelKey" @change="emitModelCall">
            <option value="">— select model —</option>
            <option v-for="m in models" :key="m.id" :value="`${m.endpointId}::${m.providerModelName}`">
              {{ m.displayName }} ({{ endpointName(m.endpointId) }})
            </option>
          </select>
        </div>
        <div v-else class="inspector-field">
          <label>Slot name</label>
          <select v-model="localSlotName" @change="emitModelCall">
            <option value="">— select slot —</option>
            <option v-for="slot in capsule?.interface.modelSlots ?? []" :key="slot.name" :value="slot.name">
              {{ slot.name }}{{ slot.required ? ' *' : '' }}
            </option>
          </select>
        </div>
        <div class="inspector-field">
          <label>Mode</label>
          <select v-model="localMode" @change="emitModelCall">
            <option value="generate">Generate</option>
            <option value="chat">Chat</option>
          </select>
        </div>
        <div class="inspector-field">
          <label>Input artifact ref</label>
          <input v-model="localInputRef" @blur="emitModelCall" placeholder="user_prompt.xml" />
        </div>
        <div class="inspector-field">
          <label>System prompt (optional)</label>
          <textarea v-model="localSystemPrompt" rows="3" @blur="emitModelCall" />
        </div>
        <div class="inspector-field-row">
          <label>Expected output</label>
          <select v-model="localExpectedOutput" @change="emitModelCall">
            <option value="">text</option>
            <option value="json">json</option>
          </select>
        </div>
      </template>

      <!-- JsonExtractNode -->
      <div v-else-if="node.type === 'json-extract'" class="inspector-field">
        <label>Input artifact ref</label>
        <input v-model="localInputRef" @blur="emit('update', {inputArtifactRef: localInputRef})" placeholder="answer.text" />
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
.inspector-prefix-row label { font-size: 0.72rem; color: #666; flex-shrink: 0; }
.inspector-prefix-row input { flex: 1; }
.inspector-readonly p { font-size: 0.78rem; color: #666; }
.inspector-readonly code { color: #7ec8e3; font-family: monospace; }
.inspector-field { display: flex; flex-direction: column; gap: 0.2rem; }
.inspector-field label { font-size: 0.72rem; color: #888; }
.inspector-field .hint { color: #555; font-size: 0.65rem; }
.inspector-field-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: #888; }
.inspector-field-row label { display: flex; align-items: center; gap: 0.3rem; }
input, select, textarea {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 4px; padding: 4px 8px; font-size: 0.82rem; width: 100%;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #3a6080; }
textarea { resize: vertical; font-family: monospace; }
input.invalid { border-color: #c0392b; }
</style>
