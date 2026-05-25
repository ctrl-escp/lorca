<template>
  <div ref="inspectorRef" class="step-inspector">
    <div v-if="!effectiveStep" class="inspector-empty">Select a step to configure it.</div>
    <template v-else>
      <div class="inspector-header">
        <span v-if="inlineCapsuleScope" class="inline-scope-label" :title="`Inside inline capsule ${step?.label ?? ''}`">Inline</span>
        <span class="step-type-badge" :title="`Step type: ${effectiveStep.type}`">{{ stepTypeInspectorLabel(effectiveStep.type) }}</span>
        <input
          v-if="!inlineCapsuleScope"
          class="step-label-input"
          v-model="localLabel"
          placeholder="Step label"
          title="Display label for this step"
          @focus="onLabelFocus"
          @blur="commitLabel"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <span v-else class="step-label-readonly">{{ effectiveStep.label }}</span>
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
          :title="tab.title"
          @click="activeTab = tab.id"
        >{{ tab.label }}</button>
      </div>

      <div class="inspector-tab-panel">
        <!-- Config -->
        <template v-if="activeTab === 'config'">
          <div class="ns-row">
            <span class="ns-label hdr-config" title="Artifact namespace for this step's outputs">namespace</span>
            <code class="ns-value">{{ effectiveStep?.outputNamespace }}</code>
            <span class="ns-dot">·</span>
            <code class="ns-value">{{ effectiveStep?.primaryOutputName }}</code>
          </div>

          <CapsuleInlineStepEditor
            v-if="inlineCapsuleScope"
            :capsule-step-id="inlineCapsuleScope.capsuleStepId"
            :inner-step="inlineCapsuleScope.innerStep"
          />

          <ModelCallConfigPanel
            v-else-if="effectiveStep.config.type === 'model-call'"
            :step="effectiveStep"
            @begin-edit="onTextFieldFocus"
            @commit-config="(config, label) => effectiveStep && editorStore.commitStepConfigEdit(effectiveStep.id, {config}, label)"
          />

          <template v-else-if="effectiveStep.config.type === 'presentation'">
            <div class="inspector-field">
              <FieldLabel label="Text" title="Free-form text with optional {{artifact.key}} interpolation" />
              <TextEditor
                v-model="localTemplate"
                :rows="6"
                :artifact-refs="templateArtifactRefs"
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

          <template v-else-if="effectiveStep.config.type === 'loop-group'">
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
              :exit-condition="effectiveStep.config.exitCondition"
              @update="onLoopExitUpdate"
            />
            <LoopInnerChainEditor
              :loop-step-id="effectiveStep.id"
              :inner-steps="effectiveStep.config.steps"
            />
          </template>
        </template>

        <!-- Prompt -->
        <template v-else-if="activeTab === 'prompt'">
          <PromptCompositionEditor
            v-if="hasPromptBlocks && effectiveStep?.prompt && inlineCapsuleScope"
            :step-id="effectiveStep.id"
            :config="effectiveStep.prompt"
            :context-steps="inlineCapsulePromptContextSteps"
            :nested-edit-target="{kind: 'inline-capsule', parentStepId: inlineCapsuleScope.capsuleStepId}"
          />
          <PromptCompositionEditor
            v-else-if="hasPromptBlocks && effectiveStep?.prompt"
            :step-id="effectiveStep.id"
            :config="effectiveStep.prompt"
          />
          <p v-else class="empty-hint">This step type has no prompt composition.</p>
        </template>

        <!-- Inputs -->
        <template v-else-if="activeTab === 'inputs'">
          <p class="inputs-ref-semantics" :title="REORDER_REF_HINTS.history">
            Step inputs use two kinds of references:
            <strong>previous output</strong> follows chain order;
            <strong>history reads</strong>, template <code v-pre>{{artifact…}}</code> refs, and capsule bindings use artifact namespace strings and stay tied to the named step.
          </p>
          <template v-if="effectiveStep?.config.type === 'capsule-instance' && !inlineCapsuleScope">
            <div class="binding-list">
              <div v-for="(ref, port) in effectiveStep.config.inputBindings" :key="port" class="binding-row">
                <span class="binding-port">{{ port }}</span>
                <span class="binding-arrow">←</span>
                <code class="binding-ref" :title="REORDER_REF_HINTS.binding">{{ ref }}</code>
              </div>
              <p v-if="Object.keys(effectiveStep.config.inputBindings).length === 0" class="empty-hint">No input bindings.</p>
            </div>
          </template>
          <template v-else-if="hasPromptBlocks && effectiveStep?.prompt">
            <p v-if="effectiveStep.prompt.historyReads.length === 0 && !effectiveStep.prompt.previousOutput?.enabled" class="empty-hint">
              No history reads. Open the Prompt tab to add prior-step outputs.
            </p>
            <ul v-if="effectiveStep.prompt.historyReads.length > 0" class="history-read-list">
              <li
                v-for="(hr, i) in effectiveStep.prompt.historyReads"
                :key="`${hr.sourceStepId}-${i}`"
                class="history-read-row"
                :class="{invalid: !historyReadStatus(hr).ok}"
                :title="historyReadStatusTitle(hr)"
              >
                <code class="binding-ref">{{ hr.sourceArtifactRef }}</code>
                <span class="history-read-tag">&lt;{{ hr.tagName }}&gt;</span>
                <span v-if="hr.required" class="history-read-required">required</span>
                <span v-if="!historyReadStatus(hr).ok" class="history-read-issue">
                  {{ historyReadStatus(hr).issues.map(historyReadIssueLabel).join(' · ') }}
                </span>
              </li>
            </ul>
            <p v-if="effectiveStep.prompt.previousOutput?.enabled" class="inputs-hint" :title="REORDER_REF_HINTS.previous">
              Previous output (<code>{{ effectiveStep.prompt.previousOutput.tagName }}</code>, {{ effectiveStep.prompt.previousOutput.placement }}):
              from <code>{{ previousOutputRef }}</code> — updates when you reorder steps.
            </p>
          </template>
          <p v-else class="empty-hint">No configurable inputs for this step type.</p>
        </template>

        <!-- Outputs -->
        <template v-else-if="activeTab === 'outputs'">
          <div class="inspector-field">
            <FieldLabel label="Primary output key" />
            <code class="binding-ref">{{ scopedPrimaryOutputKey }}</code>
          </div>
          <div v-if="effectiveStep?.config.type === 'capsule-instance' && !inlineCapsuleScope" class="binding-list">
            <div v-for="(ref, port) in effectiveStep.config.outputBindings" :key="port" class="binding-row">
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

        <!-- Last run (tabs mode only — split modes show this in the bottom section) -->
        <template v-else-if="activeTab === 'last-run' && splitMode === 'tabs'">
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

      <!-- bottom last-run section (full / collapsed split modes) -->
      <template v-if="showBottomSection">
        <div
          class="inspector-split-handle"
          :class="{draggable: splitMode === 'full'}"
          @mousedown="splitMode === 'full' ? onSplitHandleMouseDown($event) : undefined"
        />
        <div
          class="inspector-bottom"
          :style="splitMode === 'full' ? {height: bottomHeight + 'px'} : {}"
        >
          <div
            v-if="splitMode === 'collapsed'"
            class="inspector-bottom-header"
            @click="isBottomExpanded = !isBottomExpanded"
          >
            <span class="bottom-status-dot" :class="`dot-${stepStatus?.state ?? 'not-run'}`" />
            <span class="bottom-status-label">{{ stepStatus ? stepRunUiStateLabel(stepStatus.state) : 'No run data' }}</span>
            <span v-if="lastSnapshot?.completedAt" class="bottom-status-time">{{ formatTime(lastSnapshot.completedAt) }}</span>
            <span class="bottom-chevron">{{ isBottomExpanded ? '▾' : '▴' }}</span>
          </div>
          <div v-show="splitMode === 'full' || isBottomExpanded" class="inspector-bottom-content">
            <div v-if="stepStatus" class="inspector-status" :class="`status-${stepStatus.state}`">
              <div v-if="splitMode === 'full'" class="inspector-status-header">
                <span class="inspector-status-label">{{ stepRunUiStateLabel(stepStatus.state) }}</span>
                <span v-if="lastSnapshot?.completedAt" class="inspector-status-time">{{ formatTime(lastSnapshot.completedAt) }}</span>
              </div>
              <JsonViewer
                v-if="lastRunOutputValue !== null"
                class="inspector-output-preview"
                :value="lastRunOutputValue"
              />
              <p v-else-if="stepStatus.state === 'not-run'" class="empty-hint">This step has not been executed yet.</p>
            </div>
            <p v-else class="empty-hint">No run data.</p>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, watch, computed, onMounted, onUnmounted} from 'vue';
