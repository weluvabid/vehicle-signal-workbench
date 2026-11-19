import { lowerBoundFloat64 } from '../measurements/sorted-search';
import type { IngestionRequest } from './worker-protocol';
import type { WorkerRuntimeContext } from './worker-runtime';

const yieldToWorker = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Returns one bounded page of raw samples. Canonical arrays remain worker-owned. */
export async function handleTableQuery(
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
