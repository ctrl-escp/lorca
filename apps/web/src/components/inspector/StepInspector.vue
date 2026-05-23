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
              <label class="checkbox-row" title="Run this model on the first enabled endpoint that has it">
                <input type="checkbox" v-model="localUseAnyEndpoint" @change="commitModelCall" />
                <span>Use this model on any enabled endpoint</span>
              </label>
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
            <div class="inspector-field">
              <FieldLabel label="Output format" title="How to handle the model's text output" />
              <select v-model="localOutputType" title="Output format" @change="commitOutputType">
                <option value="auto">Auto (try JSON, fall back silently)</option>
                <option value="text">Text only (no JSON attempt)</option>
                <option value="json">JSON strict (fail if not valid JSON)</option>
              </select>
            </div>
          </template>

          <template v-else-if="step.config.type === 'presentation'">
            <div class="inspector-field">
              <FieldLabel label="Text" title="Free-form text with optional {{artifact.key}} interpolation" />
              <textarea
                v-model="localTemplate"
                rows="6"
                placeholder="{{artifact.user_prompt.raw}}"
                title="Text with optional artifact placeholders"
                @focus="onTextFieldFocus"
                @blur="commitTemplate"
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
                @blur="() => commitLoopGroup()"
              />
            </div>
            <LoopExitConditionEditor
              :exit-condition="step.config.exitCondition"
              @update="onLoopExitUpdate"
            />
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
          <template v-if="step.config.type === 'capsule-instance'">
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
            <JsonViewer
              v-if="lastRunOutputValue !== null"
              class="inspector-output-preview"
              :value="lastRunOutputValue"
            />
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
import type {PipelineStep, ModelCallStepConfig, CapsuleInstanceStepConfig, LoopExitCondition} from '@lorca/core';
import {stepRunUiStateLabel} from '@lorca/pipeline';
import {useStepStaleStateMap} from '../../composables/useStepStaleStateMap.js';
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useCapsuleRunStore} from '../../stores/capsuleRun.js';
import {useUiStore} from '../../stores/ui.js';
import {useModelsStore} from '../../stores/models.js';
import {useEndpointsStore} from '../../stores/endpoints.js';
import {FieldLabel, JsonViewer} from '@lorca/ui-kit';
import PromptCompositionEditor from './PromptCompositionEditor.vue';
import LoopInnerChainEditor from './LoopInnerChainEditor.vue';
import LoopExitConditionEditor from './LoopExitConditionEditor.vue';
import PipelineCapsuleInstanceEditor from './PipelineCapsuleInstanceEditor.vue';

type InspectorTab = 'config' | 'prompt' | 'inputs' | 'outputs' | 'last-run' | 'validation';

const uiStore = useUiStore();
const editorStore = useActiveStepEditor();
const pipelineRunStore = useActiveRunStore();
const capsuleRunStore = useCapsuleRunStore();
const runStore = computed(() => uiStore.editorContext === 'capsule' ? capsuleRunStore : pipelineRunStore);
const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();

const {stateFor} = useStepStaleStateMap(() => editorStore.pipeline.input.raw);

const step = computed(() => editorStore.selectedStep);
const activeTab = ref<InspectorTab>('config');

const stepStatus = computed(() => {
  const s = step.value;
  if (!s) return null;
  return stateFor(s.id);
});

const lastSnapshot = computed(() => {
  const s = step.value;
  if (!s) return null;
  return runStore.value.snapshots[s.id] ?? null;
});

const lastRunOutputValue = computed((): unknown | null => {
  const s = step.value;
  const snapshot = lastSnapshot.value;
  if (!s || !snapshot?.primaryOutputPreview) return null;
  const key = `${s.outputNamespace}.${s.primaryOutputName}`;
  const artifact = runStore.value.artifacts[key];
  return artifact ? artifact.value : snapshot.primaryOutputPreview;
});

const hasPromptBlocks = computed(() =>
  step.value?.config.type === 'model-call',
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
}, {flush: 'sync'});

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'});
  } catch {
    return iso;
  }
}

const TYPE_LABELS: Record<string, string> = {
  'model-call': 'Model Call',
  'presentation': 'Text',
  'capsule-instance': 'Capsule',
  'loop-group': 'Loop',
};

const localLabel = ref('');
const localModelKey = ref('');
const localUseAnyEndpoint = ref(false);
const localMode = ref<'generate' | 'chat'>('generate');
const localTemperature = ref('');
const localMaxTokens = ref('');
const localOutputType = ref<'text' | 'auto' | 'json'>('auto');
const localTemplate = ref('');
const localMaxIterations = ref(3);

watch(step, (s) => {
  if (!s) return;
  localLabel.value = s.label;
  const cfg = s.config;

  if (cfg.type === 'model-call') {
    localUseAnyEndpoint.value = cfg.modelRef.kind === 'any-enabled-endpoint';
    localModelKey.value = cfg.modelRef.kind === 'fixed'
      ? `${cfg.modelRef.endpointId}::${cfg.modelRef.modelName}`
      : cfg.modelRef.kind === 'any-enabled-endpoint'
        ? modelKeyForName(cfg.modelRef.modelName)
        : '';
    localMode.value = cfg.mode;
    localTemperature.value = cfg.temperature !== undefined ? String(cfg.temperature) : '';
    localMaxTokens.value = cfg.maxTokens !== undefined ? String(cfg.maxTokens) : '';
    localOutputType.value = cfg.outputType ?? 'auto';
  }

  if (cfg.type === 'presentation') localTemplate.value = cfg.text;

  if (cfg.type === 'loop-group') {
    localMaxIterations.value = cfg.maxIterations;
  }
}, {immediate: true});

function modelsForEndpoint(endpointId: string) {
  return modelsStore.modelsByEndpoint.get(endpointId) ?? [];
}

