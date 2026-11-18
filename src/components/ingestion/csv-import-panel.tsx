'use client';

import { useCsvImport } from '@/features/ingestion/use-csv-import';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { DatasetDescriptor, TimestampEncoding } from '@/features/measurements/model';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

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
  const {
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
  } = useCsvImport({ client, dataset, onDataset });

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
