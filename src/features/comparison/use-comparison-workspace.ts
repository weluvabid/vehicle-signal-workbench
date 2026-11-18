'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import { calculateTimelineOverlap } from '@/features/measurements/alignment';
import { suggestChannelMappings } from '@/features/measurements/channel-mapping';
import type { ChannelMapping } from '@/features/measurements/channel-mapping';
import type { DatasetDescriptor } from '@/features/measurements/model';
import { MAPPING_COMPATIBILITY, MAPPING_CONFIDENCE } from '@/features/measurements/mapping-constants';

export function useComparisonWorkspace() {
  const [client] = useState(() => new MeasurementWorkerClient());
  const [reference, setReference] = useState<DatasetDescriptor | null>(null);
  const [comparison, setComparison] = useState<DatasetDescriptor | null>(null);
  const [offsetInput, setOffsetInput] = useState('0');
  const [mappings, setMappings] = useState<readonly ChannelMapping[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<readonly string[] | null>(null);

  useEffect(() => () => client.dispose(), [client]);

  const offset = Number(offsetInput);
  const validOffset = offsetInput.trim() !== '' && Number.isFinite(offset);
  const overlap = useMemo(() => {
    if (!reference || !comparison || !validOffset) return null;
    return calculateTimelineOverlap(reference.durationSeconds, comparison.durationSeconds, offset);
  }, [reference, comparison, offset, validOffset]);
  const suggestedMappings = useMemo(
    () => reference && comparison ? suggestChannelMappings(reference, comparison) : [],
    [reference, comparison],
  );
  const compatibleCount = suggestedMappings.filter(
    (mapping) => mapping.compatibility === MAPPING_COMPATIBILITY.COMPATIBLE,
  ).length;
  const effectiveMappings = useMemo(() => mappings.length > 0 ? mappings : suggestedMappings.map((mapping) => ({
    leftChannelId: mapping.left.id,
    rightChannelId: mapping.right?.id ?? null,
    compatibility: mapping.compatibility,
    reason: mapping.reason,
    confidence: mapping.right ? MAPPING_CONFIDENCE.EXACT_LABEL : MAPPING_CONFIDENCE.NONE,
  })), [mappings, suggestedMappings]);
  const compatibleMappings = useMemo(
    () => effectiveMappings.filter(
      (mapping) => mapping.compatibility === MAPPING_COMPATIBILITY.COMPATIBLE && mapping.rightChannelId,
    ),
    [effectiveMappings],
  );
  const effectiveSelectedChannelIds = useMemo(() => {
    if (selectedChannelIds === null) return compatibleMappings.slice(0, 3).map((mapping) => mapping.leftChannelId);
    const validIds = new Set(compatibleMappings.map((mapping) => mapping.leftChannelId));
    return selectedChannelIds.filter((channelId) => validIds.has(channelId));
  }, [compatibleMappings, selectedChannelIds]);
  const selectedSignals = useMemo(() => effectiveSelectedChannelIds.flatMap((channelId) => {
    const mapping = compatibleMappings.find((item) => item.leftChannelId === channelId);
    return mapping?.rightChannelId ? [{
      referenceChannelId: mapping.leftChannelId,
      comparisonChannelId: mapping.rightChannelId,
    }] : [];
  }), [effectiveSelectedChannelIds, compatibleMappings]);

  const toggleSelectedChannel = useCallback((channelId: string, checked: boolean) => {
    setSelectedChannelIds((current) => {
      const active = current ?? effectiveSelectedChannelIds;
      if (checked) {
        if (active.includes(channelId) || active.length >= 6) return active;
        return [...active, channelId];
      }
      return active.filter((item) => item !== channelId);
    });
  }, [effectiveSelectedChannelIds]);
  const setRun = useCallback((role: 'reference' | 'comparison', dataset: DatasetDescriptor | null) => {
    const previous = role === 'reference' ? reference : comparison;
    if (previous && previous.id !== dataset?.id) client.releaseDataset(previous.id);
    setMappings([]);
    setSelectedChannelIds(null);
    if (role === 'reference') setReference(dataset);
    else setComparison(dataset);
  }, [client, comparison, reference]);

  return {
    client, reference, comparison, offset, offsetInput, setOffsetInput, validOffset, overlap,
    suggestedMappings, compatibleCount, compatibleMappings, effectiveSelectedChannelIds,
    selectedSignals, setMappings, setRun, toggleSelectedChannel,
  };
}
