/** Domain-level mapping states. Keep persisted/protocol values centralized. */
export const MAPPING_COMPATIBILITY = {
  COMPATIBLE: 'compatible',
  UNIT_MISMATCH: 'unit-mismatch',
  UNMATCHED: 'unmatched',
} as const;

export type MappingCompatibility =
  (typeof MAPPING_COMPATIBILITY)[keyof typeof MAPPING_COMPATIBILITY];
