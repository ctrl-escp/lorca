<template>
  <aside class="right-pane">
    <div class="right-tabs">
      <button
        v-for="tab in activeTabs"
        :key="tab.id"
        class="tab-btn"
        :class="{active: uiStore.rightPaneTab === tab.id}"
        :title="tab.title"
        @click="uiStore.setRightPaneTab(tab.id)"
      >{{ tab.label }}</button>
    </div>

    <div class="right-content">
      <StepInspector
        v-if="uiStore.rightPaneTab === 'inspector' && !isCapsuleMode"
      />
      <NodeInspector
        v-else-if="uiStore.rightPaneTab === 'inspector' && isCapsuleMode"
        :node="selectedNode"
        :models="modelsStore.models"
        :endpoints="endpointsStore.endpoints"
        v-bind="capsule ? {capsule} : {}"
        :locked-capsules="capsulesStore.lockedCapsules"
        @update="onUpdateNode"
      />
      <CapsuleInterfacePanel
        v-else-if="uiStore.rightPaneTab === 'interface' && capsule"
        :iface="capsule.interface"
        @update="onUpdateInterface"
      />
      <TracePanel
        v-else-if="uiStore.rightPaneTab === 'trace'"
        :trace="activeTrace"
        :artifacts="isCapsuleMode ? capsuleRunStore.artifacts : runStore.artifacts"
        :partial-run="!isCapsuleMode && runStore.partial"
        :selected-step-id="isCapsuleMode ? null : editorStore.selectedStepId"
      />
      <OutputPanel
        v-else-if="uiStore.rightPaneTab === 'output'"
        :status="activeStatus"
        :output="activeOutput"
        :output-key="activeOutputKey"
        :error="activeError"
        :output-stale="pipelineOutputStale"
        :partial-run="!isCapsuleMode && runStore.partial"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import type {PipelineNode, CapsuleDefinition, CapsuleInterface} from '@lorca/core';
import {computeStepStaleStates} from '@lorca/pipeline';
import {useUiStore} from '../stores/ui.js';
import {useActiveRunStore} from '../stores/activeRun.js';
import {useCapsuleRunStore} from '../stores/capsuleRun.js';
import {usePipelineEditorStore} from '../stores/pipelineEditor.js';
import {useModelsStore} from '../stores/models.js';
import {useEndpointsStore} from '../stores/endpoints.js';
import {useCapsulesStore} from '../stores/capsules.js';
import NodeInspector from './inspector/NodeInspector.vue';
import StepInspector from './inspector/StepInspector.vue';
import CapsuleInterfacePanel from './capsule/CapsuleInterfacePanel.vue';
import TracePanel from './pipeline/TracePanel.vue';
import OutputPanel from './pipeline/OutputPanel.vue';

const props = defineProps<{
  nodes: PipelineNode[];
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
  capsule?: CapsuleDefinition;
  onUpdateCapsuleInterface?: (iface: CapsuleInterface) => void;
}>();

const uiStore = useUiStore();
const runStore = useActiveRunStore();
const editorStore = usePipelineEditorStore();
const capsuleRunStore = useCapsuleRunStore();
const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();
const capsulesStore = useCapsulesStore();

const isCapsuleMode = computed(() => uiStore.editorContext === 'capsule');

const PIPELINE_TABS = [
  {id: 'inspector' as const, label: 'Inspector', title: 'Configure the selected pipeline step'},
  {id: 'trace' as const, label: 'Trace', title: 'Step-by-step execution log from the last run'},
  {id: 'output' as const, label: 'Output', title: 'Final artifact from the last pipeline run'},
];

const CAPSULE_TABS = [
  {id: 'inspector' as const, label: 'Inspector', title: 'Configure the selected Capsule step'},
  {id: 'interface' as const, label: 'Interface', title: 'Declare Capsule inputs, outputs, parameters, and model slots'},
  {id: 'trace' as const, label: 'Trace', title: 'Step-by-step log from the last test run'},
  {id: 'output' as const, label: 'Output', title: 'Final artifact from the last test run'},
];

const activeTabs = computed(() => isCapsuleMode.value ? CAPSULE_TABS : PIPELINE_TABS);

const selectedNode = computed(() =>
  uiStore.selectedNodeId ? props.nodes.find((n) => n.id === uiStore.selectedNodeId) ?? null : null,
);

const activeTrace = computed(() => isCapsuleMode.value ? capsuleRunStore.trace : runStore.trace);
const activeStatus = computed(() => isCapsuleMode.value ? capsuleRunStore.status : runStore.status);
const activeOutput = computed(() => isCapsuleMode.value ? capsuleRunStore.finalOutput ?? null : runStore.finalOutput ?? null);
const activeOutputKey = computed(() => isCapsuleMode.value ? capsuleRunStore.finalOutputKey : runStore.finalOutputKey);
const activeError = computed(() => isCapsuleMode.value ? capsuleRunStore.error : runStore.error);

const pipelineOutputStale = computed(() => {
  if (isCapsuleMode.value || !runStore.finalOutputKey) return false;
  const step = editorStore.steps.find(
    (s) => `${s.outputNamespace}.${s.primaryOutputName}` === runStore.finalOutputKey,
  );
  if (!step) return false;
  const states = computeStepStaleStates(
    editorStore.pipeline,
    runStore.runSnapshotContext,
    editorStore.pipeline.input.raw,
    (id, version) => capsulesStore.getCapsule(id, version),
  );
  const st = states.find((s) => s.stepId === step.id)?.state;
  return st === 'stale' || st === 'failed-stale';
});

function onUpdateNode(patch: Record<string, unknown>) {
  if (uiStore.selectedNodeId) props.onUpdate(uiStore.selectedNodeId, patch);
}

function onUpdateInterface(iface: CapsuleInterface) {
  props.onUpdateCapsuleInterface?.(iface);
}

// Auto-switch to output tab when run completes
import {watch} from 'vue';
watch(() => runStore.status, (s) => {
  if (!isCapsuleMode.value && (s === 'completed' || s === 'failed')) uiStore.setRightPaneTab('output');
});
watch(() => capsuleRunStore.status, (s) => {
  if (isCapsuleMode.value && (s === 'completed' || s === 'failed')) uiStore.setRightPaneTab('output');
});
</script>

<style scoped>
.right-pane { display: flex; flex-direction: column; height: 100%; }
.right-tabs { display: flex; border-bottom: 1px solid #1e1e1e; flex-shrink: 0; }
.tab-btn { flex: 1; background: none; border: none; border-bottom: 2px solid transparent; color: #666; padding: 0.4rem; font-size: 0.72rem; cursor: pointer; }
.tab-btn:hover { color: #999; }
.tab-btn.active { color: #7ec8e3; border-bottom-color: #7ec8e3; }
.right-content { flex: 1; overflow: hidden; }
</style>
