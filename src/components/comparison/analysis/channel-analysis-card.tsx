import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { COMPARISON_LABELS as LABELS } from '@/constants/comparison-labels';
import { formatChannelStatistics, formatMeasurementValue } from '@/features/measurements/formatting';
import type { MetricsQueryResult } from '@/features/ingestion/worker-protocol';
import type { SignalSelection } from '@/features/comparison/types';

interface ChannelAnalysisCardProps {
  readonly selection: SignalSelection;
  readonly index: number;
  readonly label: string;
  readonly unit: string | null | undefined;
  readonly panel: MetricsQueryResult['panels'][number] | undefined;
}

export function ChannelAnalysisCard({ selection, index, label, unit, panel }: ChannelAnalysisCardProps) {
  const reference = panel ? formatChannelStatistics(panel.referenceStatistics) : null;
  const comparison = panel ? formatChannelStatistics(panel.comparisonStatistics) : null;
  const difference = panel?.differenceStatistics;
  const statistics = [
    [LABELS.minimum, reference?.min ?? '—', comparison?.min ?? '—'],
    [LABELS.maximum, reference?.max ?? '—', comparison?.max ?? '—'],
    [LABELS.average, reference?.mean ?? '—', comparison?.mean ?? '—'],
    [LABELS.standardDeviation, reference?.standardDeviation ?? '—', comparison?.standardDeviation ?? '—'],
    [LABELS.validSamples, reference?.valid ?? '—', comparison?.valid ?? '—'],
    [LABELS.missingSamples, reference?.missing ?? '—', comparison?.missing ?? '—'],
  ] as const;
  const coverage = difference
    ? `${((difference.matchedCount / Math.max(1, difference.matchedCount + difference.unavailableCount)) * 100).toFixed(2)}%`
    : '—';
  const rows = [
    [LABELS.bias, formatMeasurementValue(difference?.bias ?? null)],
    [LABELS.meanAbsoluteError, formatMeasurementValue(difference?.meanAbsoluteError ?? null)],
    [LABELS.rootMeanSquareError, formatMeasurementValue(difference?.rootMeanSquareError ?? null)],
    [LABELS.maximumDeviation, formatMeasurementValue(difference?.maximumAbsoluteError ?? null)],
    [LABELS.matched, difference?.matchedCount.toLocaleString() ?? '—'],
    [LABELS.unavailable, difference?.unavailableCount.toLocaleString() ?? '—'],
    [LABELS.matchCoverage, coverage],
  ] as const;

  return (
    <Card key={`${selection.referenceChannelId}:${selection.comparisonChannelId}`} size="sm" className="min-w-0 bg-card/40">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: ['#a1a1aa', '#60a5fa', '#d6a85f', '#34d399', '#c084fc', '#f472b6'][index % 6] }} />
          <CardTitle className="truncate text-sm">{label}</CardTitle>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{unit ?? '—'}</span>
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{difference?.matchedCount.toLocaleString() ?? '—'} {LABELS.matched.toLowerCase()}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent">
            <TableHead className="h-8 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">{LABELS.measurement}</TableHead>
            <TableHead className="h-8 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">{LABELS.reference}</TableHead>
            <TableHead className="h-8 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">{LABELS.comparison}</TableHead>
          </TableRow></TableHeader>
          <TableBody>{statistics.map(([name, referenceValue, comparisonValue]) => (
            <TableRow key={name}>
              <TableCell className="px-2 py-2 text-xs text-muted-foreground">{name}</TableCell>
              <TableCell className="px-2 py-2 font-mono text-xs tabular-nums">{referenceValue}</TableCell>
              <TableCell className="px-2 py-2 font-mono text-xs tabular-nums">{comparisonValue}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
        <div className="border-t pt-3">
          <h4 className="mb-2 text-xs font-semibold">{LABELS.comparisonAnalysis}</h4>
          <div className="divide-y divide-border/70">{rows.slice(0, 4).map(([name, value]) => <ReceiptRow key={name} label={name} value={value} />)}</div>
          <div className="mt-3 border-t pt-2"><div className="divide-y divide-border/70">{rows.slice(4).map(([name, value]) => <ReceiptRow key={name} label={name} value={value} />)}</div></div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReceiptRow({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="flex items-center justify-between gap-4 py-2"><span className="text-xs text-muted-foreground">{label}</span><span className="text-right font-mono text-sm font-medium tabular-nums">{value}</span></div>;
}
