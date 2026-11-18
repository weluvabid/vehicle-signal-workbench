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

const EChartsSignalChart = dynamic(
  () => import('./echarts-signal-chart').then((module) => module.EChartsSignalChart),
  {
    ssr: false,
    loading: () => <p className="plot-message">Initializing interactive chart…</p>,
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
    <Card className="signal-card">
      <CardHeader className="signal-card-header">
        <div>
          <p className="eyebrow">SYNCHRONIZED SIGNAL OVERLAY</p>
          <CardTitle>{props.selections.length} mapped signals</CardTitle>
          <p className="signal-unit">Native run overlays and a separate delta axis · linked crosshair · exact sampled values in tooltips</p>
        </div>
        <div className="signal-actions"><Badge variant="outline">{loading ? 'Updating' : 'Viewport ready'}</Badge><Button variant="outline" size="sm" type="button" onClick={exportVisibleCsv} disabled={!resultsRange || exporting || loading}>{exporting ? `Exporting ${Math.round(exportProgress * 100)}%…` : 'Export visible CSV'}</Button></div>
      </CardHeader>
      <CardContent className="signal-card-content">
        {error && <p className="import-error" role="alert">{error}</p>}
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
          <p className="plot-message">No samples are available in the selected overlap window.</p>
        )}
        {results.length > 0 && (
          <div className="signal-statistics-list" aria-live="polite">
            {resultsRange && <p className="signal-statistics-range">Statistics interval: {resultsRange.start.toFixed(3)}–{resultsRange.end.toFixed(3)} s · end exclusive</p>}
            {results.map((result) => {
              const reference = formatChannelStatistics(result.referenceStatistics);
              const comparison = formatChannelStatistics(result.comparisonStatistics);
              const difference = result.differenceStatistics;
              return (
                <section className="signal-statistics" key={result.id} aria-label={`${result.label} visible interval statistics`}>
                  <div className="signal-statistics-heading">
                    <strong>{result.label}</strong>
                    <span>{result.unit ?? 'Unit unspecified'}</span>
                  </div>
                  <div className="signal-statistics-scroll">
                    <table>
                      <thead><tr><th>Run</th><th>Samples</th><th>Valid</th><th>Missing</th><th>Min</th><th>Max</th><th>Mean</th><th>Std dev</th></tr></thead>
                      <tbody>
                        <tr><th scope="row">Reference</th><td>{reference.samples}</td><td>{reference.valid}</td><td>{reference.missing}</td><td>{reference.min}</td><td>{reference.max}</td><td>{reference.mean}</td><td>{reference.standardDeviation}</td></tr>
                        <tr><th scope="row">Comparison</th><td>{comparison.samples}</td><td>{comparison.valid}</td><td>{comparison.missing}</td><td>{comparison.min}</td><td>{comparison.max}</td><td>{comparison.mean}</td><td>{comparison.standardDeviation}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="signal-difference-summary" aria-label={`${result.label} difference analysis`}>
                    <span><strong>Δ bias</strong> {formatMeasurementValue(difference.bias)}</span>
                    <span><strong>MAE</strong> {formatMeasurementValue(difference.meanAbsoluteError)}</span>
                    <span><strong>RMSE</strong> {formatMeasurementValue(difference.rootMeanSquareError)}</span>
                    <span><strong>Max |Δ|</strong> {formatMeasurementValue(difference.maximumAbsoluteError)}</span>
                    <span><strong>Matched</strong> {formatMeasurementCount(difference.matchedCount)} / {formatMeasurementCount(difference.matchedCount + difference.unavailableCount)}</span>
                  </div>
                </section>
              );
            })}
          </div>
        )}
        <p className="plot-note">ECharts owns zoom, pan, pinch, shared crosshair and range-slider interactions. Difference metrics use reference − comparison at reference timestamps: exact matches within 1 ns, otherwise linear interpolation only between adjacent finite comparison samples no more than 2.5 median comparison sample intervals apart. No extrapolation, unit conversion, or interpolation across missing samples. Unmatched reference samples are excluded from difference metrics.</p>
      </CardContent>
    </Card>
  );
}
