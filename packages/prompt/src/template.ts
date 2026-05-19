import type {Result, PipelineError} from '@lorca/core';
import {ok, err} from '@lorca/core';

// Template syntax: {{artifact.<key>}} and {{param.<name>}}
// Literal {{ is escaped as \{{

const PLACEHOLDER_RE = /\\?\{\{(artifact|param)\.([\w.\-]+)\}\}/g;

export interface TemplateContext {
  artifacts: Record<string, unknown>;
  params?: Record<string, unknown>;
  allowParams: boolean;
}

export function renderTemplate(
  template: string,
  ctx: TemplateContext,
): Result<string, PipelineError> {
  const missing: string[] = [];

  const result = template.replace(PLACEHOLDER_RE, (match, kind, name) => {
    // Escaped literal: \{{ → {{
    if (match.startsWith('\\')) {
      return match.slice(1);
    }

    if (kind === 'artifact') {
      if (!(name in ctx.artifacts)) {
        missing.push(`artifact.${name}`);
        return match;
      }
      const val = ctx.artifacts[name];
      return typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    }

    if (kind === 'param') {
      if (!ctx.allowParams) {
        missing.push(`param.${name} (params not valid outside Capsules)`);
        return match;
      }
      if (!ctx.params || !(name in ctx.params)) {
        missing.push(`param.${name}`);
        return match;
      }
      const val = ctx.params[name];
      return typeof val === 'string' ? val : JSON.stringify(val);
    }

    return match;
  });

  if (missing.length > 0) {
    return err({
      code: 'template_render_failed',
      message: `Unresolved template references: ${missing.join(', ')}`,
    });
  }

  return ok(result);
}
