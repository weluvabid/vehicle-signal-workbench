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
  chartWidth: number,
  initialVisibleFraction = 1,
): EChartsOption {
  const axisIndexes = panels.map((_, index) => index);
  const lastVisibleIndex = panels.reduce((last, panel, index) => panel.visible ? index : last, -1);
  const series = panels.flatMap((panel, index) => panel.visible ? createPanelSeries(panel, index) : []);
  const sliderReserve = 42;
  const outerInset = 8;
  const cardGap = 14;
  const panelSlot = (chartHeight - sliderReserve - outerInset * 2) / Math.max(1, panels.length);
  const cardTop = (index: number) => outerInset + index * panelSlot;
  const isNarrow = chartWidth < 640;
  const plotTop = 42;
  const leftGutter = 10;
  const rightGutter = 10;
  const axisLabelFontSize = 10;
  const xAxisSplitNumber = 10;
  const cardHeight = panelSlot - cardGap;
  const plotHeight = Math.max(58, cardHeight - 64);
  const yAxisSplitNumber = Math.max(2, Math.min(isNarrow ? 4 : 5, Math.floor(plotHeight / 34)));

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: {
      color: '#c4c9d2',
      fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 11,
    },
    grid: panels.map((_, index) => {
      return {
        top: cardTop(index) + plotTop,
        left: leftGutter,
        right: rightGutter,
        height: plotHeight,
        containLabel: true,
      };
    }),
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', snap: false },
      backgroundColor: '#171a1f',
      borderColor: AXIS_COLOR,
      textStyle: { color: '#f1f2f3', fontSize: 11 },
      valueFormatter: (value) => value === null || value === undefined ? 'Missing' : formatChartValue(Number(value)),
    },
    xAxis: panels.map((panel, index) => {
      const isLastVisible = index === lastVisibleIndex;
      return {
        type: 'value' as const,
        gridIndex: index,
        show: panel.visible,
        min: domainStartSeconds,
        max: domainEndSeconds,
        name: isLastVisible ? 'Elapsed time (s)' : '',
        nameLocation: 'middle' as const,
        nameGap: isNarrow ? 24 : 27,
        axisLine: { show: isLastVisible, lineStyle: { color: AXIS_COLOR } },
        axisTick: { show: isLastVisible, lineStyle: { color: AXIS_COLOR } },
        axisLabel: {
          show: panel.visible && isLastVisible,
          color: LABEL_COLOR,
          hideOverlap: true,
          margin: isNarrow ? 10 : 8,
          fontSize: axisLabelFontSize,
          formatter: (value: number) => formatChartValue(value),
        },
        splitNumber: xAxisSplitNumber,
        splitLine: { show: panel.visible, lineStyle: { color: GRID_COLOR, type: 'dashed' as const } },
        nameTextStyle: { color: LABEL_COLOR, fontSize: isNarrow ? 9 : 10 },
      };
    }),
    yAxis: panels.map((panel, index) => ({
      type: 'value' as const,
      gridIndex: index,
      show: panel.visible,
      scale: true,
      axisLine: { show: true, lineStyle: { color: AXIS_COLOR } },
      axisTick: { lineStyle: { color: AXIS_COLOR } },
      axisLabel: {
        show: panel.visible,
        color: LABEL_COLOR,
        hideOverlap: true,
        width: isNarrow ? 38 : 48,
        margin: isNarrow ? 6 : 8,
        fontSize: axisLabelFontSize,
        overflow: 'truncate' as const,
        formatter: (value: number) => formatChartValue(value),
      },
      splitNumber: yAxisSplitNumber,
      splitLine: { show: panel.visible, lineStyle: { color: GRID_COLOR, type: 'dashed' as const } },
    })),
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      label: { backgroundColor: AXIS_COLOR },
    },
    dataZoom: [
      {
        id: 'viewport-inside',
        type: 'inside',
        start: (1 - initialVisibleFraction) * 100,
        end: 100,
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
        start: (1 - initialVisibleFraction) * 100,
        end: 100,
        xAxisIndex: axisIndexes,
        height: 24,
        handleSize: 14,
        moveHandleSize: 10,
        bottom: 12,
        borderColor: '#30343b',
        backgroundColor: '#171a1f',
        fillerColor: 'rgba(174, 180, 190, 0.2)',
        handleStyle: { color: '#c4c9d2', borderColor: '#f1f2f3' },
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
      lineStyle: { color: '#c4c9d2', width: 1.5, type: 'dashed' as const, opacity: 0.9 },
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
      lineStyle: { color: panel.color, width: 2.2, opacity: 1 },
      emphasis: { focus: 'series' as const, lineStyle: { width: 2.2 } },
    },
  ];
}
