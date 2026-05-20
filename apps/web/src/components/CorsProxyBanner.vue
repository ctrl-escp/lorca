<template>
  <div v-if="visible" class="cors-banner" role="note">
    <div class="cors-banner-body">
      <strong class="cors-banner-title">Local endpoint access requires a CORS proxy</strong>
      <p>
        You're running Lorca from <code>{{ currentOrigin }}</code>. Browsers block direct calls to
        local endpoints (Ollama, LM Studio, etc.) from non-localhost pages. The included proxy
        script forwards requests to your endpoint and adds the required CORS headers — your
        endpoint never sees a cross-origin request.
      </p>
      <p>
        <a
          class="cors-banner-link"
          href="https://raw.githubusercontent.com/ctrl-escp/lorca/main/scripts/llm-cors-proxy.mjs"
          download="llm-cors-proxy.mjs"
        >Download llm-cors-proxy.mjs</a>
        — then run it with Node.js 18+:
      </p>
      <pre class="cors-banner-code"># HTTPS mode (required for HTTPS pages — generates a self-signed cert on first run)
node llm-cors-proxy.mjs --endpoint http://localhost:11434 --port 11435 --https --domain localhost

# HTTP mode (only works if Lorca is served over plain HTTP)
node llm-cors-proxy.mjs --endpoint http://localhost:11434 --port 11435</pre>
      <p>
        Add <code>https://localhost:11435</code> (or the HTTP equivalent) as the endpoint URL in
        Lorca. Run one instance per endpoint on separate ports for multiple backends.
        Trust the generated certificate once with your OS keychain — the script prints the exact
        command on first run.
      </p>
    </div>
    <button type="button" class="cors-banner-dismiss" title="Dismiss" @click="dismiss">Dismiss</button>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue';

const STORAGE_KEY = 'lorca.corsProxyBannerDismissed';

function isLocalhost(): boolean {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
}

const visible = ref(!isLocalhost() && localStorage.getItem(STORAGE_KEY) !== '1');
const currentOrigin = window.location.origin;

function dismiss() {
  localStorage.setItem(STORAGE_KEY, '1');
  visible.value = false;
}
</script>

<style scoped>
.cors-banner {
  margin: 0.5rem 0.75rem 0;
  padding: 0.6rem 0.75rem;
  border: 1px solid #2a4a2a;
  background: #141e14;
  border-radius: 4px;
  font-size: 0.78rem;
  color: #9dca9d;
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
}
.cors-banner-body { flex: 1; min-width: 0; }
.cors-banner-title { display: block; color: #b8e0b8; margin-bottom: 0.35rem; }
.cors-banner-body p { margin: 0.3rem 0; }
.cors-banner-code {
  margin: 0.4rem 0;
  padding: 0.4rem 0.6rem;
  background: #0a100a;
  border: 1px solid #223322;
  border-radius: 3px;
  font-size: 0.72rem;
  color: #7ec87e;
  white-space: pre-wrap;
  word-break: break-all;
}
.cors-banner-link { color: #7ec8e3; }
.cors-banner-link:hover { color: #a8dff0; }
code { font-family: monospace; font-size: 0.78rem; color: #7ec8e3; }
.cors-banner-dismiss {
  flex-shrink: 0;
  background: none;
  border: 1px solid #2a4a2a;
  color: #6a9a6a;
  border-radius: 3px;
  padding: 2px 8px;
  font-size: 0.72rem;
  cursor: pointer;
  align-self: flex-start;
}
.cors-banner-dismiss:hover { color: #9dca9d; border-color: #4a7a4a; }
</style>
