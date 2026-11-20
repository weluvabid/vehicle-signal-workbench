'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import { calculateTimelineOverlap } from '@/features/measurements/alignment';
import { suggestChannelMappings } from '@/features/measurements/channel-mapping';
import { MAPPING_COMPATIBILITY } from '@/features/measurements/mapping-constants';
import type { DatasetDescriptor } from '@/features/measurements/model';

const COMPARISON_OFFSET_SECONDS = 0;
const MAX_VISIBLE_SIGNALS = 3;

export function useComparisonWorkspace() {
  const [client] = useState(() => new MeasurementWorkerClient());
  const [reference, setReference] = useState<DatasetDescriptor | null>(null);
  const [comparison, setComparison] = useState<DatasetDescriptor | null>(null);

  useEffect(() => () => client.dispose(), [client]);

  const overlap = useMemo(() => {
    if (!reference || !comparison) return null;

    return calculateTimelineOverlap(
      reference.durationSeconds,
      comparison.durationSeconds,
      COMPARISON_OFFSET_SECONDS,
    );
  }, [reference, comparison]);

  const compatibleMappings = useMemo(() => {
    if (!reference || !comparison) return [];

    return suggestChannelMappings(reference, comparison).filter(
      (mapping) => mapping.compatibility === MAPPING_COMPATIBILITY.COMPATIBLE && mapping.right,
    );
  }, [reference, comparison]);

  const selectedSignals = useMemo(
    () =>
      compatibleMappings.slice(0, MAX_VISIBLE_SIGNALS).flatMap((mapping) =>
        mapping.right
          ? [
              {
                referenceChannelId: mapping.left.id,
                comparisonChannelId: mapping.right.id,
              },
            ]
          : [],
      ),
    [compatibleMappings],
  );

  const setRun = useCallback(
    (role: 'reference' | 'comparison', dataset: DatasetDescriptor | null) => {
      const previous = role === 'reference' ? reference : comparison;

      if (previous && previous.id !== dataset?.id) client.releaseDataset(previous.id);

      if (role === 'reference') setReference(dataset);
      else setComparison(dataset);
    },
    [client, comparison, reference],
  );

  return {
    client,
    reference,
    comparison,
    offset: COMPARISON_OFFSET_SECONDS,
    overlap,
    compatibleMappings,
    selectedSignals,
    setRun,
  };
}
