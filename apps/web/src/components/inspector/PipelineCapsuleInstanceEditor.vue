<template>
  <div class="pci-editor">
    <div v-if="props.step.config.displayMode !== 'inline' && definitionStale" class="pci-stale-banner" role="status">
      <p class="pci-stale-text">
        The saved Capsule definition changed since this instance was bound. Outputs may be stale until you rebind.
      </p>
      <button type="button" class="btn btn-sm btn-rebind" @click="rebindDefinition">
        Rebind to current Capsule
      </button>
    </div>

    <div v-if="props.step.config.displayMode === 'inline'" class="pci-inline-panel">
      <div class="pci-inline-row">
        <span>Inline working copy</span>
        <span v-if="props.step.config.inlineModified" class="pci-inline-badge">modified</span>
      </div>
      <p v-if="definitionStale" class="pci-inline-warning">
        Saved Capsule changed after this inline copy was created.
      </p>
      <p class="pci-inline-hint">Use <strong>Collapse</strong> on the step card to fold this back into a Capsule instance.</p>
    </div>

    <template v-else>
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
        <FieldLabel label="Input bindings" :title="`${REORDER_REF_HINTS.binding} Parent artifact keys bound to Capsule input ports.`" />
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

    <button type="button" class="btn btn-sm btn-inline" @click="spreadInline">
      Spread / Edit inline
    </button>
    </template>

    <CapsuleModelSlotFields
      v-if="resolvedCapsule && resolvedCapsule.interface.modelSlots.length > 0"
      :slots="resolvedCapsule.interface.modelSlots"
      :assignments="localSlotKeys"
      :models="enabledModels"
      header-label="Model slot assignments"
      slot-name-prefix=""
      @update="onSlotAssignmentsUpdate"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue';
import type {PipelineStep, CapsuleInstanceStepConfig} from '@lorca/core';
import {computeCapsuleContentSignature, REORDER_REF_HINTS} from '@lorca/pipeline';
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import {useModelsStore} from '../../stores/models.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {bindingsFromSlotKeys, slotKeysFromBindings} from '../../utils/modelAutoSelect.js';
import {reconcileInlineCapsuleSlotRefs} from '../../utils/inlineCapsuleRun.js';
import {FieldLabel} from '@lorca/ui-kit';
import CapsuleModelSlotFields from '../shared/CapsuleModelSlotFields.vue';

const props = defineProps<{
  step: PipelineStep & {config: CapsuleInstanceStepConfig};
}>();

const editorStore = useActiveStepEditor();
const pipelineEditor = usePipelineEditorStore();
const capsulesStore = useCapsulesStore();
const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();

const availableCapsules = computed(() => capsulesStore.capsules);

const localCapsuleKey = ref('');
const localInputBindings = ref<Record<string, string>>({});
const localOutputBindings = ref<Record<string, string>>({});
const localSlotKeys = ref<Record<string, string>>({});

const enabledModels = computed(() => {
  if (!endpointsStore.loaded) return [];
  const disabledEndpointIds = new Set(endpointsStore.endpoints.filter((e) => !e.enabled).map((e) => e.id));
  return modelsStore.models.filter((m) => m.enabled !== false && !disabledEndpointIds.has(m.endpointId));
});

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
  localSlotKeys.value = slotKeysFromBindings(s.config.modelSlotBindings);
}, {immediate: true, deep: true});

onMounted(() => {
  void Promise.all([endpointsStore.load(), modelsStore.load()]);
});

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
  localSlotKeys.value = slotKeysFromBindings(draft.config.modelSlotBindings);
}

function onSlotAssignmentsUpdate(keys: Record<string, string>) {
  localSlotKeys.value = keys;
  const nextConfig: CapsuleInstanceStepConfig = {
    ...props.step.config,
    modelSlotBindings: bindingsFromSlotKeys(keys),
  };
  if (props.step.config.displayMode === 'inline' && props.step.config.inlineSteps?.length) {
    const cap = resolvedCapsule.value;
    if (cap) {
      nextConfig.inlineSteps = reconcileInlineCapsuleSlotRefs(cap, props.step.config.inlineSteps);
    }
  }
  editorStore.commitStepConfigEdit(props.step.id, {config: nextConfig}, 'Update Capsule model slots');
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

function spreadInline() {
  pipelineEditor.spreadCapsule(props.step.id);
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
.btn-inline {
  align-self: flex-start;
  background: #17131c;
  border: 1px solid #3a3245;
  color: #c6b4d8;
  padding: 3px 8px;
  font-size: 0.72rem;
  border-radius: 3px;
  cursor: pointer;
}
.btn-inline:hover { background: #21182a; }
.pci-inline-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem;
  border: 1px solid #3a3245;
  background: #151119;
  border-radius: 4px;
}
.pci-inline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
  color: #c6b4d8;
  font-size: 0.78rem;
}
.pci-inline-badge {
  color: #d0a85a;
  font-size: 0.68rem;
}
.pci-inline-warning {
  margin: 0;
  color: #c8a050;
  font-size: 0.72rem;
  line-height: 1.35;
}
.pci-inline-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.35;
}
.binding-edit-row {
  display: flex; align-items: center; gap: 0.35rem;
  margin-bottom: 0.25rem;
}
.binding-port { font-size: 0.72rem; color: var(--text-label); min-width: 5rem; }
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
