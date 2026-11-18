import type { ChannelDescriptor, DatasetDescriptor } from './model';
import { MAPPING_COMPATIBILITY, MAPPING_CONFIDENCE } from './mapping-constants';
import type { MappingCompatibility, MappingConfidence } from './mapping-constants';

export type { MappingCompatibility, MappingConfidence } from './mapping-constants';

export interface ChannelMapping {
  readonly leftChannelId: string;
  readonly rightChannelId: string | null;
  readonly compatibility: MappingCompatibility;
  readonly reason: string;
  readonly confidence: MappingConfidence;
}

export interface SuggestedChannelMapping {
  readonly left: ChannelDescriptor;
  readonly right: ChannelDescriptor | null;
  readonly compatibility: MappingCompatibility;
  readonly reason: string;
}

function normalizeLabel(label: string): string {
  return label
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeUnit(unit: string | null): string | null {
  return unit?.trim().toLowerCase().replace(/\s+/g, '') ?? null;
}

export function areUnitsCompatible(left: string | null, right: string | null): boolean {
  return normalizeUnit(left) === normalizeUnit(right);
}

/**
 * Produces conservative suggestions. It does not infer aliases or convert units:
 * only a normalized exact label match is suggested automatically.
 */
export function suggestChannelMappings(
  leftDataset: DatasetDescriptor,
  rightDataset: DatasetDescriptor,
): readonly SuggestedChannelMapping[] {
  const rightByLabel = new Map<string, ChannelDescriptor[]>();
  const leftLabelCounts = new Map<string, number>();

  for (const channel of leftDataset.channels) {
    const key = normalizeLabel(channel.label);
    leftLabelCounts.set(key, (leftLabelCounts.get(key) ?? 0) + 1);
  }

  for (const channel of rightDataset.channels) {
    const key = normalizeLabel(channel.label);
    const candidates = rightByLabel.get(key) ?? [];
    candidates.push(channel);
    rightByLabel.set(key, candidates);
  }

  return leftDataset.channels.map((left) => {
    const key = normalizeLabel(left.label);
    const candidates = rightByLabel.get(key) ?? [];
    const ambiguousLeft = (leftLabelCounts.get(key) ?? 0) > 1;
    const right = !ambiguousLeft && candidates.length === 1 ? candidates[0] : null;

    if (!right) {
      return {
        left,
        right: null,
        compatibility: MAPPING_COMPATIBILITY.UNMATCHED,
        reason: ambiguousLeft || candidates.length > 1
          ? 'Multiple channels share this label; map manually.'
          : 'No exact channel-name match found.',
      };
    }

    if (!areUnitsCompatible(left.unit, right.unit)) {
      return {
        left,
        right,
        compatibility: MAPPING_COMPATIBILITY.UNIT_MISMATCH,
        reason: `Units differ (${left.unit ?? 'unspecified'} vs ${right.unit ?? 'unspecified'}).`,
      };
    }

    return {
      left,
      right,
      compatibility: MAPPING_COMPATIBILITY.COMPATIBLE,
      reason: 'Exact normalized label and unit match.',
    };
  });
}

export function createManualChannelMapping(
  left: ChannelDescriptor,
  right: ChannelDescriptor | null,
): ChannelMapping {
  if (!right) {
    return {
      leftChannelId: left.id,
      rightChannelId: null,
      compatibility: MAPPING_COMPATIBILITY.UNMATCHED,
      reason: 'No right-side channel selected.',
      confidence: MAPPING_CONFIDENCE.NONE,
    };
  }

  const compatible = areUnitsCompatible(left.unit, right.unit);

  return {
    leftChannelId: left.id,
    rightChannelId: right.id,
    compatibility: compatible ? MAPPING_COMPATIBILITY.COMPATIBLE : MAPPING_COMPATIBILITY.UNIT_MISMATCH,
    reason: compatible
      ? 'Units match.'
      : `Units differ (${left.unit ?? 'unspecified'} vs ${right.unit ?? 'unspecified'}); conversion is not available.`,
    confidence: MAPPING_CONFIDENCE.MANUAL,
  };
}
