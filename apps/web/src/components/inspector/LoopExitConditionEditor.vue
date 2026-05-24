<template>
  <div class="loop-exit-editor">
    <div class="inspector-field">
      <FieldLabel label="Exit when" title="Stop looping when the last inner step's JSON output matches this condition" />
      <select v-model="localPresetId" title="Common exit conditions from verification steps" @change="applyPreset">
        <option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.label }}</option>
        <option value="custom">Custom field…</option>
      </select>
      <p v-if="activePresetDescription" class="preset-hint">{{ activePresetDescription }}</p>
    </div>

    <template v-if="localPresetId === 'custom'">
      <div class="inspector-field">
        <FieldLabel label="JSON field" title="Dot-path into the last inner step's JSON output (e.g. passed, drifted)" />
        <input
          v-model="localFieldPath"
          placeholder="passed"
          title="Field path"
          @blur="commitCustom"
        />
      </div>
      <div class="inspector-field">
        <FieldLabel label="Equals" title="Loop exits when the field equals this value" />
        <select v-model="localValueKind" title="Expected value" @change="commitCustom">
          <option value="true">true</option>
          <option value="false">false</option>
          <option value="string">Custom string…</option>
        </select>
        <input
          v-if="localValueKind === 'string'"
          v-model="localCustomValue"
          placeholder="done"
          title="Custom string value"
          @blur="commitCustom"
        />
      </div>
    </template>

    <div class="exit-summary">
      <span class="exit-summary-label">Summary</span>
      <code class="exit-summary-code">{{ summary }}</code>
    </div>

    <details class="loop-help">
      <summary>How retry loops work</summary>
      <ul>
        <li>The <strong>last inner step</strong> should output JSON (e.g. verification or drift check).</li>
        <li>Each iteration exposes the previous attempt at <code>loop.prev.text</code> to inner steps.</li>
        <li>Wire feedback on the first refine step via <strong>Add retry feedback</strong> in the Prompt tab.</li>
        <li>Outer pipeline steps (intent, criteria, etc.) stay available via history reads.</li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {LoopExitCondition} from '@lorca/core';
import {LOOP_EXIT_PRESETS, formatLoopExitSummary, loopExitPresetLabel} from '@lorca/pipeline';
import {FieldLabel} from '@lorca/ui-kit';

const props = defineProps<{
  exitCondition: LoopExitCondition;
}>();

const emit = defineEmits<{
  update: [exit: LoopExitCondition];
}>();

const presets = LOOP_EXIT_PRESETS;

function presetIdFor(exit: LoopExitCondition): string {
  if (exit.type === 'iterations') return 'max-only';
  if (exit.fieldPath === 'passed' && exit.value === true) return 'verify-passed';
  if (exit.fieldPath === 'drifted' && exit.value === false) return 'no-drift';
  return 'custom';
}

function valueKindFor(exit: LoopExitCondition): 'true' | 'false' | 'string' {
  if (exit.type !== 'json-field-equals') return 'true';
  if (exit.value === true) return 'true';
  if (exit.value === false) return 'false';
  return 'string';
}

const localPresetId = ref(presetIdFor(props.exitCondition));
const localFieldPath = ref(
  props.exitCondition.type === 'json-field-equals' ? props.exitCondition.fieldPath : 'passed',
);
const localValueKind = ref(valueKindFor(props.exitCondition));
const localCustomValue = ref(
  props.exitCondition.type === 'json-field-equals' && typeof props.exitCondition.value === 'string'
    ? props.exitCondition.value
    : '',
);

watch(() => props.exitCondition, (exit) => {
  localPresetId.value = presetIdFor(exit);
  if (exit.type === 'json-field-equals') {
    localFieldPath.value = exit.fieldPath;
    if (exit.value === true) localValueKind.value = 'true';
    else if (exit.value === false) localValueKind.value = 'false';
    else {
      localValueKind.value = 'string';
      localCustomValue.value = String(exit.value);
    }
  }
}, {deep: true});

const summary = computed(() => formatLoopExitSummary(props.exitCondition));

const activePresetDescription = computed(() => {
  if (localPresetId.value === 'custom') return null;
  return presets.find((p) => p.id === localPresetId.value)?.description ?? null;
});

function applyPreset() {
  if (localPresetId.value === 'custom') return;
  const preset = presets.find((p) => p.id === localPresetId.value);
  if (!preset) return;
  emit('update', preset.exit);
}

function commitCustom() {
  if (localPresetId.value !== 'custom') return;
  const value = localValueKind.value === 'true'
    ? true
    : localValueKind.value === 'false'
      ? false
      : localCustomValue.value || 'done';
  emit('update', {type: 'json-field-equals', fieldPath: localFieldPath.value || 'passed', value});
}

// Re-export for parent if needed
defineExpose({loopExitPresetLabel});
</script>

<style scoped>
.loop-exit-editor { display: flex; flex-direction: column; gap: 0.55rem; }
.preset-hint { margin: 0.2rem 0 0; font-size: 0.72rem; color: var(--text-label); line-height: 1.35; }
.exit-summary {
  display: flex; flex-direction: column; gap: 0.2rem;
  padding: 0.45rem 0.55rem; background: #111; border: 1px solid #252525; border-radius: 4px;
}
.exit-summary-label { font-size: 0.68rem; color: var(--text-section); text-transform: uppercase; letter-spacing: 0.04em; }
.exit-summary-code { font-size: 0.78rem; color: #7ec8e3; }
.loop-help {
  font-size: 0.72rem; color: var(--text-label); border: 1px solid #222; border-radius: 4px; padding: 0.35rem 0.55rem;
}
.loop-help summary { cursor: pointer; color: var(--text-secondary); }
.loop-help ul { margin: 0.35rem 0 0; padding-left: 1.1rem; }
.loop-help li { margin-bottom: 0.25rem; }
.loop-help code { color: #7ec8e3; font-size: 0.7rem; }
.inspector-field { display: flex; flex-direction: column; gap: 0.25rem; }
input, select {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 5px; padding: 6px 10px; font-size: 0.88rem; width: 100%;
}
</style>
