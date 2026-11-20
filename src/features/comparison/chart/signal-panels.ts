import type { DatasetDescriptor } from '@/features/measurements/model';
import type { SignalPanelResult } from '@/features/comparison/signal-panel-mapper';
import type { SignalSelection } from '@/features/comparison/types';
import type { ComparisonPlotData } from '@/features/measurements/plot-data';

const SERIES_COLORS = ['#a78bfa', '#60a5fa', '#d6a85f', '#34d399', '#c084fc', '#f472b6'] as const;
const EMPTY_DATA: ComparisonPlotData = { reference: [], comparison: [] };

/** Pure projection from selected channels and worker results to chart view models. */
export function buildSignalChartPanels(
  selections: readonly SignalSelection[],
  channels: DatasetDescriptor['channels'],
  results: readonly SignalPanelResult[],
) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  return selections.map((selection, index) => {
    const channel = channels.find((item) => item.id === selection.referenceChannelId);
    const result = resultById.get(selection.referenceChannelId);
    return {
      id: selection.referenceChannelId,
      label: channel?.label ?? selection.referenceChannelId,
      unit: channel?.unit ?? null,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      reference: result?.data.reference ?? EMPTY_DATA.reference,
      comparison: result?.data.comparison ?? EMPTY_DATA.comparison,
      visible: true,
    };
  });
}
