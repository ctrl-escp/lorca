<template>
  <div class="ci-inspector">
    <div class="ci-field">
      <label>Capsule</label>
      <select v-model="localCapsuleId" @change="onCapsuleSelect">
        <option value="">— select locked capsule —</option>
        <option v-for="c in lockedCapsules" :key="`${c.id}::${c.version}`" :value="`${c.id}::${c.version}`">
          {{ c.name }} ({{ c.version }})
        </option>
      </select>
    </div>

    <template v-if="selectedCapsule">
      <template v-if="selectedCapsule.interface.inputs.length > 0">
        <div class="ci-section-label">Input bindings</div>
        <div v-for="port in selectedCapsule.interface.inputs" :key="port.name" class="ci-field">
          <label>{{ port.name }} <span class="kind-tag">{{ port.kind }}</span></label>
          <input
            :value="localInputBindings[port.name] ?? ''"
            @input="localInputBindings[port.name] = ($event.target as HTMLInputElement).value"
            @blur="emitConfig"
            :placeholder="`${instancePrefix}.${port.name}`"
          />
        </div>
      </template>

      <template v-if="selectedCapsule.interface.outputs.length > 0">
        <div class="ci-section-label">Output bindings</div>
        <div v-for="port in selectedCapsule.interface.outputs" :key="port.name" class="ci-field">
          <label>{{ port.name }} <span class="kind-tag">{{ port.kind }}</span></label>
          <input
            :value="localOutputBindings[port.name] ?? ''"
            @input="localOutputBindings[port.name] = ($event.target as HTMLInputElement).value"
            @blur="emitConfig"
            :placeholder="`${instancePrefix}.${port.name}`"
          />
        </div>
      </template>

      <template v-if="selectedCapsule.interface.parameters.length > 0">
        <div class="ci-section-label">Parameter values</div>
        <div v-for="param in selectedCapsule.interface.parameters" :key="param.name" class="ci-field">
          <label>{{ param.name }} <span class="kind-tag">{{ param.kind }}</span></label>
          <input
            :value="String(localParamValues[param.name] ?? '')"
            @input="localParamValues[param.name] = ($event.target as HTMLInputElement).value"
            @blur="emitConfig"
            :placeholder="param.kind"
          />
        </div>
      </template>

      <template v-if="selectedCapsule.interface.modelSlots.length > 0">
        <div class="ci-section-label">Model slot assignments</div>
        <div v-for="slot in selectedCapsule.interface.modelSlots" :key="slot.name" class="ci-field">
          <label>{{ slot.name }}{{ slot.required ? ' *' : '' }}</label>
          <input
            :value="slotToString(localSlotAssignments[slot.name])"
            @input="localSlotAssignments[slot.name] = stringToSlot(($event.target as HTMLInputElement).value)"
            @blur="emitConfig"
            placeholder="endpointId::modelName"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {CapsuleInstanceNode, CapsuleDefinition} from '@lorca/core';

const props = defineProps<{
  node: CapsuleInstanceNode;
  lockedCapsules: CapsuleDefinition[];
}>();

const emit = defineEmits<{update: [patch: Record<string, unknown>]}>();

const localCapsuleId = ref('');
const localInputBindings = ref<Record<string, string>>({});
const localOutputBindings = ref<Record<string, string>>({});
const localParamValues = ref<Record<string, unknown>>({});
const localSlotAssignments = ref<Record<string, {endpointId: string; modelName: string}>>({});

const instancePrefix = computed(() => props.node.artifactPrefix ?? props.node.id);

const selectedCapsule = computed(() => {
  if (!localCapsuleId.value) return null;
  const [id, version] = localCapsuleId.value.split('::');
  return props.lockedCapsules.find((c) => c.id === id && c.version === version) ?? null;
});

watch(() => props.node, (n) => {
  const {capsuleDefinitionId, capsuleVersion, inputBindings, outputBindings, parameterValues, modelSlotAssignments} = n.config;
  localCapsuleId.value = capsuleDefinitionId ? `${capsuleDefinitionId}::${capsuleVersion}` : '';
  localInputBindings.value = {...inputBindings};
  localOutputBindings.value = {...outputBindings};
  localParamValues.value = {...parameterValues};
  localSlotAssignments.value = {...modelSlotAssignments};
}, {immediate: true});

function onCapsuleSelect() {
  // Reset bindings when capsule changes
  localInputBindings.value = {};
  localOutputBindings.value = {};
  localParamValues.value = {};
  localSlotAssignments.value = {};
  emitConfig();
}

function emitConfig() {
  const [id = '', version = 'v1'] = localCapsuleId.value.split('::');
  emit('update', {
    config: {
      capsuleDefinitionId: id,
      capsuleVersion: version,
      inputBindings: {...localInputBindings.value},
      outputBindings: {...localOutputBindings.value},
      parameterValues: {...localParamValues.value},
      modelSlotAssignments: {...localSlotAssignments.value},
    },
  });
}

function slotToString(slot: {endpointId: string; modelName: string} | undefined): string {
  if (!slot) return '';
  return `${slot.endpointId}::${slot.modelName}`;
}

function stringToSlot(value: string): {endpointId: string; modelName: string} {
  const parts = value.split('::');
  return {endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')};
}
</script>

<style scoped>
.ci-inspector { display: flex; flex-direction: column; gap: 0.5rem; }
.ci-section-label { font-size: 0.65rem; color: #555; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.25rem; }
.ci-field { display: flex; flex-direction: column; gap: 0.15rem; }
.ci-field label { font-size: 0.72rem; color: #888; }
.kind-tag { font-size: 0.62rem; color: #555; background: #1a1a1a; padding: 0 4px; border-radius: 2px; }
input, select {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 4px; padding: 4px 8px; font-size: 0.82rem; width: 100%;
}
input:focus, select:focus { outline: none; border-color: #3a6080; }
</style>
