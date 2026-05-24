<template>
  <div v-if="open" class="help-backdrop" @click.self="emit('close')">
    <div class="help-dialog" role="dialog" :aria-labelledby="titleId">
      <header class="help-header">
        <h2 :id="titleId">{{ title }}</h2>
        <button type="button" class="help-close" title="Close" @click="emit('close')">×</button>
      </header>
      <div class="help-body">
        <template v-if="variant === 'app'">
          <section>
            <h3>Layout</h3>
            <ul>
              <li><strong>Left pane</strong> — Step types, Step Suggestions, Capsules, Models, and Endpoints.</li>
              <li><strong>Center</strong> — Your prompt and the step chain. Select a step to configure it in the right pane.</li>
              <li><strong>Right pane</strong> — Step inspector, trace from the last run, and pipeline output.</li>
            </ul>
          </section>
          <section>
            <h3>Typical flow</h3>
            <ol>
              <li>Add an <strong>Endpoint</strong> and discover or add <strong>Models</strong>.</li>
              <li>Enter your prompt at the top of the center pane.</li>
              <li>Add steps or drag <strong>Step Suggestions</strong> into the chain.</li>
              <li>Select a model-call step, then click a model in the left pane to assign it.</li>
              <li>Use <strong>▷</strong> on a step for a partial run, or <strong>Execute Pipeline</strong> for a full run.</li>
              <li>Inspect artifacts and responses in the <strong>Trace</strong> tab.</li>
            </ol>
          </section>
          <section>
            <h3>Tips</h3>
            <ul>
              <li>Filter models by <strong>usage bucket</strong> to match task type (extract-json, summarize, etc.).</li>
              <li>Drag the <strong>⠿</strong> handle to reorder steps; drag suggestions onto insert zones.</li>
              <li>Wrap refine + verify steps in a <strong>retry loop</strong> (⋯ More → Wrap in retry loop, or use Step Suggestions).</li>
              <li>Stale badges mean upstream inputs changed since the last run.</li>
              <li>Save reusable flows as <strong>Capsules</strong> and insert them as capsule-instance steps.</li>
            </ul>
          </section>
          <section>
            <h3>Keyboard shortcuts</h3>
            <table class="help-shortcuts">
              <tbody>
                <tr><td class="shortcut-key"><kbd>⌘Z</kbd> / <kbd>Ctrl+Z</kbd></td><td>Undo last pipeline edit</td></tr>
                <tr><td class="shortcut-key"><kbd>⌘⇧Z</kbd> / <kbd>Ctrl+Y</kbd></td><td>Redo</td></tr>
                <tr><td class="shortcut-key"><kbd>⌘↵</kbd> / <kbd>Ctrl+↵</kbd></td><td>Execute Pipeline (or Cancel if running)</td></tr>
                <tr><td class="shortcut-key"><kbd>Shift+click</kbd></td><td>Extend step selection range</td></tr>
                <tr><td class="shortcut-key"><kbd>Click</kbd></td><td>Select step</td></tr>
              </tbody>
            </table>
          </section>
        </template>
        <template v-else>
          <section>
            <h3>Prompt composition</h3>
            <p>Model-call steps build XML from blocks, optional previous-step output, and history reads. The pipeline wraps your top prompt in <code>&lt;user_prompt&gt;</code>.</p>
          </section>
          <section>
            <h3>Artifact references (templates)</h3>
            <p>In template steps, reference prior step outputs:</p>
            <pre class="help-code" v-pre>{{artifact.example_namespace.text}}</pre>
            <p>Escape a literal brace as <code v-pre>\{{</code>. Parameter refs <code v-pre>{{param.name}}</code> work inside Capsules only.</p>
          </section>
          <section>
            <h3>Available artifact keys</h3>
            <p v-if="refs.length === 0" class="help-muted">Add prior steps to see artifact keys you can reference.</p>
            <ul v-else class="help-ref-list">
              <li v-for="ref in refs" :key="ref">
                <code>{{ ref }}</code>
              </li>
            </ul>
          </section>
          <section>
            <h3>History reads</h3>
            <p>Pull a prior step's primary output into this step's prompt under a custom XML tag. Required reads block the run if the source is missing.</p>
          </section>
          <section>
            <h3>Reserved tags</h3>
            <p>Do not use these as custom tag names: <code>user_prompt</code>, <code>previous_output</code>, and other system tags.</p>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue';

const props = defineProps<{
  open: boolean;
  variant: 'app' | 'prompt';
  artifactRefs?: string[];
}>();

const refs = computed(() => props.artifactRefs ?? []);

const emit = defineEmits<{close: []}>();

const titleId = 'help-dialog-title';

const title = computed(() =>
  props.variant === 'app' ? 'Lorca — Help' : 'Prompt references',
);
</script>

<style scoped>
.help-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.65);
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}
.help-dialog {
  background: #141414; border: 1px solid #333; border-radius: 8px;
  max-width: 520px; width: 100%; max-height: 85vh;
  display: flex; flex-direction: column; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
}
.help-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.75rem 1rem; border-bottom: 1px solid #2a2a2a;
}
.help-header h2 { margin: 0; font-size: 1rem; color: #ddd; }
.help-close {
  background: none; border: none; color: var(--text-label); font-size: 1.25rem; cursor: pointer;
}
.help-close:hover { color: #ccc; }
.help-body {
  padding: 0.75rem 1rem 1rem; overflow-y: auto;
  font-size: 0.82rem; color: #aaa; line-height: 1.5;
}
.help-body h3 { margin: 0.75rem 0 0.35rem; font-size: 0.78rem; color: #7ec8e3; text-transform: uppercase; letter-spacing: 0.05em; }
.help-body h3:first-child { margin-top: 0; }
.help-body ul, .help-body ol { margin: 0.25rem 0 0; padding-left: 1.2rem; }
.help-body li { margin-bottom: 0.25rem; }
.help-code {
  margin: 0.35rem 0; padding: 0.4rem 0.5rem; background: #0a0a0a;
  border: 1px solid #222; border-radius: 4px; font-size: 0.75rem; color: #7ec8e3;
}
.help-ref-list { list-style: none; padding: 0; max-height: 10rem; overflow-y: auto; }
.help-ref-list li { margin-bottom: 0.2rem; }
.help-muted { color: var(--text-label); font-style: italic; }
code { font-family: monospace; color: #7ec8e3; font-size: 0.78rem; }
.help-shortcuts { width: 100%; border-collapse: collapse; margin-top: 0.25rem; }
.help-shortcuts td { padding: 3px 0; vertical-align: middle; }
.shortcut-key { width: 40%; white-space: nowrap; }
kbd {
  display: inline-block; padding: 1px 5px; font-family: monospace; font-size: 0.75rem;
  background: #1a1a1a; border: 1px solid #333; border-radius: 3px; color: #ccc;
}
</style>
