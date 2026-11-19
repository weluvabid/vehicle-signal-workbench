import { calculateSignalDifferencePlotEnvelopeInTimeRange } from '../measurements/difference';
import { queryTieredChannelEnvelope, queryTieredChannelStatistics } from '../measurements/tiered-envelope-index';
import type { ComparisonPanelQueryResult, IngestionRequest } from './worker-protocol';
import type { WorkerRuntimeContext } from './worker-runtime';

const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Handles one logical viewport operation and all selected channels as one response. */
export async function handleComparisonQuery(
  request: Extract<IngestionRequest, { type: 'query-comparison-batch' }>,
  context: WorkerRuntimeContext,
): Promise<void> {

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
    const queryStartedAt = performance.now();
    let indexBuildMs = 0;
    const recordIndexBuild = (durationMs: number) => { indexBuildMs += durationMs; };
    let differenceMs = 0;
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

      const referenceWindow = queryTieredChannelEnvelope(
        request.referenceDatasetId, selection.referenceChannelId, referenceBuffers,
        referenceChannel.envelopeIndex, request.startSeconds, request.endSeconds, request.pixelWidth, isCancelled, recordIndexBuild,
      );
      const comparisonWindow = queryTieredChannelEnvelope(
        request.comparisonDatasetId, selection.comparisonChannelId, comparisonBuffers,
        comparisonChannel.envelopeIndex, comparisonStart, comparisonEnd, request.pixelWidth, isCancelled, recordIndexBuild,
      );
      const referenceStatistics = queryTieredChannelStatistics(
        request.referenceDatasetId, selection.referenceChannelId, referenceBuffers,
        referenceChannel.envelopeIndex, request.startSeconds, request.endSeconds, isCancelled, recordIndexBuild,
      );
      const comparisonStatistics = queryTieredChannelStatistics(
        request.comparisonDatasetId, selection.comparisonChannelId, comparisonBuffers,
        comparisonChannel.envelopeIndex, comparisonStart, comparisonEnd, isCancelled, recordIndexBuild,
      );

      // Give cancellation a checkpoint before the potentially largest operation (difference generation).
      await yieldToWorker();
      cancelIfRequested();
      const differenceStartedAt = performance.now();
      const differenceSeries = calculateSignalDifferencePlotEnvelopeInTimeRange(
        { datasetId: request.referenceDatasetId, channelId: selection.referenceChannelId,
          timeSeconds: referenceDataset.timeSeconds, values: referenceChannel.values },
        { datasetId: request.comparisonDatasetId, channelId: selection.comparisonChannelId,
          timeSeconds: comparisonDataset.timeSeconds, values: comparisonChannel.values },
        request.startSeconds, request.endSeconds, request.comparisonOffsetSeconds, request.pixelWidth, isCancelled,
      );
      differenceMs += performance.now() - differenceStartedAt;
      results.push({ referenceWindow, comparisonWindow, referenceStatistics, comparisonStatistics, differenceSeries });
    }

    cancelIfRequested();
    const workerElapsedMs = performance.now() - queryStartedAt;
    const result = {
      panels: results,
      timings: {
        indexBuildMs,
        workerComputeMs: Math.max(0, workerElapsedMs - indexBuildMs),
        differenceMs,
      },
    };
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
}


