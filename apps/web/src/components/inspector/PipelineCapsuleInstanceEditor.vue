<template>
  <div class="pci-editor">
    <div v-if="definitionStale" class="pci-stale-banner" role="status">
      <p class="pci-stale-text">
        The saved Capsule definition changed since this instance was bound. Outputs may be stale until you rebind.
      </p>
      <button type="button" class="btn btn-sm btn-rebind" @click="rebindDefinition">
        Rebind to current Capsule
      </button>
    </div>

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
            @focus="beginBindingsEdit"
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
            @focus="beginBindingsEdit"
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
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import FieldLabel from '../common/FieldLabel.vue';

const props = defineProps<{
  step: PipelineStep & {config: CapsuleInstanceStepConfig};
}>();

const editorStore = useActiveStepEditor();
const pipelineEditor = usePipelineEditorStore();
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

const definitionStale = computed(() => {
  const cap = resolvedCapsule.value;
  const bound = props.step.config.boundContentSignature;
  if (!cap || !bound) return false;
  return computeCapsuleContentSignature(cap) !== bound;
});

watch(() => props.step, (s) => {
  localCapsuleKey.value = `${s.config.capsuleId}::${s.config.capsuleVersion}`;
  localInputBindings.value = {...s.config.inputBindings};
  localOutputBindings.value = {...s.config.outputBindings};
}, {immediate: true, deep: true});

function onCapsuleSelect() {
  const cap = resolvedCapsule.value;
  if (!cap) return;
  const draft = pipelineEditor.buildCapsuleInstanceStep(cap, {id: props.step.id, label: props.step.label});
  if (draft.config.type !== 'capsule-instance') return;
  editorStore.commitStepConfigEdit(props.step.id, {
    config: draft.config,
    outputNamespace: draft.outputNamespace,
    primaryOutputName: draft.primaryOutputName,
  }, 'Change Capsule instance');
  localInputBindings.value = {...draft.config.inputBindings};
  localOutputBindings.value = {...draft.config.outputBindings};
}

function beginBindingsEdit() {
  editorStore.beginStepEdit(props.step.id);
}

function commitBindings() {
  const cap = resolvedCapsule.value;
  if (!cap) return;
  editorStore.commitStepEdit(props.step.id, {
    config: {
      ...props.step.config,
      inputBindings: {...localInputBindings.value},
      outputBindings: {...localOutputBindings.value},
      boundContentSignature: computeCapsuleContentSignature(cap),
    },
  }, 'Update Capsule bindings');
}

function rebindDefinition() {
  const cap = resolvedCapsule.value;
  if (!cap) return;
  editorStore.commitStepConfigEdit(props.step.id, {
    config: {
      ...props.step.config,
      boundContentSignature: computeCapsuleContentSignature(cap),
    },
  }, 'Rebind Capsule definition');
}
</script>

<style scoped>
.pci-editor { display: flex; flex-direction: column; gap: 0.45rem; }
.pci-stale-banner {
  padding: 0.45rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #4a4020;
  background: #2a2418;
}
.pci-stale-text { margin: 0 0 0.4rem; font-size: 0.72rem; color: #c8a050; line-height: 1.35; }
.btn-rebind {
  background: #2d2a1e;
  border: 1px solid #4d3d1a;
  color: #c8a85a;
  padding: 2px 8px;
  font-size: 0.72rem;
  border-radius: 3px;
  cursor: pointer;
}
.btn-rebind:hover { background: #3d3822; }
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
