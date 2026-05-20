<template>
  <div class="trace-panel">
    <div v-if="partialRun" class="trace-run-banner partial">Partial run — only steps up to the selected target executed.</div>
    <div v-else-if="trace.length > 0" class="trace-run-banner full">Full pipeline run</div>

    <div v-if="selectedStepId && filterToSelected" class="trace-filter-note">
      Showing events for selected step
      <button type="button" class="trace-filter-clear" @click="filterToSelected = false">Show all</button>
    </div>

    <div v-if="displayTrace.length === 0" class="trace-empty">No trace yet. Execute Pipeline to see step details.</div>
    <div
      v-for="event in displayTrace"
      :key="`${event.stepId ?? event.nodeId}-${event.status}-${event.timestamp}`"
      class="trace-event"
      :class="`ev-${event.status}`"
    >
      <div class="ev-header">
        <span v-if="event.capsuleInstanceId" class="ev-capsule-id">{{ event.capsuleInstanceId }}<template v-if="event.capsuleIteration !== undefined"> #{{ event.capsuleIteration }}</template></span>
        <span class="ev-node" :class="{'ev-node-internal': !!event.capsuleInstanceId}">{{ event.stepId ?? event.nodeId }}</span>
        <span class="ev-status">{{ event.status }}</span>
        <span v-if="event.durationMs !== undefined" class="ev-duration">{{ event.durationMs }}ms</span>
        <button
          v-if="hasDetails(event)"
          type="button"
          class="ev-expand"
          @click="toggleExpand(event.stepId ?? event.nodeId ?? '')"
        >{{ expanded.has(event.stepId ?? event.nodeId ?? '') ? '▾' : '▸' }}</button>
      </div>

      <div v-if="event.inputArtifactNames?.length" class="ev-artifacts">
        <span class="ev-artifacts-label">inputs</span>
        <span v-for="name in event.inputArtifactNames" :key="name" class="artifact-tag">{{ name }}</span>
      </div>
      <div v-if="event.outputArtifactNames?.length" class="ev-artifacts">
        <span class="ev-artifacts-label">outputs</span>
        <button
          v-for="name in event.outputArtifactNames"
          :key="name"
          type="button"
          class="artifact-tag out artifact-link"
          :class="{active: expandedArtifact === artifactKey(event, name)}"
          :title="artifacts?.[name] ? 'Show artifact body' : 'Name only — body not in run store'"
          @click="toggleArtifact(event, name)"
        >{{ name }}</button>
      </div>

      <div v-if="expandedArtifactForEvent(event)" class="ev-detail">
        <div class="ev-detail-title">Artifact: {{ expandedArtifactForEvent(event) }}</div>
        <pre v-if="artifactBody(expandedArtifactForEvent(event)!)" class="ev-preview">{{ artifactBody(expandedArtifactForEvent(event)!) }}</pre>
        <p v-else class="ev-missing-artifact">Body not available for this artifact in the current run.</p>
      </div>

      <template v-if="expanded.has(event.stepId ?? event.nodeId ?? '') && hasDetails(event)">
        <div v-if="event.historyReadInputs?.length" class="ev-detail">
          <div class="ev-detail-title">History reads</div>
          <div v-for="(hr, i) in event.historyReadInputs" :key="i" class="ev-history-row">
            <span class="artifact-tag" :class="{omitted: hr.omitted}">{{ hr.sourceArtifactRef }}</span>
            <span v-if="hr.omitted" class="ev-omitted">omitted</span>
            <pre v-else-if="hr.preview" class="ev-preview">{{ hr.preview }}</pre>
          </div>
        </div>
        <div v-if="event.renderedPromptXml" class="ev-detail">
          <div class="ev-detail-title">Rendered prompt</div>
          <pre class="ev-prompt">{{ event.renderedPromptXml }}</pre>
        </div>
        <div v-if="event.rawModelResponsePreview" class="ev-detail">
          <div class="ev-detail-title">Raw model response</div>
          <pre class="ev-preview">{{ event.rawModelResponsePreview }}</pre>
        </div>
      </template>

      <div v-if="event.error" class="ev-error">
        <span class="ev-error-code">{{ event.error.code }}</span>
        <span class="ev-error-msg">{{ event.error.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import type {PipelineArtifact, PipelineTraceEvent} from '@lorca/core';

const ARTIFACT_PREVIEW_MAX = 4000;

const props = defineProps<{
  trace: PipelineTraceEvent[];
  artifacts?: Record<string, PipelineArtifact>;
  partialRun?: boolean;
  selectedStepId?: string | null;
}>();

const filterToSelected = ref(false);
const expanded = ref(new Set<string>());
const expandedArtifact = ref<string | null>(null);

watch(() => props.selectedStepId, (id) => {
  filterToSelected.value = Boolean(id);
  if (id) expanded.value = new Set([id]);
});

const displayTrace = computed(() => {
  if (!filterToSelected.value || !props.selectedStepId) return props.trace;
  const id = props.selectedStepId;
  return props.trace.filter(
    (e) => e.nodeId === id || e.stepId === id,
  );
});

function hasDetails(event: PipelineTraceEvent): boolean {
  return Boolean(
    event.renderedPromptXml
    || event.rawModelResponsePreview
    || (event.historyReadInputs && event.historyReadInputs.length > 0),
  );
}

function toggleExpand(id: string) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

function artifactKey(event: PipelineTraceEvent, name: string): string {
  return `${event.stepId ?? event.nodeId ?? ''}:${name}`;
}

function toggleArtifact(event: PipelineTraceEvent, name: string) {
  const key = artifactKey(event, name);
  expandedArtifact.value = expandedArtifact.value === key ? null : key;
}

function expandedArtifactForEvent(event: PipelineTraceEvent): string | null {
  if (!expandedArtifact.value) return null;
  const prefix = `${event.stepId ?? event.nodeId ?? ''}:`;
  if (!expandedArtifact.value.startsWith(prefix)) return null;
  return expandedArtifact.value.slice(prefix.length);
}

function artifactBody(name: string): string | null {
  const art = props.artifacts?.[name];
  if (!art) return null;
  const raw = typeof art.value === 'string' ? art.value : JSON.stringify(art.value, null, 2);
  return raw.length > ARTIFACT_PREVIEW_MAX ? `${raw.slice(0, ARTIFACT_PREVIEW_MAX)}\n… (truncated)` : raw;
}
</script>

<style scoped>
.trace-panel { padding: 0.75rem; display: flex; flex-direction: column; gap: 0.4rem; overflow-y: auto; height: 100%; }
.trace-run-banner {
  font-size: 0.65rem; padding: 0.3rem 0.5rem; border-radius: 3px; text-transform: uppercase;
  letter-spacing: 0.04em;
}
.trace-run-banner.full { background: #1a2a1a; color: #5a9d5a; }
.trace-run-banner.partial { background: #1a1a2a; color: #8080c0; }
.trace-filter-note {
  font-size: 0.68rem; color: #666; display: flex; align-items: center; gap: 0.4rem;
}
.trace-filter-clear {
  background: none; border: none; color: #7ec8e3; cursor: pointer; font-size: 0.68rem; padding: 0;
}
.trace-filter-clear:hover { text-decoration: underline; }
.trace-empty { color: #444; font-size: 0.78rem; }
.trace-event { background: #111; border: 1px solid #1e1e1e; border-radius: 4px; padding: 0.4rem 0.6rem; }
.ev-completed { border-left: 2px solid #3a9d6e; }
.ev-failed { border-left: 2px solid #c0392b; }
.ev-started { border-left: 2px solid #e8a020; }
.ev-skipped, .ev-cancelled { opacity: 0.5; }
.ev-header { display: flex; gap: 0.5rem; align-items: center; font-size: 0.78rem; flex-wrap: wrap; }
.ev-capsule-id { font-family: monospace; color: #5a9fd4; font-size: 0.68rem; }
.ev-capsule-id::after { content: ' ›'; }
.ev-node { font-family: monospace; color: #7ec8e3; }
.ev-node-internal { color: #4a8db4; font-size: 0.72rem; }
.ev-status { color: #888; }
.ev-duration { color: #555; font-size: 0.72rem; margin-left: auto; }
.ev-expand {
  background: none; border: none; color: #666; cursor: pointer; font-size: 0.7rem; padding: 0 4px;
}
.ev-expand:hover { color: #aaa; }
.ev-artifacts { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; align-items: center; }
.ev-artifacts-label { font-size: 0.62rem; color: #555; text-transform: uppercase; margin-right: 0.15rem; }
.artifact-tag { background: #1e1e1e; border: 1px solid #2a2a2a; border-radius: 3px; padding: 1px 5px; font-size: 0.68rem; color: #888; font-family: monospace; }
.artifact-tag.out { color: #7ec8e3; }
.artifact-link { cursor: pointer; }
.artifact-link:hover, .artifact-link.active { border-color: #3a6080; background: #1a2430; }
.ev-missing-artifact { margin: 0; font-size: 0.68rem; color: #666; font-style: italic; }
.artifact-tag.omitted { opacity: 0.5; text-decoration: line-through; }
.ev-detail { margin-top: 0.35rem; padding-top: 0.35rem; border-top: 1px solid #1a1a1a; }
.ev-detail-title { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 0.2rem; }
.ev-history-row { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.25rem; }
.ev-omitted { font-size: 0.68rem; color: #666; font-style: italic; }
.ev-prompt, .ev-preview {
  margin: 0; font-size: 0.72rem; color: #bbb; background: #0a0a0a;
  border: 1px solid #222; border-radius: 3px; padding: 0.35rem 0.45rem;
  white-space: pre-wrap; word-break: break-word; max-height: 12rem; overflow-y: auto;
}
.ev-error { margin-top: 0.25rem; font-size: 0.75rem; }
.ev-error-code { color: #e07070; margin-right: 0.4rem; font-family: monospace; }
.ev-error-msg { color: #c88; }
</style>
