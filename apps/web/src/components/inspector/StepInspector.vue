<template>
  <div class="step-inspector">
    <div v-if="!step" class="inspector-empty">Select a step to configure it.</div>
    <template v-else>
      <div class="inspector-header">
        <span class="step-type-badge" :title="`Step type: ${step.type}`">{{ TYPE_LABELS[step.type] ?? step.type }}</span>
        <input
          class="step-label-input"
          v-model="localLabel"
          placeholder="Step label"
          title="Display label for this step"
          @focus="onLabelFocus"
          @blur="commitLabel"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
      </div>

      <div class="inspector-tabs" role="tablist">
        <button
          v-for="tab in visibleTabs"
          :key="tab.id"
          type="button"
          class="inspector-tab"
          :class="{active: activeTab === tab.id}"
          role="tab"
          :aria-selected="activeTab === tab.id"
          @click="activeTab = tab.id"
        >{{ tab.label }}</button>
      </div>

      <div class="inspector-tab-panel">
        <!-- Config -->
        <template v-if="activeTab === 'config'">
          <div class="ns-row">
            <span class="ns-label" title="Artifact namespace for this step's outputs">namespace</span>
            <code class="ns-value">{{ step.outputNamespace }}</code>
            <span class="ns-dot">·</span>
            <code class="ns-value">{{ step.primaryOutputName }}</code>
          </div>

          <template v-if="step.config.type === 'model-call'">
            <div class="inspector-field">
              <FieldLabel label="Model" required title="Which model to call for this step" />
              <select v-model="localModelKey" title="Select a model" @change="commitModelCall">
                <option value="">— select model —</option>
                <optgroup v-for="ep in endpointsStore.endpoints" :key="ep.id" :label="ep.name">
                  <option
                    v-for="m in modelsForEndpoint(ep.id)"
                    :key="m.id"
                    :value="`${m.endpointId}::${m.providerModelName}`"
                  >
                    {{ m.displayName }}
                  </option>
                </optgroup>
              </select>
            </div>
            <div class="inspector-field">
              <FieldLabel label="Mode" title="Generate: single prompt → single response. Chat: system + user message roles." />
              <select v-model="localMode" title="Inference mode" @change="commitModelCall">
                <option value="generate">Generate</option>
                <option value="chat">Chat</option>
              </select>
            </div>
            <div class="inspector-field">
              <FieldLabel label="Temperature" title="Sampling temperature (leave blank for model default)" />
              <input
                type="number" min="0" max="2" step="0.05"
                v-model="localTemperature"
                placeholder="default"
                title="Sampling temperature"
                @blur="commitModelCall"
              />
            </div>
            <div class="inspector-field">
              <FieldLabel label="Max tokens" title="Maximum output tokens (leave blank for model default)" />
              <input
                type="number" min="1" step="128"
                v-model="localMaxTokens"
                placeholder="default"
                title="Maximum output tokens"
                @blur="commitModelCall"
              />
            </div>
          </template>

          <template v-else-if="step.config.type === 'manual-text'">
            <div class="inspector-field">
              <FieldLabel label="Text" title="Static text output produced by this step" />
              <textarea
                v-model="localText"
                rows="6"
                placeholder="Enter static text…"
                title="Static text"
                @focus="onTextFieldFocus"
                @blur="commitManualText"
              />
            </div>
          </template>

          <template v-else-if="step.config.type === 'template'">
            <div class="inspector-field">
              <FieldLabel label="Template" title="Handlebars-style template using {{artifact.key}} placeholders" />
              <textarea
                v-model="localTemplate"
                rows="6"
                placeholder="{{user_prompt.raw}}"
                title="Template with artifact placeholders"
                @focus="onTextFieldFocus"
                @blur="commitTemplate"
              />
            </div>
          </template>

          <template v-else-if="step.config.type === 'json-extract'">
            <div class="inspector-field">
              <FieldLabel label="Source artifact" required title="Artifact key to parse as JSON (supports fenced code blocks)" />
              <input
                v-model="localSourceRef"
                placeholder="answer.text"
                title="Source artifact key"
                @blur="commitJsonExtract"
              />
            </div>
          </template>

          <PipelineCapsuleInstanceEditor
            v-else-if="capsuleInstanceStep"
            :step="capsuleInstanceStep"
          />

          <template v-else-if="step.config.type === 'loop-group'">
            <div class="inspector-field">
              <FieldLabel label="Max iterations" required title="Maximum number of times the inner chain will run" />
              <input
                type="number" min="1" max="20" step="1"
                v-model="localMaxIterations"
                title="Maximum iterations"
                @blur="commitLoopGroup"
              />
            </div>
            <div class="inspector-field">
              <FieldLabel label="Exit condition" title="When to stop looping before reaching max iterations" />
              <select v-model="localExitConditionType" title="Exit condition type" @change="commitLoopGroup">
                <option value="iterations">Always run max iterations</option>
                <option value="json-field-equals">JSON field equals value</option>
              </select>
            </div>
            <template v-if="localExitConditionType === 'json-field-equals'">
              <div class="inspector-field">
                <FieldLabel label="Field path" title="Dot-path into last inner step's JSON output (e.g. passed)" />
                <input
                  v-model="localExitFieldPath"
                  placeholder="passed"
                  title="JSON field path to check"
                  @blur="commitLoopGroup"
                />
              </div>
              <div class="inspector-field">
                <FieldLabel label="Exit when value" title="Loop exits when the field equals this value" />
                <select v-model="localExitValue" title="Expected value that triggers loop exit" @change="commitLoopGroup">
                  <option value="true_bool">true</option>
                  <option value="false_bool">false</option>
                  <option value="custom">Custom string…</option>
                </select>
              </div>
            </template>
            <LoopInnerChainEditor
              :loop-step-id="step.id"
              :inner-steps="step.config.steps"
            />
          </template>
        </template>

        <!-- Prompt -->
        <template v-else-if="activeTab === 'prompt'">
          <PromptCompositionEditor
            v-if="hasPromptBlocks"
            :step-id="step.id"
            :config="step.prompt"
          />
          <p v-else class="empty-hint">This step type has no prompt composition.</p>
        </template>

        <!-- Inputs -->
        <template v-else-if="activeTab === 'inputs'">
          <template v-if="step.config.type === 'json-extract'">
            <div class="inspector-field">
              <FieldLabel label="Source artifact" />
              <code class="binding-ref">{{ step.config.sourceArtifactRef || '(not set)' }}</code>
            </div>
          </template>
          <template v-else-if="step.config.type === 'capsule-instance'">
            <div class="binding-list">
              <div v-for="(ref, port) in step.config.inputBindings" :key="port" class="binding-row">
                <span class="binding-port">{{ port }}</span>
                <span class="binding-arrow">←</span>
                <code class="binding-ref">{{ ref }}</code>
              </div>
              <p v-if="Object.keys(step.config.inputBindings).length === 0" class="empty-hint">No input bindings.</p>
            </div>
          </template>
          <template v-else-if="hasPromptBlocks && step.prompt">
            <p v-if="step.prompt.historyReads.length === 0" class="empty-hint">
              No history reads. Open the Prompt tab to add prior-step outputs.
            </p>
            <ul v-else class="history-read-list">
              <li v-for="(hr, i) in step.prompt.historyReads" :key="`${hr.sourceStepId}-${i}`" class="history-read-row">
                <code class="binding-ref">{{ hr.sourceArtifactRef }}</code>
                <span class="history-read-tag">&lt;{{ hr.tagName }}&gt;</span>
                <span v-if="hr.required" class="history-read-required">required</span>
              </li>
            </ul>
            <p v-if="step.prompt.previousOutput?.enabled" class="inputs-hint">
              Previous output: <code>{{ step.prompt.previousOutput.tagName }}</code>
              ({{ step.prompt.previousOutput.placement }})
            </p>
          </template>
          <p v-else class="empty-hint">No configurable inputs for this step type.</p>
        </template>

        <!-- Outputs -->
        <template v-else-if="activeTab === 'outputs'">
          <div class="inspector-field">
            <FieldLabel label="Primary output key" />
            <code class="binding-ref">{{ step.outputNamespace }}.{{ step.primaryOutputName }}</code>
          </div>
          <div v-if="step.config.type === 'capsule-instance'" class="binding-list">
            <div v-for="(ref, port) in step.config.outputBindings" :key="port" class="binding-row">
              <span class="binding-port">{{ port }}</span>
              <span class="binding-arrow">→</span>
              <code class="binding-ref">{{ ref }}</code>
            </div>
          </div>
          <div v-if="lastSnapshot?.outputArtifactRefs.length" class="inspector-last-outputs">
            <span class="inspector-last-label">From last run:</span>
            <code v-for="ref in lastSnapshot.outputArtifactRefs" :key="ref" class="inspector-artifact-ref">{{ ref }}</code>
          </div>
          <p v-else class="empty-hint">No output artifacts from a run yet.</p>
        </template>

        <!-- Last run -->
        <template v-else-if="activeTab === 'last-run'">
          <div v-if="stepStatus" class="inspector-status" :class="`status-${stepStatus.state}`">
            <div class="inspector-status-header">
              <span class="inspector-status-label">{{ stepRunUiStateLabel(stepStatus.state) }}</span>
              <span v-if="lastSnapshot?.completedAt" class="inspector-status-time">
                {{ formatTime(lastSnapshot.completedAt) }}
              </span>
            </div>
            <pre v-if="lastSnapshot?.primaryOutputPreview" class="inspector-output-preview">{{ lastSnapshot.primaryOutputPreview }}</pre>
            <p v-else-if="stepStatus.state === 'not-run'" class="empty-hint">This step has not been executed yet.</p>
          </div>
          <p v-else class="empty-hint">No run data.</p>
        </template>

        <!-- Validation -->
        <template v-else-if="activeTab === 'validation'">
          <div v-if="stepStatus?.blockReasons?.length" class="inspector-status status-blocked">
            <ul class="inspector-status-issues">
              <li v-for="(reason, i) in stepStatus.blockReasons" :key="i">{{ reason }}</li>
            </ul>
          </div>
          <p v-else-if="stepStatus?.state === 'stale' || stepStatus?.state === 'failed-stale'" class="inspector-status-hint">
            Upstream config or inputs changed since the last run. Re-run to refresh outputs.
          </p>
          <p v-else-if="stepStatus?.state === 'current' || stepStatus?.state === 'failed-current'" class="inspector-status-hint ok">
            No blocking issues for this step.
          </p>
          <p v-else class="empty-hint">Run the pipeline to evaluate validation state.</p>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, watch, computed} from 'vue';
