import {
  calculateSignalDifferenceEnvelopeInTimeRange,
  calculateSignalDifferencePlotEnvelopeInTimeRange,
  calculateSignalDifferenceInTimeRange,
  calculateSignalDifferenceSeriesInTimeRange,
} from '../measurements/difference';
import {
  calculateChannelStatistics,
  queryChannelEnvelopeTimeWindow,
  queryChannelTimeWindow,
  queryChannelWindow,
  queryChannelTimeStatistics,
} from '../measurements/windowing';
import { lowerBoundFloat64 } from '../measurements/sorted-search';
import type { IngestionRequest } from './worker-protocol';
import type { WorkerRuntimeContext } from './worker-runtime';

/** Handles read-only measurement queries against worker-owned canonical buffers. */
export function handleMeasurementQuery(
  request: IngestionRequest,
  context: WorkerRuntimeContext,
): boolean {
  if (request.type === 'query-difference-series') {
    const referenceDataset = context.datasets.get(request.referenceDatasetId);
    const comparisonDataset = context.datasets.get(request.comparisonDatasetId);
    const referenceChannel = referenceDataset?.channels.get(request.referenceChannelId);
    const comparisonChannel = comparisonDataset?.channels.get(request.comparisonChannelId);
    if (!referenceDataset || !comparisonDataset || !referenceChannel || !comparisonChannel) {
      context.post({ type: 'error', requestId: request.requestId, code: 'DIFFERENCE_INPUT_NOT_FOUND',
        message: 'One or both datasets or channels are unavailable in this worker session.' });
      return true;
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
      context.postTransfer({ type: 'difference-series', requestId: request.requestId, result }, {
        transfer: [result.timeSeconds.buffer, result.referenceValues.buffer,
          result.comparisonValues.buffer, result.delta.buffer],
      });
    } catch (error) {
      context.post({ type: 'error', requestId: request.requestId, code: 'INVALID_DIFFERENCE_QUERY',
        message: error instanceof Error ? error.message : 'Unable to calculate difference series.' });
    }
    return true;
  }

  if (request.type === 'query-comparison-panel') {
    const referenceDataset = context.datasets.get(request.referenceDatasetId);
    const comparisonDataset = context.datasets.get(request.comparisonDatasetId);
    const referenceChannel = referenceDataset?.channels.get(request.referenceChannelId);
    const comparisonChannel = comparisonDataset?.channels.get(request.comparisonChannelId);
    if (!referenceDataset || !comparisonDataset || !referenceChannel || !comparisonChannel) {
      context.post({ type: 'error', requestId: request.requestId, code: 'DIFFERENCE_INPUT_NOT_FOUND',
        message: 'One or both datasets or channels are unavailable in this worker session.' });
      return true;
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
      context.postTransfer({ type: 'comparison-panel', requestId: request.requestId, result }, {
        transfer: [
          result.referenceWindow.timeSeconds.buffer, result.referenceWindow.values.buffer,
          result.comparisonWindow.timeSeconds.buffer, result.comparisonWindow.values.buffer,
          result.differenceSeries.timeSeconds.buffer, result.differenceSeries.delta.buffer,
        ],
      });
    } catch (error) {
      context.post({ type: 'error', requestId: request.requestId, code: 'INVALID_QUERY',
        message: error instanceof Error ? error.message : 'Unable to query comparison panel.' });
    }
    return true;
  }

  if (request.type === 'query-difference-statistics') {
    const referenceDataset = context.datasets.get(request.referenceDatasetId);
    const comparisonDataset = context.datasets.get(request.comparisonDatasetId);
    const referenceChannel = referenceDataset?.channels.get(request.referenceChannelId);
    const comparisonChannel = comparisonDataset?.channels.get(request.comparisonChannelId);
    if (!referenceDataset || !comparisonDataset || !referenceChannel || !comparisonChannel) {
      context.post({
        type: 'error', requestId: request.requestId, code: 'DIFFERENCE_INPUT_NOT_FOUND',
        message: 'One or both datasets or channels are unavailable in this worker session.',
      });
      return true;
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
      context.post({ type: 'difference-statistics', requestId: request.requestId, statistics });
    } catch (error) {
      context.post({
        type: 'error', requestId: request.requestId, code: 'INVALID_DIFFERENCE_QUERY',
        message: error instanceof Error ? error.message : 'Unable to calculate signal difference.',
      });
    }
    return true;
  }

  if (request.type === 'query-window' || request.type === 'query-statistics' || request.type === 'query-time-window' || request.type === 'query-envelope-time-window' || request.type === 'query-time-statistics') {
    const dataset = context.datasets.get(request.datasetId);
    if (!dataset) {
      context.post({
        type: 'error',
        requestId: request.requestId,
        code: 'DATASET_NOT_FOUND',
        message: 'The requested dataset is no longer available in this worker session.',
      });
      return true;
    }

    const channel = dataset.channels.get(request.channelId);
    if (!channel) {
      context.post({
        type: 'error',
        requestId: request.requestId,
        code: 'CHANNEL_NOT_FOUND',
        message: 'The requested channel does not exist in this dataset.',
      });
      return true;
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
        context.postTransfer(
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
        context.post({ type: 'statistics', requestId: request.requestId, statistics });
      }
    } catch (error) {
      context.post({
        type: 'error',
        requestId: request.requestId,
        code: 'INVALID_QUERY',
        message: error instanceof Error ? error.message : 'Invalid measurement query.',
      });
    }
    return true;
  }

  return false;
}
