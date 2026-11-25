import type uPlot from 'uplot';
import { resolveSamplingPixelWidth } from '@/features/comparison/chart/sampling-budget';
import { clampChartRange, type ChartViewport } from '@/features/comparison/chart/chart-range';
import { MAX_CHART_ZOOM_FACTOR } from '@/features/comparison/chart/chart-constants';

function plotWidth(element: HTMLElement): number {
  return Math.max(1, Math.floor(element.getBoundingClientRect().width));
}

export function createNavigationPlugin(
  domainStart: number,
  domainEnd: number,
  notify: (range: ChartViewport, width: number) => void,
  inspect: (time: number, clientX: number, clientY: number) => void,
): uPlot.Plugin {
  return {
    hooks: {
      ready: [
        (u) => {
          const over = u.over;
          let drag: { pointerId: number; x: number; min: number; max: number } | null = null;
          let frame = 0;
          let pending: ChartViewport | null = null;
          let inspectFrame = 0;
          let pendingInspection: { time: number; clientX: number; clientY: number } | null = null;
          const pointerMove = (event: PointerEvent) => {
            const bounds = over.getBoundingClientRect();
            const x = event.clientX - bounds.left;
            const time = u.posToVal(x, 'x');

            if (!Number.isFinite(time)) return;

            pendingInspection = { time, clientX: event.clientX, clientY: event.clientY };

            if (inspectFrame) return;

            inspectFrame = requestAnimationFrame(() => {
              inspectFrame = 0;

              if (pendingInspection)
                inspect(
                  pendingInspection.time,
                  pendingInspection.clientX,
                  pendingInspection.clientY,
                );

              pendingInspection = null;
            });
          };
          const emit = (min: number, max: number) => {
            pending = clampChartRange(min, max, domainStart, domainEnd);

            if (frame) return;

            frame = requestAnimationFrame(() => {
              frame = 0;

              if (!pending) return;

              const next = pending;
              pending = null;
              u.setScale('x', next);
              notify(next, resolveSamplingPixelWidth(plotWidth(over)));
            });
          };
          const down = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || event.button !== 0) return;

            const scale = u.scales.x;

            if (scale.min === undefined || scale.max === undefined) return;

            drag = { pointerId: event.pointerId, x: event.clientX, min: scale.min, max: scale.max };
            over.setPointerCapture(event.pointerId);
            event.preventDefault();
          };
          const move = (event: PointerEvent) => {
            if (!drag || drag.pointerId !== event.pointerId) return;

            const delta = ((event.clientX - drag.x) / plotWidth(over)) * (drag.max - drag.min);
            emit(drag.min - delta, drag.max - delta);
          };
          const up = (event: PointerEvent) => {
            if (!drag || drag.pointerId !== event.pointerId) return;

            drag = null;

            if (over.hasPointerCapture(event.pointerId))
              over.releasePointerCapture(event.pointerId);
          };
          const wheel = (event: WheelEvent) => {
            if (!(event.ctrlKey || event.metaKey || event.shiftKey)) return;

            const scale = u.scales.x;

            if (scale.min === undefined || scale.max === undefined) return;

            const delta = event.deltaY || event.deltaX;

            if (!Number.isFinite(delta) || delta === 0) return;

            event.preventDefault();
            event.stopPropagation();
            const span = scale.max - scale.min;

            if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
              const shift = (delta / 100) * span * 0.08;
              emit(scale.min + shift, scale.max + shift);
              return;
            }

            const factor = Math.exp(Math.max(-2, Math.min(2, delta * 0.002)));
            const nextSpan = Math.min(
              domainEnd - domainStart,
              Math.max((domainEnd - domainStart) / MAX_CHART_ZOOM_FACTOR, span * factor),
            );
            const bounds = over.getBoundingClientRect();
            const fraction = Math.min(
              1,
              Math.max(0, (event.clientX - bounds.left) / Math.max(1, bounds.width)),
            );
            const anchor = scale.min + span * fraction;
            emit(anchor - nextSpan * fraction, anchor + nextSpan * (1 - fraction));
          };
          over.addEventListener('pointermove', pointerMove);
          over.addEventListener('pointerdown', down);
          over.addEventListener('pointermove', move);
          over.addEventListener('pointerup', up);
          over.addEventListener('pointercancel', up);
          over.addEventListener('wheel', wheel, { passive: false });
          (u as uPlot & { __vswCleanup?: () => void }).__vswCleanup = () => {
            if (frame) cancelAnimationFrame(frame);

            if (inspectFrame) cancelAnimationFrame(inspectFrame);

            over.removeEventListener('pointermove', pointerMove);
            over.removeEventListener('pointerdown', down);
            over.removeEventListener('pointermove', move);
            over.removeEventListener('pointerup', up);
            over.removeEventListener('pointercancel', up);
            over.removeEventListener('wheel', wheel);
          };
        },
      ],
      destroy: [(u) => (u as uPlot & { __vswCleanup?: () => void }).__vswCleanup?.()],
    },
  };
}
