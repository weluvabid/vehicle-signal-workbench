import { calculateSignalDifferencePlotEnvelopeInTimeRange } from '../measurements/difference';
import { lowerBoundFloat64 } from '../measurements/sorted-search';
import { queryChannelEnvelopeTimeWindow, queryChannelTimeStatistics } from '../measurements/windowing';
import type { ComparisonPanelQueryResult, IngestionRequest } from './worker-protocol';
import type { WorkerRuntimeContext } from './worker-runtime';

const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Handles one logical viewport operation and all selected channels as one response. */
export async function handleMeasurementQuery(
  request: IngestionRequest,
  context: WorkerRuntimeContext,
): Promise<boolean> {
  if (request.type === 'query-table') {
    await handleTableQuery(request, context);
    return true;
  }
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


/** Returns one bounded page of raw samples. Canonical arrays remain worker-owned. */
async function handleTableQuery(
  request: Extract<IngestionRequest, { type: 'query-table' }>,
  context: WorkerRuntimeContext,
): Promise<void> {
  const { requestId } = request;
  context.activeQueries.add(requestId);
  const cancelled = () => !context.activeQueries.has(requestId);
  const checkpoint = async () => {
    await yieldToWorker();
    if (cancelled()) throw new DOMException('Table query superseded.', 'AbortError');
  };
  try {
    const reference = context.datasets.get(request.referenceDatasetId);
    const comparison = context.datasets.get(request.comparisonDatasetId);
    if (!reference || !comparison) throw new Error('One or both datasets are unavailable in this worker session.');
    if (!Number.isFinite(request.startSeconds) || !Number.isFinite(request.endSeconds) || request.endSeconds <= request.startSeconds ||
        !Number.isInteger(request.page) || request.page < 0 || !Number.isInteger(request.pageSize) || request.pageSize < 1 || request.pageSize > 100 ||
        !Number.isFinite(request.comparisonOffsetSeconds) || request.panels.length === 0) throw new RangeError('Invalid table query.');

    const start = lowerBoundFloat64(reference.timeSeconds, request.startSeconds);
    const end = lowerBoundFloat64(reference.timeSeconds, request.endSeconds);
    const search = request.search?.trim().toLocaleLowerCase() ?? '';
    const panels = request.panels.filter((panel) => !search || panel.label.toLocaleLowerCase().includes(search));
    const totalRows = Math.max(0, end - start) * panels.length;
    const offset = request.page * request.pageSize;
    const rows = [];
    const first = Math.min(totalRows, offset);
    const last = Math.min(totalRows, offset + request.pageSize);

    for (let ordinal = first; ordinal < last; ordinal++) {
      if ((ordinal - first) % 256 === 0) await checkpoint();
      const panel = panels[ordinal % panels.length];
      const sampleIndex = start + Math.floor(ordinal / panels.length);
      const timeSeconds = reference.timeSeconds[sampleIndex];
      const referenceChannel = reference.channels.get(panel.referenceChannelId);
      const comparisonChannel = comparison.channels.get(panel.comparisonChannelId);
      if (!referenceChannel || !comparisonChannel) throw new Error(`Table channel pair is unavailable: ${panel.referenceChannelId}/${panel.comparisonChannelId}.`);
      const alignedTime = timeSeconds - request.comparisonOffsetSeconds;
      const right = lowerBoundFloat64(comparison.timeSeconds, alignedTime);
      let comparisonValue: number | null = null;
      if (right < comparison.timeSeconds.length && Math.abs(comparison.timeSeconds[right] - alignedTime) <= 1e-9) {
        const value = comparisonChannel.values[right];
        comparisonValue = Number.isFinite(value) ? value : null;
      } else if (right > 0 && right < comparison.timeSeconds.length) {
        const leftTime = comparison.timeSeconds[right - 1], rightTime = comparison.timeSeconds[right];
        const leftValue = comparisonChannel.values[right - 1], rightValue = comparisonChannel.values[right];
        if (Number.isFinite(leftValue) && Number.isFinite(rightValue) && rightTime > leftTime) {
          const ratio = (alignedTime - leftTime) / (rightTime - leftTime);
          comparisonValue = leftValue + (rightValue - leftValue) * ratio;
        }
      }
      const referenceValue = referenceChannel.values[sampleIndex];
      const safeReference = Number.isFinite(referenceValue) ? referenceValue : null;
      rows.push({ timeSeconds, signalId: panel.referenceChannelId, signalLabel: panel.label, unit: panel.unit,
        color: panel.color, reference: safeReference, comparison: comparisonValue,
        delta: safeReference !== null && comparisonValue !== null ? safeReference - comparisonValue : null });
    }
    if (request.sortDirection === 'desc') rows.reverse();
    if (cancelled()) throw new DOMException('Table query superseded.', 'AbortError');
    context.post({ type: 'table-page', requestId, result: { rows, totalRows, page: request.page, pageSize: request.pageSize } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') context.post({ type: 'cancelled', requestId });
    else context.post({ type: 'error', requestId, code: 'INVALID_QUERY', message: error instanceof Error ? error.message : 'Unable to query table.' });
  } finally { context.activeQueries.delete(requestId); }
}
