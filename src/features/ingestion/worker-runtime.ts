import type { ActiveImport, StoredDataset } from './csv-import';
import type { IngestionResponse } from './worker-protocol';

export interface WorkerRuntimeContext {
  readonly datasets: Map<string, StoredDataset>;
  readonly activeImports: Map<number, ActiveImport>;
  post(message: IngestionResponse): void;
  postTransfer(message: IngestionResponse, options: { transfer: Transferable[] }): void;
}

export function createWorkerRuntimeContext(): WorkerRuntimeContext {
  return {
    datasets: new Map(),
    activeImports: new Map(),
    post(message) { self.postMessage(message); },
    postTransfer(message, options) { self.postMessage(message, options); },
  };
}
