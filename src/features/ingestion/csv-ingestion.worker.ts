import { importCsv } from './csv-import';
import { handleCsvExport } from './csv-export.handler';
import { handleMeasurementQuery } from './measurement-query.handlers';
import { createWorkerRuntimeContext } from './worker-runtime';
import type { IngestionRequest } from './worker-protocol';

const context = createWorkerRuntimeContext();

self.onmessage = (event: MessageEvent<IngestionRequest>): void => {
  const request = event.data;

  switch (request.type) {
    case 'cancel-csv-export': {
      if (context.activeCsvExports.has(request.requestId)) {
        context.cancelledCsvExports.add(request.requestId);
        context.pendingCsvExportAcks.get(request.requestId)?.();
        context.pendingCsvExportAcks.delete(request.requestId);
      }
      return;
    }
    case 'ack-csv-export-chunk':
      context.pendingCsvExportAcks.get(request.requestId)?.();
      context.pendingCsvExportAcks.delete(request.requestId);
      return;
    case 'export-difference-csv':
      context.activeCsvExports.add(request.requestId);
      void handleCsvExport(request, context);
      return;
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
      return;
    }
    case 'import':
      importCsv(request, context.activeImports, context.datasets, context.post);
      return;
    default:
      if (!handleMeasurementQuery(request, context)) {
        throw new Error(`Unhandled worker request: ${JSON.stringify(request)}`);
      }
      return;
  }
};
