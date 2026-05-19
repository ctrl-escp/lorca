<template>
  <aside class="right-pane">
    <div class="right-tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tab-btn"
        :class="{active: uiStore.rightPaneTab === tab.id}"
        @click="uiStore.setRightPaneTab(tab.id)"
      >{{ tab.label }}</button>
    </div>

    <div class="right-content">
      <NodeInspector
        v-if="uiStore.rightPaneTab === 'inspector'"
        :node="selectedNode"
        :models="modelsStore.models"
        :endpoints="endpointsStore.endpoints"
        @update="onUpdateNode"
      />
      <TracePanel
        v-else-if="uiStore.rightPaneTab === 'trace'"
        :trace="runStore.trace"
      />
      <OutputPanel
        v-else-if="uiStore.rightPaneTab === 'output'"
        :status="runStore.status"
        :output="runStore.finalOutput ?? null"
        :output-key="runStore.finalOutputKey"
        :error="runStore.error"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import type {PipelineNode} from '@lorca/core';
import {useUiStore} from '../stores/ui.js';
import {useActiveRunStore} from '../stores/activeRun.js';
import {useModelsStore} from '../stores/models.js';
import {useEndpointsStore} from '../stores/endpoints.js';
import NodeInspector from './inspector/NodeInspector.vue';
import TracePanel from './pipeline/TracePanel.vue';
import OutputPanel from './pipeline/OutputPanel.vue';

const props = defineProps<{
  nodes: PipelineNode[];
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void;
}>();

const uiStore = useUiStore();
const runStore = useActiveRunStore();
const modelsStore = useModelsStore();
const endpointsStore = useEndpointsStore();

const TABS = [
  {id: 'inspector' as const, label: 'Inspector'},
  {id: 'trace' as const, label: 'Trace'},
  {id: 'output' as const, label: 'Output'},
];

const selectedNode = computed(() =>
  uiStore.selectedNodeId ? props.nodes.find((n) => n.id === uiStore.selectedNodeId) ?? null : null,
);

function onUpdateNode(patch: Record<string, unknown>) {
  if (uiStore.selectedNodeId) props.onUpdate(uiStore.selectedNodeId, patch);
}

// Auto-switch to output tab when run completes
import {watch} from 'vue';
watch(() => runStore.status, (s) => {
  if (s === 'completed' || s === 'failed') uiStore.setRightPaneTab('output');
});
</script>

<style scoped>
.right-pane { display: flex; flex-direction: column; height: 100%; border-left: 1px solid #2a2a2a; }
.right-tabs { display: flex; border-bottom: 1px solid #1e1e1e; flex-shrink: 0; }
.tab-btn { flex: 1; background: none; border: none; border-bottom: 2px solid transparent; color: #666; padding: 0.4rem; font-size: 0.78rem; cursor: pointer; }
.tab-btn:hover { color: #999; }
.tab-btn.active { color: #7ec8e3; border-bottom-color: #7ec8e3; }
.right-content { flex: 1; overflow: hidden; }
</style>