import type {PipelineStep, CapsuleInstanceStepConfig, LoopExitCondition, StepHistoryReadConfig} from '@lorca/core';
import {stepRunUiStateLabel, resolvePreviousOutputArtifactRef, validateHistoryRead, historyReadIssueLabel, REORDER_REF_HINTS} from '@lorca/pipeline';
import type {HistoryReadIssue} from '@lorca/pipeline';
import {useStepStaleStateMap} from '../../composables/useStepStaleStateMap.js';
import {useActiveStepEditor} from '../../composables/useActiveStepEditor.js';
import {useActiveRunStore} from '../../stores/activeRun.js';
import {useCapsuleRunStore} from '../../stores/capsuleRun.js';
import {useUiStore} from '../../stores/ui.js';
import {FieldLabel, JsonViewer} from '@lorca/ui-kit';
import PromptCompositionEditor from './PromptCompositionEditor.vue';
import {usePipelineEditorStore} from '../../stores/pipelineEditor.js';
import LoopInnerChainEditor from './LoopInnerChainEditor.vue';
import LoopExitConditionEditor from './LoopExitConditionEditor.vue';
import PipelineCapsuleInstanceEditor from './PipelineCapsuleInstanceEditor.vue';
import CapsuleInlineStepEditor from './CapsuleInlineStepEditor.vue';
import ModelCallConfigPanel from './ModelCallConfigPanel.vue';
import TextEditor from '../shared/TextEditor.vue';
import {stepTypeInspectorLabel} from '../../utils/stepTypeLabels.js';
import {artifactRefsBeforeStep} from '../../utils/artifactRefs.js';
import {
  inlineCapsuleArtifactKey,
  inlineCapsuleSnapshotKey,
  resolveInlineCapsuleRunScope,
} from '../../utils/inlineCapsuleRun.js';

