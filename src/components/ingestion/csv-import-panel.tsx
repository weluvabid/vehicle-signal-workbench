'use client';

import { useRef, useState } from 'react';
import { detectTimestampColumn } from '@/features/ingestion/csv-normalization';
import { inspectCsvHeaders } from '@/features/ingestion/csv-preview';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { DatasetDescriptor, TimestampEncoding } from '@/features/measurements/model';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

type ImportStatus = 'idle' | 'inspecting' | 'importing' | 'complete' | 'error';

const timestampEncodings: readonly { value: TimestampEncoding; label: string }[] = [
  { value: 'iso-8601', label: 'ISO 8601 date/time' },
  { value: 'unix-seconds', label: 'Unix timestamp (seconds)' },
  { value: 'unix-milliseconds', label: 'Unix timestamp (milliseconds)' },
];

interface CsvImportPanelProps {
  readonly title: string;
  readonly role: 'reference' | 'comparison';
  readonly client: MeasurementWorkerClient;
  readonly dataset: DatasetDescriptor | null;
  readonly onDataset: (dataset: DatasetDescriptor | null) => void;
}

export function CsvImportPanel({ title, role, client, dataset, onDataset }: CsvImportPanelProps) {
  const generationRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [timestampColumn, setTimestampColumn] = useState('');
  const [timestampEncoding, setTimestampEncoding] = useState<TimestampEncoding>('iso-8601');
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(nextFile: File | null) {
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
  }

  async function handleImport() {
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
        (fraction) => { if (generation === generationRef.current) setProgress(fraction); },
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
  }

  return (
    <section className="import-panel" aria-labelledby={`${role}-import-title`} data-testid={`${role}-import-panel`}>
      <div className="import-panel-heading">
        <div>
          <p className="eyebrow">{role === 'reference' ? 'RUN A · BASELINE' : 'RUN B · CANDIDATE'}</p>
          <h2 id={`${role}-import-title`}>{title}</h2>
        </div>
        <span className="panel-status">{dataset ? 'READY' : status.toUpperCase()}</span>
      </div>

      <label className="file-picker">
        <input
          data-testid={`${role}-file-input`}
          type="file" accept=".csv,text/csv"
          disabled={status === 'importing' || status === 'inspecting'}
          onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
        />
        <span>{file ? file.name : 'Choose a CSV file'}</span>
        <span className="file-picker-hint">CSV · parsed locally in the shared Web Worker</span>
      </label>

      {file && status !== 'inspecting' && (
        <div className="import-options">
          <label><span>Timestamp column</span>
            <select value={timestampColumn} onChange={(event) => setTimestampColumn(event.target.value)} disabled={status === 'importing'}>
              <option value="" disabled>Select timestamp column</option>
              {headers.map((header, index) => <option key={`${index}:${header}`} value={header}>{header}</option>)}
            </select>
          </label>
          <label><span>Timestamp format</span>
            <select value={timestampEncoding} onChange={(event) => setTimestampEncoding(event.target.value as TimestampEncoding)} disabled={status === 'importing'}>
              {timestampEncodings.map((encoding) => <option key={encoding.value} value={encoding.value}>{encoding.label}</option>)}
            </select>
          </label>
        </div>
      )}

      {status === 'importing' && <div className="progress-track" aria-label={`Import progress ${Math.round(progress * 100)}%`}><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      <div className="import-actions">
        <Button type="button" onClick={() => void handleImport()} disabled={!file || !timestampColumn || status === 'importing' || status === 'inspecting'}>
          <Upload size={14} aria-hidden="true" />
          {dataset ? 'Re-import run' : 'Import run'}
        </Button>
      </div>
      {error && <p className="import-error" role="alert">{error}</p>}
      {dataset && (
        <div className="dataset-summary" aria-live="polite" data-testid={`${role}-dataset-summary`}>
          <p className="summary-title">{dataset.name}</p>
          <dl>
            <div><dt>Samples</dt><dd>{dataset.sampleCount.toLocaleString()}</dd></div>
            <div><dt>Channels</dt><dd>{dataset.channels.length}</dd></div>
            <div><dt>Duration</dt><dd>{dataset.durationSeconds.toFixed(3)} s</dd></div>
          </dl>
        </div>
      )}
    </section>
  );
}