import type {PipelineStep, ModelCallStepConfig, CapsuleInstanceStepConfig} from '@lorca/core';
import {computeStepStaleStates, stepRunUiStateLabel} from '@lorca/pipeline';
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useCapsuleRunStore} from '../../stores/capsuleRun.js';
import {useUiStore} from '../../stores/ui.js';
import {useModelsStore} from '../../stores/models.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {useCapsulesStore} from '../../stores/capsules.js';
import FieldLabel from '../common/FieldLabel.vue';
import PromptCompositionEditor from './PromptCompositionEditor.vue';
import LoopInnerChainEditor from './LoopInnerChainEditor.vue';
import PipelineCapsuleInstanceEditor from './PipelineCapsuleInstanceEditor.vue';

type InspectorTab = 'config' | 'prompt' | 'inputs' | 'outputs' | 'last-run' | 'validation';

const uiStore = useUiStore();
const editorStore = useActiveStepEditor();
const pipelineRunStore = useActiveRunStore();
const capsuleRunStore = useCapsuleRunStore();
const runStore = computed(() => uiStore.editorContext === 'capsule' ? capsuleRunStore : pipelineRunStore);
const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();
const capsulesStore = useCapsulesStore();

const step = computed(() => editorStore.selectedStep);
const activeTab = ref<InspectorTab>('config');

