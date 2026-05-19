import type {ModelUsageBucket} from '@lorca/core';

interface BucketInput {
  providerModelName: string;
  parameterSize?: string;
  quantization?: string;
  family?: string;
}

// Parameter counts parsed from names like "7b", "70b", "1.7b"
function parseParamBillions(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.toLowerCase().match(/^([\d.]+)b$/);
  return m && m[1] ? parseFloat(m[1]) : null;
}

function lc(s: string): string {
  return s.toLowerCase();
}

export function assignBuckets(input: BucketInput): ModelUsageBucket[] {
  const name = lc(input.providerModelName);
  const paramB = parseParamBillions(input.parameterSize);
  const buckets = new Set<ModelUsageBucket>();

  // Thinking / reasoning models
  if (name.includes('think') || name.includes('reason') || name.includes('r1') || name.includes('qwq')) {
    buckets.add('thinking');
  }

  // Tiny models (≤ 3B params or explicit "tiny" / "mini" / "small" tags)
  const isTiny =
    name.includes('tiny') ||
    name.includes('mini') ||
    (paramB !== null && paramB <= 3);
  if (isTiny) {
    buckets.add('tiny');
  }

  // JSON extraction capability
  if (
    name.includes('extract') ||
    name.includes('json') ||
    name.includes('struct') ||
    name.includes('hermes') ||
    name.includes('mistral') ||
    name.includes('functionary')
  ) {
    buckets.add('extract-json');
  }

  // Summarize
  if (name.includes('summar') || name.includes('compress') || name.includes('short')) {
    buckets.add('summarize');
  }

  // Rewrite
  if (name.includes('rewrite') || name.includes('edit') || name.includes('refine')) {
    buckets.add('rewrite');
  }

  // Verify / judge
  if (name.includes('verif') || name.includes('judge') || name.includes('eval') || name.includes('critic')) {
    buckets.add('verify');
  }

  // General — catch-all for medium–large capable models
  const isGeneral =
    buckets.size === 0 ||
    (paramB !== null && paramB >= 7) ||
    name.includes('llama') ||
    name.includes('phi') ||
    name.includes('gemma') ||
    name.includes('qwen') ||
    name.includes('deepseek') ||
    name.includes('mixtral') ||
    name.includes('command');
  if (isGeneral) {
    buckets.add('general');
  }

  // Fallback
  if (buckets.size === 0) {
    buckets.add('unknown');
  }

  return [...buckets];
}
