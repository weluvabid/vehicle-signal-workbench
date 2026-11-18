'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DatasetDescriptor, ChannelStatistics } from '@/features/measurements/model';
import type { DifferenceResult, DifferenceStatistics } from '@/features/measurements/difference';
import type { ComparisonPlotData } from '@/features/measurements/plot-data';
import { formatChannelStatistics, formatMeasurementCount, formatMeasurementValue } from '@/features/measurements/formatting';
import { formatDifferenceCsvRow } from '@/features/measurements/csv-format';
import { buildComparisonPlotData, buildSignalPoints } from '@/features/measurements/plot-data';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
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

export interface SignalSelection {
  readonly referenceChannelId: string;
  readonly comparisonChannelId: string;
}

interface SignalComparisonPlotProps {
  readonly client: MeasurementWorkerClient;
  readonly reference: DatasetDescriptor;
  readonly comparison: DatasetDescriptor;
  readonly selections: readonly SignalSelection[];
  readonly offsetSeconds: number;
  readonly startSeconds: number;
  readonly endSeconds: number;
}

interface SignalPanelResult {
  readonly id: string;
  readonly label: string;
  readonly unit: string | null;
  readonly data: ComparisonPlotData;
  readonly referenceStatistics: ChannelStatistics;
  readonly comparisonStatistics: ChannelStatistics;
  readonly differenceStatistics: DifferenceStatistics;
  readonly differenceSeries: DifferenceResult;
}

const EMPTY_DATA: ComparisonPlotData = { reference: [], comparison: [] };

export function SignalComparisonPlot(props: SignalComparisonPlotProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<readonly SignalPanelResult[]>([]);
  const [resultsRange, setResultsRange] = useState<{ readonly start: number; readonly end: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const generation = useRef(0);
  const lastRequestKey = useRef('');

  const selectionKey = useMemo(
    () => props.selections.map((selection) => `${selection.referenceChannelId}:${selection.comparisonChannelId}`).join('|'),
    [props.selections],
  );

  useEffect(() => {
    lastRequestKey.current = '';
    return () => { generation.current += 1; };
  }, [
    props.reference.id,
    props.comparison.id,
    selectionKey,
    props.offsetSeconds,
    props.startSeconds,
    props.endSeconds,
  ]);

  const requestViewport = useCallback((startSeconds: number, endSeconds: number, pixelWidth: number) => {
    const start = Math.max(props.startSeconds, startSeconds);
    const end = Math.min(props.endSeconds, endSeconds);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || props.selections.length === 0) return;

    const width = Math.max(1, Math.min(8_192, Math.floor(pixelWidth)));
    const requestKey = [start.toPrecision(13), end.toPrecision(13), width, selectionKey].join(':');
    if (requestKey === lastRequestKey.current) return;
    lastRequestKey.current = requestKey;

    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setResults([]);
    setResultsRange(null);

    const requests = props.selections.map(async (selection): Promise<SignalPanelResult> => {
      const referenceChannel = props.reference.channels.find((channel) => channel.id === selection.referenceChannelId);
      if (!referenceChannel) throw new Error(`Reference channel ${selection.referenceChannelId} is unavailable.`);
      const comparisonChannel = props.comparison.channels.find((channel) => channel.id === selection.comparisonChannelId);
      if (!comparisonChannel) throw new Error(`Comparison channel ${selection.comparisonChannelId} is unavailable.`);

      const panel = await props.client.queryComparisonPanel(
        props.reference.id,
        selection.referenceChannelId,
        props.comparison.id,
        selection.comparisonChannelId,
        start,
        end,
        props.offsetSeconds,
        width,
      );
      const {
        referenceWindow, comparisonWindow, referenceStatistics,
        comparisonStatistics, differenceSeries,
      } = panel;

      return {
        id: selection.referenceChannelId,
        label: referenceChannel.label,
        unit: referenceChannel.unit,
        data: buildComparisonPlotData(referenceWindow, comparisonWindow, props.offsetSeconds),
        referenceStatistics,
        comparisonStatistics,
        differenceStatistics: differenceSeries.statistics,
        differenceSeries,
      };
    });

    Promise.all(requests).then((nextResults) => {
      if (generation.current !== current) return;
      setResults(nextResults);
      setResultsRange({ start, end });
    }).catch((cause: unknown) => {
      if (generation.current !== current) return;
      setError(cause instanceof Error ? cause.message : 'Unable to query signal data.');
    }).finally(() => {
      if (generation.current === current) setLoading(false);
    });
  }, [
    props.client,
    props.reference,
    props.comparison,
    props.selections,
    props.offsetSeconds,
    props.startSeconds,
    props.endSeconds,
    selectionKey,
  ]);

  // Initial data acquisition must not depend on ECharts emitting onChartReady.
  // The chart is a viewport control; it is not the owner of the first data load.
  // This also guarantees statistics are available when chart initialization is
  // delayed by dynamic import, resize, or a renderer lifecycle transition.
  useEffect(() => {
    requestViewport(props.startSeconds, props.endSeconds, 1_024);
  }, [requestViewport, props.startSeconds, props.endSeconds]);

  const exportVisibleCsv = useCallback(async () => {
    if (!resultsRange || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const parts = ['channel,unit,reference_time_seconds,reference_value,comparison_interpolated_value,delta_reference_minus_comparison,matched\r\n'];
      let chunk: string[] = [];
      let exportedRows = 0;
      for (const selection of props.selections) {
        const referenceChannel = props.reference.channels.find((channel) => channel.id === selection.referenceChannelId);
        if (!referenceChannel) throw new Error(`Reference channel ${selection.referenceChannelId} is unavailable.`);
        const series = await props.client.queryDifferenceSeries(
          props.reference.id, selection.referenceChannelId,
          props.comparison.id, selection.comparisonChannelId,
          resultsRange.start, resultsRange.end, props.offsetSeconds, 0,
        );
        for (let index = 0; index < series.timeSeconds.length; index++) {
          const delta = series.delta[index];
          chunk.push(formatDifferenceCsvRow(
            referenceChannel.label,
            referenceChannel.unit ?? '',
            series.timeSeconds[index],
            series.referenceValues[index],
            series.comparisonValues[index],
            delta,
          ));
          exportedRows++;
          if (exportedRows > 5_000_000) throw new Error('The export exceeds 5 million rows. Zoom into a smaller interval and retry.');
          if (chunk.length >= 20_000) { parts.push(`${chunk.join('\r\n')}\r\n`); chunk = []; }
        }
      }
      if (chunk.length > 0) parts.push(`${chunk.join('\r\n')}\r\n`);
      if (exportedRows === 0) throw new Error('The selected viewport contains no reference samples to export.');
      const url = URL.createObjectURL(new Blob(['\uFEFF', ...parts], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `vsw-comparison-${new Date().toISOString().replaceAll(':', '-')}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to export comparison data.');
    } finally {
      setExporting(false);
    }
  }, [exporting, props.client, props.reference, props.comparison, props.selections, props.offsetSeconds, resultsRange]);

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
        <div className="signal-actions"><Badge variant="outline">{loading ? 'Updating' : 'Viewport ready'}</Badge><Button variant="outline" size="sm" type="button" onClick={exportVisibleCsv} disabled={!resultsRange || exporting || loading}>{exporting ? 'Exporting…' : 'Export visible CSV'}</Button></div>
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
