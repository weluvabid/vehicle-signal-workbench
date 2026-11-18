import {
  CSV_EXPORT_CHUNK_ROWS,
  CSV_EXPORT_MAX_ROWS,
  CSV_EXPORT_MAX_ROWS_PER_CHANNEL,
  encodeDifferenceCsvChunk,
} from '../measurements/csv-export';
import { calculateSignalDifferenceSeriesInTimeRange, medianSampleInterval } from '../measurements/difference';
import { lowerBoundFloat64 } from '../measurements/sorted-search';
import type { IngestionRequest } from './worker-protocol';
import type { WorkerRuntimeContext } from './worker-runtime';

function waitForCsvExportAck(context: WorkerRuntimeContext, requestId: number): Promise<void> {
  return new Promise((resolve) => context.pendingCsvExportAcks.set(requestId, resolve));
}

export async function handleCsvExport(
  request: Extract<IngestionRequest, { type: 'export-difference-csv' }>,
  context: WorkerRuntimeContext,
): Promise<void> {
  try {
    const referenceDataset = context.datasets.get(request.referenceDatasetId);
    const comparisonDataset = context.datasets.get(request.comparisonDatasetId);
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
        if (context.cancelledCsvExports.has(request.requestId)) return;

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
        context.postTransfer(
          {
            type: 'csv-export-chunk',
            requestId: request.requestId,
            chunk: chunk.buffer as ArrayBuffer,
            rows: series.timeSeconds.length,
          },
          { transfer: [chunk.buffer as ArrayBuffer] },
        );
        context.post({
          type: 'csv-export-progress',
          requestId: request.requestId,
          fraction: completedRows / totalRows,
          rows: completedRows,
        });

        // Wait for the UI to consume this chunk before allocating the next one.
        // This keeps the message queue bounded and provides explicit backpressure.
        await waitForCsvExportAck(context, request.requestId);
      }
    }

    if (!context.cancelledCsvExports.has(request.requestId)) {
      context.post({ type: 'csv-export-complete', requestId: request.requestId, rows: completedRows });
    }
  } catch (error) {
    if (!context.cancelledCsvExports.has(request.requestId)) {
      context.post({
        type: 'error',
        requestId: request.requestId,
        code: 'EXPORT_FAILED',
        message: error instanceof Error ? error.message : 'Unable to export comparison CSV.',
      });
    }
  } finally {
    context.pendingCsvExportAcks.get(request.requestId)?.();
    context.pendingCsvExportAcks.delete(request.requestId);
    context.activeCsvExports.delete(request.requestId);
    context.cancelledCsvExports.delete(request.requestId);
  }
}