function modelKeyForName(modelName: string): string {
  const model = modelsStore.models.find((m) => m.providerModelName === modelName);
  return model ? `${model.endpointId}::${model.providerModelName}` : '';
}

function modelNameFromKey(key: string): string {
  return key ? key.split('::').slice(1).join('::') : '';
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
  const modelName = modelNameFromKey(localModelKey.value);
  const modelRef = modelName
    ? localUseAnyEndpoint.value
      ? {kind: 'any-enabled-endpoint' as const, modelName}
      : {kind: 'fixed' as const, endpointId: parts[0] ?? '', modelName}
    : s.config.modelRef;
  const patch: Partial<ModelCallStepConfig> = {modelRef, mode: localMode.value};
  const temp = parseFloat(localTemperature.value);
  if (!isNaN(temp)) patch.temperature = temp;
  const maxTok = parseInt(localMaxTokens.value, 10);
  if (!isNaN(maxTok) && maxTok > 0) patch.maxTokens = maxTok;
  editorStore.commitStepConfigEdit(s.id, {config: {...s.config, ...patch}}, 'Update model call');
}

function commitOutputType() {
  const s = step.value;
  if (!s || s.config.type !== 'model-call') return;
  const {outputType: _old, ...rest} = s.config;
  const newConfig = localOutputType.value === 'auto'
    ? rest as typeof s.config
    : {...rest, outputType: localOutputType.value} as typeof s.config;
  editorStore.commitStepConfigEdit(s.id, {config: newConfig}, 'Update output format');
}

function commitTemplate() {
  const s = step.value;
  if (!s || s.config.type !== 'presentation') return;
  editorStore.commitStepEdit(s.id, {config: {...s.config, text: localTemplate.value}}, 'Edit text');
}

function commitLoopGroup(exitCondition?: LoopExitCondition) {
  const s = step.value;
  if (!s || s.config.type !== 'loop-group') return;
  editorStore.commitStepConfigEdit(s.id, {
    config: {
      ...s.config,
      maxIterations: localMaxIterations.value,
      exitCondition: exitCondition ?? s.config.exitCondition,
    },
  }, 'Update loop');
}

function onLoopExitUpdate(exit: LoopExitCondition) {
  commitLoopGroup(exit);
}

</script>

<style scoped>
.step-inspector { padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.65rem; overflow: hidden; height: 100%; }
.inspector-empty { color: #444; font-size: 0.88rem; }

.inspector-header { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
.step-type-badge { font-size: 0.72rem; padding: 2px 8px; background: #1a2a3a; color: #7ec8e3; border-radius: 4px; flex-shrink: 0; border: 1px solid #2a4a6a; }
.step-label-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid #2a2a2a; color: #e8e8e8; font-size: 1rem; font-weight: 500; padding: 3px 0; min-width: 0; }
.step-label-input:focus { outline: none; border-bottom-color: #3a6080; }

.inspector-tabs {
  display: flex; flex-wrap: wrap; gap: 0.2rem; flex-shrink: 0;
  border-bottom: 1px solid #1e1e1e; padding-bottom: 0.45rem;
}
.inspector-tab {
  background: none; border: 1px solid transparent; color: #666;
  font-size: 0.78rem; padding: 4px 9px; border-radius: 4px; cursor: pointer;
}
.inspector-tab:hover { color: #999; }
.inspector-tab.active { color: #7ec8e3; border-color: #2a4a6a; background: #1a2430; }

.inspector-tab-panel { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.65rem; }

.ns-row { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; }
.ns-label { color: #444; }
.ns-value { color: #5a8a5a; font-size: 0.75rem; }
.ns-dot { color: #333; }

.inspector-status {
  border: 1px solid #2a2a2a; border-radius: 5px; padding: 0.55rem 0.7rem;
  display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem;
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
.inspector-status-time { color: #555; font-size: 0.75rem; }
.inspector-status-issues { margin: 0; padding-left: 1rem; color: #e07070; }
.inspector-status-hint { margin: 0; color: #888; font-size: 0.78rem; }
.inspector-status-hint.ok { color: #5a9d6e; }
.inspector-last-outputs { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
.inspector-last-label { color: #555; font-size: 0.75rem; }
.inspector-artifact-ref { color: #5a8a5a; font-size: 0.75rem; }
.inspector-output-preview {
  margin: 0.4rem 0 0;
  max-height: 12rem;
  overflow-y: auto;
}
.inspector-output-preview :deep(.jv-raw),
.inspector-output-preview :deep(.jv-pretty) {
  font-size: 0.78rem;
}

.inspector-field { display: flex; flex-direction: column; gap: 0.25rem; }
.checkbox-row { display: flex; align-items: center; gap: 0.45rem; color: #aaa; font-size: 0.78rem; }
.checkbox-row input { width: auto; margin: 0; }

input, select, textarea {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 5px; padding: 6px 10px; font-size: 0.88rem; width: 100%;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #3a6080; }
textarea { resize: vertical; font-family: monospace; line-height: 1.4; }

.binding-list { display: flex; flex-direction: column; gap: 0.25rem; }
.binding-row { display: flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; }
.binding-port { color: #888; }
.binding-arrow { color: #444; }
.binding-ref { color: #5a8a5a; font-size: 0.82rem; }

.history-read-list { margin: 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
.history-read-row { font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.history-read-disabled { color: #666; font-size: 0.75rem; }
.history-read-tag { color: #666; font-size: 0.75rem; }
.history-read-required { color: #c8a050; font-size: 0.75rem; }
.inputs-hint { font-size: 0.78rem; color: #666; margin: 0.4rem 0 0; }

.empty-hint { font-size: 0.78rem; color: #444; margin: 0; }
</style>
