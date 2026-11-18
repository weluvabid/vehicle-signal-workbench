import { importCsv } from './csv-import';
import { handleMeasurementQuery } from './measurement-query.handlers';
import { createWorkerRuntimeContext } from './worker-runtime';
import type { IngestionRequest } from './worker-protocol';

const context = createWorkerRuntimeContext();

self.onmessage = (event: MessageEvent<IngestionRequest>): void => {
  const request = event.data;

  switch (request.type) {
    case 'release':
      context.datasets.delete(request.datasetId);
      return;
    case 'cancel': {
      const active = context.activeImports.get(request.requestId);
      if (active) {
        active.cancelled = true;
        active.parser?.abort();
        if (active.parser) context.activeImports.delete(request.requestId);
      }
      context.activeQueries.delete(request.requestId);
      return;
    }
    case 'import':
      importCsv(request, context.activeImports, context.datasets, context.post);
      return;
    default:
      void handleMeasurementQuery(request, context).then((handled) => {
        if (!handled) throw new Error(`Unhandled worker request: ${JSON.stringify(request)}`);
      }).catch((error: unknown) => {
        throw error;
      });
      return;
  }
};
