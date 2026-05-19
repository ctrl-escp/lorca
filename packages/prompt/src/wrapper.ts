import type { PromptWrapperConfig } from '@lorca/core';
import { escapePromptText } from './escape.js';

export function renderPromptWrapper(
  config: PromptWrapperConfig,
  inputArtifactValue: string,
): string {
  const { tagName, instructionText, includeInputArtifact, inputPlacement, template } = config;

  if (!includeInputArtifact) {
    return `<${tagName}>\n${instructionText}\n</${tagName}>`;
  }

  if (inputPlacement === 'inside-template' && template) {
    const rendered = template.replace('{{input}}', inputArtifactValue);
    return `<${tagName}>\n${rendered}\n</${tagName}>`;
  }

  if (inputPlacement === 'before-instructions') {
    return `<${tagName}>\n${inputArtifactValue}\n${instructionText}\n</${tagName}>`;
  }

  // after-instructions (default)
  return `<${tagName}>\n${instructionText}\n${inputArtifactValue}\n</${tagName}>`;
}
