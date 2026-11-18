import { calculateSignalDifferencePlotEnvelopeInTimeRange } from '../measurements/difference';
import { queryChannelEnvelopeTimeWindow, queryChannelTimeStatistics } from '../measurements/windowing';
import type { IngestionRequest } from './worker-protocol';
import type { WorkerRuntimeContext } from './worker-runtime';

/** Handles viewport-bounded comparison queries against worker-owned canonical buffers. */
export function handleMeasurementQuery(
  request: IngestionRequest,
  context: WorkerRuntimeContext,
): boolean {
  if (request.type !== 'query-comparison-panel') return false;

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
        comparisonDataset.nominalSampleIntervalSeconds,
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
