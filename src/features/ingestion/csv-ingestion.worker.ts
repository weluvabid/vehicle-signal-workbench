import {
  calculateSignalDifferenceEnvelopeInTimeRange,
  calculateSignalDifferencePlotEnvelopeInTimeRange,
  calculateSignalDifferenceInTimeRange,
  calculateSignalDifferenceSeriesInTimeRange,
  medianSampleInterval,
} from '../measurements/difference';
import {
  CSV_EXPORT_CHUNK_ROWS,
  CSV_EXPORT_MAX_ROWS,
  CSV_EXPORT_MAX_ROWS_PER_CHANNEL,
  encodeDifferenceCsvChunk,
} from '../measurements/csv-export';
import {
  calculateChannelStatistics,
  queryChannelEnvelopeTimeWindow,
  queryChannelTimeWindow,
  queryChannelWindow,
  queryChannelTimeStatistics,
} from '../measurements/windowing';
import { importCsv, type ActiveImport, type StoredDataset } from './csv-import';
import { lowerBoundFloat64 } from '../measurements/sorted-search';
import type { IngestionRequest, IngestionResponse } from './worker-protocol';

const datasets = new Map<string, StoredDataset>();
const activeImports = new Map<number, ActiveImport>();
const cancelledCsvExports = new Set<number>();
const activeCsvExports = new Set<number>();
const pendingCsvExportAcks = new Map<number, () => void>();

function post(message: IngestionResponse): void {
  self.postMessage(message);
}


function waitForCsvExportAck(requestId: number): Promise<void> {
  return new Promise((resolve) => pendingCsvExportAcks.set(requestId, resolve));
}

async function exportDifferenceCsv(
  request: Extract<IngestionRequest, { type: 'export-difference-csv' }>,
): Promise<void> {
  try {
    const referenceDataset = datasets.get(request.referenceDatasetId);
    const comparisonDataset = datasets.get(request.comparisonDatasetId);
    if (!referenceDataset || !comparisonDataset) {
      throw new Error('One or both datasets are unavailable in this worker session.');
    }
    if (
      !Number.isFinite(request.startSeconds) ||
      !Number.isFinite(request.endSeconds) ||
      request.endSeconds <= request.startSeconds ||
      !Number.isFinite(request.comparisonOffsetSeconds) ||
      request.channels.length === 0
    ) {
      throw new RangeError('Invalid CSV export request.');
    }

    let totalRows = 0;
    const channelPairs = request.channels.map((selection) => {
      const referenceChannel = referenceDataset.channels.get(selection.referenceChannelId);
      const comparisonChannel = comparisonDataset.channels.get(selection.comparisonChannelId);
      if (!referenceChannel || !comparisonChannel) {
        throw new Error(
          `A selected channel is unavailable: ${selection.referenceChannelId} / ${selection.comparisonChannelId}.`,
        );
      }
      const startIndex = lowerBoundFloat64(referenceDataset.timeSeconds, request.startSeconds);
      const endIndex = lowerBoundFloat64(referenceDataset.timeSeconds, request.endSeconds);
      const channelRows = endIndex - startIndex;
      if (channelRows > CSV_EXPORT_MAX_ROWS_PER_CHANNEL) {
        throw new RangeError(
          `Channel ${selection.referenceChannelId} exceeds the ${CSV_EXPORT_MAX_ROWS_PER_CHANNEL.toLocaleString()}-sample export limit. Zoom into a smaller interval and retry.`,
        );
      }
      totalRows += channelRows;
      if (totalRows > CSV_EXPORT_MAX_ROWS) {
        throw new RangeError(
          `The export exceeds ${CSV_EXPORT_MAX_ROWS.toLocaleString()} rows. Zoom into a smaller interval and retry.`,
        );
      }
      return { selection, referenceChannel, comparisonChannel, startIndex, endIndex };
    });

    if (totalRows === 0) {
      throw new RangeError('The selected viewport contains no reference samples to export.');
    }

    let completedRows = 0;
    let includeHeader = true;

    for (const pair of channelPairs) {
      const referenceSource = {
        datasetId: request.referenceDatasetId,
        channelId: pair.selection.referenceChannelId,
        timeSeconds: referenceDataset.timeSeconds,
        values: pair.referenceChannel.values,
      };
      const comparisonSource = {
        datasetId: request.comparisonDatasetId,
        channelId: pair.selection.comparisonChannelId,
        timeSeconds: comparisonDataset.timeSeconds,
        values: pair.comparisonChannel.values,
      };
      const cadence = medianSampleInterval(comparisonSource);

      for (let startIndex = pair.startIndex; startIndex < pair.endIndex; startIndex += CSV_EXPORT_CHUNK_ROWS) {
        if (cancelledCsvExports.has(request.requestId)) return;

        const chunkEndIndex = Math.min(pair.endIndex, startIndex + CSV_EXPORT_CHUNK_ROWS);
        const chunkStartSeconds = referenceDataset.timeSeconds[startIndex];
        const chunkEndSeconds =
          chunkEndIndex < pair.endIndex
            ? referenceDataset.timeSeconds[chunkEndIndex]
            : request.endSeconds;
        const series = calculateSignalDifferenceSeriesInTimeRange(
          referenceSource,
          comparisonSource,
          chunkStartSeconds,
          chunkEndSeconds,
          request.comparisonOffsetSeconds,
          cadence,
        );
        const expectedRows = chunkEndIndex - startIndex;
        if (series.timeSeconds.length !== expectedRows) {
          throw new Error(
            `CSV export chunk size mismatch: expected ${expectedRows}, received ${series.timeSeconds.length}.`,
          );
        }

        const chunk = encodeDifferenceCsvChunk(
          pair.selection.label,
          pair.selection.unit,
          series,
          includeHeader,
        );
        includeHeader = false;
        completedRows += series.timeSeconds.length;
        self.postMessage(
          {
            type: 'csv-export-chunk',
            requestId: request.requestId,
            chunk: chunk.buffer as ArrayBuffer,
            rows: series.timeSeconds.length,
          },
          { transfer: [chunk.buffer as ArrayBuffer] },
        );
        post({
          type: 'csv-export-progress',
          requestId: request.requestId,
          fraction: completedRows / totalRows,
          rows: completedRows,
        });

        // Wait for the UI to consume this chunk before allocating the next one.
        // This keeps the message queue bounded and provides explicit backpressure.
        await waitForCsvExportAck(request.requestId);
      }
    }

    if (!cancelledCsvExports.has(request.requestId)) {
      post({ type: 'csv-export-complete', requestId: request.requestId, rows: completedRows });
    }
  } catch (error) {
    if (!cancelledCsvExports.has(request.requestId)) {
      post({
        type: 'error',
        requestId: request.requestId,
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Unable to export comparison CSV.',
      });
    }
  } finally {
    pendingCsvExportAcks.get(request.requestId)?.();
    pendingCsvExportAcks.delete(request.requestId);
    activeCsvExports.delete(request.requestId);
    cancelledCsvExports.delete(request.requestId);
  }
}

