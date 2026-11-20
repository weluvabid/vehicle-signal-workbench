import type { SignalChartPanel } from './signal-chart-types';
import { COMPARISON_LABELS as LABELS } from '../../constants/comparison-labels.ts';
import { formatChartValue } from './chart-value-format.ts';

function tooltipItems(value: unknown): { readonly axisValue?: string | number }[] {
  if (Array.isArray(value)) return value;

  return value && typeof value === 'object'
    ? [value as { readonly axisValue?: string | number }]
    : [];
}

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

  if (
    !left ||
    !right ||
    left[1] === null ||
    right[1] === null ||
    !Number.isFinite(left[1]) ||
    !Number.isFinite(right[1])
  )
    return null;

  const span = right[0] - left[0];

  if (!(span > 0)) return null;

  return left[1] + (right[1] - left[1]) * ((targetSeconds - left[0]) / span);
}

function escapeTooltipText(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

export function createTooltipFormatter(
  panels: readonly SignalChartPanel[],
  getPointerTime: () => number | null,
) {
  return (rawParams: unknown): string => {
    const items = tooltipItems(rawParams);

    if (items.length === 0) return '';

    const axisValue = items.find((item) => item.axisValue !== undefined)?.axisValue;
    const pointerTime = getPointerTime();
    const time =
      pointerTime !== null && Number.isFinite(pointerTime) ? pointerTime : Number(axisValue);

    if (!Number.isFinite(time)) return '';

    const rows = panels
      .filter((panel) => panel.visible)
      .flatMap((panel) => {
        const reference =
          panel.referenceVisible === false ? null : sampleRenderedSeries(panel.reference, time);
        const comparison =
          panel.comparisonVisible === false ? null : sampleRenderedSeries(panel.comparison, time);
        const difference =
          reference !== null && comparison !== null ? reference - comparison : null;
        return [
          `<strong>${escapeTooltipText(panel.label)}</strong> ${escapeTooltipText(panel.unit ?? '')}`,
          `${LABELS.reference}: ${reference === null ? LABELS.missing : formatChartValue(reference)}`,
          `${LABELS.comparison}: ${comparison === null ? LABELS.missing : formatChartValue(comparison)}`,
          `${LABELS.difference}: ${difference === null ? LABELS.unavailable : formatChartValue(difference)}`,
        ];
      });

    return [`<strong>${LABELS.time}: ${formatChartValue(time)} s</strong>`, ...rows].join('<br/>');
  };
}
