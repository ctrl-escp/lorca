<template>
  <div class="app">
    <header class="app-header">
      <h1>Lorca</h1>
      <span class="app-subtitle">Local AI Orchestrator</span>
    </header>
    <main class="app-main">
      <p>Pipeline workbench loading…</p>
    </main>
  </div>
</template>

<script setup lang="ts">
// App shell — three-pane layout is implemented in Phase 11
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
}

.app-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #2a2a2a;
}

.app-header h1 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  letter-spacing: 0.05em;
}

.app-subtitle {
  font-size: 0.8rem;
  color: #888;
}

.app-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
}
</style>
