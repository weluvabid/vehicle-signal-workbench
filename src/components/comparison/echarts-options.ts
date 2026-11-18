import type { EChartsOption } from 'echarts';
import type { SignalChartPanel } from './signal-chart-types';

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const PANEL_GAP = 330;
const AXIS_COLOR = '#454b55';
const GRID_COLOR = '#25292f';
const LABEL_COLOR = '#858b95';

export function createSignalChartOption(
  panels: readonly SignalChartPanel[],
  domainStartSeconds: number,
  domainEndSeconds: number,
): EChartsOption {
  const axisCount = panels.length * 2;
  const axisIndexes = Array.from({ length: axisCount }, (_, index) => index);
  const series = panels.flatMap(createPanelSeries);

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: {
      color: '#aeb4be',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 10,
    },
    grid: createGrids(axisCount),
    title: createTitles(panels),
    legend: {
      top: 7,
      right: 16,
      type: 'scroll',
      itemWidth: 16,
      itemHeight: 2,
      textStyle: { color: '#b6bbc3', fontSize: 10 },
      data: series.map((item) => item.name),
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', snap: false },
      backgroundColor: '#171a1f',
      borderColor: AXIS_COLOR,
      textStyle: { color: '#f1f2f3', fontSize: 10 },
      valueFormatter: (value) => value === null || value === undefined ? 'Missing' : numberFormatter.format(Number(value)),
    },
    xAxis: createXAxis(axisCount, domainStartSeconds, domainEndSeconds),
    yAxis: createYAxis(panels),
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
        height: 18,
        bottom: 12,
        borderColor: '#30343b',
        backgroundColor: '#171a1f',
        fillerColor: 'rgba(174, 180, 190, 0.16)',
        handleStyle: { color: '#aeb4be', borderColor: '#d7dbe1' },
        textStyle: { color: LABEL_COLOR },
        showDataShadow: false,
        showDetail: false,
        throttle: 80,
      },
    ],
    series,
    aria: { enabled: true },
  };
}

function createGrids(axisCount: number) {
  return Array.from({ length: axisCount }, (_, index) => ({
    top: 38 + Math.floor(index / 2) * PANEL_GAP + (index % 2) * 164,
    left: 76,
    right: 28,
    height: 112,
    containLabel: true,
  }));
}

function createXAxis(axisCount: number, start: number, end: number) {
  return Array.from({ length: axisCount }, (_, index) => ({
    type: 'value' as const,
    gridIndex: index,
    min: start,
    max: end,
    name: index === axisCount - 1 ? 'Elapsed time (s)' : '',
    nameLocation: 'middle' as const,
    nameGap: 31,
    axisLine: { lineStyle: { color: AXIS_COLOR } },
    axisTick: { lineStyle: { color: AXIS_COLOR } },
    axisLabel: { color: LABEL_COLOR, hideOverlap: true },
    splitLine: { lineStyle: { color: GRID_COLOR, type: 'dashed' as const } },
    nameTextStyle: { color: LABEL_COLOR, fontSize: 10 },
  }));
}

function createYAxis(panels: readonly SignalChartPanel[]) {
  return panels.flatMap((panel, index) => ([
    createYAxisConfig(index * 2, panel.unit ?? 'Value'),
    createYAxisConfig(index * 2 + 1, `Δ ${panel.unit ?? 'Value'}`),
  ]));
}

function createYAxisConfig(gridIndex: number, name: string) {
  return {
    type: 'value' as const,
    gridIndex,
    name,
    nameLocation: 'middle' as const,
    nameGap: 52,
    scale: true,
    axisLine: { show: true, lineStyle: { color: AXIS_COLOR } },
    axisTick: { lineStyle: { color: AXIS_COLOR } },
    axisLabel: { color: LABEL_COLOR, hideOverlap: true },
    splitLine: { lineStyle: { color: GRID_COLOR, type: 'dashed' as const } },
    nameTextStyle: { color: LABEL_COLOR, fontSize: 10 },
  };
}

function createPanelSeries(panel: SignalChartPanel, index: number) {
  // The arrays are viewport-bounded and owned by the UI. ECharts receives them
  // directly; copying them here would add three allocations per panel update.
  return [
    {
      id: `${panel.id}-reference`,
      name: `${panel.label} · Reference`,
      type: 'line' as const,
      xAxisIndex: index * 2,
      yAxisIndex: index * 2,
      data: panel.reference,
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { color: '#e5e7eb', width: 1.4 },
      emphasis: { focus: 'series' as const, lineStyle: { width: 2 } },
    },
    {
      id: `${panel.id}-comparison`,
      name: `${panel.label} · Comparison`,
      type: 'line' as const,
      xAxisIndex: index * 2,
      yAxisIndex: index * 2,
      data: panel.comparison,
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { color: '#929ba8', width: 1.4, type: 'dashed' as const },
      emphasis: { focus: 'series' as const, lineStyle: { width: 2 } },
    },
    {
      id: `${panel.id}-delta`,
      name: `${panel.label} · Δ (Reference − Comparison)`,
      type: 'line' as const,
      xAxisIndex: index * 2 + 1,
      yAxisIndex: index * 2 + 1,
      data: panel.delta,
      showSymbol: false,
      connectNulls: false,
      smooth: false,
      lineStyle: { color: '#d6a85f', width: 1.35 },
      emphasis: { focus: 'series' as const, lineStyle: { width: 2 } },
    },
  ];
}

function createTitles(panels: readonly SignalChartPanel[]) {
  return panels.flatMap((panel, index) => ([
    {
      text: panel.label,
      subtext: panel.unit ?? 'Unit unspecified',
      left: 76,
      top: 5 + index * PANEL_GAP,
      itemGap: 2,
      textStyle: { color: '#d2d5da', fontSize: 11, fontWeight: 500 },
      subtextStyle: { color: LABEL_COLOR, fontSize: 9 },
    },
    {
      text: 'Difference · Reference − Comparison',
      subtext: 'Interpolated on reference timestamps',
      left: 76,
      top: 169 + index * PANEL_GAP,
      itemGap: 2,
      textStyle: { color: '#d6a85f', fontSize: 10, fontWeight: 500 },
      subtextStyle: { color: LABEL_COLOR, fontSize: 9 },
    },
  ]));
}
