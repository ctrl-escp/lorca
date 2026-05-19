<template>
  <div class="app">
    <header class="app-header">
      <h1>Lorca</h1>
      <span class="app-subtitle">Local AI Orchestrator</span>
    </header>
    <main class="app-body">
      <div class="pane pane-left">
        <LeftPane />
      </div>
      <div class="pane pane-center">
        <div class="pane-placeholder">
          <span>Pipeline builder</span>
          <small>Phase 6</small>
        </div>
      </div>
      <div class="pane pane-right">
        <div class="pane-placeholder">
          <span>Inspector &amp; output</span>
          <small>Phase 6</small>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import LeftPane from './components/LeftPane.vue';
</script>

<style>
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0f0f0f;
  color: #e8e8e8;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.5rem 1.25rem;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}

.app-header h1 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.app-subtitle { font-size: 0.75rem; color: #666; }

.app-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.pane { overflow: hidden; }
.pane-left { width: 280px; flex-shrink: 0; }
.pane-center { flex: 1; border-right: 1px solid #2a2a2a; }
.pane-right { width: 360px; flex-shrink: 0; }

.pane-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  color: #444;
}
.pane-placeholder span { font-size: 0.85rem; }
.pane-placeholder small { font-size: 0.7rem; color: #333; }
</style>
