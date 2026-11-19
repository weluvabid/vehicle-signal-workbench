import { INGESTION_LABELS } from '@/constants/comparison-labels';

export const INGESTION_INTENTS = {
  IMPORT_FAILED: 'INGESTION_IMPORT_FAILED',
} as const;

export type IngestionIntent = (typeof INGESTION_INTENTS)[keyof typeof INGESTION_INTENTS];

export interface IngestionFailure {
  readonly intent: IngestionIntent;
  readonly message: string;
}

export function resolveIngestionFailure(cause: unknown): IngestionFailure {
  return {
    intent: INGESTION_INTENTS.IMPORT_FAILED,
    message: cause instanceof Error ? cause.message : INGESTION_LABELS.importFailure,
  };
}
