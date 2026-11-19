import type { CsvImportOptions, DatasetDescriptor } from '../measurements/model';
import type {
  ComparisonBatchQueryResult, ComparisonPanelQuery, TablePanelQuery, TableQueryResult, IngestionRequest, IngestionResponse,
} from './worker-protocol';

type WorkerOperationRequest = Extract<IngestionRequest, { readonly requestId: number }>;
type WithoutRequestId<T> = T extends { readonly requestId: number } ? Omit<T, 'requestId'> : never;
type OperationKind = 'import' | 'comparison-batch' | 'table';

interface PendingOperation {
  readonly kind: OperationKind;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress?: (fraction: number) => void;
}

export interface ComparisonQueryHandle {
  readonly requestId: number;
  readonly promise: Promise<ComparisonBatchQueryResult>;
  cancel(): void;
}

export interface TableQueryHandle {
  readonly requestId: number;
  readonly promise: Promise<TableQueryResult>;
  cancel(): void;
}

export class MeasurementWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingOperation>();

  import(file: File, options: CsvImportOptions, onProgress?: (fraction: number) => void): Promise<DatasetDescriptor> {
    return this.dispatch<DatasetDescriptor>({ type: 'import', file, options }, 'import', onProgress);
  }

  queryComparisonBatch(
    referenceDatasetId: string,
    comparisonDatasetId: string,
    panels: readonly ComparisonPanelQuery[],
    startSeconds: number,
    endSeconds: number,
    comparisonOffsetSeconds: number,
    pixelWidth: number,
  ): ComparisonQueryHandle {
    const cancelBuffer = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated
      ? new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT) : undefined;
    const cancelFlag = cancelBuffer ? new Int32Array(cancelBuffer) : null;
    const request = {
      type: 'query-comparison-batch' as const, referenceDatasetId, comparisonDatasetId,
      panels, cancelBuffer, startSeconds, endSeconds, comparisonOffsetSeconds, pixelWidth,
    };
    const requestId = this.nextRequestId++;
    let worker: Worker;
    try {
      worker = this.getWorker();
    } catch (cause) {
      return { requestId, promise: Promise.reject(cause instanceof Error ? cause : new Error('Unable to create measurement worker.')), cancel() {} };
    }

    const promise = new Promise<ComparisonBatchQueryResult>((resolve, reject) => {
      this.pending.set(requestId, {
        kind: 'comparison-batch', resolve: (value) => resolve(value as ComparisonBatchQueryResult), reject,
      });
      try {
        worker.postMessage({ ...request, requestId } satisfies IngestionRequest);
      } catch (cause) {
        this.pending.delete(requestId);
        reject(cause instanceof Error ? cause : new Error('Unable to dispatch comparison viewport query.'));
      }
    });

    let cancelRequested = false;
    return {
      requestId,
      promise,
      cancel: () => {
        if (cancelRequested || !this.pending.has(requestId)) return;
        cancelRequested = true;
        if (cancelFlag) Atomics.store(cancelFlag, 0, 1);
        this.worker?.postMessage({ type: 'cancel', requestId } satisfies IngestionRequest);
      },
    };
  }

  queryTable(
    referenceDatasetId: string, comparisonDatasetId: string, panels: readonly TablePanelQuery[],
    startSeconds: number, endSeconds: number, comparisonOffsetSeconds: number,
    page: number, pageSize = 100, options: { search?: string; sortDirection?: 'asc' | 'desc' } = {},
  ): TableQueryHandle {
    const requestId = this.nextRequestId++;
    let worker: Worker;
    try { worker = this.getWorker(); }
    catch (cause) {
      return { requestId, promise: Promise.reject(cause instanceof Error ? cause : new Error('Unable to create measurement worker.')), cancel() {} };
    }
    const promise = new Promise<TableQueryResult>((resolve, reject) => {
      this.pending.set(requestId, { kind: 'table', resolve: (value) => resolve(value as TableQueryResult), reject });
      try {
        worker.postMessage({ type: 'query-table', requestId, referenceDatasetId, comparisonDatasetId, panels,
          startSeconds, endSeconds, comparisonOffsetSeconds, page, pageSize, ...options } satisfies IngestionRequest);
      } catch (cause) { this.pending.delete(requestId); reject(cause instanceof Error ? cause : new Error('Unable to dispatch table query.')); }
    });
    let cancelled = false;
    return { requestId, promise, cancel: () => {
      if (cancelled || !this.pending.has(requestId)) return;
      cancelled = true;
      this.worker?.postMessage({ type: 'cancel', requestId } satisfies IngestionRequest);
    } };
  }

  releaseDataset(datasetId: string): void {
    this.worker?.postMessage({ type: 'release', datasetId } satisfies IngestionRequest);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const operation of this.pending.values()) operation.reject(new Error('Measurement worker was disposed.'));
    this.pending.clear();
  }

  private dispatch<T>(request: WithoutRequestId<WorkerOperationRequest>, kind: OperationKind,
    onProgress?: (fraction: number) => void): Promise<T> {
    const requestId = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      let worker: Worker;
      try { worker = this.getWorker(); }
      catch (cause) {
        reject(cause instanceof Error ? cause : new Error('Unable to create measurement worker.'));
        return;
      }
      this.pending.set(requestId, { kind, resolve: (value) => resolve(value as T), reject, onProgress });
      try { worker.postMessage({ ...request, requestId } as IngestionRequest); }
      catch (cause) {
        this.pending.delete(requestId);
        reject(cause instanceof Error ? cause : new Error('Unable to dispatch measurement worker request.'));
      }
    });
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('./csv-ingestion.worker.ts', import.meta.url), {
      type: 'module', name: 'vsw-measurement-worker',
    });
    this.worker.onmessage = (event: MessageEvent<IngestionResponse>) => {
      const message = event.data;
      const operation = this.pending.get(message.requestId);
      if (!operation) return;
      if (message.type === 'progress') {
        if (operation.kind === 'import') operation.onProgress?.(message.fraction);
        return;
      }
      this.pending.delete(message.requestId);
      if (message.type === 'error') {
        operation.reject(new Error(`${message.code}: ${message.message}`));
      } else if (message.type === 'cancelled') {
        operation.reject(new DOMException('Viewport query superseded.', 'AbortError'));
      } else if (message.type === 'complete' && operation.kind === 'import') {
        operation.resolve(message.dataset);
      } else if (message.type === 'comparison-batch' && operation.kind === 'comparison-batch') {
        operation.resolve(message.result);
      } else if (message.type === 'table-page' && operation.kind === 'table') {
        operation.resolve(message.result);
      } else {
        operation.reject(new Error('Measurement worker returned an unexpected response type.'));
      }
    };
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Measurement worker failed.');
      for (const operation of this.pending.values()) operation.reject(error);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    return this.worker;
  }
}
