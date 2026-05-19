<template>
  <div class="chain-editor">
    <div class="chain-viewport">
      <div ref="scrollRef" class="chain-scroll">
        <div class="chain-scroll-spacer" aria-hidden="true" />

        <div
          v-for="(node, i) in nodes"
          :key="node.id"
          :ref="(el) => setStepRef(node.id, el as HTMLElement | null)"
          class="chain-step"
          :class="{selected: selectedNodeId === node.id, [traceStatusClass(node.id)]: true}"
          :title="`Select ${nodeTypeLabel(node)} step — edit its main prompt above, details in the Inspector`"
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
                {{ node.config.modelRef.modelName || '— no model —' }}
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
        <div class="chain-output-ref" title="Artifact key written by the final pipeline step">
          <span class="output-label">Output</span>
          <span class="output-key">{{ finalArtifactKey ?? '(none)' }}</span>
        </div>

        <div class="chain-scroll-spacer" aria-hidden="true" />
      </div>
    </div>

    <div class="chain-add-bar">
      <div class="chain-add-bar-header">
        <span class="chain-add-bar-label">Add next step</span>
        <span class="chain-add-bar-hint">Build your pipeline below the current chain</span>
      </div>
      <div class="chain-add-bar-buttons">
        <button class="btn btn-sm btn-accent" title="Call an AI model with the current artifact as input" @click="$emit('add', 'model-call')">+ Model call</button>
        <button class="btn btn-sm" title="Wrap instructions and input in a tagged XML block" @click="$emit('add', 'prompt-wrapper')">+ Prompt wrapper</button>
        <button class="btn btn-sm" title="Insert fixed text as a pipeline artifact" @click="$emit('add', 'manual-text')">+ Manual text</button>
        <button class="btn btn-sm" title="Render a template with {{artifact.*}} placeholders" @click="$emit('add', 'template')">+ Template</button>
        <button class="btn btn-sm" title="Parse JSON from a prior text artifact" @click="$emit('add', 'json-extract')">+ JSON extract</button>
        <button v-if="showCapsuleAdd" class="btn btn-sm btn-capsule" title="Embed a locked Capsule as a reusable sub-pipeline" @click="$emit('add', 'capsule-instance')">+ Capsule</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, watch, nextTick, onMounted} from 'vue';
import type {PipelineNode, PipelineTraceEvent} from '@lorca/core';

const props = defineProps<{
  nodes: PipelineNode[];
  selectedNodeId: string | null;
  trace: PipelineTraceEvent[];
  finalArtifactKey: string | null;
  showCapsuleAdd?: boolean;
}>();

defineEmits<{
  select: [nodeId: string];
  'move-up': [nodeId: string];
  'move-down': [nodeId: string];
  remove: [nodeId: string];
  add: [type: PipelineNode['type']];
}>();

const scrollRef = ref<HTMLElement | null>(null);
const stepRefs = new Map<string, HTMLElement>();

function setStepRef(nodeId: string, el: HTMLElement | null) {
  if (el) stepRefs.set(nodeId, el);
  else stepRefs.delete(nodeId);
}

function scrollToStep(nodeId: string, behavior: ScrollBehavior = 'smooth') {
  nextTick(() => {
    stepRefs.get(nodeId)?.scrollIntoView({block: 'center', behavior});
  });
}

watch(() => props.selectedNodeId, (id) => {
  if (id) scrollToStep(id);
});

watch(() => props.nodes.length, () => {
  if (props.selectedNodeId) scrollToStep(props.selectedNodeId, 'auto');
});

onMounted(() => {
  const initialId = props.selectedNodeId ?? props.nodes[0]?.id;
  if (initialId) scrollToStep(initialId, 'auto');
});

function traceFor(nodeId: string): PipelineTraceEvent | undefined {
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
    return node.config.modelRef.modelName || node.artifactPrefix || node.id;
  }
  if (node.artifactPrefix) return node.artifactPrefix;
  return node.id;
}
</script>

<style scoped>
.chain-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0c0c0c;
}

.chain-viewport {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.chain-viewport::before,
.chain-viewport::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 56px;
  pointer-events: none;
  z-index: 1;
}
.chain-viewport::before {
  top: 0;
  background: linear-gradient(to bottom, #0c0c0c 20%, transparent);
}
.chain-viewport::after {
  bottom: 0;
  background: linear-gradient(to top, #0c0c0c 20%, transparent);
}

.chain-scroll {
  height: 100%;
  overflow-y: auto;
  scroll-snap-type: y proximity;
  scroll-behavior: smooth;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 1rem;
}

.chain-scroll-spacer {
  flex-shrink: 0;
  height: max(35vh, 140px);
  width: 100%;
}

.chain-step {
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: center;
  scroll-snap-align: center;
  scroll-snap-stop: always;
}

.step-connector { color: #444; font-size: 1rem; margin: 2px 0; flex-shrink: 0; }

.step-card {
  width: 100%;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 0.65rem 0.8rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.chain-step:not(.selected) .step-card { opacity: 0.72; transform: scale(0.98); }
.chain-step.selected .step-card {
  opacity: 1;
  transform: scale(1);
  border-color: #2a5070;
  background: #111e2a;
  box-shadow: 0 0 0 1px #2a5070, 0 8px 24px rgba(0, 0, 0, 0.35);
}
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
.selected .step-actions { opacity: 1; }

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
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.4rem 0.75rem;
  background: #111;
  border: 1px dashed #333;
  border-radius: 6px;
  width: 100%;
  max-width: 480px;
  flex-shrink: 0;
  opacity: 0.85;
}
.output-label { font-size: 0.7rem; color: #555; }
.output-key { font-size: 0.78rem; color: #7ec8e3; font-family: monospace; }

.chain-add-bar {
  flex-shrink: 0;
  border-top: 2px solid #2a5070;
  background: linear-gradient(180deg, #0f1418 0%, #111820 100%);
  padding: 0.65rem 0.85rem 0.75rem;
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.45);
}
.chain-add-bar-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.45rem;
}
.chain-add-bar-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7ec8e3;
  font-weight: 700;
}
.chain-add-bar-hint {
  font-size: 0.65rem;
  color: #556;
}
.chain-add-bar-buttons {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #888; border-radius: 4px; cursor: pointer; }
.btn-sm { padding: 4px 10px; font-size: 0.75rem; }
.btn:hover { background: #222; color: #ccc; border-color: #3a3a3a; }
.btn-accent {
  background: #1e3d52;
  border-color: #2a5070;
  color: #7ec8e3;
}
.btn-accent:hover { background: #254a62; color: #a8dff5; }
.btn-capsule { border-color: #2a3d52; color: #5a9fd4; }
.btn-capsule:hover { background: #1a2a3a; color: #7ec8e3; }

.icon-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 0.8rem; padding: 0 3px; }
.icon-btn:hover:not(:disabled) { color: #aaa; }
.icon-btn:disabled { opacity: 0.2; cursor: default; }
.icon-btn.danger:hover:not(:disabled) { color: #e07070; }
</style>
