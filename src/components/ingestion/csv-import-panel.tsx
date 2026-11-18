'use client';

import { useId } from 'react';
import { CheckCircle2, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import { useCsvImport } from '@/features/ingestion/use-csv-import';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import type { DatasetDescriptor, TimestampEncoding } from '@/features/measurements/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  const id = useId();
  const {
    file, headers, timestampColumn, setTimestampColumn, timestampEncoding,
    setTimestampEncoding, status, progress, error, handleFileChange, handleImport,
  } = useCsvImport({ client, dataset, onDataset });
  const busy = status === 'importing' || status === 'inspecting';

  return (
    <Card className="min-w-0" data-testid={`${role}-import-panel`}>
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="font-medium uppercase tracking-wider">{role === 'reference' ? 'Run A · Baseline' : 'Run B · Candidate'}</CardDescription>
          <Badge variant={dataset ? 'default' : status === 'error' ? 'destructive' : 'secondary'}>
            {dataset ? <><CheckCircle2 className="mr-1 size-3" /> Ready</> : status === 'importing' ? 'Importing' : status === 'inspecting' ? 'Inspecting' : status === 'error' ? 'Error' : 'Awaiting file'}
          </Badge>
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>CSV is parsed locally in a dedicated Web Worker.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${id}-file`}>Measurement file</Label>
          <Input
            id={`${id}-file`}
            data-testid={`${role}-file-input`}
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)}
            className="file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium"
          />
          {file && <p className="flex items-center gap-2 text-xs text-muted-foreground"><FileSpreadsheet className="size-3.5" />{file.name}</p>}
        </div>

        {file && status !== 'inspecting' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label>Timestamp column</Label>
              <Select value={timestampColumn} onValueChange={(value) => { if (value) setTimestampColumn(value); }} disabled={busy}>
                <SelectTrigger aria-label="Timestamp column"><SelectValue placeholder="Select timestamp column" /></SelectTrigger>
                <SelectContent>
                  {headers.map((header, index) => <SelectItem key={`${index}:${header}`} value={header}>{header}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label>Timestamp format</Label>
              <Select value={timestampEncoding} onValueChange={(value) => { if (value) setTimestampEncoding(value as TimestampEncoding); }} disabled={busy}>
                <SelectTrigger aria-label="Timestamp format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {timestampEncodings.map((encoding) => <SelectItem key={encoding.value} value={encoding.value}>{encoding.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {status === 'importing' && <div className="space-y-2" aria-label={`Import progress ${Math.round(progress * 100)}%`}><div className="flex justify-between text-xs text-muted-foreground"><span>Importing measurements</span><span>{Math.round(progress * 100)}%</span></div><Progress value={progress * 100} /></div>}
        <Button type="button" className="w-full" onClick={() => void handleImport()} disabled={!file || !timestampColumn || busy}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {status === 'importing' ? 'Importing…' : dataset ? 'Re-import run' : 'Import run'}
        </Button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {dataset && (
          <div className="rounded-lg border bg-muted/30 p-3" aria-live="polite" data-testid={`${role}-dataset-summary`}>
            <p className="truncate text-sm font-medium">{dataset.name}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <div><dt className="text-xs text-muted-foreground">Samples</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{dataset.sampleCount.toLocaleString()}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Channels</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{dataset.channels.length}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Duration</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{dataset.durationSeconds.toFixed(3)} s</dd></div>
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
