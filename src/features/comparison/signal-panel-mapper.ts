import type { DatasetDescriptor } from '@/features/measurements/model';
import type { ComparisonPlotData } from '@/features/measurements/plot-data';
import { buildComparisonPlotData } from '@/features/measurements/plot-data';
import type { SignalSelection } from './types';

export interface SignalPanelResult {
  readonly id: string;
  readonly label: string;
  readonly unit: string | null;
  readonly data: ComparisonPlotData;
}

interface ComparisonPanelWindow {
  readonly referenceWindow: Parameters<typeof buildComparisonPlotData>[0];
  readonly comparisonWindow: Parameters<typeof buildComparisonPlotData>[1];
}

export function mapComparisonPanels(
  panels: readonly ComparisonPanelWindow[],
  selections: readonly SignalSelection[],
  reference: DatasetDescriptor,
  offsetSeconds: number,
): readonly SignalPanelResult[] {
  if (panels.length !== selections.length) {
    throw new Error(`Expected ${selections.length} comparison panels, received ${panels.length}.`);
  }

  return panels.map((panel, index) => {
    const selection = selections[index];
    const channel = reference.channels.find((item) => item.id === selection.referenceChannelId);
    if (!channel) throw new Error(`Reference channel ${selection.referenceChannelId} is unavailable.`);
    return {
      id: selection.referenceChannelId,
      label: channel.label,
      unit: channel.unit,
      data: buildComparisonPlotData(panel.referenceWindow, panel.comparisonWindow, offsetSeconds),
    };
  });
}
