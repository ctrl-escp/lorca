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

function blockToXml(tagName: string, body: string): string {
  return `<${tagName}>\n${body}\n</${tagName}>`;
}

/**
 * Render a PromptCompositionConfig into structured blocks and final XML.
 *
 * Pass resolvedPrevOutput when the previous step's output is known (execution).
 * Pass undefined for preview — previous-output block is omitted from output.
 */
export function renderPromptComposition(
  config: PromptCompositionConfig,
  resolvedPrevOutput?: string,
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

/** Preview XML — previous output shown as a placeholder tag when enabled. */
export function previewPromptXml(config: PromptCompositionConfig): string {
  const blocks: string[] = [];
  const prevTagName = config.previousOutput.tagName || 'previous_output';

  const prevXml = config.previousOutput.enabled
    ? blockToXml(prevTagName, '…previous step output…')
    : null;

  if (prevXml && config.previousOutput.placement === 'beforeOwnPrompt') blocks.push(prevXml);

  for (const block of config.blocks) {
    if (!block.enabled) continue;
    if (!isValidTag(block.tagName)) continue;
    blocks.push(blockToXml(block.tagName, block.body));
  }

  if (prevXml && config.previousOutput.placement === 'afterOwnPrompt') blocks.push(prevXml);

  return blocks.join('\n\n');
}