const stepStatus = computed(() => {
  const s = step.value;
  if (!s) return null;
  const states = computeStepStaleStates(
    editorStore.pipeline,
    runStore.value.runSnapshotContext,
    editorStore.pipeline.input.raw,
    (id, version) => capsulesStore.getCapsule(id, version),
  );
  return states.find((st) => st.stepId === s.id) ?? null;
});

const lastSnapshot = computed(() => {
  const s = step.value;
  if (!s) return null;
  return runStore.value.snapshots[s.id] ?? null;
});

const hasPromptBlocks = computed(() =>
  step.value?.config.type === 'model-call' || step.value?.config.type === 'prompt-wrapper',
);

const capsuleInstanceStep = computed((): (PipelineStep & {config: CapsuleInstanceStepConfig}) | null => {
  const s = step.value;
  if (!s || s.config.type !== 'capsule-instance') return null;
  return s as PipelineStep & {config: CapsuleInstanceStepConfig};
});

const visibleTabs = computed(() => {
  const tabs: {id: InspectorTab; label: string}[] = [
    {id: 'config', label: 'Config'},
  ];
  if (hasPromptBlocks.value) tabs.push({id: 'prompt', label: 'Prompt'});
  tabs.push({id: 'inputs', label: 'Inputs'}, {id: 'outputs', label: 'Outputs'});
  tabs.push({id: 'last-run', label: 'Last run'}, {id: 'validation', label: 'Validation'});
  return tabs;
});

watch(step, () => {
  if (!visibleTabs.value.some((t) => t.id === activeTab.value)) {
    activeTab.value = 'config';
  }
});

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
  } catch {
    return iso;
  }
}

