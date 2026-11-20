import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';
import { getSignalSummary } from './chart-summary';
import { formatChartValue } from './chart-value-format';
import type { SignalChartPanel } from './signal-chart-types';

interface SignalChartCardProps {
  readonly panel: SignalChartPanel;
  readonly top: number;
  readonly height: number;
  readonly domainStartSeconds: number;
  readonly domainEndSeconds: number;
  readonly visibleStartPercent: number;
  readonly visibleEndPercent: number;
  readonly cursorTime: number | null;
  readonly onToggleSeries: (panelId: string, series: 'reference' | 'comparison') => void;
}

export function SignalChartCard({
  panel,
  top,
  height,
  domainStartSeconds,
  domainEndSeconds,
  visibleStartPercent,
  visibleEndPercent,
  cursorTime,
  onToggleSeries,
}: SignalChartCardProps) {
  const visibleStart =
    domainStartSeconds + ((domainEndSeconds - domainStartSeconds) * visibleStartPercent) / 100;
  const visibleEnd =
    domainStartSeconds + ((domainEndSeconds - domainStartSeconds) * visibleEndPercent) / 100;
  const summary = getSignalSummary(
    panel.reference,
    panel.comparison,
    cursorTime,
    visibleStart,
    visibleEnd,
  );
  const summaryItems = [
    [LABELS.currentValue, summary.current],
    [LABELS.maximumValue, summary.maximum],
    [LABELS.differenceValue, summary.difference],
  ] as const;

  return (
    <>
      <Card
        className="pointer-events-none absolute left-0 right-0 z-0 gap-0 rounded-xl border border-border/70 bg-card/55 p-0 shadow-sm"
        style={{ top, height }}
        aria-hidden="true"
      />
      <CardHeader
        className="pointer-events-none absolute inset-x-0 z-20 flex h-[60px] flex-col items-stretch justify-center gap-1 px-3 py-1.5 sm:px-4"
        style={{ top }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full ring-2 ring-background"
              style={{ backgroundColor: panel.color }}
              aria-hidden="true"
            />
            <CardTitle className="truncate text-sm font-semibold tracking-tight">
              {panel.label}
            </CardTitle>
            <span className="shrink-0 rounded-md bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {panel.unit ?? LABELS.unitUnspecified}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 pl-4 text-[10px] leading-tight sm:max-w-md sm:gap-6 sm:pl-5">
          {summaryItems.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="truncate uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="truncate font-mono text-xs font-medium tabular-nums text-foreground">
                {typeof value === 'number'
                  ? `${label === LABELS.differenceValue && value > 0 ? '+' : ''}${formatChartValue(value)}`
                  : '—'}
              </div>
            </div>
          ))}
        </div>
      </CardHeader>
      <CardFooter
        className="pointer-events-auto absolute z-20 flex h-6 items-center justify-end gap-3 border-0 bg-transparent px-3 py-0 sm:px-4"
        style={{ top: top + height - 24, left: 0, right: 0 }}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={panel.referenceVisible !== false}
          onClick={() => onToggleSeries(panel.id, 'reference')}
          className={`h-auto rounded-sm px-0 py-0 text-[10px] text-muted-foreground transition-opacity ${panel.referenceVisible === false ? 'opacity-40' : 'opacity-100'}`}
          title={`${LABELS.referenceSeries}: ${panel.label}`}
        >
          <span className="w-4 border-t border-dashed border-foreground/70" />
          {LABELS.referenceSeries}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={panel.comparisonVisible !== false}
          onClick={() => onToggleSeries(panel.id, 'comparison')}
          className={`h-auto rounded-sm px-0 py-0 text-[10px] text-muted-foreground transition-opacity ${panel.comparisonVisible === false ? 'opacity-40' : 'opacity-100'}`}
          title={`${LABELS.comparisonSeries}: ${panel.label}`}
        >
          <span className="w-4 border-t-2" style={{ borderColor: panel.color }} />
          {LABELS.comparisonSeries}
        </Button>
      </CardFooter>
    </>
  );
}
