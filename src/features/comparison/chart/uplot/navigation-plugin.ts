import type uPlot from 'uplot';
import { resolveSamplingPixelWidth } from '@/features/comparison/chart/sampling-budget';
import { clampChartRange, type ChartViewport } from '@/features/comparison/chart/chart-range';
import {
  INSPECTION_MIN_VIEWPORT_WIDTH,
  MAX_CHART_ZOOM_FACTOR,
} from '@/features/comparison/chart/chart-constants';

function plotWidth(element: HTMLElement): number {
  return Math.max(1, Math.floor(element.getBoundingClientRect().width));
}

export function createNavigationPlugin(
  domainStart: number,
  domainEnd: number,
  notify: (range: ChartViewport, width: number) => void,
  inspect: (time: number, clientX: number, clientY: number, toggle?: boolean) => void,
): uPlot.Plugin {
  return {
    hooks: {
      ready: [
        (u) => {
          const over = u.over;
          let drag: { pointerId: number; x: number; min: number; max: number } | null = null;
          const touchPointers = new Map<
            number,
            { x: number; y: number; startX: number; startY: number }
          >();
          let touchGesture: {
            min: number;
            max: number;
            distance: number;
            anchorTime: number;
            moved: boolean;
          } | null = null;
          let frame = 0;
          let pending: ChartViewport | null = null;
          let inspectFrame = 0;
          let pendingInspection: { time: number; clientX: number; clientY: number } | null = null;
          const boundsFor = () => over.getBoundingClientRect();
          const currentScale = () => {
            const scale = u.scales.x;
            return scale.min === undefined || scale.max === undefined
              ? null
              : { min: scale.min, max: scale.max };
          };
          const rebaseTouchGesture = () => {
            const scale = currentScale();

            if (!scale || touchPointers.size === 0) {
              touchGesture = null;
              return;
            }

            const points = [...touchPointers.values()];

            for (const point of points) {
              point.startX = point.x;
              point.startY = point.y;
            }

            const first = points[0];
            const second = points[1] ?? first;
            const midpointX = (first.x + second.x) / 2;
            const bounds = boundsFor();
            const fraction = Math.min(
              1,
              Math.max(0, (midpointX - bounds.left) / Math.max(1, bounds.width)),
            );
            const distance =
              points.length > 1
                ? Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
                : 1;

            touchGesture = {
              ...scale,
              distance,
              anchorTime: scale.min + (scale.max - scale.min) * fraction,
              moved: false,
            };
          };
          const pointerMove = (event: PointerEvent) => {
            if (touchPointers.size > 0 || window.innerWidth < INSPECTION_MIN_VIEWPORT_WIDTH) return;

            const bounds = boundsFor();
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
            if (event.pointerType === 'touch') {
              touchPointers.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
                startX: event.clientX,
                startY: event.clientY,
              });
              over.setPointerCapture(event.pointerId);
              rebaseTouchGesture();
              event.preventDefault();
              return;
            }

            if (event.button !== 0) return;

            const scale = currentScale();

            if (!scale) return;

            drag = { pointerId: event.pointerId, x: event.clientX, ...scale };
            over.setPointerCapture(event.pointerId);
            event.preventDefault();
          };
          const move = (event: PointerEvent) => {
            if (event.pointerType === 'touch') {
              const point = touchPointers.get(event.pointerId);

              if (!point) return;

              point.x = event.clientX;
              point.y = event.clientY;
              const gesture = touchGesture;

              if (!gesture) {
                rebaseTouchGesture();
                return;
              }

              const points = [...touchPointers.values()];
              const first = points[0];
              const second = points[1] ?? first;
              const midpointX = (first.x + second.x) / 2;
              const bounds = boundsFor();
              const width = Math.max(1, bounds.width);
              const fraction = Math.min(1, Math.max(0, (midpointX - bounds.left) / width));
              const distance =
                points.length > 1
                  ? Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
                  : gesture.distance;
              const moved =
                Math.abs(point.x - point.startX) > 3 || Math.abs(point.y - point.startY) > 3;
              gesture.moved ||= moved;

              if (points.length === 1) {
                const delta = ((point.x - point.startX) / width) * (gesture.max - gesture.min);
                emit(gesture.min - delta, gesture.max - delta);
              } else {
                const initialSpan = gesture.max - gesture.min;
                const nextSpan = Math.min(
                  domainEnd - domainStart,
                  Math.max(
                    (domainEnd - domainStart) / MAX_CHART_ZOOM_FACTOR,
                    (initialSpan * gesture.distance) / distance,
                  ),
                );
                emit(
                  gesture.anchorTime - nextSpan * fraction,
                  gesture.anchorTime + nextSpan * (1 - fraction),
                );
              }

              event.preventDefault();
              return;
            }

            if (!drag || drag.pointerId !== event.pointerId) return;

            const delta = ((event.clientX - drag.x) / plotWidth(over)) * (drag.max - drag.min);
            emit(drag.min - delta, drag.max - delta);
          };
          const up = (event: PointerEvent) => {
            if (event.pointerType === 'touch') {
              const point = touchPointers.get(event.pointerId);

              if (!point) return;

              const gesture = touchGesture;
              const wasTap =
                event.type !== 'pointercancel' &&
                gesture !== null &&
                window.innerWidth >= INSPECTION_MIN_VIEWPORT_WIDTH &&
                !gesture.moved &&
                touchPointers.size === 1;

              if (wasTap) {
                const bounds = boundsFor();
                const time = u.posToVal(event.clientX - bounds.left, 'x');

                if (Number.isFinite(time)) inspect(time, event.clientX, event.clientY, true);
              }

              touchPointers.delete(event.pointerId);

              if (over.hasPointerCapture(event.pointerId))
                over.releasePointerCapture(event.pointerId);

              rebaseTouchGesture();
              return;
            }

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