type InspectorTab = 'config' | 'prompt' | 'inputs' | 'outputs' | 'last-run' | 'validation';
type SplitMode = 'full' | 'collapsed' | 'tabs';

const uiStore = useUiStore();
const editorStore = useActiveStepEditor();
const pipelineEditorStore = usePipelineEditorStore();
const pipelineRunStore = useActiveRunStore();
const capsuleRunStore = useCapsuleRunStore();
const runStore = computed(() => uiStore.editorContext === 'capsule' ? capsuleRunStore : pipelineRunStore);
const {stateFor} = useStepStaleStateMap(() => editorStore.pipeline.input.raw);

const step = computed(() => editorStore.selectedStep);

const inlineCapsuleScope = computed(() =>
  uiStore.editorContext === 'pipeline'
    ? resolveInlineCapsuleRunScope(pipelineEditorStore.selectedStep, pipelineEditorStore.selectedInlineCapsuleInnerStepId)
    : null,
);

const effectiveStep = computed(() => inlineCapsuleScope.value?.innerStep ?? step.value);
const templateArtifactRefs = computed(() => {
  const selected = effectiveStep.value;
  return selected ? artifactRefsBeforeStep(editorStore.steps, selected.id) : [];
});
const inlineCapsulePromptContextSteps = computed(() => {
  if (!inlineCapsuleScope.value) return [];
  return pipelineEditorStore.contextStepsForInlineCapsuleInner(
    inlineCapsuleScope.value.capsuleStepId,
    inlineCapsuleScope.value.innerStep.id,
  );
});
const activeTab = ref<InspectorTab>('config');

