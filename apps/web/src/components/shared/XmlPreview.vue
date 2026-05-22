<template>
  <pre class="xml-preview" v-html="highlightedXml"></pre>
</template>

<script setup lang="ts">
import {computed} from 'vue';

const props = defineProps<{value: string}>();

const highlightedXml = computed(() => highlightXml(props.value || '(empty prompt)'));

function highlightXml(value: string): string {
  return escapeHtml(value).replace(
    /(&lt;\/?)([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?&gt;)/g,
    (_match, open: string, name: string, attrs: string, close: string) =>
      `<span class="xml-punct">${open}</span><span class="xml-tag">${name}</span>${highlightAttrs(attrs)}<span class="xml-punct">${close}</span>`,
  );
}

function highlightAttrs(value: string): string {
  return value.replace(
    /([A-Za-z_][\w:.-]*)(=)(&quot;.*?&quot;|&#39;.*?&#39;)/g,
    '<span class="xml-attr">$1</span><span class="xml-punct">$2</span><span class="xml-string">$3</span>',
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
</script>

<style>
.xml-preview {
  color: #cfcfcf;
}

.xml-preview .xml-punct { color: #5f6870; }
.xml-preview .xml-tag { color: #7ec8e3; }
.xml-preview .xml-attr { color: #d19a66; }
.xml-preview .xml-string { color: #98c379; }
</style>
