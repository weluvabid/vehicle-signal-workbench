'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileSpreadsheet, LoaderCircle } from 'lucide-react';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import { inspectCsv, type CsvPreflight } from '@/features/ingestion/csv-preview';
import type { DatasetDescriptor, TimestampEncoding } from '@/features/measurements/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const encodings: readonly { value: TimestampEncoding; label: string }[] = [
  { value: 'iso-8601', label: 'ISO 8601 date/time' },
  { value: 'unix-seconds', label: 'Unix timestamp (seconds)' },
  { value: 'unix-milliseconds', label: 'Unix timestamp (milliseconds)' },
];

type RunRole = 'reference' | 'comparison';
interface SelectedRun { file: File; preview: CsvPreflight; timestampColumn: string; timestampEncoding: TimestampEncoding | ''; }
interface ComparisonWizardProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly client: MeasurementWorkerClient;
  readonly onComplete: (reference: DatasetDescriptor, comparison: DatasetDescriptor, metrics: { durationMs: number; totalBytes: number }) => void;
}

const steps = [
  { title: 'Reference', description: 'Choose the baseline measurement.' },
  { title: 'Comparison', description: 'Choose the candidate measurement.' },
  { title: 'Review', description: 'Check both files before importing.' },
] as const;

export function ComparisonWizard({ open, onOpenChange, client, onComplete }: ComparisonWizardProps) {
  const [step, setStep] = useState(0);
  const [runs, setRuns] = useState<Partial<Record<RunRole, SelectedRun>>>({});
  const [inspecting, setInspecting] = useState<RunRole | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ reference: 0, comparison: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const generation = useRef(0);
  const active = step === 0 ? 'reference' : 'comparison';
  const reference = runs.reference;
  const comparison = runs.comparison;
  const current = runs[active];
  const pairValid = Boolean(reference && comparison && reference.timestampColumn && reference.timestampEncoding && comparison.timestampColumn && comparison.timestampEncoding && reference.preview.numericChannels.length > 0 && comparison.preview.numericChannels.length > 0);

  useEffect(() => {
    if (!open) {
      generation.current += 1;
      setStep(0);
      setRuns({});
      setInspecting(null);
      setInspectionError(null);
      setImporting(false);
      setProgress({ reference: 0, comparison: 0 });
      setImportError(null);
    }
  }, [open]);

  const duplicateFile = useMemo(() => Boolean(reference && comparison && reference.file.name === comparison.file.name && reference.file.size === comparison.file.size && reference.file.lastModified === comparison.file.lastModified), [reference, comparison]);

  async function selectFile(role: RunRole, file: File | undefined) {
    const token = ++generation.current;
    setInspectionError(null);
    setImportError(null);
    setInspecting(null);
    setRuns((previous) => ({ ...previous, [role]: undefined }));
    if (!file) {
      setRuns((previous) => ({ ...previous, [role]: undefined }));
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setInspectionError('Choose a CSV measurement file.');
      return;
    }
    setInspecting(role);
    try {
      const preview = await inspectCsv(file);
      if (generation.current !== token) return;
      const timestampColumn = preview.timestampColumn ?? '';
      const timestampEncoding = preview.timestampEncoding ?? '';
      setRuns((previous) => ({ ...previous, [role]: { file, preview, timestampColumn, timestampEncoding } }));
    } catch (error) {
      if (generation.current !== token) return;
      setInspectionError(error instanceof Error ? error.message : 'Unable to inspect this CSV.');
    } finally {
      if (generation.current === token) setInspecting(null);
    }
  }

  function updateRun(role: RunRole, patch: Partial<Pick<SelectedRun, 'timestampColumn' | 'timestampEncoding'>>) {
    setRuns((previous) => {
      const run = previous[role];
      return run ? { ...previous, [role]: { ...run, ...patch } } : previous;
    });
  }

  async function startComparison() {
    if (!reference || !comparison || !pairValid || duplicateFile || importing) return;
    const importStartedAt = performance.now();
    setImporting(true);
    setImportError(null);
    setProgress({ reference: 0, comparison: 0 });
    let importedReference: DatasetDescriptor | null = null;
    let importedComparison: DatasetDescriptor | null = null;
    try {
      const results = await Promise.allSettled([
        client.import(reference.file, { timestampColumn: reference.timestampColumn, timestampEncoding: reference.timestampEncoding as TimestampEncoding }, (value) => setProgress((previous) => ({ ...previous, reference: value }))),
        client.import(comparison.file, { timestampColumn: comparison.timestampColumn, timestampEncoding: comparison.timestampEncoding as TimestampEncoding }, (value) => setProgress((previous) => ({ ...previous, comparison: value }))),
      ]);
      importedReference = results[0].status === 'fulfilled' ? results[0].value : null;
      importedComparison = results[1].status === 'fulfilled' ? results[1].value : null;
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      if (!importedReference || !importedComparison) throw new Error('Both measurement imports must complete before comparison can begin.');
      onComplete(importedReference, importedComparison, {
        durationMs: performance.now() - importStartedAt,
        totalBytes: reference.file.size + comparison.file.size,
      });
      onOpenChange(false);
    } catch (error) {
      if (importedReference) client.releaseDataset(importedReference.id);
      if (importedComparison) client.releaseDataset(importedComparison.id);
      setImportError(error instanceof Error ? error.message : 'One or both measurement imports failed.');
    } finally {
      setImporting(false);
    }
  }

  const canContinue = Boolean(current && current.timestampColumn && current.timestampEncoding && current.preview.numericChannels.length > 0 && !inspecting && !importing && !inspectionError);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!importing) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-3xl" showCloseButton={!importing}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle>Set up measurement comparison</DialogTitle>
            <Badge variant="secondary">Step {step + 1} of 3</Badge>
          </div>
          <DialogDescription>Choose two CSV runs. We'll inspect a small preview first; full measurement imports start only after review.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2" aria-label="Comparison setup steps">
          {steps.map((item, index) => (
            <div key={item.title} className="min-w-0 space-y-2">
              <div className={`flex items-center gap-2 text-sm ${index === step ? 'font-medium text-foreground' : index < step ? 'text-foreground' : 'text-muted-foreground'}`}>
                <span className={`grid size-7 shrink-0 place-items-center rounded-full border ${index < step ? 'border-primary bg-primary text-primary-foreground' : index === step ? 'border-primary' : 'border-muted-foreground/30'}`}>{index < step ? <Check className="size-4" /> : index + 1}</span>
                <span className="truncate">{item.title}</span>
              </div>
              <Progress value={index < step ? 100 : index === step ? 50 : 0} className="h-1" />
            </div>
          ))}
        </div>

        {step < 2 && <>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{steps[step].title} measurement</h3>
            <p className="text-sm text-muted-foreground">{steps[step].description} {step === 0 ? 'This is the baseline that the candidate run will be compared against.' : 'This run will be compared with the selected reference.'}</p>
          </div>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm"><FileSpreadsheet className="size-4" />{step === 0 ? 'Reference CSV' : 'Comparison CSV'}</CardTitle>
              <CardDescription>Local preflight reads the header and up to eight non-empty records. It does not import measurement arrays.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`wizard-${active}-file`}>Measurement file</Label>
                <Input id={`wizard-${active}-file`} type="file" accept=".csv,text/csv" disabled={Boolean(inspecting) || importing} onChange={(event) => void selectFile(active, event.target.files?.[0])} />
              </div>
              {inspecting === active && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Inspecting CSV structure…</div>}
              {current && <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div className="flex min-w-0 items-center gap-2"><FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" /><span className="truncate text-sm font-medium">{current.file.name}</span></div>
                  <Badge variant="secondary"><CheckCircle2 className="size-3" /> Preview ready</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Timestamp column</Label>
                    <Select value={current.timestampColumn} onValueChange={(value) => { if (value) updateRun(active, { timestampColumn: value }); }}>
                      <SelectTrigger aria-label="Timestamp column"><SelectValue placeholder="Choose timestamp column" /></SelectTrigger>
                      <SelectContent>{current.preview.headers.map((header, index) => <SelectItem key={`${index}-${header}`} value={header}>{header}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Timestamp format</Label>
                    <Select value={current.timestampEncoding} onValueChange={(value) => { if (value) updateRun(active, { timestampEncoding: value as TimestampEncoding }); }}>
                      <SelectTrigger aria-label="Timestamp format"><SelectValue placeholder="Confirm timestamp format" /></SelectTrigger>
                      <SelectContent>{encodings.map((encoding) => <SelectItem key={encoding.value} value={encoding.value}>{encoding.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Separator />
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted-foreground">Delimiter</dt><dd className="mt-1 font-medium">{current.preview.delimiter === '\t' ? 'Tab' : current.preview.delimiter === ',' ? 'Comma' : current.preview.delimiter}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Rows inspected</dt><dd className="mt-1 font-medium tabular-nums">{current.preview.inspectedRows}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Numeric channels</dt><dd className="mt-1 font-medium tabular-nums">{current.preview.numericChannels.length}</dd></div>
                </dl>
                {current.preview.warnings.length > 0 && <div className="space-y-1" role="status">{current.preview.warnings.map((warning) => <p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}</div>}
              </>}
              {inspectionError && <p role="alert" className="text-sm text-destructive">{inspectionError}</p>}
            </CardContent>
          </Card>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => step === 0 ? onOpenChange(false) : setStep(0)} disabled={importing}><ArrowLeft className="size-4" />{step === 0 ? 'Cancel' : 'Previous'}</Button>
            <Button onClick={() => { setInspectionError(null); setStep((value) => value + 1); }} disabled={!canContinue}>{step === 0 ? 'Next' : 'Review'}<ArrowRight className="size-4" /></Button>
          </div>
        </>}

        {step === 2 && reference && comparison && <>
          <div className="space-y-1"><h3 className="text-base font-semibold">Review measurement pair</h3><p className="text-sm text-muted-foreground">Both files passed lightweight structural inspection. Full imports will now run concurrently in the existing Web Worker.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([{ title: 'Reference · Baseline', run: reference }, { title: 'Comparison · Candidate', run: comparison }] as const).map(({ title, run }) => (
              <Card key={title} size="sm">
                <CardHeader><CardDescription>{title}</CardDescription><CardTitle className="truncate text-sm">{run.file.name}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">File size</span><span className="tabular-nums">{(run.file.size / 1024 / 1024).toFixed(2)} MB</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Timestamp</span><span className="truncate">{run.timestampColumn}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Format</span><span>{encodings.find((item) => item.value === run.timestampEncoding)?.label}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Numeric channels</span><span>{run.preview.numericChannels.length}</span></div>
                </CardContent>
              </Card>
            ))}
          </div>
          {duplicateFile && <p role="alert" className="text-sm text-destructive">Choose two different measurement files. The same file cannot be used for both runs.</p>}
          {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
          {importing && <div className="space-y-3 rounded-lg border p-3">
            {(['reference', 'comparison'] as const).map((role) => <div key={role} className="space-y-1"><div className="flex justify-between text-xs text-muted-foreground"><span>{role === 'reference' ? 'Reference' : 'Comparison'} import</span><span>{Math.round(progress[role] * 100)}%</span></div><Progress value={progress[role] * 100} /></div>)}
          </div>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setStep(1)} disabled={importing}><ArrowLeft className="size-4" />Previous</Button>
            <Button onClick={() => void startComparison()} disabled={!pairValid || duplicateFile || importing}>{importing ? <><LoaderCircle className="size-4 animate-spin" />Importing measurements…</> : <>Start comparison<ArrowRight className="size-4" /></>}</Button>
          </div>
        </>}
      </DialogContent>
    </Dialog>
  );
}