const inspectorRef = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const bottomHeight = ref(200);
const isBottomExpanded = ref(false);

const splitMode = computed((): SplitMode => {
  if (containerWidth.value >= 380) return 'full';
  if (containerWidth.value >= 240) return 'collapsed';
  return 'tabs';
});
const showBottomSection = computed(() => splitMode.value !== 'tabs' && !!effectiveStep.value);

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (!inspectorRef.value) return;
  resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) containerWidth.value = entry.contentRect.width;
  });
  resizeObserver.observe(inspectorRef.value);
});
onUnmounted(() => resizeObserver?.disconnect());

function onSplitHandleMouseDown(e: MouseEvent) {
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = bottomHeight.value;
  function onMove(ev: MouseEvent) {
    bottomHeight.value = Math.max(60, Math.min(500, startHeight + (startY - ev.clientY)));
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
  document.body.style.cursor = 'row-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

const stepStatus = computed(() => {
  const scope = inlineCapsuleScope.value;
  if (scope) {
    const snapshot = runStore.value.snapshots[inlineCapsuleSnapshotKey(scope.capsuleStepId, scope.innerStepId)];
    if (!snapshot) return {stepId: scope.innerStepId, state: 'not-run' as const};
    return {
      stepId: scope.innerStepId,
      state: snapshot.status === 'completed' ? 'current' as const : 'failed-current' as const,
    };
  }
  const s = step.value;
  if (!s) return null;
  return stateFor(s.id);
});

const lastSnapshot = computed(() => {
  const scope = inlineCapsuleScope.value;
  if (scope) {
    return runStore.value.snapshots[inlineCapsuleSnapshotKey(scope.capsuleStepId, scope.innerStepId)] ?? null;
  }
  const s = step.value;
  if (!s) return null;
  return runStore.value.snapshots[s.id] ?? null;
});

const lastRunOutputValue = computed((): unknown | null => {
  const scope = inlineCapsuleScope.value;
  const s = effectiveStep.value;
  const snapshot = lastSnapshot.value;
  if (!s || !snapshot?.primaryOutputPreview) return null;
  const localKey = `${s.outputNamespace}.${s.primaryOutputName}`;
  const artifactKey = scope
    ? inlineCapsuleArtifactKey(scope.instancePrefix, localKey)
    : localKey;
  const artifact = runStore.value.artifacts[artifactKey];
  return artifact ? artifact.value : snapshot.primaryOutputPreview;
});

const hasPromptBlocks = computed(() =>
  effectiveStep.value?.config.type === 'model-call',
);

const capsuleInstanceStep = computed((): (PipelineStep & {config: CapsuleInstanceStepConfig}) | null => {
  const s = step.value;
  if (!s || s.config.type !== 'capsule-instance' || inlineCapsuleScope.value) return null;
  return s as PipelineStep & {config: CapsuleInstanceStepConfig};
});

const scopedPrimaryOutputKey = computed(() => {
  const s = effectiveStep.value;
  if (!s) return '';
  const localKey = `${s.outputNamespace}.${s.primaryOutputName}`;
  const scope = inlineCapsuleScope.value;
  return scope ? inlineCapsuleArtifactKey(scope.instancePrefix, localKey) : localKey;
});

const chainSteps = computed(() => editorStore.pipeline.steps);

const previousOutputRef = computed(() => {
  const s = effectiveStep.value;
  if (!s) return '';
  return resolvePreviousOutputArtifactRef(chainSteps.value, s.id);
});

function historyReadStatus(read: StepHistoryReadConfig) {
  const s = effectiveStep.value;
  if (!s) return {ok: true, issues: [] as HistoryReadIssue[]};
  return validateHistoryRead(read, s.id, chainSteps.value);
}

function historyReadStatusTitle(read: StepHistoryReadConfig): string {
  const status = historyReadStatus(read);
  const base = `${read.sourceArtifactRef} → <${read.tagName}>. ${REORDER_REF_HINTS.history}`;
  if (status.ok) return base;
  return `${base} Issue: ${status.issues.map(historyReadIssueLabel).join(', ')}`;
}

const visibleTabs = computed(() => {
  const tabs: {id: InspectorTab; label: string; title: string}[] = [
    {id: 'config', label: 'Config', title: 'Step configuration: model, output format, and other settings'},
  ];
  if (hasPromptBlocks.value) tabs.push({id: 'prompt', label: 'Prompt', title: 'Compose the prompt sent to the model'});
  tabs.push(
    {id: 'inputs', label: 'Inputs', title: 'Artifacts read by this step from previous steps'},
    {id: 'outputs', label: 'Outputs', title: 'Artifacts produced by this step'},
  );
  if (splitMode.value === 'tabs') {
    tabs.push({id: 'last-run', label: 'Last run', title: 'Output from the most recent execution of this step'});
  }
  tabs.push({id: 'validation', label: 'Validation', title: 'Validation errors and warnings for this step'});
  return tabs;
});

watch(step, () => {
  if (!visibleTabs.value.some((t) => t.id === activeTab.value)) {
    activeTab.value = 'config';
  }
}, {flush: 'sync'});

watch(splitMode, () => {
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

const localLabel = ref('');
const localTemplate = ref('');
const localMaxIterations = ref(3);

watch(step, (s) => {
  if (!s) return;
  localLabel.value = s.label;
  const cfg = s.config;

  if (cfg.type === 'presentation') localTemplate.value = cfg.text;

  if (cfg.type === 'loop-group') {
    localMaxIterations.value = cfg.maxIterations;
  }
}, {immediate: true});

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
.inspector-empty { color: var(--text-muted); font-size: 0.88rem; }

.inspector-header { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
.step-type-badge { font-size: 0.72rem; padding: 2px 8px; background: var(--accent-bg-muted); color: var(--accent); border-radius: 4px; flex-shrink: 0; border: 1px solid var(--accent-border-muted); }
.step-label-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid #2a2a2a; color: #e8e8e8; font-size: 1rem; font-weight: 500; padding: 3px 0; min-width: 0; }
.step-label-input:focus { outline: none; border-bottom-color: var(--accent-border); }
.step-label-readonly { flex: 1; color: #e8e8e8; font-size: 1rem; font-weight: 500; min-width: 0; }
.inline-scope-label {
  font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.04em;
  color: #7d5aa0; background: #1d1628; border: 1px solid #4a3f5a; border-radius: 3px; padding: 2px 6px;
}

.inspector-tabs {
  display: flex; flex-wrap: wrap; gap: 0.2rem; flex-shrink: 0;
  border-bottom: 1px solid var(--border-divider); padding-bottom: 0.45rem;
}
.inspector-tab {
  background: none; border: 1px solid transparent; color: var(--text-tab);
  font-size: 0.78rem; padding: 4px 9px; border-radius: 4px; cursor: pointer;
}
.inspector-tab:hover { color: var(--text-tab-hover); }
.inspector-tab.active { color: var(--accent); border-color: var(--accent-border-muted); background: var(--accent-bg-muted); }

.inspector-tab-panel { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.65rem; }

.inspector-split-handle {
  flex-shrink: 0;
  height: 5px;
  margin: 0 -1rem;
  position: relative;
}
.inspector-split-handle::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  top: 2px;
  height: 1px;
  background: var(--border-divider);
  transition: background 0.15s, height 0.15s, top 0.15s;
}
.inspector-split-handle.draggable { cursor: row-resize; }
.inspector-split-handle.draggable:hover::after,
.inspector-split-handle.draggable:active::after {
  top: 1px;
  height: 3px;
  background: var(--accent-border);
}

.inspector-bottom {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.inspector-bottom-header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0;
  cursor: pointer;
  user-select: none;
  font-size: 0.82rem;
  flex-shrink: 0;
}
.inspector-bottom-header:hover { opacity: 0.85; }

.bottom-status-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.dot-current { background: #3a9d6e; }
.dot-stale, .dot-failed-stale { background: #c8a050; }
.dot-blocked, .dot-failed-current { background: #c0392b; }
.dot-not-run, .dot-skipped-partial { background: #444; }
.dot-disabled { background: #333; }

.bottom-status-label { color: #aaa; }
.bottom-status-time { color: var(--text-secondary); font-size: 0.75rem; margin-left: auto; }
.bottom-chevron { color: var(--text-secondary); font-size: 0.7rem; margin-left: 0.2rem; }

.inspector-bottom-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.inspector-bottom-content .inspector-status {
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
  margin: 0 -1rem;
  padding: 0.55rem 1rem;
}

.ns-row { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; }
.ns-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.72rem; }
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
.inspector-status-time { color: var(--text-secondary); font-size: 0.75rem; }
.inspector-status-issues { margin: 0; padding-left: 1rem; color: #e07070; }
.inspector-status-hint { margin: 0; color: var(--text-label); font-size: 0.78rem; }
.inspector-status-hint.ok { color: #5a9d6e; }
.inspector-last-outputs { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
.inspector-last-label { color: var(--text-secondary); font-size: 0.75rem; }
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

input, select {
  background: #111; border: 1px solid #2a2a2a; color: #e8e8e8;
  border-radius: 5px; padding: 6px 10px; font-size: 0.88rem; width: 100%;
}
input:focus, select:focus { outline: none; border-color: var(--accent-border); }

.model-select-row { display: flex; gap: 0.4rem; align-items: center; }
.model-select-row select { flex: 1; min-width: 0; }
.btn-autoselect { background: #1a1a1a; border: 1px solid #333; color: #aaa; padding: 4px 8px; border-radius: 4px; font-size: 0.78rem; cursor: pointer; }
.btn-autoselect:hover { background: #222; color: #ccc; border-color: var(--text-muted); }
.model-select-warning {
  margin: 0;
  color: #c8a050;
  font-size: 0.72rem;
  line-height: 1.35;
}

.binding-list { display: flex; flex-direction: column; gap: 0.25rem; }
.binding-row { display: flex; align-items: center; gap: 0.45rem; font-size: 0.82rem; }
.binding-port { color: var(--text-label); }
.binding-arrow { color: var(--text-muted); }
.binding-ref { color: #5a8a5a; font-size: 0.82rem; }

.history-read-list { margin: 0; padding-left: 1rem; display: flex; flex-direction: column; gap: 0.3rem; }
.history-read-row { font-size: 0.82rem; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.history-read-disabled { color: var(--text-label); font-size: 0.75rem; }
.history-read-tag { color: var(--text-label); font-size: 0.75rem; }
.history-read-required { color: #c8a050; font-size: 0.75rem; }
.inputs-hint { font-size: 0.78rem; color: var(--text-label); margin: 0.4rem 0 0; }
.inputs-ref-semantics {
  font-size: 0.78rem;
  color: var(--text-label);
  margin: 0 0 0.65rem;
  line-height: 1.45;
}
.inputs-ref-semantics code { font-size: 0.76rem; }
.history-read-row.invalid { color: #e08080; }
.history-read-issue { font-size: 0.74rem; color: #e08080; margin-left: 0.35rem; }

.empty-hint { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
</style>
