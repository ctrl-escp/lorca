import {escapePromptText} from './escape.js';

export interface UserPromptArtifacts {
  raw: string;
  xml: string;
}

export function buildUserPromptArtifacts(rawText: string): UserPromptArtifacts {
  const escaped = escapePromptText(rawText);
  return {
    raw: rawText,
    xml: `<user_prompt>\n${escaped}\n</user_prompt>`,
  };
}
