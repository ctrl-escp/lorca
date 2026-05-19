<template>
  <div class="interface-panel">
    <!-- Inputs -->
    <section class="iface-section">
      <div class="iface-section-header">
        <span class="iface-section-title">Inputs</span>
        <button class="icon-btn" @click="addInput">+</button>
      </div>
      <div v-for="(port, i) in localInputs" :key="i" class="port-row">
        <input v-model="port.name" placeholder="name" @blur="emitUpdate" />
        <select v-model="port.kind" @change="emitUpdate">
          <option value="text">text</option>
          <option value="json">json</option>
        </select>
        <label class="req-check"><input type="checkbox" v-model="port.required" @change="emitUpdate" /> req</label>
        <button class="remove-btn" @click="removeInput(i)">×</button>
      </div>
      <p v-if="localInputs.length === 0" class="empty-hint">No inputs declared.</p>
    </section>

    <!-- Outputs -->
    <section class="iface-section">
      <div class="iface-section-header">
        <span class="iface-section-title">Outputs</span>
        <button class="icon-btn" @click="addOutput">+</button>
      </div>
      <div v-for="(port, i) in localOutputs" :key="i" class="port-row">
        <input v-model="port.name" placeholder="name" @blur="emitUpdate" />
        <select v-model="port.kind" @change="emitUpdate">
          <option value="text">text</option>
          <option value="json">json</option>
        </select>
        <button class="remove-btn" @click="removeOutput(i)">×</button>
      </div>
      <p v-if="localOutputs.length === 0" class="empty-hint">No outputs declared.</p>
    </section>

    <!-- Parameters -->
    <section class="iface-section">
      <div class="iface-section-header">
        <span class="iface-section-title">Parameters</span>
        <button class="icon-btn" @click="addParam">+</button>
      </div>
      <div v-for="(param, i) in localParams" :key="i" class="port-row">
        <input v-model="param.name" placeholder="name" @blur="emitUpdate" />
        <select v-model="param.kind" @change="emitUpdate">
          <option value="text">text</option>
          <option value="boolean">boolean</option>
          <option value="number">number</option>
          <option value="json">json</option>
        </select>
        <label class="req-check"><input type="checkbox" v-model="param.required" @change="emitUpdate" /> req</label>
        <button class="remove-btn" @click="removeParam(i)">×</button>
      </div>
      <p v-if="localParams.length === 0" class="empty-hint">No parameters declared.</p>
    </section>

    <!-- Model Slots -->
    <section class="iface-section">
      <div class="iface-section-header">
        <span class="iface-section-title">Model Slots</span>
        <button class="icon-btn" @click="addSlot">+</button>
      </div>
      <div v-for="(slot, i) in localSlots" :key="i" class="slot-row">
        <input v-model="slot.name" placeholder="slot name" @blur="emitUpdate" />
        <label class="req-check"><input type="checkbox" v-model="slot.required" @change="emitUpdate" /> req</label>
        <button class="remove-btn" @click="removeSlot(i)">×</button>
      </div>
      <p v-if="localSlots.length === 0" class="empty-hint">No model slots declared.</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue';
import type {CapsuleInterface, CapsuleInputPort, CapsuleOutputPort, CapsuleParameter, CapsuleModelSlot} from '@lorca/core';

const props = defineProps<{iface: CapsuleInterface}>();
const emit = defineEmits<{update: [iface: CapsuleInterface]}>();

const localInputs = ref<CapsuleInputPort[]>([]);
const localOutputs = ref<CapsuleOutputPort[]>([]);
const localParams = ref<CapsuleParameter[]>([]);
const localSlots = ref<CapsuleModelSlot[]>([]);

watch(() => props.iface, (iface) => {
  localInputs.value = structuredClone(iface.inputs);
  localOutputs.value = structuredClone(iface.outputs);
  localParams.value = structuredClone(iface.parameters);
  localSlots.value = structuredClone(iface.modelSlots);
}, {immediate: true, deep: false});

function emitUpdate() {
  emit('update', {
    inputs: localInputs.value,
    outputs: localOutputs.value,
    parameters: localParams.value,
    modelSlots: localSlots.value,
  });
}

function addInput() { localInputs.value.push({name: '', kind: 'text', required: false}); emitUpdate(); }
function removeInput(i: number) { localInputs.value.splice(i, 1); emitUpdate(); }

function addOutput() { localOutputs.value.push({name: '', kind: 'text'}); emitUpdate(); }
function removeOutput(i: number) { localOutputs.value.splice(i, 1); emitUpdate(); }

function addParam() { localParams.value.push({name: '', kind: 'text', required: false}); emitUpdate(); }
function removeParam(i: number) { localParams.value.splice(i, 1); emitUpdate(); }

function addSlot() { localSlots.value.push({name: '', suggestedBuckets: ['general'], required: false}); emitUpdate(); }
function removeSlot(i: number) { localSlots.value.splice(i, 1); emitUpdate(); }
</script>

<style scoped>
.interface-panel { padding: 0.6rem; display: flex; flex-direction: column; gap: 0.5rem; overflow-y: auto; height: 100%; }
.iface-section { background: #111; border: 1px solid #222; border-radius: 5px; padding: 0.5rem; }
.iface-section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem; }
.iface-section-title { font-size: 0.72rem; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
.port-row, .slot-row { display: flex; gap: 0.3rem; align-items: center; margin-bottom: 0.25rem; }
.port-row input, .slot-row input { flex: 1; background: #1a1a1a; border: 1px solid #2a2a2a; color: #e8e8e8; border-radius: 3px; padding: 3px 6px; font-size: 0.78rem; }
.port-row select { background: #1a1a1a; border: 1px solid #2a2a2a; color: #e8e8e8; border-radius: 3px; padding: 3px 4px; font-size: 0.78rem; }
.req-check { font-size: 0.72rem; color: #666; display: flex; align-items: center; gap: 0.2rem; white-space: nowrap; }
.remove-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 1rem; padding: 0 4px; line-height: 1; }
.remove-btn:hover { color: #c0392b; }
.icon-btn { background: none; border: 1px solid #333; color: #888; border-radius: 3px; width: 18px; height: 18px; cursor: pointer; font-size: 0.9rem; line-height: 1; display: flex; align-items: center; justify-content: center; }
.icon-btn:hover { background: #222; color: #ccc; }
.empty-hint { font-size: 0.72rem; color: #555; margin: 0; }
</style>
