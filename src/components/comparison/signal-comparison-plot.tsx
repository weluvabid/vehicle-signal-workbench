'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DatasetDescriptor } from '@/features/measurements/model';
import type { ComparisonPlotData } from '@/features/measurements/plot-data';
import { formatChannelStatistics, formatMeasurementCount, formatMeasurementValue } from '@/features/measurements/formatting';
import { buildSignalPoints } from '@/features/measurements/plot-data';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { CsvExportChannel } from '@/features/ingestion/worker-protocol';
import type { SignalSelection } from '@/features/comparison/types';
import { useSignalViewport } from '@/features/comparison/use-signal-viewport';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const EChartsSignalChart = dynamic(
  () => import('./echarts-signal-chart').then((module) => module.EChartsSignalChart),
  {
    ssr: false,
    loading: () => <p className="py-12 text-center text-sm text-muted-foreground">Initializing interactive chart…</p>,
  },
);

interface SignalComparisonPlotProps {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

const EMPTY_DATA: ComparisonPlotData = { reference: [], comparison: [] };

export function SignalComparisonPlot(props: SignalComparisonPlotProps) {
  const { loading, error, results, resultsRange, requestViewport, selectionKey, setError } = useSignalViewport(props);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportAbortController = useRef<AbortController | null>(null);
  useEffect(() => () => exportAbortController.current?.abort(), []);

  const exportVisibleCsv = useCallback(async () => {
    if (!resultsRange || exporting) return;
    const controller = new AbortController();
    exportAbortController.current = controller;
    setExporting(true);
    setExportProgress(0);
    setError(null);
    try {
      const channels: CsvExportChannel[] = props.selections.map((selection) => {
        const channel = props.reference.channels.find((item) => item.id === selection.referenceChannelId);
        if (!channel) throw new Error(`Reference channel ${selection.referenceChannelId} is unavailable.`);
        return {
          referenceChannelId: selection.referenceChannelId,
          comparisonChannelId: selection.comparisonChannelId,
          label: channel.label,
          unit: channel.unit ?? '',
        };
      });
      const chunks: Blob[] = [new Blob([new Uint8Array([0xef, 0xbb, 0xbf])])];
      const exportedRows = await props.client.exportDifferenceCsv(
        props.reference.id,
        props.comparison.id,
        channels,
        resultsRange.start,
        resultsRange.end,
        props.offsetSeconds,
        (chunk) => chunks.push(new Blob([chunk], { type: 'text/csv;charset=utf-8' })),
        setExportProgress,
        controller.signal,
      );
      if (exportedRows === 0) throw new Error('The selected viewport contains no reference samples to export.');
      const url = URL.createObjectURL(new Blob(chunks, { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `vsw-comparison-${new Date().toISOString().replaceAll(':', '-')}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(cause instanceof Error ? cause.message : 'Unable to export comparison data.');
      }
    } finally {
      if (exportAbortController.current === controller) exportAbortController.current = null;
      setExporting(false);
    }
  }, [exporting, props.client, props.reference, props.comparison, props.selections, props.offsetSeconds, resultsRange, setError]);

  const resultById = useMemo(() => new Map(results.map((result) => [result.id, result])), [results]);
  const chartPanels = useMemo(() => props.selections.map((selection) => {
    const channel = props.reference.channels.find((item) => item.id === selection.referenceChannelId);
    const result = resultById.get(selection.referenceChannelId);
    return {
      id: selection.referenceChannelId,
      label: channel?.label ?? selection.referenceChannelId,
      unit: channel?.unit ?? null,
      reference: result?.data.reference ?? EMPTY_DATA.reference,
      comparison: result?.data.comparison ?? EMPTY_DATA.comparison,
      delta: result ? buildSignalPoints(result.differenceSeries.timeSeconds, result.differenceSeries.delta) : [],
    };
  }), [props.selections, props.reference.channels, resultById]);

  const hasSamples = results.some((result) => result.data.reference.length > 0 || result.data.comparison.length > 0);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col justify-between gap-3 pb-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Synchronized signal overlay</p>
          <CardTitle className="text-base">{props.selections.length} mapped signals</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Native run overlays and a separate delta axis · linked crosshair · exact sampled values in tooltips</p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2"><Badge variant="outline">{loading ? 'Updating' : 'Viewport ready'}</Badge><Button variant="outline" size="sm" type="button" onClick={exportVisibleCsv} disabled={!resultsRange || exporting || loading}>{exporting ? `Exporting ${Math.round(exportProgress * 100)}%…` : 'Export visible CSV'}</Button></div>
      </CardHeader>
      <CardContent className="space-y-4 px-3 pb-4 sm:px-5">
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {!error && (
          <EChartsSignalChart
            key={`${selectionKey}:${props.offsetSeconds}:${props.startSeconds}:${props.endSeconds}`}
            panels={chartPanels}
            domainStartSeconds={props.startSeconds}
            domainEndSeconds={props.endSeconds}
            onViewportChange={requestViewport}
          />
        )}
        {!error && !loading && !hasSamples && (
          <p className="py-8 text-center text-sm text-muted-foreground">No samples are available in the selected overlap window.</p>
        )}
        {results.length > 0 && (
          <div className="space-y-4" aria-live="polite">
            {resultsRange && <p className="signal-statistics-range text-xs text-muted-foreground">Statistics interval: {resultsRange.start.toFixed(3)}–{resultsRange.end.toFixed(3)} s · end exclusive</p>}
            {results.map((result) => {
              const reference = formatChannelStatistics(result.referenceStatistics);
              const comparison = formatChannelStatistics(result.comparisonStatistics);
              const difference = result.differenceStatistics;
              return (
                <section className="signal-statistics overflow-hidden rounded-lg border" key={result.id} aria-label={`${result.label} visible interval statistics`}>
                  <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5 text-sm">
                    <strong>{result.label}</strong>
                    <span className="text-xs text-muted-foreground">{result.unit ?? 'Unit unspecified'}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Run</TableHead><TableHead className="text-right">Samples</TableHead><TableHead className="text-right">Valid</TableHead><TableHead className="text-right">Missing</TableHead><TableHead className="text-right">Min</TableHead><TableHead className="text-right">Max</TableHead><TableHead className="text-right">Mean</TableHead><TableHead className="text-right">Std dev</TableHead></TableRow></TableHeader>
                      <TableBody>
                        <TableRow><TableHead scope="row">Reference</TableHead><TableCell className="text-right tabular-nums">{reference.samples}</TableCell><TableCell className="text-right tabular-nums">{reference.valid}</TableCell><TableCell className="text-right tabular-nums">{reference.missing}</TableCell><TableCell className="text-right tabular-nums">{reference.min}</TableCell><TableCell className="text-right tabular-nums">{reference.max}</TableCell><TableCell className="text-right tabular-nums">{reference.mean}</TableCell><TableCell className="text-right tabular-nums">{reference.standardDeviation}</TableCell></TableRow>
                        <TableRow><TableHead scope="row">Comparison</TableHead><TableCell className="text-right tabular-nums">{comparison.samples}</TableCell><TableCell className="text-right tabular-nums">{comparison.valid}</TableCell><TableCell className="text-right tabular-nums">{comparison.missing}</TableCell><TableCell className="text-right tabular-nums">{comparison.min}</TableCell><TableCell className="text-right tabular-nums">{comparison.max}</TableCell><TableCell className="text-right tabular-nums">{comparison.mean}</TableCell><TableCell className="text-right tabular-nums">{comparison.standardDeviation}</TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div className="signal-difference-summary flex flex-wrap gap-x-5 gap-y-2 border-t px-3 py-3 text-xs text-muted-foreground tabular-nums" aria-label={`${result.label} difference analysis`}>
                    <span><strong className="mr-1 font-medium text-foreground">Δ bias</strong> {formatMeasurementValue(difference.bias)}</span>
                    <span><strong className="mr-1 font-medium text-foreground">MAE</strong> {formatMeasurementValue(difference.meanAbsoluteError)}</span>
                    <span><strong className="mr-1 font-medium text-foreground">RMSE</strong> {formatMeasurementValue(difference.rootMeanSquareError)}</span>
                    <span><strong className="mr-1 font-medium text-foreground">Max |Δ|</strong> {formatMeasurementValue(difference.maximumAbsoluteError)}</span>
                    <span><strong className="mr-1 font-medium text-foreground">Matched</strong> {formatMeasurementCount(difference.matchedCount)} / {formatMeasurementCount(difference.matchedCount + difference.unavailableCount)}</span>
                  </div>
                </section>
              );
            })}
          </div>
        )}
        <p className="px-1 text-xs leading-5 text-muted-foreground">ECharts owns zoom, pan, pinch, shared crosshair and range-slider interactions. Difference metrics use reference − comparison at reference timestamps: exact matches within 1 ns, otherwise linear interpolation only between adjacent finite comparison samples no more than 2.5 median comparison sample intervals apart. No extrapolation, unit conversion, or interpolation across missing samples. Unmatched reference samples are excluded from difference metrics.</p>
      </CardContent>
    </Card>
  );
}
