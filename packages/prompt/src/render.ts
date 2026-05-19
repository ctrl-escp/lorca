import type {PromptCompositionConfig, PromptBlock} from '@lorca/core';
import {isValidTag} from './tags.js';

export interface RenderedPromptBlock {
  tagName: string;
  body: string;
  source: PromptBlock['source'];
}

export interface RenderedPromptPayload {
  blocks: RenderedPromptBlock[];
  xmlText: string;
}

export interface ResolvedHistoryRead {
  sourceArtifactRef: string;
  value?: string;
  omitted?: boolean;
}

function blockToXml(tagName: string, body: string): string {
  return `<${tagName}>\n${body}\n</${tagName}>`;
}

function historyReadBlocks(
  config: PromptCompositionConfig,
  resolvedHistory?: ResolvedHistoryRead[],
): RenderedPromptBlock[] {
  const byRef = new Map(resolvedHistory?.map((r) => [r.sourceArtifactRef, r]) ?? []);
  const blocks: RenderedPromptBlock[] = [];

  for (const read of config.historyReads) {
    if (!isValidTag(read.tagName)) continue;
    const resolved = byRef.get(read.sourceArtifactRef);
    if (resolved?.omitted) continue;
    if (resolved?.value !== undefined) {
      blocks.push({tagName: read.tagName, body: resolved.value, source: 'history-read'});
    }
  }

  return blocks;
}

/**
 * Render a PromptCompositionConfig into structured blocks and final XML.
 *
 * Pass resolvedPrevOutput when the previous step's output is known (execution).
 * Pass undefined for preview — previous-output block is omitted from output.
 * Pass resolvedHistory during execution to inject prior step outputs.
 */
export function renderPromptComposition(
  config: PromptCompositionConfig,
  resolvedPrevOutput?: string,
  resolvedHistory?: ResolvedHistoryRead[],
): RenderedPromptPayload {
  const blocks: RenderedPromptBlock[] = [];

  const prevEnabled = config.previousOutput.enabled;
  const prevTagName = config.previousOutput.tagName || 'previous_output';

  const prevBlock: RenderedPromptBlock | null =
    prevEnabled && resolvedPrevOutput !== undefined
      ? {tagName: prevTagName, body: resolvedPrevOutput, source: 'previous-output'}
      : null;

  if (prevBlock && config.previousOutput.placement === 'beforeOwnPrompt') {
    blocks.push(prevBlock);
  }

  blocks.push(...historyReadBlocks(config, resolvedHistory));

  for (const block of config.blocks) {
    if (!block.enabled) continue;
    if (!isValidTag(block.tagName)) continue;
    blocks.push({tagName: block.tagName, body: block.body, source: block.source});
  }

  if (prevBlock && config.previousOutput.placement === 'afterOwnPrompt') {
    blocks.push(prevBlock);
  }

  const xmlText = blocks.map((b) => blockToXml(b.tagName, b.body)).join('\n\n');

  return {blocks, xmlText};
}

function previewHistoryReadBody(read: {sourceArtifactRef: string; required: boolean}): string {
  const suffix = read.required ? '' : ' (optional — omitted if unavailable)';
  return `…${read.sourceArtifactRef}${suffix}…`;
}

/** Preview XML — previous output and history reads shown as placeholders when unresolved. */
export function previewPromptXml(config: PromptCompositionConfig): string {
  const blocks: string[] = [];
  const prevTagName = config.previousOutput.tagName || 'previous_output';

  const prevXml = config.previousOutput.enabled
    ? blockToXml(prevTagName, '…previous step output…')
    : null;

  if (prevXml && config.previousOutput.placement === 'beforeOwnPrompt') blocks.push(prevXml);

  for (const read of config.historyReads) {
    if (!isValidTag(read.tagName)) continue;
    blocks.push(blockToXml(read.tagName, previewHistoryReadBody(read)));
  }

  for (const block of config.blocks) {
    if (!block.enabled) continue;
    if (!isValidTag(block.tagName)) continue;
    blocks.push(blockToXml(block.tagName, block.body));
  }

  if (prevXml && config.previousOutput.placement === 'afterOwnPrompt') blocks.push(prevXml);

  return blocks.join('\n\n');
}