self.onmessage = (event: MessageEvent<IngestionRequest>): void => {
  const request = event.data;

  if (request.type === 'cancel-csv-export') {
    if (activeCsvExports.has(request.requestId)) {
      cancelledCsvExports.add(request.requestId);
      pendingCsvExportAcks.get(request.requestId)?.();
      pendingCsvExportAcks.delete(request.requestId);
    }
    return;
  }

  if (request.type === 'ack-csv-export-chunk') {
    pendingCsvExportAcks.get(request.requestId)?.();
    pendingCsvExportAcks.delete(request.requestId);
    return;
  }

  if (request.type === 'export-difference-csv') {
    activeCsvExports.add(request.requestId);
    void exportDifferenceCsv(request);
    return;
  }

  if (request.type === 'release') {
    datasets.delete(request.datasetId);
    return;
  }

  if (request.type === 'query-difference-series') {
    const referenceDataset = datasets.get(request.referenceDatasetId);
    const comparisonDataset = datasets.get(request.comparisonDatasetId);
    const referenceChannel = referenceDataset?.channels.get(request.referenceChannelId);
    const comparisonChannel = comparisonDataset?.channels.get(request.comparisonChannelId);
    if (!referenceDataset || !comparisonDataset || !referenceChannel || !comparisonChannel) {
      post({ type: 'error', requestId: request.requestId, code: 'DIFFERENCE_INPUT_NOT_FOUND',
        message: 'One or both datasets or channels are unavailable in this worker session.' });
      return;
    }
    try {
      if (!Number.isInteger(request.pixelWidth) || request.pixelWidth < 0 || request.pixelWidth > 8_192) {
        throw new RangeError('Difference envelope pixel width must be zero (full export) or between 1 and 8192.');
      }
      if (request.pixelWidth === 0) {
        const exportSamples = lowerBoundFloat64(referenceDataset.timeSeconds, request.endSeconds) -
          lowerBoundFloat64(referenceDataset.timeSeconds, request.startSeconds);
        if (exportSamples > 2_000_000) {
          throw new RangeError('The visible interval exceeds the 2,000,000-sample export limit. Zoom into a smaller interval and retry.');
        }
      }
      const referenceSource = {
        datasetId: request.referenceDatasetId,
        channelId: request.referenceChannelId,
        timeSeconds: referenceDataset.timeSeconds,
        values: referenceChannel.values,
      };
      const comparisonSource = {
        datasetId: request.comparisonDatasetId,
        channelId: request.comparisonChannelId,
        timeSeconds: comparisonDataset.timeSeconds,
        values: comparisonChannel.values,
      };
      // Display queries construct only the pixel-bounded envelope. Full-resolution
      // arrays are allocated exclusively for explicit CSV export (pixelWidth = 0).
      const result = request.pixelWidth > 0
        ? calculateSignalDifferenceEnvelopeInTimeRange(
          referenceSource, comparisonSource, request.startSeconds, request.endSeconds,
          request.comparisonOffsetSeconds, Math.min(8_192, request.pixelWidth),
        )
        : calculateSignalDifferenceSeriesInTimeRange(
          referenceSource, comparisonSource, request.startSeconds, request.endSeconds,
          request.comparisonOffsetSeconds,
        );
      self.postMessage({ type: 'difference-series', requestId: request.requestId, result }, {
        transfer: [result.timeSeconds.buffer, result.referenceValues.buffer,
          result.comparisonValues.buffer, result.delta.buffer],
      });
    } catch (error) {
      post({ type: 'error', requestId: request.requestId, code: 'INVALID_DIFFERENCE_QUERY',
        message: error instanceof Error ? error.message : 'Unable to calculate difference series.' });
    }
    return;
  }

  if (request.type === 'query-comparison-panel') {
    const referenceDataset = datasets.get(request.referenceDatasetId);
    const comparisonDataset = datasets.get(request.comparisonDatasetId);
    const referenceChannel = referenceDataset?.channels.get(request.referenceChannelId);
    const comparisonChannel = comparisonDataset?.channels.get(request.comparisonChannelId);
    if (!referenceDataset || !comparisonDataset || !referenceChannel || !comparisonChannel) {
      post({ type: 'error', requestId: request.requestId, code: 'DIFFERENCE_INPUT_NOT_FOUND',
        message: 'One or both datasets or channels are unavailable in this worker session.' });
      return;
    }
    try {
      if (!Number.isInteger(request.pixelWidth) || request.pixelWidth < 1 || request.pixelWidth > 8_192) {
        throw new RangeError('Comparison panel pixel width must be between 1 and 8192.');
      }
      const referenceBuffers = { timeSeconds: referenceDataset.timeSeconds, values: referenceChannel.values };
      const comparisonBuffers = { timeSeconds: comparisonDataset.timeSeconds, values: comparisonChannel.values };
      const comparisonStart = request.startSeconds - request.comparisonOffsetSeconds;
      const comparisonEnd = request.endSeconds - request.comparisonOffsetSeconds;
      const result = {
        referenceWindow: queryChannelEnvelopeTimeWindow(
          request.referenceDatasetId, request.referenceChannelId, referenceBuffers,
          referenceChannel.envelopeIndex, request.startSeconds, request.endSeconds, request.pixelWidth,
        ),
        comparisonWindow: queryChannelEnvelopeTimeWindow(
          request.comparisonDatasetId, request.comparisonChannelId, comparisonBuffers,
          comparisonChannel.envelopeIndex, comparisonStart, comparisonEnd, request.pixelWidth,
        ),
        referenceStatistics: queryChannelTimeStatistics(
          request.referenceDatasetId, request.referenceChannelId, referenceBuffers,
          referenceChannel.envelopeIndex, request.startSeconds, request.endSeconds,
        ),
        comparisonStatistics: queryChannelTimeStatistics(
          request.comparisonDatasetId, request.comparisonChannelId, comparisonBuffers,
          comparisonChannel.envelopeIndex, comparisonStart, comparisonEnd,
        ),
        differenceSeries: calculateSignalDifferencePlotEnvelopeInTimeRange(
          { datasetId: request.referenceDatasetId, channelId: request.referenceChannelId,
            timeSeconds: referenceDataset.timeSeconds, values: referenceChannel.values },
          { datasetId: request.comparisonDatasetId, channelId: request.comparisonChannelId,
            timeSeconds: comparisonDataset.timeSeconds, values: comparisonChannel.values },
          request.startSeconds, request.endSeconds, request.comparisonOffsetSeconds, request.pixelWidth,
        ),
      };
      self.postMessage({ type: 'comparison-panel', requestId: request.requestId, result }, {
        transfer: [
          result.referenceWindow.timeSeconds.buffer, result.referenceWindow.values.buffer,
          result.comparisonWindow.timeSeconds.buffer, result.comparisonWindow.values.buffer,
          result.differenceSeries.timeSeconds.buffer, result.differenceSeries.delta.buffer,
        ],
      });
    } catch (error) {
      post({ type: 'error', requestId: request.requestId, code: 'INVALID_QUERY',
        message: error instanceof Error ? error.message : 'Unable to query comparison panel.' });
    }
    return;
  }

  if (request.type === 'query-difference-statistics') {
    const referenceDataset = datasets.get(request.referenceDatasetId);
    const comparisonDataset = datasets.get(request.comparisonDatasetId);
    const referenceChannel = referenceDataset?.channels.get(request.referenceChannelId);
    const comparisonChannel = comparisonDataset?.channels.get(request.comparisonChannelId);
    if (!referenceDataset || !comparisonDataset || !referenceChannel || !comparisonChannel) {
      post({
        type: 'error', requestId: request.requestId, code: 'DIFFERENCE_INPUT_NOT_FOUND',
        message: 'One or both datasets or channels are unavailable in this worker session.',
      });
      return;
    }
    try {
      const statistics = calculateSignalDifferenceInTimeRange(
        {
          datasetId: request.referenceDatasetId,
          channelId: request.referenceChannelId,
          timeSeconds: referenceDataset.timeSeconds,
          values: referenceChannel.values,
        },
        {
          datasetId: request.comparisonDatasetId,
          channelId: request.comparisonChannelId,
          timeSeconds: comparisonDataset.timeSeconds,
          values: comparisonChannel.values,
        },
        request.startSeconds,
        request.endSeconds,
        request.comparisonOffsetSeconds,
      );
      post({ type: 'difference-statistics', requestId: request.requestId, statistics });
    } catch (error) {
      post({
        type: 'error', requestId: request.requestId, code: 'INVALID_DIFFERENCE_QUERY',
        message: error instanceof Error ? error.message : 'Unable to calculate signal difference.',
      });
    }
    return;
  }

  if (request.type === 'query-window' || request.type === 'query-statistics' || request.type === 'query-time-window' || request.type === 'query-envelope-time-window' || request.type === 'query-time-statistics') {
    const dataset = datasets.get(request.datasetId);
    if (!dataset) {
      post({
        type: 'error',
        requestId: request.requestId,
        code: 'DATASET_NOT_FOUND',
        message: 'The requested dataset is no longer available in this worker session.',
      });
      return;
    }

    const channel = dataset.channels.get(request.channelId);
    if (!channel) {
      post({
        type: 'error',
        requestId: request.requestId,
        code: 'CHANNEL_NOT_FOUND',
        message: 'The requested channel does not exist in this dataset.',
      });
      return;
    }

    try {
      if (request.type === 'query-window' || request.type === 'query-time-window' || request.type === 'query-envelope-time-window') {
        const buffers = { timeSeconds: dataset.timeSeconds, values: channel.values };
        const window = request.type === 'query-envelope-time-window'
          ? queryChannelEnvelopeTimeWindow(
            request.datasetId, request.channelId, buffers, channel.envelopeIndex,
            request.startSeconds, request.endSeconds, request.pixelWidth,
          )
          : request.type === 'query-time-window'
            ? queryChannelTimeWindow(
              request.datasetId, request.channelId, buffers,
              request.startSeconds, request.endSeconds,
            )
            : queryChannelWindow(
              request.datasetId, request.channelId, buffers, request.startIndex, request.endIndex,
            );
        self.postMessage(
          { type: 'window', requestId: request.requestId, window },
          {
            transfer: [
              window.timeSeconds.buffer as ArrayBuffer,
              window.values.buffer as ArrayBuffer,
            ],
          },
        );
      } else {
        const statistics = request.type === 'query-time-statistics'
          ? queryChannelTimeStatistics(
            request.datasetId,
            request.channelId,
            { timeSeconds: dataset.timeSeconds, values: channel.values },
            channel.envelopeIndex,
            request.startSeconds,
            request.endSeconds,
          )
          : calculateChannelStatistics(
            request.datasetId,
            request.channelId,
            channel.values,
            request.startIndex,
            request.endIndex,
          );
        post({ type: 'statistics', requestId: request.requestId, statistics });
      }
    } catch (error) {
      post({
        type: 'error',
        requestId: request.requestId,
        code: 'INVALID_QUERY',
        message: error instanceof Error ? error.message : 'Invalid measurement query.',
      });
    }
    return;
  }

  if (request.type === 'cancel') {
    const active = activeImports.get(request.requestId);
    if (active) {
      active.cancelled = true;
      active.parser?.abort();
      if (active.parser) {
        activeImports.delete(request.requestId);
      }
    }
    return;
  }

  importCsv(request, activeImports, datasets, post);
};
