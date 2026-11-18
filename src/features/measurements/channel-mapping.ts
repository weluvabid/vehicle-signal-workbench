import type { ChannelDescriptor, DatasetDescriptor } from './model';

export type MappingCompatibility = 'compatible' | 'unit-mismatch' | 'unmatched';

export interface ChannelMapping {
  readonly leftChannelId: string;
  readonly rightChannelId: string | null;
  readonly compatibility: MappingCompatibility;
  readonly reason: string;
  readonly confidence: 'exact-label' | 'manual' | 'none';
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

  for (const channel of rightDataset.channels) {
    const key = normalizeLabel(channel.label);
    const candidates = rightByLabel.get(key) ?? [];
    candidates.push(channel);
    rightByLabel.set(key, candidates);
  }

  return leftDataset.channels.map((left) => {
    const candidates = rightByLabel.get(normalizeLabel(left.label)) ?? [];
    const right = candidates.length === 1 ? candidates[0] : null;

    if (!right) {
      return {
        left,
        right: null,
        compatibility: 'unmatched',
        reason: candidates.length > 1
          ? 'Multiple channels share this label; map manually.'
          : 'No exact channel-name match found.',
      };
    }

    if (!areUnitsCompatible(left.unit, right.unit)) {
      return {
        left,
        right,
        compatibility: 'unit-mismatch',
        reason: `Units differ (${left.unit ?? 'unspecified'} vs ${right.unit ?? 'unspecified'}).`,
      };
    }

    return {
      left,
      right,
      compatibility: 'compatible',
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
      compatibility: 'unmatched',
      reason: 'No right-side channel selected.',
      confidence: 'none',
    };
  }

  const compatible = areUnitsCompatible(left.unit, right.unit);

  return {
    leftChannelId: left.id,
    rightChannelId: right.id,
    compatibility: compatible ? 'compatible' : 'unit-mismatch',
    reason: compatible
      ? 'Units match.'
      : `Units differ (${left.unit ?? 'unspecified'} vs ${right.unit ?? 'unspecified'}); conversion is not available.`,
    confidence: 'manual',
  };
}
