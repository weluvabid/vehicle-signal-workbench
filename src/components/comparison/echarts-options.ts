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
const MIN_VIEWPORT_SPAN_SECONDS = 0.1;

type TooltipItem = {
  readonly axisValue?: string | number;
};

function tooltipItems(value: unknown): TooltipItem[] {
  if (Array.isArray(value)) return value as TooltipItem[];
  return value && typeof value === 'object' ? [value as TooltipItem] : [];
}

/** Samples the exact line currently rendered by ECharts at the pointer's x coordinate. */
function sampleRenderedSeries(
  points: SignalChartPanel['reference'],
  targetSeconds: number,
): number | null {
  if (!Number.isFinite(targetSeconds) || points.length === 0) return null;
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (points[middle][0] < targetSeconds) low = middle + 1;
    else high = middle;
  }

  const right = points[low];
  if (right && Math.abs(right[0] - targetSeconds) <= 1e-9) {
    return right[1] !== null && Number.isFinite(right[1]) ? right[1] : null;
  }
  const left = points[low - 1];
  if (!left || !right || left[1] === null || right[1] === null ||
      !Number.isFinite(left[1]) || !Number.isFinite(right[1])) return null;
  const span = right[0] - left[0];
  if (!(span > 0)) return null;
  const fraction = (targetSeconds - left[0]) / span;
  return left[1] + (right[1] - left[1]) * fraction;
}

function escapeTooltipText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function createTooltipFormatter(
  panels: readonly SignalChartPanel[],
  getPointerTime: () => number | null,
) {
  return (rawParams: unknown): string => {
    const items = tooltipItems(rawParams);
    if (items.length === 0) return '';
    const axisValue = items.find((item) => item.axisValue !== undefined)?.axisValue;
    // ECharts axis-tooltip params expose the nearest rendered data point, not
    // the pointer coordinate. Prefer the unsnapped axis-pointer value so the
    // tooltip can interpolate continuously between envelope representatives.
    const pointerTime = getPointerTime();
    const time = pointerTime !== null && Number.isFinite(pointerTime)
      ? pointerTime
      : Number(axisValue);
    if (!Number.isFinite(time)) return '';
    const rows: string[] = [];

    for (const panel of panels) {
      if (!panel.visible) continue;
      const reference = panel.referenceVisible === false ? null : sampleRenderedSeries(panel.reference, time);
      const comparison = panel.comparisonVisible === false ? null : sampleRenderedSeries(panel.comparison, time);
      const difference = reference !== null && comparison !== null ? reference - comparison : null;
      rows.push(
        `<div class="vsw-chart-tooltip__channel"><strong>${escapeTooltipText(panel.label)}</strong> <span>${escapeTooltipText(panel.unit ?? '')}</span></div>`,
        `<div class="vsw-chart-tooltip__row">Reference: <span>${reference === null ? 'Missing' : formatChartValue(reference)}</span></div>`,
        `<div class="vsw-chart-tooltip__row">Comparison: <span>${comparison === null ? 'Missing' : formatChartValue(comparison)}</span></div>`,
        `<div class="vsw-chart-tooltip__row">Difference (Ref − Comp): <strong>${difference === null ? 'Unavailable' : formatChartValue(difference)}</strong></div>`,
      );
    }

    return `<div class="vsw-chart-tooltip__content"><div class="vsw-chart-tooltip__time">Time: ${formatChartValue(time)} s</div>${rows.join('')}</div>`;
  };
}

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
      className: 'vsw-chart-tooltip',
      appendTo: 'body',
      z: 1000,
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      padding: 0,
      textStyle: { color: 'var(--popover-foreground)', fontSize: 11 },
      extraCssText: 'box-shadow:none;border:0;',
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
        minValueSpan: MIN_VIEWPORT_SPAN_SECONDS,
        zoomOnMouseWheel: false,
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
        minValueSpan: MIN_VIEWPORT_SPAN_SECONDS,
        left: '4%',
        right: '4%',
        height: 14,
        handleSize: 10,
        moveHandleSize: 8,
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
        showDetail: false,
        brushSelect: false,
        throttle: 80,
      },
      ...panels.map((_, index) => ({
        id: `signal-y-inside-${index}`,
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

function createPanelSeries(panel: SignalChartPanel, index: number) {
  // Viewport-bounded arrays are passed through without copying.
  return [
    ...(panel.referenceVisible === false ? [] : [{
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
    }]),
    ...(panel.comparisonVisible === false ? [] : [{
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
    }]),
  ];
}
