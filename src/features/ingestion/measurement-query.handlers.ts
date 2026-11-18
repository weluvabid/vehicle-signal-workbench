import { calculateSignalDifferencePlotEnvelopeInTimeRange } from '../measurements/difference';
import { queryChannelEnvelopeTimeWindow, queryChannelTimeStatistics } from '../measurements/windowing';
import type { ComparisonPanelQueryResult, IngestionRequest } from './worker-protocol';
import type { WorkerRuntimeContext } from './worker-runtime';

const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Handles one logical viewport operation and all selected channels as one response. */
export async function handleMeasurementQuery(
  request: IngestionRequest,
  context: WorkerRuntimeContext,
): Promise<boolean> {
  if (request.type !== 'query-comparison-batch') return false;

  const { requestId } = request;
  context.activeQueries.add(requestId);
  const cancelFlag = request.cancelBuffer ? new Int32Array(request.cancelBuffer) : null;
  const isCancelled = () => !context.activeQueries.has(requestId) || (cancelFlag !== null && Atomics.load(cancelFlag, 0) !== 0);
  const cancelIfRequested = () => {
    if (isCancelled()) throw new DOMException('Viewport query superseded.', 'AbortError');
  };

  try {
    const referenceDataset = context.datasets.get(request.referenceDatasetId);
    const comparisonDataset = context.datasets.get(request.comparisonDatasetId);
    if (!referenceDataset || !comparisonDataset) {
      throw new Error('One or both datasets are unavailable in this worker session.');
    }
    if (!Number.isInteger(request.pixelWidth) || request.pixelWidth < 1 || request.pixelWidth > 8_192 ||
        !Number.isFinite(request.startSeconds) || !Number.isFinite(request.endSeconds) ||
        request.endSeconds <= request.startSeconds || !Number.isFinite(request.comparisonOffsetSeconds) ||
        request.panels.length === 0) {
      throw new RangeError('Invalid batched comparison viewport query.');
    }

    const results: ComparisonPanelQueryResult[] = [];
    for (const selection of request.panels) {
      // Yield between panels so the worker can receive and process a cancel message.
      await yieldToWorker();
      cancelIfRequested();

      const referenceChannel = referenceDataset.channels.get(selection.referenceChannelId);
      const comparisonChannel = comparisonDataset.channels.get(selection.comparisonChannelId);
      if (!referenceChannel || !comparisonChannel) {
        throw new Error(`Comparison channel pair is unavailable: ${selection.referenceChannelId}/${selection.comparisonChannelId}.`);
      }

      const referenceBuffers = { timeSeconds: referenceDataset.timeSeconds, values: referenceChannel.values };
      const comparisonBuffers = { timeSeconds: comparisonDataset.timeSeconds, values: comparisonChannel.values };
      const comparisonStart = request.startSeconds - request.comparisonOffsetSeconds;
      const comparisonEnd = request.endSeconds - request.comparisonOffsetSeconds;

      const referenceWindow = queryChannelEnvelopeTimeWindow(
        request.referenceDatasetId, selection.referenceChannelId, referenceBuffers,
        referenceChannel.envelopeIndex, request.startSeconds, request.endSeconds, request.pixelWidth, isCancelled,
      );
      const comparisonWindow = queryChannelEnvelopeTimeWindow(
        request.comparisonDatasetId, selection.comparisonChannelId, comparisonBuffers,
        comparisonChannel.envelopeIndex, comparisonStart, comparisonEnd, request.pixelWidth, isCancelled,
      );
      const referenceStatistics = queryChannelTimeStatistics(
        request.referenceDatasetId, selection.referenceChannelId, referenceBuffers,
        referenceChannel.envelopeIndex, request.startSeconds, request.endSeconds, isCancelled,
      );
      const comparisonStatistics = queryChannelTimeStatistics(
        request.comparisonDatasetId, selection.comparisonChannelId, comparisonBuffers,
        comparisonChannel.envelopeIndex, comparisonStart, comparisonEnd, isCancelled,
      );

      // Give cancellation a checkpoint before the potentially largest operation (difference generation).
      await yieldToWorker();
      cancelIfRequested();
      const differenceSeries = calculateSignalDifferencePlotEnvelopeInTimeRange(
        { datasetId: request.referenceDatasetId, channelId: selection.referenceChannelId,
          timeSeconds: referenceDataset.timeSeconds, values: referenceChannel.values },
        { datasetId: request.comparisonDatasetId, channelId: selection.comparisonChannelId,
          timeSeconds: comparisonDataset.timeSeconds, values: comparisonChannel.values },
        request.startSeconds, request.endSeconds, request.comparisonOffsetSeconds, request.pixelWidth, isCancelled,
      );
      results.push({ referenceWindow, comparisonWindow, referenceStatistics, comparisonStatistics, differenceSeries });
    }

    cancelIfRequested();
    const result = { panels: results };
    const transfer: Transferable[] = [];
    for (const panel of results) {
      transfer.push(
        panel.referenceWindow.timeSeconds.buffer, panel.referenceWindow.values.buffer,
        panel.comparisonWindow.timeSeconds.buffer, panel.comparisonWindow.values.buffer,
        panel.differenceSeries.timeSeconds.buffer, panel.differenceSeries.delta.buffer,
      );
    }
    context.postTransfer({ type: 'comparison-batch', requestId, result }, { transfer });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      context.post({ type: 'cancelled', requestId });
    } else {
      context.post({ type: 'error', requestId, code: 'INVALID_QUERY',
        message: error instanceof Error ? error.message : 'Unable to query comparison viewport.' });
    }
  } finally {
    context.activeQueries.delete(requestId);
  }
  return true;
}