const TYPE_LABELS: Record<string, string> = {
  'model-call': 'Model Call',
  'prompt-wrapper': 'Prompt Wrapper',
  'template': 'Template',
  'json-extract': 'JSON Extract',
  'manual-text': 'Manual Text',
  'capsule-instance': 'Capsule',
  'loop-group': 'Loop Group',
};

const localLabel = ref('');
const localModelKey = ref('');
const localMode = ref<'generate' | 'chat'>('generate');
const localTemperature = ref('');
const localMaxTokens = ref('');
const localText = ref('');
const localTemplate = ref('');
const localSourceRef = ref('');
const localMaxIterations = ref(3);
const localExitConditionType = ref<'iterations' | 'json-field-equals'>('json-field-equals');
const localExitFieldPath = ref('passed');
const localExitValue = ref<'true_bool' | 'false_bool' | 'custom'>('true_bool');

watch(step, (s) => {
  if (!s) return;
  localLabel.value = s.label;
  const cfg = s.config;

  if (cfg.type === 'model-call') {
    localModelKey.value = cfg.modelRef.kind === 'fixed'
      ? `${cfg.modelRef.endpointId}::${cfg.modelRef.modelName}`
      : '';
    localMode.value = cfg.mode;
    localTemperature.value = cfg.temperature !== undefined ? String(cfg.temperature) : '';
    localMaxTokens.value = cfg.maxTokens !== undefined ? String(cfg.maxTokens) : '';
  }

  if (cfg.type === 'manual-text') localText.value = cfg.text;
  if (cfg.type === 'template') localTemplate.value = cfg.template;
  if (cfg.type === 'json-extract') localSourceRef.value = cfg.sourceArtifactRef;

  if (cfg.type === 'loop-group') {
    localMaxIterations.value = cfg.maxIterations;
    const ec = cfg.exitCondition;
    localExitConditionType.value = ec.type === 'json-field-equals' ? 'json-field-equals' : 'iterations';
    if (ec.type === 'json-field-equals') {
      localExitFieldPath.value = ec.fieldPath;
      localExitValue.value = ec.value === true ? 'true_bool' : ec.value === false ? 'false_bool' : 'custom';
    }
  }
}, {immediate: true});

function modelsForEndpoint(endpointId: string) {
  return modelsStore.modelsByEndpoint.get(endpointId) ?? [];
}

function onLabelFocus() {
  const s = step.value;
  if (s) editorStore.beginStepEdit(s.id);
}

function onTextFieldFocus() {
  const s = step.value;
  if (s) editorStore.beginStepEdit(s.id);
}

function commitLabel() {
  const s = step.value;
  if (!s || localLabel.value === s.label) return;
  editorStore.commitStepEdit(s.id, {label: localLabel.value.trim() || s.label}, 'Rename step');
}

function commitModelCall() {
  const s = step.value;
  if (!s || s.config.type !== 'model-call') return;
  const parts = localModelKey.value.split('::');
  const modelRef = localModelKey.value
    ? {kind: 'fixed' as const, endpointId: parts[0] ?? '', modelName: parts.slice(1).join('::')}
    : s.config.modelRef;
  const patch: Partial<ModelCallStepConfig> = {modelRef, mode: localMode.value};
  const temp = parseFloat(localTemperature.value);
  if (!isNaN(temp)) patch.temperature = temp;
  const maxTok = parseInt(localMaxTokens.value, 10);
  if (!isNaN(maxTok) && maxTok > 0) patch.maxTokens = maxTok;
  editorStore.commitStepConfigEdit(s.id, {config: {...s.config, ...patch}}, 'Update model call');
}

function commitManualText() {
  const s = step.value;
  if (!s || s.config.type !== 'manual-text') return;
  editorStore.commitStepEdit(s.id, {config: {...s.config, text: localText.value}}, 'Edit text');
}

function commitTemplate() {
  const s = step.value;
  if (!s || s.config.type !== 'template') return;
  editorStore.commitStepEdit(s.id, {config: {...s.config, template: localTemplate.value}}, 'Edit template');
}

function commitJsonExtract() {
  const s = step.value;
  if (!s || s.config.type !== 'json-extract') return;
  editorStore.commitStepConfigEdit(s.id, {config: {...s.config, sourceArtifactRef: localSourceRef.value}}, 'Update source');
}

