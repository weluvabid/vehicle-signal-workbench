import { calculateSignalDifferenceInTimeRange } from '../measurements/difference';
import { queryTieredChannelStatistics } from '../measurements/tiered-envelope-index';
import type { IngestionRequest, MetricsPanelQueryResult } from './worker-protocol';
import type { WorkerRuntimeContext } from './worker-runtime';

const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Queries indexed channel statistics and comparison metrics for the selected slider interval. */
export async function handleMetricsQuery(
  request: Extract<IngestionRequest, { type: 'query-metrics' }>,
  context: WorkerRuntimeContext,
): Promise<void> {
  const { requestId } = request;
  context.activeQueries.add(requestId);
  const cancelFlag = request.cancelBuffer ? new Int32Array(request.cancelBuffer) : null;
  const cancelled = () =>
    !context.activeQueries.has(requestId) ||
    (cancelFlag !== null && Atomics.load(cancelFlag, 0) !== 0);
  const checkpoint = async () => {
    await yieldToWorker();

    if (cancelled()) throw new DOMException('Metrics query superseded.', 'AbortError');
  };

  try {
    const reference = context.datasets.get(request.referenceDatasetId);
    const comparison = context.datasets.get(request.comparisonDatasetId);

    if (!reference || !comparison)
      throw new Error('One or both datasets are unavailable in this worker session.');

    if (
      !Number.isFinite(request.startSeconds) ||
      !Number.isFinite(request.endSeconds) ||
      request.endSeconds <= request.startSeconds ||
      !Number.isFinite(request.comparisonOffsetSeconds) ||
      request.panels.length === 0
    ) {
      throw new RangeError('Invalid metrics query.');
    }

    const results: MetricsPanelQueryResult[] = [];

    for (const panel of request.panels) {
      await checkpoint();
      const referenceChannel = reference.channels.get(panel.referenceChannelId);
      const comparisonChannel = comparison.channels.get(panel.comparisonChannelId);

      if (!referenceChannel || !comparisonChannel) {
        throw new Error(
          `Metrics channel pair is unavailable: ${panel.referenceChannelId}/${panel.comparisonChannelId}.`,
        );
      }

      const referenceBuffers = {
        timeSeconds: reference.timeSeconds,
        values: referenceChannel.values,
      };
      const comparisonBuffers = {
        timeSeconds: comparison.timeSeconds,
        values: comparisonChannel.values,
      };
      const referenceStatistics = queryTieredChannelStatistics(
        request.referenceDatasetId,
        panel.referenceChannelId,
        referenceBuffers,
        referenceChannel.envelopeIndex,
        request.startSeconds,
        request.endSeconds,
        cancelled,
      );
      const comparisonStatistics = queryTieredChannelStatistics(
        request.comparisonDatasetId,
        panel.comparisonChannelId,
        comparisonBuffers,
        comparisonChannel.envelopeIndex,
        request.startSeconds - request.comparisonOffsetSeconds,
        request.endSeconds - request.comparisonOffsetSeconds,
        cancelled,
      );
      const differenceStatistics = calculateSignalDifferenceInTimeRange(
        {
          datasetId: request.referenceDatasetId,
          channelId: panel.referenceChannelId,
          ...referenceBuffers,
        },
        {
          datasetId: request.comparisonDatasetId,
          channelId: panel.comparisonChannelId,
          ...comparisonBuffers,
        },
        request.startSeconds,
        request.endSeconds,
        request.comparisonOffsetSeconds,
        cancelled,
      );
      results.push({ referenceStatistics, comparisonStatistics, differenceStatistics });
    }

    if (cancelled()) throw new DOMException('Metrics query superseded.', 'AbortError');

    context.post({
      type: 'metrics',
      requestId,
      result: {
        panels: results,
        startSeconds: request.startSeconds,
        endSeconds: request.endSeconds,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      context.post({ type: 'cancelled', requestId });
    else
      context.post({
        type: 'error',
        requestId,
        code: 'INVALID_QUERY',
        message: error instanceof Error ? error.message : 'Unable to query channel metrics.',
      });
  } finally {
    context.activeQueries.delete(requestId);
  }
}
