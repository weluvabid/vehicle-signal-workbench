import { calculateSignalDifferenceEnvelopeInTimeRange, calculateSignalDifferenceInTimeRange, calculateSignalDifferenceSeriesInTimeRange } from '../measurements/difference';
import {
  calculateChannelStatistics,
  queryChannelEnvelopeTimeWindow,
  queryChannelTimeWindow,
  queryChannelWindow,
  queryChannelTimeStatistics,
} from '../measurements/windowing';
import { importCsv, type ActiveImport, type StoredDataset } from './csv-import';
import type { IngestionRequest, IngestionResponse } from './worker-protocol';

const datasets = new Map<string, StoredDataset>();
const activeImports = new Map<number, ActiveImport>();

function post(message: IngestionResponse): void {
  self.postMessage(message);
}

function lowerBound(values: Float64Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

self.onmessage = (event: MessageEvent<IngestionRequest>): void => {
  const request = event.data;

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
        const exportSamples = lowerBound(referenceDataset.timeSeconds, request.endSeconds) -
          lowerBound(referenceDataset.timeSeconds, request.startSeconds);
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
        differenceSeries: calculateSignalDifferenceEnvelopeInTimeRange(
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
          result.differenceSeries.timeSeconds.buffer, result.differenceSeries.referenceValues.buffer,
          result.differenceSeries.comparisonValues.buffer, result.differenceSeries.delta.buffer,
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
