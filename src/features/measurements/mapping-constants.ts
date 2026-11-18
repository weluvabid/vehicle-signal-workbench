/** Domain-level mapping states. Keep persisted/protocol values centralized. */
export const MAPPING_COMPATIBILITY = {
  COMPATIBLE: 'compatible',
  UNIT_MISMATCH: 'unit-mismatch',
  UNMATCHED: 'unmatched',
} as const;

export type MappingCompatibility =
  (typeof MAPPING_COMPATIBILITY)[keyof typeof MAPPING_COMPATIBILITY];

export const MAPPING_CONFIDENCE = {
  EXACT_LABEL: 'exact-label',
  MANUAL: 'manual',
  NONE: 'none',
} as const;

export type MappingConfidence =
  (typeof MAPPING_CONFIDENCE)[keyof typeof MAPPING_CONFIDENCE];

/** Presentation copy is separate from domain state and CSS class names. */
export const MAPPING_PRESENTATION = {
  [MAPPING_COMPATIBILITY.COMPATIBLE]: {
    label: 'Compatible',
    className: 'compatible',
  },
  [MAPPING_COMPATIBILITY.UNIT_MISMATCH]: {
    label: 'Unit mismatch',
    className: 'unit-mismatch',
  },
  [MAPPING_COMPATIBILITY.UNMATCHED]: {
    label: 'Unmapped',
    className: 'unmatched',
  },
} as const satisfies Record<MappingCompatibility, { label: string; className: string }>;
