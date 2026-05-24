<template>
  <div class="capsule-slot-fields">
    <div v-if="showAutoSelectAll" class="capsule-slot-header">
      <span class="capsule-slot-title">{{ headerLabel }}</span>
      <button
        type="button"
        class="btn btn-secondary btn-auto-all"
        title="Auto-select all models for this capsule's slots"
        @click="forceFillAll"
      >
        Auto-select all
      </button>
    </div>

    <div v-for="slot in slots" :key="slot.name" class="capsule-slot-field">
      <FieldLabel
        :label="slotLabel(slot.name)"
        :required="slot.required"
        :title="`Model assignment for slot '${slot.name}'`"
      />
      <div class="model-select-row">
        <select
          :value="assignments[slot.name] ?? ''"
          :title="`Model assignment for slot '${slot.name}'`"
          @change="onSelect(slot.name, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">— select model —</option>
          <option v-for="m in models" :key="m.id" :value="`${m.endpointId}::${m.providerModelName}`">
            {{ m.displayName }}
          </option>
        </select>
        <button
          type="button"
          class="btn-autoselect"
          title="Auto-select a model for this slot"
          @click="autoSelectOne(slot.name)"
        >
          Auto
        </button>
      </div>
      <p v-if="slotWarnings[slot.name]" class="model-select-warning">{{ slotWarnings[slot.name] }}</p>
    </div>

    <p v-if="bulkWarning" class="model-select-warning bulk-warning">{{ bulkWarning }}</p>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue';
import type {CapsuleModelSlot, DiscoveredModel} from '@lorca/core';
import {FieldLabel} from '@lorca/ui-kit';
import {autoSelectCapsuleSlot, modelKeyFromRef} from '../../utils/modelAutoSelect.js';

const props = withDefaults(defineProps<{
  slots: CapsuleModelSlot[];
  assignments: Record<string, string>;
  models: DiscoveredModel[];
  headerLabel?: string;
  slotNamePrefix?: string;
  showAutoSelectAll?: boolean;
}>(), {
  headerLabel: 'Model slots',
  slotNamePrefix: 'slot: ',
  showAutoSelectAll: true,
});

const emit = defineEmits<{update: [assignments: Record<string, string>]}>();

const slotWarnings = ref<Record<string, string>>({});
const bulkWarning = ref('');

function slotLabel(name: string): string {
  return props.slotNamePrefix ? `${props.slotNamePrefix}${name}` : name;
}

function emitAssignments(next: Record<string, string>) {
  emit('update', next);
}

function onSelect(slotName: string, value: string) {
  bulkWarning.value = '';
  const next = {...props.assignments, [slotName]: value};
  if (!value) delete next[slotName];
  const warnings = {...slotWarnings.value};
  delete warnings[slotName];
  slotWarnings.value = warnings;
  emitAssignments(next);
}

function autoSelectOne(slotName: string) {
  bulkWarning.value = '';
  const slot = props.slots.find((s) => s.name === slotName);
  if (!slot) return;
  const result = autoSelectCapsuleSlot(slot, props.models);
  if (result.ok) {
    const warnings = {...slotWarnings.value};
    delete warnings[slotName];
    slotWarnings.value = warnings;
    emitAssignments({...props.assignments, [slotName]: modelKeyFromRef(result.modelRef)});
  } else {
    slotWarnings.value = {...slotWarnings.value, [slotName]: result.warning};
  }
}

function forceFillAll() {
  bulkWarning.value = '';
  slotWarnings.value = {};
  const next = {...props.assignments};
  const failures: string[] = [];
  for (const slot of props.slots) {
    const result = autoSelectCapsuleSlot(slot, props.models);
    if (result.ok) {
      next[slot.name] = modelKeyFromRef(result.modelRef);
    } else {
      failures.push(result.warning);
    }
  }
  emitAssignments(next);
  if (failures.length > 0) {
    bulkWarning.value = failures.join(' ');
  }
}
</script>

<style scoped>
.capsule-slot-fields {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.capsule-slot-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}
.capsule-slot-title {
  font-size: 0.65rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.capsule-slot-field {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.model-select-row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.model-select-row select {
  flex: 1;
  min-width: 0;
  background: #111;
  border: 1px solid #2a2a2a;
  color: #e8e8e8;
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 0.78rem;
}
.model-select-row select:focus {
  outline: none;
  border-color: #3a6080;
}
.btn-autoselect {
  background: #1a1a1a;
  border: 1px solid #333;
  color: #aaa;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.78rem;
  cursor: pointer;
  flex-shrink: 0;
}
.btn-autoselect:hover {
  background: #222;
  color: #ccc;
  border-color: var(--text-muted);
}
.model-select-warning {
  margin: 0;
  color: #c8a050;
  font-size: 0.72rem;
  line-height: 1.35;
}
.bulk-warning {
  margin-top: 0.15rem;
}
.btn {
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 0.72rem;
  cursor: pointer;
  border: 1px solid #333;
}
.btn-secondary {
  background: #1a1a1a;
  color: #aaa;
}
.btn-secondary:hover {
  background: #222;
  color: #ccc;
}
.btn-auto-all {
  flex-shrink: 0;
}
</style>
