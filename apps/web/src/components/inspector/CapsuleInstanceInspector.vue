<template>
  <div class="ci-inspector">
    <div class="ci-field">
      <FieldLabel label="Capsule" required title="Locked Capsule definition to embed in this pipeline step" />
      <select v-model="localCapsuleId" title="Locked Capsule definition to embed in this pipeline step" @change="onCapsuleSelect">
        <option value="">— select locked capsule —</option>
        <option v-for="c in lockedCapsules" :key="`${c.id}::${c.version}`" :value="`${c.id}::${c.version}`">
          {{ c.name }} ({{ c.version }})
        </option>
      </select>
    </div>

    <template v-if="selectedCapsule">
      <!-- Loop config -->
      <div class="ci-section-label">Loop</div>
      <div class="ci-field-row">
        <label title="Repeat this Capsule instance, carrying output from each iteration into the next">
          <input type="checkbox" v-model="localLoopEnabled" title="Enable iterative execution with carried state" @change="emitConfig" /> Enable loop
        </label>
      </div>
      <template v-if="localLoopEnabled">
        <div class="ci-field">
          <label title="How many times to run the Capsule (1-10)">Iterations (1-10)</label>
          <input type="number" v-model.number="localLoopCount" min="1" max="10" title="Number of loop iterations" @change="emitConfig" />
        </div>
        <div class="ci-field">
          <label title="Capsule input port fed from the previous iteration's output">Carried input port</label>
          <select v-model="localCarriedInputName" title="Input port that receives the carried value each iteration" @change="emitConfig">
            <option value="">— select input port —</option>
            <option v-for="p in selectedCapsule.interface.inputs" :key="p.name" :value="p.name">{{ p.name }}</option>
          </select>
        </div>
        <div class="ci-field">
          <label title="Output from each iteration used as input for the next">Carried output name</label>
          <input v-model="localCarriedOutputName" @blur="emitConfig" placeholder="output port or outputRef name" title="Output artifact name to carry between iterations" />
        </div>
      </template>

      <template v-if="selectedCapsule.interface.inputs.length > 0">
        <div class="ci-section-label">Input bindings</div>
        <div v-for="port in selectedCapsule.interface.inputs" :key="port.name" class="ci-field">
          <label :title="`Pipeline artifact key bound to Capsule input '${port.name}'`">{{ port.name }} <span class="kind-tag">{{ port.kind }}</span></label>
          <input
            :value="localInputBindings[port.name] ?? ''"
            @input="localInputBindings[port.name] = ($event.target as HTMLInputElement).value"
            @blur="emitConfig"
            :placeholder="`${instancePrefix}.${port.name}`"
            :title="`Artifact key for Capsule input '${port.name}' (${port.kind})`"
          />
        </div>
      </template>

      <template v-if="selectedCapsule.interface.outputs.length > 0">
        <div class="ci-section-label">Output bindings</div>
        <div v-for="port in selectedCapsule.interface.outputs" :key="port.name" class="ci-field">
          <label :title="`Pipeline artifact key where Capsule output '${port.name}' is stored`">{{ port.name }} <span class="kind-tag">{{ port.kind }}</span></label>
          <input
            :value="localOutputBindings[port.name] ?? ''"
            @input="localOutputBindings[port.name] = ($event.target as HTMLInputElement).value"
            @blur="emitConfig"
            :placeholder="`${instancePrefix}.${port.name}`"
            :title="`Artifact key for Capsule output '${port.name}' (${port.kind})`"
          />
        </div>
      </template>

      <template v-if="selectedCapsule.interface.parameters.length > 0">
        <div class="ci-section-label">Parameter values</div>
        <div v-for="param in selectedCapsule.interface.parameters" :key="param.name" class="ci-field">
          <label :title="`Value for Capsule parameter '${param.name}'`">param: {{ param.name }} <span class="kind-tag">{{ param.kind }}</span></label>
          <input
            :value="String(localParamValues[param.name] ?? '')"
            @input="localParamValues[param.name] = ($event.target as HTMLInputElement).value"
            @blur="emitConfig"
            :placeholder="param.kind"
            :title="`Value for parameter '${param.name}' (${param.kind})`"
          />
        </div>
      </template>

      <template v-if="selectedCapsule.interface.modelSlots.length > 0">
        <div class="ci-section-label">Model slot assignments</div>
        <div v-for="slot in selectedCapsule.interface.modelSlots" :key="slot.name" class="ci-field">
          <FieldLabel :label="slot.name" :required="slot.required" :title="`Model assignment for slot '${slot.name}' (endpointId::modelName)`" />
          <input
            :value="slotToString(localSlotAssignments[slot.name])"
            @input="localSlotAssignments[slot.name] = stringToSlot(($event.target as HTMLInputElement).value)"
            @blur="emitConfig"
            placeholder="endpointId::modelName"
            :title="`Model for slot '${slot.name}' as endpointId::modelName`"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {CapsuleInstanceNode, CapsuleDefinition} from '@lorca/core';
