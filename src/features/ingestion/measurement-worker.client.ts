import type {
  ChannelStatistics,
  ChannelWindow,
  CsvImportOptions,
  DatasetDescriptor,
} from '../measurements/model';
import type { DifferenceResult, DifferenceStatistics } from '../measurements/difference';
import type { ComparisonPanelQueryResult, IngestionRequest, IngestionResponse } from './worker-protocol';

type WorkerOperationRequest = Extract<IngestionRequest, { readonly requestId: number }>;
type WithoutRequestId<T> = T extends { readonly requestId: number } ? Omit<T, 'requestId'> : never;

type OperationKind = 'import' | 'window' | 'statistics' | 'difference' | 'difference-series' | 'comparison-panel';

interface PendingOperation {
  readonly kind: OperationKind;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress?: (fraction: number) => void;
}

export class MeasurementWorkerClient {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingOperation>();

  import(
    file: File,
    options: CsvImportOptions,
    onProgress?: (fraction: number) => void,
  ): Promise<DatasetDescriptor> {
    return this.dispatch<DatasetDescriptor>(
      { type: 'import', file, options },
      'import',
      onProgress,
    );
  }

  queryWindow(
    datasetId: string,
    channelId: string,
    startIndex: number,
    endIndex: number,
  ): Promise<ChannelWindow> {
    return this.dispatch<ChannelWindow>(
      { type: 'query-window', datasetId, channelId, startIndex, endIndex },
      'window',
    );
  }

  queryEnvelopeTimeWindow(
    datasetId: string,
    channelId: string,
    startSeconds: number,
    endSeconds: number,
    pixelWidth: number,
  ): Promise<ChannelWindow> {
    return this.dispatch<ChannelWindow>(
      { type: 'query-envelope-time-window', datasetId, channelId, startSeconds, endSeconds, pixelWidth },
      'window',
    );
  }

  queryTimeWindow(
    datasetId: string,
    channelId: string,
    startSeconds: number,
    endSeconds: number,
  ): Promise<ChannelWindow> {
    return this.dispatch<ChannelWindow>(
      { type: 'query-time-window', datasetId, channelId, startSeconds, endSeconds },
      'window',
    );
  }


  queryStatistics(
    datasetId: string,
    channelId: string,
    startIndex: number,
    endIndex: number,
  ): Promise<ChannelStatistics> {
    return this.dispatch<ChannelStatistics>(
      { type: 'query-statistics', datasetId, channelId, startIndex, endIndex },
      'statistics',
    );
  }

  queryTimeStatistics(
    datasetId: string,
    channelId: string,
    startSeconds: number,
    endSeconds: number,
  ): Promise<ChannelStatistics> {
    return this.dispatch<ChannelStatistics>(
      { type: 'query-time-statistics', datasetId, channelId, startSeconds, endSeconds },
      'statistics',
    );
  }

  queryDifferenceSeries(
    referenceDatasetId: string,
    referenceChannelId: string,
    comparisonDatasetId: string,
    comparisonChannelId: string,
    startSeconds: number,
    endSeconds: number,
    comparisonOffsetSeconds: number,
    pixelWidth: number,
  ): Promise<DifferenceResult> {
    return this.dispatch<DifferenceResult>({
      type: 'query-difference-series', referenceDatasetId, referenceChannelId,
      comparisonDatasetId, comparisonChannelId, startSeconds, endSeconds,
      comparisonOffsetSeconds, pixelWidth,
    }, 'difference-series');
  }

  queryComparisonPanel(
    referenceDatasetId: string,
    referenceChannelId: string,
    comparisonDatasetId: string,
    comparisonChannelId: string,
    startSeconds: number,
    endSeconds: number,
    comparisonOffsetSeconds: number,
    pixelWidth: number,
  ): Promise<ComparisonPanelQueryResult> {
    return this.dispatch<ComparisonPanelQueryResult>({
      type: 'query-comparison-panel', referenceDatasetId, referenceChannelId,
      comparisonDatasetId, comparisonChannelId, startSeconds, endSeconds,
      comparisonOffsetSeconds, pixelWidth,
    }, 'comparison-panel');
  }

  queryDifferenceStatistics(
    referenceDatasetId: string,
    referenceChannelId: string,
    comparisonDatasetId: string,
    comparisonChannelId: string,
    startSeconds: number,
    endSeconds: number,
    comparisonOffsetSeconds: number,
  ): Promise<DifferenceStatistics> {
    return this.dispatch<DifferenceStatistics>(
      {
        type: 'query-difference-statistics',
        referenceDatasetId,
        referenceChannelId,
        comparisonDatasetId,
        comparisonChannelId,
        startSeconds,
        endSeconds,
        comparisonOffsetSeconds,
      },
      'difference',
    );
  }

  releaseDataset(datasetId: string): void {
    this.worker?.postMessage({ type: 'release', datasetId } satisfies IngestionRequest);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;

    for (const operation of this.pending.values()) {
      operation.reject(new Error('Measurement worker was disposed.'));
    }

    this.pending.clear();
  }

  private dispatch<T>(
    request: WithoutRequestId<WorkerOperationRequest>,
    kind: OperationKind,
    onProgress?: (fraction: number) => void,
  ): Promise<T> {
    const requestId = this.nextRequestId++;

    return new Promise<T>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = this.getWorker();
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error('Unable to create measurement worker.'));
        return;
      }

      this.pending.set(requestId, {
        kind,
        resolve: (value) => resolve(value as T),
        reject,
        onProgress,
      });

      try {
        worker.postMessage({ ...request, requestId } as IngestionRequest);
      } catch (cause) {
        this.pending.delete(requestId);
        reject(cause instanceof Error ? cause : new Error('Unable to dispatch measurement worker request.'));
      }
    });
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;

    this.worker = new Worker(new URL('./csv-ingestion.worker.ts', import.meta.url), {
      type: 'module',
      name: 'vsw-measurement-worker',
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
        return;
      }

      if (message.type === 'complete' && operation.kind === 'import') {
        operation.resolve(message.dataset);
      } else if (message.type === 'window' && operation.kind === 'window') {
        operation.resolve(message.window);
      } else if (message.type === 'statistics' && operation.kind === 'statistics') {
        operation.resolve(message.statistics);
      } else if (message.type === 'difference-statistics' && operation.kind === 'difference') {
        operation.resolve(message.statistics);
      } else if (message.type === 'difference-series' && operation.kind === 'difference-series') {
        operation.resolve(message.result);
      } else if (message.type === 'comparison-panel' && operation.kind === 'comparison-panel') {
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
