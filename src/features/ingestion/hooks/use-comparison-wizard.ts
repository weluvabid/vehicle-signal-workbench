'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MeasurementWorkerClient } from '@/features/ingestion/measurement-worker.client';
import { inspectCsv, type CsvPreflight } from '@/features/ingestion/csv-preview';
import type { DatasetDescriptor, TimestampEncoding } from '@/features/measurements/model';

export type RunRole = 'reference' | 'comparison';
export interface SelectedRun {
  readonly file: File;
  readonly preview: CsvPreflight;
  readonly timestampColumn: string;
  readonly timestampEncoding: TimestampEncoding | '';
}
export interface ComparisonWizardOptions {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly client: MeasurementWorkerClient;
  readonly onComplete: (reference: DatasetDescriptor, comparison: DatasetDescriptor, metrics: { durationMs: number; totalBytes: number }) => void;
}

export const WIZARD_ENCODINGS: readonly { readonly value: TimestampEncoding; readonly label: string }[] = [
  { value: 'iso-8601', label: 'ISO 8601 date/time' },
  { value: 'unix-seconds', label: 'Unix timestamp (seconds)' },
  { value: 'unix-milliseconds', label: 'Unix timestamp (milliseconds)' },
];
export const WIZARD_STEPS = [
  { title: 'Reference', description: 'Choose the baseline measurement.' },
  { title: 'Comparison', description: 'Choose the candidate measurement.' },
  { title: 'Review', description: 'Check both files before importing.' },
] as const;

export function isDuplicateMeasurementFile(reference?: SelectedRun, comparison?: SelectedRun): boolean {
  return Boolean(reference && comparison && reference.file.name === comparison.file.name &&
    reference.file.size === comparison.file.size && reference.file.lastModified === comparison.file.lastModified);
}

/** Owns the comparison wizard workflow; the component only renders its state. */
export function useComparisonWizard(options: ComparisonWizardOptions) {
  const [step, setStep] = useState(0);
  const [runs, setRuns] = useState<Partial<Record<RunRole, SelectedRun>>>({});
  const [inspecting, setInspecting] = useState<RunRole | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ reference: 0, comparison: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const generation = useRef(0);
  const active: RunRole = step === 0 ? 'reference' : 'comparison';
  const reference = runs.reference;
  const comparison = runs.comparison;
  const current = runs[active];
  const pairValid = Boolean(reference && comparison && reference.timestampColumn && reference.timestampEncoding &&
    comparison.timestampColumn && comparison.timestampEncoding && reference.preview.numericChannels.length > 0 &&
    comparison.preview.numericChannels.length > 0);
  const duplicateFile = useMemo(() => isDuplicateMeasurementFile(reference, comparison), [reference, comparison]);
  const canContinue = Boolean(current && current.timestampColumn && current.timestampEncoding &&
    current.preview.numericChannels.length > 0 && !inspecting && !importing && !inspectionError);

  useEffect(() => {
    if (options.open) return;
    generation.current += 1;
    setStep(0);
    setRuns({});
    setInspecting(null);
    setInspectionError(null);
    setImporting(false);
    setProgress({ reference: 0, comparison: 0 });
    setImportError(null);
  }, [options.open]);

  async function selectFile(role: RunRole, file: File | undefined): Promise<void> {
    const token = ++generation.current;
    setInspectionError(null);
    setImportError(null);
    setInspecting(null);
    setRuns((previous) => ({ ...previous, [role]: undefined }));
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setInspectionError('Choose a CSV measurement file.');
      return;
    }
    setInspecting(role);
    try {
      const preview = await inspectCsv(file);
      if (generation.current !== token) return;
      setRuns((previous) => ({ ...previous, [role]: {
        file, preview, timestampColumn: preview.timestampColumn ?? '', timestampEncoding: preview.timestampEncoding ?? '',
      } }));
    } catch (cause) {
      if (generation.current === token) setInspectionError(cause instanceof Error ? cause.message : 'Unable to inspect this CSV.');
    } finally {
      if (generation.current === token) setInspecting(null);
    }
  }

  function updateRun(role: RunRole, patch: Partial<Pick<SelectedRun, 'timestampColumn' | 'timestampEncoding'>>): void {
    setRuns((previous) => {
      const run = previous[role];
      return run ? { ...previous, [role]: { ...run, ...patch } } : previous;
    });
  }

  async function startComparison(): Promise<void> {
    if (!reference || !comparison || !pairValid || duplicateFile || importing) return;
    const startedAt = performance.now();
    setImporting(true);
    setImportError(null);
    setProgress({ reference: 0, comparison: 0 });
    let importedReference: DatasetDescriptor | null = null;
    let importedComparison: DatasetDescriptor | null = null;
    try {
      const results = await Promise.allSettled([
        options.client.import(reference.file, { timestampColumn: reference.timestampColumn, timestampEncoding: reference.timestampEncoding as TimestampEncoding },
          (value) => setProgress((previous) => ({ ...previous, reference: value }))),
        options.client.import(comparison.file, { timestampColumn: comparison.timestampColumn, timestampEncoding: comparison.timestampEncoding as TimestampEncoding },
          (value) => setProgress((previous) => ({ ...previous, comparison: value }))),
      ]);
      importedReference = results[0].status === 'fulfilled' ? results[0].value : null;
      importedComparison = results[1].status === 'fulfilled' ? results[1].value : null;
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      if (!importedReference || !importedComparison) throw new Error('Both measurement imports must complete before comparison can begin.');
      options.onComplete(importedReference, importedComparison, {
        durationMs: performance.now() - startedAt, totalBytes: reference.file.size + comparison.file.size,
      });
      options.onOpenChange(false);
    } catch (cause) {
      if (importedReference) options.client.releaseDataset(importedReference.id);
      if (importedComparison) options.client.releaseDataset(importedComparison.id);
      setImportError(cause instanceof Error ? cause.message : 'One or both measurement imports failed.');
    } finally {
      setImporting(false);
    }
  }

  return {
    step, setStep, runs, active, reference, comparison, current, inspecting, inspectionError,
    importing, progress, importError, duplicateFile, pairValid, canContinue,
    selectFile, updateRun, startComparison, clearInspectionError: () => setInspectionError(null),
  };
}
