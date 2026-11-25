'use client';

import { useCallback, useRef, useState } from 'react';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { DatasetDescriptor } from '@/features/measurements/model';
import {
  generateDriveRecording,
  type DriveRole,
  type WorkloadPreset,
} from '@/features/ingestion/synthetic-drive';
import { resolveIngestionFailure, type IngestionFailure } from '@/intents/ingestion-intents';

export type IngestionStage = 0 | 1 | 2 | 3;

interface ComparisonIngestionOptions {
  readonly client: MeasurementWorkerClient;
  readonly onComplete: (
    reference: DatasetDescriptor,
    comparison: DatasetDescriptor,
    metrics: { ingestionDurationMs: number; totalBytes: number },
  ) => void;
  readonly onOpenChange: (open: boolean) => void;
}

export function useComparisonIngestion({
  client,
  onComplete,
  onOpenChange,
}: ComparisonIngestionOptions) {
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const [stage, setStage] = useState<IngestionStage>(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<IngestionFailure | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setProgress(0);
    setStage(0);
  }, []);

  const start = useCallback(
    async (preset: WorkloadPreset) => {
      if (runningRef.current) return;

      runningRef.current = true;
      setRunning(true);
      setError(null);
      let reference: DatasetDescriptor | null = null;
      let comparison: DatasetDescriptor | null = null;

      const ingestRole = async (
        role: DriveRole,
        generationStage: IngestionStage,
        importStage: IngestionStage,
      ) => {
        setStage(generationStage);
        setProgress(0);
        const file = await generateDriveRecording(preset.rows, role, setProgress);
        setStage(importStage);
        setProgress(0);
        const result = await client.import(
          file,
          {
            timestampColumn: 'Timestamp',
            timestampEncoding: 'unix-seconds',
          },
          setProgress,
        );
        return {
          dataset: result.dataset,
          bytes: file.size,
          ingestionDurationMs: result.ingestionDurationMs,
        };
      };

      try {
        // Sequential imports let each generated CSV become collectible before the next is created.
        const referenceResult = await ingestRole('reference', 0, 1);
        reference = referenceResult.dataset;
        const comparisonResult = await ingestRole('comparison', 2, 3);
        comparison = comparisonResult.dataset;
        onComplete(reference, comparison, {
          ingestionDurationMs:
            referenceResult.ingestionDurationMs + comparisonResult.ingestionDurationMs,
          totalBytes: referenceResult.bytes + comparisonResult.bytes,
        });
        onOpenChange(false);
      } catch (cause) {
        if (reference) client.releaseDataset(reference.id);

        if (comparison) client.releaseDataset(comparison.id);

        setError(resolveIngestionFailure(cause));
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [client, onComplete, onOpenChange],
  );

  return { running, stage, progress, error, start, reset };
}
