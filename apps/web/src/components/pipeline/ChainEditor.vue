<template>
  <div class="chain-editor">
    <div class="chain-nodes">
      <div
        v-for="(node, i) in nodes"
        :key="node.id"
        class="chain-step"
        :class="{selected: selectedNodeId === node.id, [traceStatusClass(node.id)]: true}"
        @click="$emit('select', node.id)"
      >
        <div class="step-connector" v-if="i > 0">↓</div>
        <div class="step-card">
          <div class="step-card-header">
            <span class="step-type-badge">{{ nodeTypeLabel(node) }}</span>
            <span class="step-title">{{ node.title ?? nodeDefaultTitle(node) }}</span>
            <div class="step-actions">
              <button class="icon-btn" :disabled="i === 0" @click.stop="$emit('move-up', node.id)" title="Move up">↑</button>
              <button class="icon-btn" :disabled="i === nodes.length - 1" @click.stop="$emit('move-down', node.id)" title="Move down">↓</button>
              <button class="icon-btn danger" :disabled="node.type === 'input'" @click.stop="$emit('remove', node.id)" title="Remove">×</button>
            </div>
          </div>
          <div class="step-meta">
            <span v-if="node.type === 'model-call' && node.config.modelRef.kind === 'fixed'" class="step-model">
              {{ node.config.modelRef.modelName }}
            </span>
            <span v-if="node.artifactPrefix" class="step-prefix">→ {{ node.artifactPrefix }}.*</span>
          </div>
          <div v-if="traceFor(node.id)" class="step-trace">
            <span :class="`status-${traceFor(node.id)!.status}`">{{ traceFor(node.id)!.status }}</span>
            <span v-if="traceFor(node.id)!.durationMs !== undefined" class="step-duration">{{ traceFor(node.id)!.durationMs }}ms</span>
          </div>
        </div>
      </div>

      <div class="step-connector">↓</div>
      <div class="chain-output-ref">
        <span class="output-label">Output</span>
        <span class="output-key">{{ finalArtifactKey ?? '(none)' }}</span>
      </div>
    </div>

    <div class="chain-add-bar">
      <button class="btn btn-sm" @click="$emit('add', 'model-call')">+ Model call</button>
      <button class="btn btn-sm" @click="$emit('add', 'prompt-wrapper')">+ Prompt wrapper</button>
      <button class="btn btn-sm" @click="$emit('add', 'manual-text')">+ Manual text</button>
      <button class="btn btn-sm" @click="$emit('add', 'template')">+ Template</button>
      <button class="btn btn-sm" @click="$emit('add', 'json-extract')">+ JSON extract</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {PipelineNode, PipelineTraceEvent} from '@lorca/core';

const props = defineProps<{
  nodes: PipelineNode[];
  selectedNodeId: string | null;
  trace: PipelineTraceEvent[];
  finalArtifactKey: string | null;
}>();

defineEmits<{
  select: [nodeId: string];
  'move-up': [nodeId: string];
  'move-down': [nodeId: string];
  remove: [nodeId: string];
  add: [type: PipelineNode['type']];
}>();

function traceFor(nodeId: string): PipelineTraceEvent | undefined {
  // Return the last trace event for this node
  return [...props.trace].reverse().find((e) => e.nodeId === nodeId);
}

function traceStatusClass(nodeId: string): string {
  const t = traceFor(nodeId);
  return t ? `trace-${t.status}` : '';
}

const TYPE_LABELS: Record<PipelineNode['type'], string> = {
  'input': 'Input',
  'prompt-wrapper': 'Wrapper',
  'template': 'Template',
  'model-call': 'Model call',
  'json-extract': 'JSON extract',
  'manual-text': 'Manual text',
  'capsule-instance': 'Capsule',
};

function nodeTypeLabel(node: PipelineNode): string {
  return TYPE_LABELS[node.type] ?? node.type;
}

function nodeDefaultTitle(node: PipelineNode): string {
  if (node.type === 'model-call' && node.config.modelRef.kind === 'fixed') {
    return node.config.modelRef.modelName;
  }
  if (node.artifactPrefix) return node.artifactPrefix;
  return node.id;
}
</script>

<style scoped>
.chain-editor { display: flex; flex-direction: column; height: 100%; gap: 0; }
.chain-nodes { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; align-items: center; }

.chain-step { width: 100%; max-width: 480px; display: flex; flex-direction: column; align-items: center; }

.step-connector { color: #444; font-size: 1rem; margin: 2px 0; }

.step-card {
  width: 100%;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  cursor: pointer;
  transition: border-color 0.1s;
}
.selected .step-card { border-color: #2a5070; background: #111e2a; }
.trace-completed .step-card { border-left: 3px solid #3a9d6e; }
.trace-failed .step-card { border-left: 3px solid #c0392b; }
.trace-running .step-card, .trace-started .step-card { border-left: 3px solid #e8a020; }
.trace-skipped .step-card { opacity: 0.5; }
.trace-cancelled .step-card { border-left: 3px solid #666; }

.step-card-header { display: flex; align-items: center; gap: 0.5rem; }
.step-type-badge { font-size: 0.65rem; padding: 1px 5px; border-radius: 3px; background: #222; color: #888; flex-shrink: 0; }
.step-title { flex: 1; font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.step-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 0.1s; }
.step-card:hover .step-actions { opacity: 1; }

.step-meta { display: flex; gap: 0.5rem; font-size: 0.72rem; color: #666; margin-top: 0.2rem; }
.step-model { color: #5a9fd4; }
.step-prefix { color: #888; }

.step-trace { display: flex; gap: 0.5rem; font-size: 0.72rem; margin-top: 0.2rem; }
.status-completed { color: #3a9d6e; }
.status-failed { color: #c0392b; }
.status-started, .status-running { color: #e8a020; }
.status-skipped, .status-cancelled { color: #666; }
.step-duration { color: #555; }

.chain-output-ref {
  display: flex; gap: 0.5rem; align-items: center;
  padding: 0.4rem 0.75rem;
  background: #111;
  border: 1px dashed #333;
  border-radius: 6px;
  width: 100%; max-width: 480px;
}
.output-label { font-size: 0.7rem; color: #555; }
.output-key { font-size: 0.78rem; color: #7ec8e3; font-family: monospace; }

.chain-add-bar {
  display: flex; gap: 0.4rem; flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid #1e1e1e;
  background: #0f0f0f;
}
.btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #888; border-radius: 4px; cursor: pointer; }
.btn-sm { padding: 3px 8px; font-size: 0.75rem; }
.btn:hover { background: #222; color: #ccc; }

.icon-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 0.8rem; padding: 0 3px; }
.icon-btn:hover:not(:disabled) { color: #aaa; }
.icon-btn:disabled { opacity: 0.2; cursor: default; }
.icon-btn.danger:hover:not(:disabled) { color: #e07070; }
</style>
