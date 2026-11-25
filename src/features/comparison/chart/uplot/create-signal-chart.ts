import uPlot from 'uplot';
import type { SignalChartPanel } from '@/features/comparison/chart/signal-chart-types';
import type { ChartViewport } from '@/features/comparison/chart/chart-range';
import { resolveSamplingPixelWidth } from '@/features/comparison/chart/sampling-budget';
import { formatChartNumber } from '@/features/measurements/number-format';
import { COMPARISON_LABELS } from '@/constants/comparison-labels';
import { createNavigationPlugin } from './navigation-plugin';

interface CreateSignalChartOptions {
  readonly host: HTMLElement;
  readonly panel: SignalChartPanel;
  readonly index: number;
  readonly count: number;
  readonly data: uPlot.AlignedData;
  readonly domainStart: number;
  readonly domainEnd: number;
  readonly initialRange: ChartViewport;
  readonly onViewport: (range: ChartViewport, width: number) => void;
  readonly onInspect: (time: number, clientX: number, clientY: number, toggle?: boolean) => void;
  readonly onInitialViewport: (range: ChartViewport, width: number) => void;
}

export function createSignalChart(options: CreateSignalChartOptions): uPlot {
  const {
    host,
    panel,
    index,
    count,
    data,
    domainStart,
    domainEnd,
    initialRange,
    onViewport,
    onInspect,
    onInitialViewport,
  } = options;
  const width = Math.max(1, Math.floor(host.clientWidth));
  const height = Math.max(180, Math.floor(host.clientHeight));
  const computedStyle = getComputedStyle(host);
  const foreground = computedStyle.color || '#c4c9d2';
  const border = computedStyle.borderTopColor || '#3f3f46';
  const plotWidth = (element: HTMLElement) =>
    Math.max(1, Math.floor(element.getBoundingClientRect().width));
  const plugin = createNavigationPlugin(domainStart, domainEnd, onViewport, onInspect);

  const chart = new uPlot(
    {
      width,
      height,
      class: 'vsw-uplot',
      plugins: [plugin],
      scales: {
        x: { time: false },
        y: {
          auto: true,
          range: (_u, min, max) => {
            if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];

            if (min === max) {
              const padding = Math.max(Math.abs(min) * 0.05, 1);
              return [min - padding, max + padding];
            }

            const padding = (max - min) * 0.06;
            return [min - padding, max + padding];
          },
        },
      },
      axes: [
        {
          show: index === count - 1,
          stroke: foreground,
          grid: { stroke: border, width: 1, dash: [3, 4] },
          ticks: { stroke: border, width: 1 },
          values: (_u, values) => values.map((value) => `${formatChartNumber(value)} s`),
          size: index === count - 1 ? 34 : 0,
        },
        {
          scale: 'y',
          side: 3,
          stroke: foreground,
          grid: { stroke: border, width: 1, dash: [3, 4] },
          ticks: { stroke: border, width: 1 },
          values: (_u, values) => values.map(formatChartNumber),
          size: 58,
        },
      ],
      series: [
        {},
        {
          label: COMPARISON_LABELS.referenceSeries,
          stroke: panel.color,
          width: 1.25,
          alpha: 0.7,
          dash: [5, 4],
          spanGaps: false,
          paths: uPlot.paths.linear?.(),
        },
        {
          label: COMPARISON_LABELS.comparisonSeries,
          stroke: panel.color,
          width: 2,
          spanGaps: false,
          paths: uPlot.paths.linear?.(),
        },
      ],
      cursor: {
        show: true,
        drag: { x: false, y: false, setScale: false },
        points: { show: false },
        sync: { key: 'vsw-comparison' },
      },
      legend: { show: false },
    },
    data,
    host,
  );

  chart.setScale('x', initialRange);

  if (index === 0)
    onInitialViewport(initialRange, resolveSamplingPixelWidth(plotWidth(chart.over)));

  return chart;
}
