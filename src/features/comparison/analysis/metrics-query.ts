import type { DatasetDescriptor } from '@/features/measurements/model';
import type { SignalSelection } from '@/features/comparison/types';
import { createChannelLookup, getSignalColor } from '../chart/signal-presentation';

export interface MetricsPanelQuery {
  readonly referenceChannelId: string;
  readonly comparisonChannelId: string;
  readonly label: string;
  readonly unit: string | null;
  readonly color: string;
}

/** Purely maps UI selections and dataset metadata to the worker query shape. */
export function buildMetricsPanelQueries(
  selections: readonly SignalSelection[],
  reference: DatasetDescriptor,
): readonly MetricsPanelQuery[] {
  const channelById = createChannelLookup(reference.channels);
  return selections.map((selection, index) => {
    const channel = channelById.get(selection.referenceChannelId);
    return {
      referenceChannelId: selection.referenceChannelId,
      comparisonChannelId: selection.comparisonChannelId,
      label: channel?.label ?? selection.referenceChannelId,
      unit: channel?.unit ?? null,
      color: getSignalColor(index),
    };
  });
}
