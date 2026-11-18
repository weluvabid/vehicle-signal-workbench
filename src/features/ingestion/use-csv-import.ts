'use client';

import { useCallback, useRef, useState } from 'react';
import { detectTimestampColumn } from './csv-normalization';
import { inspectCsvHeaders } from './csv-preview';
import type { MeasurementWorkerClient } from './measurement-worker.client';
import type { DatasetDescriptor, TimestampEncoding } from '../measurements/model';

export type ImportStatus = 'idle' | 'inspecting' | 'importing' | 'complete' | 'error';

interface UseCsvImportOptions {
  readonly client: MeasurementWorkerClient;
  readonly dataset: DatasetDescriptor | null;
  readonly onDataset: (dataset: DatasetDescriptor | null) => void;
}

export function useCsvImport({ client, dataset, onDataset }: UseCsvImportOptions) {
  const generationRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [timestampColumn, setTimestampColumn] = useState('');
  const [timestampEncoding, setTimestampEncoding] = useState<TimestampEncoding>('iso-8601');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback(async (nextFile: File | null) => {
    const generation = ++generationRef.current;
    if (dataset) client.releaseDataset(dataset.id);
    onDataset(null);
    setFile(nextFile);
    setHeaders([]);
    setTimestampColumn('');
    setProgress(0);
    setError(null);

    if (!nextFile) {
      setStatus('idle');
      return;
    }

    setStatus('inspecting');
    try {
      const preview = await inspectCsvHeaders(nextFile);
      if (generation !== generationRef.current) return;
      setHeaders(preview);
      setTimestampColumn(detectTimestampColumn(preview) ?? '');
      setStatus('idle');
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Unable to inspect CSV file.');
      setStatus('error');
    }
  }, [client, dataset, onDataset]);

  const handleImport = useCallback(async () => {
    if (!file || !timestampColumn || status === 'importing') return;
    const generation = generationRef.current;
    if (dataset) {
      client.releaseDataset(dataset.id);
      onDataset(null);
    }
    setStatus('importing');
    setProgress(0);
    setError(null);
    try {
      const imported = await client.import(
        file,
        { timestampColumn, timestampEncoding },
        (fraction) => {
          if (generation === generationRef.current) setProgress(fraction);
        },
      );
      if (generation !== generationRef.current) {
        client.releaseDataset(imported.id);
        return;
      }
      onDataset(imported);
      setProgress(1);
      setStatus('complete');
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setError(cause instanceof Error ? cause.message : 'CSV import failed.');
      setStatus('error');
    }
  }, [client, dataset, file, onDataset, status, timestampColumn, timestampEncoding]);

  return {
    file,
    headers,
    timestampColumn,
    setTimestampColumn,
    timestampEncoding,
    setTimestampEncoding,
    status,
    progress,
    error,
    handleFileChange,
    handleImport,
  };
}
