import type {CapsuleDefinition, ModelRef, PipelineStep} from '@lorca/core';
import {computeCapsuleContentSignature} from '@lorca/pipeline';
import {defaultModelSlotBindings, uniqueNamespace} from './stepBuilders.js';

export function buildCapsuleInstanceStep(
  capsule: CapsuleDefinition,
  existingNamespaces: ReadonlySet<string>,
  createId: (prefix: string) => string,
  overrides?: Partial<PipelineStep>,
): PipelineStep {
  const ns = uniqueNamespace('capsule_instance', existingNamespaces);
  const inputBindings: Record<string, string> = {};
  for (const port of capsule.interface.inputs) {
    inputBindings[port.name] = port.defaultArtifactKey
      ?? (port.name === 'user_prompt' ? 'user_prompt.xml' : `${port.name}.text`);
  }
  const outputBindings: Record<string, string> = {};
  for (const port of capsule.interface.outputs) {
    const suffix = port.sourceArtifactKey?.split('.').pop() ?? port.name;
    outputBindings[port.name] = `${ns}.${suffix}`;
  }
  const lastOut = capsule.interface.outputs.at(-1);
  const primaryOutputName = lastOut
    ? (lastOut.sourceArtifactKey?.split('.').pop() ?? 'text')
    : 'text';
  const modelSlotBindings = defaultModelSlotBindings(capsule);

  return {
    id: createId('cap_inst'),
    type: 'capsule-instance',
    label: capsule.name,
    enabled: true,
    outputNamespace: ns,
    primaryOutputName,
    lastEditedAt: new Date().toISOString(),
    config: {
      type: 'capsule-instance',
      capsuleId: capsule.id,
      capsuleVersion: capsule.version,
      inputBindings,
      outputBindings,
      ...(Object.keys(modelSlotBindings).length > 0 ? {modelSlotBindings} : {}),
      boundContentSignature: computeCapsuleContentSignature(capsule),
    },
    ...overrides,
  };
}