import {FieldLabel} from '@lorca/ui-kit';

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
const localLoopEnabled = ref(false);
const localLoopCount = ref(1);
const localCarriedInputName = ref('');
const localCarriedOutputName = ref('');

const instancePrefix = computed(() => props.node.artifactPrefix ?? props.node.id);

const selectedCapsule = computed(() => {
  if (!localCapsuleId.value) return null;
  const [id, version] = localCapsuleId.value.split('::');
  return props.lockedCapsules.find((c) => c.id === id && c.version === version) ?? null;
});

watch(() => props.node, (n) => {
  const {capsuleDefinitionId, capsuleVersion, inputBindings, outputBindings, parameterValues, modelSlotAssignments, loop} = n.config;
  localCapsuleId.value = capsuleDefinitionId ? `${capsuleDefinitionId}::${capsuleVersion}` : '';
  localInputBindings.value = {...inputBindings};
  localOutputBindings.value = {...outputBindings};
  localParamValues.value = {...parameterValues};
  localSlotAssignments.value = {...modelSlotAssignments};
  localLoopEnabled.value = loop?.enabled ?? false;
  localLoopCount.value = loop?.count ?? 1;
  localCarriedInputName.value = loop?.carriedInputName ?? '';
  localCarriedOutputName.value = loop?.carriedOutputName ?? '';
}, {immediate: true});

function onCapsuleSelect() {
  localInputBindings.value = {};
  localOutputBindings.value = {};
  localParamValues.value = {};
  localSlotAssignments.value = {};
  emitConfig();
}

function emitConfig() {
  const [id = '', version = 'v1'] = localCapsuleId.value.split('::');
  const loopConfig = localLoopEnabled.value ? {
    loop: {
      enabled: true,
      count: localLoopCount.value,
      inputCarryMode: 'first-input-then-previous-output' as const,
      carriedInputName: localCarriedInputName.value,
      carriedOutputName: localCarriedOutputName.value,
    },
  } : {};
  emit('update', {
    config: {
      capsuleDefinitionId: id,
      capsuleVersion: version,
      inputBindings: {...localInputBindings.value},
      outputBindings: {...localOutputBindings.value},
      parameterValues: {...localParamValues.value},
      modelSlotAssignments: {...localSlotAssignments.value},
      ...loopConfig,
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
.ci-field-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: var(--text-label); }
.ci-field-row label { display: flex; align-items: center; gap: 0.3rem; cursor: help; }
.ci-section-label { font-size: 0.65rem; color: var(--text-section); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.25rem; }
.ci-field { display: flex; flex-direction: column; gap: 0.15rem; }
.ci-field label { font-size: 0.72rem; color: var(--text-label); cursor: help; }
.kind-tag { font-size: 0.62rem; color: var(--text-secondary); background: #1a1a1a; padding: 0 4px; border-radius: 2px; }
input, select {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 4px; padding: 4px 8px; font-size: 0.82rem; width: 100%;
}
input:focus, select:focus { outline: none; border-color: #3a6080; }
</style>
