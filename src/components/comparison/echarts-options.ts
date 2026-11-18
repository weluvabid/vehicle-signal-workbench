import type { EChartsOption } from 'echarts';
import type { SignalChartPanel } from './signal-chart-types';

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const scientificFormatter = new Intl.NumberFormat(undefined, {
  notation: 'scientific',
  maximumSignificantDigits: 4,
});

function formatChartValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e9 || magnitude < 1e-4)) {
    return scientificFormatter.format(value);
  }
  return numberFormatter.format(Object.is(value, -0) ? 0 : value);
}
const AXIS_COLOR = '#454b55';
const GRID_COLOR = '#25292f';
const LABEL_COLOR = '#858b95';

export function createSignalChartOption(
  panels: readonly SignalChartPanel[],
  domainStartSeconds: number,
  domainEndSeconds: number,
  chartHeight: number,
): EChartsOption {
  const axisIndexes = panels.map((_, index) => index);
  const series = panels.flatMap((panel, index) => panel.visible ? createPanelSeries(panel, index) : []);
  // Reserve space for the shared range slider and distribute plot height evenly.
  const sliderReserve = 42;
  const panelSlot = Math.max(120, (chartHeight - sliderReserve - 12) / Math.max(1, panels.length));
  const plotTop = 30;
  const plotBottomReserve = 42;
  const plotHeight = Math.max(64, panelSlot - plotTop - plotBottomReserve);

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: {
      color: '#aeb4be',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 10,
    },
    grid: panels.map((_, index) => ({
      top: 8 + index * panelSlot + plotTop,
      left: 76,
      right: 28,
      height: plotHeight,
      containLabel: true,
    })),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', snap: false },
      backgroundColor: '#171a1f',
      borderColor: AXIS_COLOR,
      textStyle: { color: '#f1f2f3', fontSize: 10 },
      valueFormatter: (value) => value === null || value === undefined ? 'Missing' : formatChartValue(Number(value)),
    },
    xAxis: panels.map((_, index) => ({
      type: 'value' as const,
      gridIndex: index,
      show: panels[index].visible,
      min: domainStartSeconds,
      max: domainEndSeconds,
      name: index === panels.length - 1 ? 'Elapsed time (s)' : '',
      nameLocation: 'middle' as const,
      nameGap: 29,
      axisLine: { lineStyle: { color: AXIS_COLOR } },
      axisTick: { lineStyle: { color: AXIS_COLOR } },
      axisLabel: { show: panels[index].visible, color: LABEL_COLOR, hideOverlap: true, width: 72, overflow: 'truncate' as const, formatter: (value: number) => formatChartValue(value) },
      splitLine: { show: panels[index].visible, lineStyle: { color: GRID_COLOR, type: 'dashed' as const } },
      nameTextStyle: { color: LABEL_COLOR, fontSize: 10 },
    })),
    yAxis: panels.map((panel, index) => ({
      type: 'value' as const,
      gridIndex: index,
      show: panel.visible,
      name: panel.unit ?? 'Value',
      nameLocation: 'middle' as const,
      nameGap: 52,
      scale: true,
      axisLine: { show: true, lineStyle: { color: AXIS_COLOR } },
      axisTick: { lineStyle: { color: AXIS_COLOR } },
      axisLabel: { show: panel.visible, color: LABEL_COLOR, hideOverlap: true, width: 76, overflow: 'truncate' as const, formatter: (value: number) => formatChartValue(value) },
      splitLine: { show: panel.visible, lineStyle: { color: GRID_COLOR, type: 'dashed' as const } },
      nameTextStyle: { color: LABEL_COLOR, fontSize: 10 },
    })),
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      label: { backgroundColor: AXIS_COLOR },
    },
    dataZoom: [
      {
        id: 'viewport-inside',
        type: 'inside',
        xAxisIndex: axisIndexes,
        filterMode: 'none',
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true,
        throttle: 80,
      },
      {
        id: 'viewport-slider',
        type: 'slider',
        xAxisIndex: axisIndexes,
        height: 24,
        handleSize: 14,
        moveHandleSize: 10,
        bottom: 12,
        borderColor: '#30343b',
        backgroundColor: '#171a1f',
        fillerColor: 'rgba(174, 180, 190, 0.16)',
        handleStyle: { color: '#aeb4be', borderColor: '#d7dbe1' },
        textStyle: { color: LABEL_COLOR },
        showDataShadow: false,
        showDetail: false,
        brushSelect: false,
        throttle: 80,
      },
    ],
    series,
    aria: { enabled: true },
  };
}

function createPanelSeries(panel: SignalChartPanel, index: number) {
  // Viewport-bounded arrays are passed through without copying.
  return [
    {
      id: `${panel.id}-reference`,
      name: `${panel.label} · Reference`,
      type: 'line' as const,
      xAxisIndex: index,
      yAxisIndex: index,
      data: panel.reference,
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { color: panel.color, width: 1.8 },
      emphasis: { focus: 'series' as const, lineStyle: { width: 2.2 } },
    },
    {
      id: `${panel.id}-comparison`,
      name: `${panel.label} · Comparison`,
      type: 'line' as const,
      xAxisIndex: index,
      yAxisIndex: index,
      data: panel.comparison,
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { color: panel.color, width: 1.5, type: 'dashed' as const, opacity: 0.62 },
      emphasis: { focus: 'series' as const, lineStyle: { width: 2.2 } },
    },
  ];
}
