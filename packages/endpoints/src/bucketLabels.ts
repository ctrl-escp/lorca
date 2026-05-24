import type {CapsuleModelSlot, ModelUsageBucket} from '@lorca/core';

export const MODEL_USAGE_BUCKET_LABELS: Record<ModelUsageBucket, string> = {
  tiny: 'small/fast models for lightweight tasks',
  thinking: 'larger models for reasoning and complex generation',
  summarize: 'models suited for summarization',
  rewrite: 'models suited for rewriting and rephrasing',
  'rewrite-prose': 'models suited for prose and prompt rewriting',
  'rewrite-code': 'models suited for code rewriting and refactoring',
  'extract-json': 'models suited for structured JSON extraction',
  verify: 'models suited for verification and critique',
  general: 'general-purpose models',
  unknown: 'uncategorized usage',
};

export function formatBucketRequirement(bucket: ModelUsageBucket): string {
  return `${bucket} (${MODEL_USAGE_BUCKET_LABELS[bucket]})`;
}

export function formatBucketsRequirement(buckets: readonly ModelUsageBucket[]): string {
  return buckets.map(formatBucketRequirement).join('; ');
}

export function noEnabledModelsMessage(): string {
  return 'No enabled models are available. Add or enable a model in the left pane.';
}

export function formatModelCallRequirementMessage(buckets: readonly ModelUsageBucket[]): string {
  if (buckets.length === 1) {
    return `No enabled model matches the suggested type: ${formatBucketRequirement(buckets[0]!)}. Add or enable a matching model, or pick one manually.`;
  }
  return `No enabled model matches any suggested type: ${formatBucketsRequirement(buckets)}. Add or enable a matching model, or pick one manually.`;
}

export function formatSlotModelRequirementMessage(slot: CapsuleModelSlot): string {
  const parts: string[] = [];
  if (slot.suggestedBuckets.length > 0) {
    parts.push(`suggested ${slot.suggestedBuckets.length === 1 ? 'type' : 'types'}: ${formatBucketsRequirement(slot.suggestedBuckets)}`);
  }
  if (slot.preferredModelNames?.length) {
    parts.push(`preferred model names: ${slot.preferredModelNames.join(', ')}`);
  }
  if (slot.preferredFamilies?.length) {
    parts.push(`preferred families: ${slot.preferredFamilies.join(', ')}`);
  }
  if (slot.preferredParameterSizes?.length) {
    parts.push(`preferred sizes: ${slot.preferredParameterSizes.join(', ')}`);
  }
  if (slot.defaultModelRef?.modelName) {
    parts.push(`default model: ${slot.defaultModelRef.modelName}`);
  }
  const requirement = parts.length > 0 ? parts.join('; ') : 'a suitable model';
  return `No enabled model matches slot "${slot.name}" (${requirement}). Add or enable a matching model, or pick one manually.`;
}
