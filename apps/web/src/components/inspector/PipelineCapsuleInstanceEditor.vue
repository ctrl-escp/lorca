<template>
  <div class="pci-editor">
    <div class="inspector-field">
      <FieldLabel label="Capsule" required title="Capsule definition for this instance" />
      <select v-model="localCapsuleKey" title="Select a saved Capsule" @change="onCapsuleSelect">
        <option value="">— select capsule —</option>
        <option v-for="c in availableCapsules" :key="`${c.id}::${c.version}`" :value="`${c.id}::${c.version}`">
          {{ c.name }} ({{ c.version }}, {{ c.status }})
        </option>
      </select>
    </div>

    <template v-if="resolvedCapsule">
      <div v-if="Object.keys(localInputBindings).length > 0" class="inspector-field">
        <FieldLabel label="Input bindings" title="Parent artifact keys bound to Capsule input ports" />
        <div v-for="port in resolvedCapsule.interface.inputs" :key="port.name" class="binding-edit-row">
          <span class="binding-port">{{ port.name }}</span>
          <input
            v-model="localInputBindings[port.name]"
            :placeholder="port.defaultArtifactKey ?? `${port.name}.text`"
            @blur="commitBindings"
          />
        </div>
      </div>

      <div v-if="Object.keys(localOutputBindings).length > 0" class="inspector-field">
        <FieldLabel label="Output bindings" />
        <div v-for="port in resolvedCapsule.interface.outputs" :key="port.name" class="binding-edit-row">
          <span class="binding-port">{{ port.name }}</span>
          <input
            v-model="localOutputBindings[port.name]"
            :placeholder="port.sourceArtifactKey ?? port.name"
            @blur="commitBindings"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {PipelineStep, CapsuleInstanceStepConfig} from '@lorca/core';
import {computeCapsuleContentSignature} from '@lorca/pipeline';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import FieldLabel from '../common/FieldLabel.vue';

const props = defineProps<{
  step: PipelineStep & {config: CapsuleInstanceStepConfig};
}>();

const editorStore = usePipelineEditorStore();
const capsulesStore = useCapsulesStore();

const availableCapsules = computed(() => capsulesStore.capsules);

const localCapsuleKey = ref('');
const localInputBindings = ref<Record<string, string>>({});
const localOutputBindings = ref<Record<string, string>>({});

const resolvedCapsule = computed(() => {
  if (!localCapsuleKey.value) return undefined;
  const [id, version] = localCapsuleKey.value.split('::');
  return id && version ? capsulesStore.getCapsule(id, version) : undefined;
});

watch(() => props.step, (s) => {
  localCapsuleKey.value = `${s.config.capsuleId}::${s.config.capsuleVersion}`;
  localInputBindings.value = {...s.config.inputBindings};
  localOutputBindings.value = {...s.config.outputBindings};
}, {immediate: true, deep: true});

function onCapsuleSelect() {
  const cap = resolvedCapsule.value;
  if (!cap) return;
  const draft = editorStore.buildCapsuleInstanceStep(cap, {id: props.step.id, label: props.step.label});
  if (draft.config.type !== 'capsule-instance') return;
  editorStore.commitStepConfigEdit(props.step.id, {
    config: draft.config,
    outputNamespace: draft.outputNamespace,
    primaryOutputName: draft.primaryOutputName,
  }, 'Change Capsule instance');
  localInputBindings.value = {...draft.config.inputBindings};
  localOutputBindings.value = {...draft.config.outputBindings};
}

function commitBindings() {
  const cap = resolvedCapsule.value;
  if (!cap) return;
  editorStore.commitStepConfigEdit(props.step.id, {
    config: {
      ...props.step.config,
      inputBindings: {...localInputBindings.value},
      outputBindings: {...localOutputBindings.value},
      boundContentSignature: computeCapsuleContentSignature(cap),
    },
  }, 'Update Capsule bindings');
}
</script>

<style scoped>
.pci-editor { display: flex; flex-direction: column; gap: 0.45rem; }
.binding-edit-row {
  display: flex; align-items: center; gap: 0.35rem;
  margin-bottom: 0.25rem;
}
.binding-port { font-size: 0.72rem; color: #888; min-width: 5rem; }
.binding-edit-row input {
  flex: 1;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 3px;
  padding: 3px 6px;
  font-size: 0.78rem;
}
select {
  width: 100%;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 0.78rem;
}
</style>
