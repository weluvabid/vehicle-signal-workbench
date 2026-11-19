import { importCsv } from './csv-import';
import { handleComparisonQuery } from './measurement-query.handlers';
import { handleTableQuery } from './table-query.handler';
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
    case 'query-table':
      void handleTableQuery(request, context);
      return;
    case 'query-comparison-batch':
      void handleComparisonQuery(request, context);
      return;
    default: {
      const exhaustive: never = request;
      throw new Error(`Unhandled worker request: ${JSON.stringify(exhaustive)}`);
    }
  }
};
