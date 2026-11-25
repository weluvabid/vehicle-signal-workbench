import type { DatasetDescriptor } from '@/features/measurements/model';
import type { SignalPanelResult } from '@/features/comparison/signal-panel-mapper';
import type { SignalSelection } from '@/features/comparison/types';
import type { ComparisonPlotData } from '@/features/measurements/plot-data';
import { createChannelLookup, getSignalColor } from './signal-presentation';
const EMPTY_DATA: ComparisonPlotData = { reference: [], comparison: [] };

/** Pure projection from selected channels and worker results to chart view models. */
export function buildSignalChartPanels(
  selections: readonly SignalSelection[],
  channels: DatasetDescriptor['channels'],
  results: readonly SignalPanelResult[],
) {
  const channelById = createChannelLookup(channels);
  const resultById = new Map(results.map((result) => [result.id, result]));
  return selections.map((selection, index) => {
    const channel = channelById.get(selection.referenceChannelId);
    const result = resultById.get(selection.referenceChannelId);
    return {
      id: selection.referenceChannelId,
      label: channel?.label ?? selection.referenceChannelId,
      unit: channel?.unit ?? null,
      color: getSignalColor(index),
      reference: result?.data.reference ?? EMPTY_DATA.reference,
      comparison: result?.data.comparison ?? EMPTY_DATA.comparison,
    };
  });
}
