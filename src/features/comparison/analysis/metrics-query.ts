import type { DatasetDescriptor } from '@/features/measurements/model';
import type { SignalSelection } from '@/features/comparison/types';

const SERIES_COLORS = ['#a1a1aa', '#60a5fa', '#d6a85f', '#34d399', '#c084fc', '#f472b6'] as const;

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
  return selections.map((selection, index) => {
    const channel = reference.channels.find((item) => item.id === selection.referenceChannelId);
    return {
      referenceChannelId: selection.referenceChannelId,
      comparisonChannelId: selection.comparisonChannelId,
      label: channel?.label ?? selection.referenceChannelId,
      unit: channel?.unit ?? null,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
    };
  });
}