function commitLoopGroup() {
  const s = step.value;
  if (!s || s.config.type !== 'loop-group') return;
  const exitCondition = localExitConditionType.value === 'iterations'
    ? {type: 'iterations' as const}
    : {
        type: 'json-field-equals' as const,
        fieldPath: localExitFieldPath.value || 'passed',
        value: localExitValue.value === 'true_bool' ? true : localExitValue.value === 'false_bool' ? false : 'done',
      };
  editorStore.commitStepConfigEdit(s.id, {
    config: {...s.config, maxIterations: localMaxIterations.value, exitCondition},
  }, 'Update loop');
}

</script>

<style scoped>
.step-inspector { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.55rem; overflow: hidden; height: 100%; }
.inspector-empty { color: #444; font-size: 0.78rem; }

.inspector-header { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
.step-type-badge { font-size: 0.62rem; padding: 1px 6px; background: #1a2a3a; color: #7ec8e3; border-radius: 3px; flex-shrink: 0; border: 1px solid #2a4a6a; }
.step-label-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid #2a2a2a; color: #e8e8e8; font-size: 0.9rem; font-weight: 500; padding: 2px 0; min-width: 0; }
.step-label-input:focus { outline: none; border-bottom-color: #3a6080; }

.inspector-tabs {
  display: flex; flex-wrap: wrap; gap: 0.15rem; flex-shrink: 0;
  border-bottom: 1px solid #1e1e1e; padding-bottom: 0.35rem;
}
.inspector-tab {
  background: none; border: 1px solid transparent; color: #666;
  font-size: 0.65rem; padding: 2px 6px; border-radius: 3px; cursor: pointer;
}
.inspector-tab:hover { color: #999; }
.inspector-tab.active { color: #7ec8e3; border-color: #2a4a6a; background: #1a2430; }

.inspector-tab-panel { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.55rem; }

.ns-row { display: flex; align-items: center; gap: 0.3rem; font-size: 0.65rem; }
.ns-label { color: #444; }
.ns-value { color: #5a8a5a; font-size: 0.65rem; }
.ns-dot { color: #333; }

.inspector-status {
  border: 1px solid #2a2a2a; border-radius: 4px; padding: 0.45rem 0.55rem;
  display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.72rem;
}
.status-current { border-left: 2px solid #3a9d6e; background: #0f1a0f; }
.status-stale, .status-failed-stale { border-left: 2px solid #c8a050; background: #1a180f; }
.status-blocked { border-left: 2px solid #c0392b; background: #1a0f0f; }
.status-not-run { border-left: 2px solid #444; background: #111; }
.status-failed-current { border-left: 2px solid #c0392b; background: #1a1010; }
.status-skipped-partial { border-left: 2px solid #606080; background: #101018; }
.status-disabled { opacity: 0.6; }

.inspector-status-header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.inspector-status-label { color: #aaa; font-weight: 500; }
.inspector-status-time { color: #555; font-size: 0.65rem; }
.inspector-status-issues { margin: 0; padding-left: 1rem; color: #e07070; }
.inspector-status-hint { margin: 0; color: #888; font-size: 0.68rem; }
.inspector-status-hint.ok { color: #5a9d6e; }
.inspector-last-outputs { display: flex; flex-wrap: wrap; gap: 0.25rem; align-items: center; }
.inspector-last-label { color: #555; font-size: 0.65rem; }
.inspector-artifact-ref { color: #5a8a5a; font-size: 0.65rem; }
.inspector-output-preview {
  margin: 0.35rem 0 0;
  padding: 0.35rem 0.5rem;
  font-size: 0.68rem;
  color: #999;
  background: #0d0d0d;
  border: 1px solid #1e1e1e;
  border-radius: 4px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 12rem;
  overflow-y: auto;
}

.inspector-field { display: flex; flex-direction: column; gap: 0.2rem; }

input, select, textarea {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 4px; padding: 4px 8px; font-size: 0.82rem; width: 100%;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #3a6080; }
textarea { resize: vertical; font-family: monospace; line-height: 1.4; }

.binding-list { display: flex; flex-direction: column; gap: 0.2rem; }
.binding-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; }
.binding-port { color: #888; }
.binding-arrow { color: #444; }
.binding-ref { color: #5a8a5a; font-size: 0.72rem; }

.history-read-list { margin: 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
.history-read-row { font-size: 0.72rem; display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
.history-read-disabled { color: #666; font-size: 0.65rem; }
.history-read-tag { color: #666; font-size: 0.65rem; }
.history-read-required { color: #c8a050; font-size: 0.65rem; }
.inputs-hint { font-size: 0.68rem; color: #666; margin: 0.35rem 0 0; }

.empty-hint { font-size: 0.68rem; color: #444; margin: 0; }
</style>
