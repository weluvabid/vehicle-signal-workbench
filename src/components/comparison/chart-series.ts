import type { SignalChartPanel } from './signal-chart-types';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';

export function createPanelSeries(panel: SignalChartPanel, index: number) {
  return [
    ...(panel.referenceVisible === false
      ? []
      : [
          {
            id: `${panel.id}-reference`,
            name: `${panel.label} · ${LABELS.referenceSeries}`,
            type: 'line' as const,
            xAxisIndex: index,
            yAxisIndex: index,
            data: panel.reference,
            showSymbol: false,
            connectNulls: false,
            smooth: false,
            lineStyle: { color: '#c4c9d2', width: 1.5, type: 'dashed' as const, opacity: 0.9 },
            emphasis: { focus: 'series' as const, lineStyle: { width: 2.2 } },
          },
        ]),
    ...(panel.comparisonVisible === false
      ? []
      : [
          {
            id: `${panel.id}-comparison`,
            name: `${panel.label} · ${LABELS.comparisonSeries}`,
            type: 'line' as const,
            xAxisIndex: index,
            yAxisIndex: index,
            data: panel.comparison,
            showSymbol: false,
            connectNulls: false,
            smooth: false,
            lineStyle: { color: panel.color, width: 2.2, opacity: 1 },
            emphasis: { focus: 'series' as const, lineStyle: { width: 2.2 } },
          },
        ]),
  ];
}
