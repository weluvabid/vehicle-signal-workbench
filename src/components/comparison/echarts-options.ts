import type { EChartsOption } from 'echarts';
import type { SignalChartPanel } from './signal-chart-types';
import { createTooltipFormatter } from './chart-tooltip';
import { createPanelSeries } from './chart-series';
import { formatChartValue } from './chart-value-format';
import { CHART_DATA_ZOOM_IDS, getVerticalZoomId } from '@/intents/chart-intents';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';

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
  getPointerTime: () => number | null = () => null,
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
  const plotTop = 64;
  const leftGutter = 10;
  const rightGutter = 10;
  const axisLabelFontSize = 10;
  const xAxisSplitNumber = 10;
  const cardHeight = panelSlot - cardGap;
  const plotHeight = Math.max(48, cardHeight - 92);
  const yAxisSplitNumber = Math.max(2, Math.min(isNarrow ? 4 : 5, Math.floor(plotHeight / 34)));

  return {
    animation: false,
    backgroundColor: 'transparent',
    textStyle: {
      color: '#c4c9d2',
      fontFamily: 'Atkinson Hyperlegible, Arial, sans-serif',
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
      z: 1000,
      backgroundColor: 'var(--popover)',
      borderColor: 'var(--border)',
      borderWidth: 1,
      borderRadius: 8,
      padding: 10,
      textStyle: { color: 'var(--popover-foreground)', fontSize: 11, lineHeight: 18 },
      formatter: createTooltipFormatter(panels, getPointerTime),
    },
    xAxis: panels.map((panel, index) => {
      const isLastVisible = index === lastVisibleIndex;
      return {
        type: 'value' as const,
        gridIndex: index,
        show: panel.visible,
        min: domainStartSeconds,
        max: domainEndSeconds,
        name: isLastVisible ? LABELS.elapsedTime : '',
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
        id: CHART_DATA_ZOOM_IDS.horizontalInside,
        type: 'inside',
        start: (1 - initialVisibleFraction) * 100,
        end: 100,
        xAxisIndex: axisIndexes,
        filterMode: 'none',
        minSpan: 5,
        zoomOnMouseWheel: false,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
        preventDefaultMouseMove: true,
        throttle: 80,
      },
      {
        id: CHART_DATA_ZOOM_IDS.horizontalSlider,
        type: 'slider',
        start: (1 - initialVisibleFraction) * 100,
        end: 100,
        xAxisIndex: axisIndexes,
        minSpan: 5,
        left: 0,
        right: 0,
        height: 16,
        handleSize: 14,
        moveHandleSize: 10,
        bottom: 10,
        borderRadius: 7,
        borderColor: '#30343b',
        backgroundColor: '#111214',
        fillerColor: 'rgba(196, 201, 210, 0.16)',
        handleStyle: { color: '#a1a1aa', borderColor: '#d4d4d8', borderWidth: 1 },
        moveHandleStyle: { color: '#71717a', borderColor: '#a1a1aa' },
        emphasis: {
          handleStyle: { color: '#e4e4e7', borderColor: '#f4f4f5' },
          moveHandleStyle: { color: '#a1a1aa', borderColor: '#d4d4d8' },
        },
        textStyle: { color: LABEL_COLOR },
        showDataShadow: false,
        showDetail: true,
        brushSelect: false,
        throttle: 80,
      },
      ...panels.map((_, index) => ({
        id: getVerticalZoomId(index),
        type: 'inside' as const,
        orient: 'vertical' as const,
        yAxisIndex: [index],
        filterMode: 'none' as const,
        zoomOnMouseWheel: false,
        moveOnMouseWheel: false,
        throttle: 80,
      })),
    ],
    series,
    aria: { enabled: true },
  };
}

